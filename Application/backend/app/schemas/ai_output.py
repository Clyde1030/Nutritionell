"""
Pydantic schemas for the shelf analysis AI output.
"""
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ScoreEnum(str, Enum):
    GREAT = "Great"
    OK = "OK"
    AVOID = "Avoid"
    UNIDENTIFIED = "Unidentified"


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
    nutritional_facts: NutritionalFacts
    scoring: ScoreEnum
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


class ShelfAnalysisResponse(BaseModel):
    products: List[ProductItem]
    total_products_found: int
    analysis_notes: Optional[str] = None
