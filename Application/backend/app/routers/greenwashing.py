"""
Greenwash marketing-honesty analysis.

Route:
  POST /api/greenwashing/analyze   multipart/form-data → full JSON result
    - image : UploadFile  (JPEG / PNG / WebP / iPhone HEIC)

Runs on the backend (behind the ALB's 180s timeout) rather than as a Next.js
route on Amplify, whose SSR compute has a hard, unconfigurable 30s timeout
that a full single-product Gemini analysis can exceed.
"""
import logging

import pillow_heif
from fastapi import APIRouter, File, HTTPException, UploadFile
from google.genai import errors as genai_errors
from PIL import Image, ImageOps
import io

from app.services.gemini_service import GeminiService

pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/greenwashing", tags=["greenwashing"])

gemini_service = GeminiService()

_STANDARD_TYPES = ("image/jpeg", "image/png", "image/webp")
_HEIC_TYPES = ("image/heic", "image/heif")


def _is_heic(content_type: str, filename: str) -> bool:
    return content_type in _HEIC_TYPES or filename.lower().endswith((".heic", ".heif"))


@router.post("/analyze")
async def analyze_greenwashing(image: UploadFile = File(..., description="Photo of a single product's label")):
    content_type = (image.content_type or "").lower()
    filename = image.filename or ""
    is_heic = _is_heic(content_type, filename)
    if not is_heic and content_type not in _STANDARD_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{image.content_type}'. Use JPEG, PNG, WebP, or an iPhone (HEIC) photo.",
        )

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

    try:
        return await gemini_service.analyze_greenwashing(image_bytes=image_bytes, mime_type=mime_type)
    except genai_errors.APIError as exc:
        logger.error("Gemini API error during greenwashing analysis: %s", exc)
        if getattr(exc, "code", None) == 429:
            raise HTTPException(
                status_code=429,
                detail="AI usage limit reached (Gemini quota or rate limit). Wait a moment and try again.",
            )
        raise HTTPException(
            status_code=503,
            detail="The AI analysis service is temporarily unavailable. Please try again in a moment.",
        )
