"""
Alternative-product recommendations for a scanned product.

Route:
  POST /api/recommender   { "product": {...} }  ->  { "alternatives": [...] }

Runs on the backend (behind the ALB's 180s timeout, with GeminiService's
retry/backoff) rather than as a Next.js route on Amplify, whose SSR compute
has a hard, unconfigurable 30s timeout and no retry logic -- any slow or
transient Gemini response surfaced to users as a timeout on the Scan tab's
alternatives panel.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors
from pydantic import BaseModel

from app.models.user import User
from app.services.auth_service import get_current_approved_user
from app.services.gemini_service import GeminiService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["recommender"])

gemini_service = GeminiService()


class RecommenderRequest(BaseModel):
    product: dict


@router.post("/recommender")
async def recommend(
    body: RecommenderRequest,
    current_user: User = Depends(get_current_approved_user),
):
    # No user-owned data here either — login is required per the product rule
    # that key features are account-gated, not for an ownership check.
    try:
        return await gemini_service.recommend_alternatives(body.product)
    except genai_errors.APIError as exc:
        logger.error("Gemini API error during recommendation: %s", exc)
        if getattr(exc, "code", None) == 429:
            raise HTTPException(
                status_code=429,
                detail="AI usage limit reached (Gemini quota or rate limit). Try again in a moment.",
            )
        raise HTTPException(
            status_code=503,
            detail="The AI analysis service is temporarily unavailable. Please try again in a moment.",
        )
