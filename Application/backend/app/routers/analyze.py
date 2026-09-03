"""
Shelf analysis endpoints — the main pipeline trigger.

Routes:
  POST /api/analyze          multipart/form-data → full JSON result
  POST /api/analyze/stream   multipart/form-data → text/event-stream progress
    - image      : UploadFile  (JPEG / PNG / WebP / iPhone HEIC)

Both routes require `Authorization: Bearer <token>` and score against the
caller's own profile. `profile_id` is deliberately NOT a form field any more —
accepting one would let any client analyse against any profile.
"""
import io
import json
import logging

import pillow_heif
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from google.genai import errors as genai_errors
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserProfile
from app.schemas.ai_output import ShelfAnalysisResponse
from app.services.auth_service import get_current_approved_user
from app.services.gemini_service import GeminiService

# Register HEIF/HEIC support so Pillow can open iPhone photos.
pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["analyze"])

gemini_service = GeminiService()

_STANDARD_TYPES = ("image/jpeg", "image/png", "image/webp")
_HEIC_TYPES = ("image/heic", "image/heif")


def _is_heic(content_type: str, filename: str) -> bool:
    return content_type in _HEIC_TYPES or filename.lower().endswith((".heic", ".heif"))


async def _prepare_request(image: UploadFile, current_user: User, db: AsyncSession):
    """Validate the upload, load the CALLER'S profile, and return
    (image_bytes, mime_type, profile).

    Shared by the plain and streaming endpoints. Converts iPhone HEIC → JPEG.
    """
    content_type = (image.content_type or "").lower()
    filename = image.filename or ""
    is_heic = _is_heic(content_type, filename)
    if not is_heic and content_type not in _STANDARD_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{image.content_type}'. Use JPEG, PNG, WebP, or an iPhone (HEIC) photo.",
        )

    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")

    image_bytes = await image.read()
    if len(image_bytes) > 20 * 1024 * 1024:  # 20 MB guard
        raise HTTPException(status_code=413, detail="Image too large. Max 20 MB.")

    mime_type = content_type or "image/jpeg"
    if is_heic:
        try:
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=92)
            image_bytes = buf.getvalue()
            mime_type = "image/jpeg"
        except Exception as exc:
            logger.error("HEIC conversion failed: %s", exc)
            raise HTTPException(
                status_code=400,
                detail="Could not read this iPhone (HEIC) photo. Try exporting it as JPEG.",
            )

    return image_bytes, mime_type, profile


def _gemini_error_detail(exc: genai_errors.APIError) -> tuple[int, str]:
    """Map a Gemini API error to (status_code, user-facing detail)."""
    code = getattr(exc, "code", None)
    if code == 429:
        return 429, (
            "AI usage limit reached (Gemini quota or rate limit). "
            "This is an API credit/quota issue, not your photo — wait a moment and retry, "
            "or raise the Gemini API rate limit (enable billing / a paid tier)."
        )
    return 503, "The AI analysis service is temporarily unavailable. Please try again in a moment."


@router.post("/analyze", response_model=ShelfAnalysisResponse)
async def analyze_shelf(
    image: UploadFile = File(..., description="Photo of a grocery shelf"),
    max_detections: int | None = Form(
        None, description="Max products to identify per scan (user-set in Settings; clamped 1-100)"
    ),
    yolo_model: str | None = Form(
        None, description="Detection model to run (user-set in Settings): yolo11n / yolo26s / yolo26s_p2"
    ),
    current_user: User = Depends(get_current_approved_user),
    db: AsyncSession = Depends(get_db),
):
    image_bytes, mime_type, profile = await _prepare_request(image, current_user, db)
    try:
        return await gemini_service.analyze_shelf(
            image_bytes=image_bytes, mime_type=mime_type, profile=profile, db=db,
            max_detections=max_detections, yolo_model=yolo_model,
        )
    except genai_errors.APIError as exc:
        logger.error("Gemini API error during shelf analysis: %s", exc)
        status, detail = _gemini_error_detail(exc)
        raise HTTPException(status_code=status, detail=detail)


@router.post("/analyze/stream")
async def analyze_shelf_stream(
    image: UploadFile = File(..., description="Photo of a grocery shelf"),
    max_detections: int | None = Form(
        None, description="Max products to identify per scan (user-set in Settings; clamped 1-100)"
    ),
    yolo_model: str | None = Form(
        None, description="Detection model to run (user-set in Settings): yolo11n / yolo26s / yolo26s_p2"
    ),
    current_user: User = Depends(get_current_approved_user),
    db: AsyncSession = Depends(get_db),
):
    """Server-Sent-Events stream of analysis progress.

    Emits `data: {json}\\n\\n` lines with per-item stages: detected, identified_item,
    analyzed_item, complete, or error. The client can fall back to /api/analyze if
    streaming is unsupported.
    """
    image_bytes, mime_type, profile = await _prepare_request(image, current_user, db)

    async def event_stream():
        try:
            async for ev in gemini_service.analyze_shelf_stream(
                image_bytes=image_bytes, mime_type=mime_type, profile=profile, db=db,
                max_detections=max_detections, yolo_model=yolo_model,
            ):
                yield f"data: {json.dumps(ev)}\n\n"
        except genai_errors.APIError as exc:
            logger.error("Gemini API error during streamed analysis: %s", exc)
            _, detail = _gemini_error_detail(exc)
            yield f"data: {json.dumps({'stage': 'error', 'detail': detail})}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface any failure to the client
            logger.error("Streamed analysis failed: %s", exc)
            yield f"data: {json.dumps({'stage': 'error', 'detail': 'Analysis failed. Please try again.'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
