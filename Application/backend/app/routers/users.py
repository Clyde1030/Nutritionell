"""
CRUD endpoints for user profiles + nutrition plan generation.
"""
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import UserProfile
from app.schemas.user import (
    NutritionPlanRequest,
    NutritionPlanResponse,
    NutritionPlanStep,
    ProfileOptionsResponse,
    UserProfileCreate,
    UserProfileResponse,
    UserProfileUpdate,
    DIETARY_PHILOSOPHIES,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/options", response_model=ProfileOptionsResponse)
async def get_profile_options():
    return ProfileOptionsResponse()


@router.post("", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(body: UserProfileCreate, db: AsyncSession = Depends(get_db)):
    profile = UserProfile(
        name=body.name,
        allergies_and_conditions=body.allergies_and_conditions,
        free_text_goals=body.free_text_goals,
        dietary_philosophy=body.dietary_philosophy,
        philosophy_customizations=body.philosophy_customizations,
        custom_philosophy_text=body.custom_philosophy_text,
        avoided_ingredients=body.avoided_ingredients,
        processed_food_tolerance=body.processed_food_tolerance,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=UserProfileResponse)
async def get_profile(profile_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserProfile).where(UserProfile.id == str(profile_id)))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/{profile_id}", response_model=UserProfileResponse)
async def update_profile(
    profile_id: UUID, body: UserProfileUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserProfile).where(UserProfile.id == str(profile_id)))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/nutrition-plan", response_model=NutritionPlanResponse)
async def generate_nutrition_plan(
    body: NutritionPlanRequest, db: AsyncSession = Depends(get_db)
):
    """Generate a personalised nutrition plan via Gemini based on the user's full profile."""
    try:
        uid = str(UUID(body.profile_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid profile_id")

    result = await db.execute(select(UserProfile).where(UserProfile.id == uid))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    from app.services.gemini_service import GeminiService
    svc = GeminiService()
    plan = await svc.generate_nutrition_plan(profile)
    return plan
