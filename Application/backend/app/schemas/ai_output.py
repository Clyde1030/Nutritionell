"""
Pydantic schemas for the shelf analysis AI output.
"""
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ScoreEnum(str, Enum):
    GREAT = "Great Fit"
    JUST_OK = "Just OK Fit"
    NEUTRAL = "Neutral Fit"
    DOESNT_FIT = "Doesn't Fit"
    UNIDENTIFIED = "Unidentified"


class ScoreBreakdown(BaseModel):
    """Deterministic per-dimension scoring — see gemini_service._scoring_pass.

    hard_exclusion short-circuits scoring to "Doesn't Fit" (allergy, avoided
    ingredient, philosophy conflict, processing-tolerance breach, or a
    conflicting medical condition); the five dimension scores + total_score
    are only meaningful when hard_exclusion is false.
    """
    hard_exclusion: bool = False
    hard_exclusion_reasons: List[str] = Field(default_factory=list)
    philosophy_score: Optional[float] = None
    goal_score: Optional[float] = None
    ingredient_score: Optional[float] = None
    processing_score: Optional[float] = None
    nutrition_score: Optional[float] = None
    total_score: Optional[float] = None


class NutritionalFacts(BaseModel):
    calories: Optional[float] = None
    serving_size: Optional[str] = None
    total_fat_g: Optional[float] = None
    saturated_fat_g: Optional[float] = None
    trans_fat_g: Optional[float] = None
    cholesterol_mg: Optional[float] = None
    sodium_mg: Optional[float] = None
    total_carbohydrate_g: Optional[float] = None
    dietary_fiber_g: Optional[float] = None
    total_sugars_g: Optional[float] = None
    added_sugars_g: Optional[float] = None
    protein_g: Optional[float] = None
    vitamin_d_pct: Optional[float] = None
    calcium_pct: Optional[float] = None
    iron_pct: Optional[float] = None
    potassium_pct: Optional[float] = None
    flagged_ingredients: List[str] = Field(default_factory=list)
    # New: full detected ingredient list for avoidance checking
    detected_ingredients: List[str] = Field(default_factory=list)


class ProductItem(BaseModel):
    brand: str
    product_name: str
    variant: Optional[str] = None
    canonical_search_name: Optional[str] = None
    nutritional_facts: NutritionalFacts
    scoring: ScoreEnum
    score_breakdown: Optional[ScoreBreakdown] = None
    # Full reasoning referencing every relevant profile factor
    reasoning: str = Field(max_length=600)
    # Specific reasons broken out by profile factor
    reasoning_by_factor: List[str] = Field(
        default_factory=list,
        description="One bullet per profile factor: allergy, philosophy, avoided ingredient, processing level, goals"
    )
    bounding_box: List[float] = Field(min_length=4, max_length=4)
    data_source: Optional[str] = None
    processing_level: Optional[int] = Field(
        None, description="NOVA score 1-4: 1=unprocessed, 4=ultra-processed"
    )
    allergens: List[str] = Field(default_factory=list)
    dietary_tags: List[str] = Field(default_factory=list)
    crop_image: Optional[str] = Field(
        None, description="data: URI (base64 JPEG) of the exact crop this product was identified from"
    )


class Detection(BaseModel):
    """One YOLO-detected box, mapped to a scored product (or none).

    `status` is the box's role in the pipeline:
      - "unique"       : first facing of an identified product; it was scored
      - "duplicate"    : a repeat facing; inherits its unique twin's score/colour
      - "unidentified" : the product could not be identified
    `product_index` points into ShelfAnalysisResponse.products for the product
    whose score colours this box (the product itself for unique, the unique twin
    for duplicate, the Unidentified entry for unidentified); None if unmapped.
    """
    bounding_box: List[float] = Field(min_length=4, max_length=4)
    status: str = "unique"
    product_index: Optional[int] = None


class PerformanceSummary(BaseModel):
    """Per-stage timings (ms) + counts, surfaced in the progress + results UI."""
    detect_ms: Optional[float] = None
    identify_ms: Optional[float] = None
    usda_ms: Optional[float] = None
    scoring_ms: Optional[float] = None
    analysis_ms: Optional[float] = None      # usda_ms + scoring_ms ("nutrition analysis")
    total_ms: Optional[float] = None
    detected_count: int = 0
    identified_count: int = 0
    unique_count: int = 0
    duplicate_count: int = 0
    unidentified_count: int = 0


class ShelfAnalysisResponse(BaseModel):
    products: List[ProductItem]
    total_products_found: int
    analysis_notes: Optional[str] = None
    # Every detected box (not just scored products), for full-image overlay + dedup colouring.
    detections: List[Detection] = Field(default_factory=list)
    performance: Optional[PerformanceSummary] = None
