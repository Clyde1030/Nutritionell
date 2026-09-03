"""
Profile endpoints + nutrition plan generation.

Every route here resolves the profile from the authenticated user. There is no
profile id in any URL or body: a client cannot name a profile, so it cannot read
or mutate someone else's. `/options` is static reference data and stays open.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from google.genai import errors as genai_errors
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserProfile
from app.services.auth_service import get_current_approved_user
from app.schemas.user import (
    NutritionPlanResponse,
    NutritionPlanStep,
    ProfileOptionsResponse,
    UserProfileResponse,
    UserProfileUpdate,
    DIETARY_PHILOSOPHIES,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/options", response_model=ProfileOptionsResponse)
async def get_profile_options():
    return ProfileOptionsResponse()


async def _own_profile(db: AsyncSession, current_user: User) -> UserProfile:
    """The caller's profile, or 404.

    Signup creates a profile for every account, so a missing one means the row
    was deleted out from under the account rather than a normal state.
    """
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


# NOTE: there is no POST /api/profile any more. Signup creates the one profile an
# account gets, and the 1:1 rule means a second one must never be creatable — so
# the route is gone rather than kept as an authenticated no-op that could drift.


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_approved_user),
    db: AsyncSession = Depends(get_db),
):
    return await _own_profile(db, current_user)


@router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    body: UserProfileUpdate,
    current_user: User = Depends(get_current_approved_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _own_profile(db, current_user)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/nutrition-plan", response_model=NutritionPlanResponse)
async def generate_nutrition_plan(
    current_user: User = Depends(get_current_approved_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a personalised nutrition plan via Gemini from the caller's profile.

    Takes no body: the profile is whoever is holding the token.
    """
    profile = await _own_profile(db, current_user)

    from app.services.gemini_service import GeminiService
    svc = GeminiService()
    try:
        plan = await svc.generate_nutrition_plan(profile)
    except genai_errors.APIError as exc:
        logger.error("Gemini API error during nutrition plan generation: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="The AI planning service is temporarily unavailable. Please try again in a moment.",
        )
    return plan
