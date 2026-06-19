"""
Shelf analysis endpoint — the main pipeline trigger.

Route:
  POST /api/analyze   multipart/form-data
    - image      : UploadFile  (JPEG / PNG from the camera)
    - profile_id : str (UUID of the user's saved profile)
"""
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import UserProfile
from app.schemas.ai_output import ShelfAnalysisResponse
from app.services.gemini_service import GeminiService

router = APIRouter(prefix="/api", tags=["analyze"])

gemini_service = GeminiService()


@router.post("/analyze", response_model=ShelfAnalysisResponse)
async def analyze_shelf(
    image: UploadFile = File(..., description="JPEG or PNG photo of a grocery shelf"),
    profile_id: str = Form(..., description="UUID of the user profile to use for scoring"),
    db: AsyncSession = Depends(get_db),
):
    # ── Validate image MIME type ────────────────────────────────────────────
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{image.content_type}'. Use JPEG or PNG.",
        )

    # ── Load user profile ───────────────────────────────────────────────────
    try:
        uid = str(UUID(profile_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid profile_id UUID format")

    result = await db.execute(select(UserProfile).where(UserProfile.id == uid))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")

    # ── Read image bytes ────────────────────────────────────────────────────
    image_bytes = await image.read()
    if len(image_bytes) > 20 * 1024 * 1024:  # 20 MB guard
        raise HTTPException(status_code=413, detail="Image too large. Max 20 MB.")

    # ── Run the AI pipeline ─────────────────────────────────────────────────
    analysis = await gemini_service.analyze_shelf(
        image_bytes=image_bytes,
        mime_type=image.content_type,
        profile=profile,
        db=db,
    )

    return analysis
