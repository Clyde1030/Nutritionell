"""
Mock analyze endpoint — returns 5 hardcoded products with full reasoning_by_factor.
POST /api/analyze/mock

Mirrors /api/analyze's contract deliberately: auth required, no client-supplied
profile_id. The frontend's USE_MOCK_ANALYZE flag points local testing here, so if
this drifted from the real route, flipping that flag would quietly exercise a
different auth behaviour than production.
"""
import io

from fastapi import APIRouter, Depends, File, UploadFile
from PIL import Image

from app.models.user import User
from app.services.auth_service import get_current_approved_user
from app.schemas.ai_output import (
    Detection, NutritionalFacts, PerformanceSummary, ProductItem,
    ScoreBreakdown, ScoreEnum, ShelfAnalysisResponse,
)
from app.services.image_utils import encode_jpeg_data_uri

router = APIRouter(prefix="/api/analyze", tags=["mock"])


def _mock_crop(color: tuple[int, int, int]) -> str:
    """A small solid-colour JPEG standing in for a real product crop."""
    img = Image.new("RGB", (120, 160), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return encode_jpeg_data_uri(buf.getvalue())

MOCK_RESULT = ShelfAnalysisResponse(
    total_products_found=5,
    analysis_notes="Mock response — no Gemini call made.",
    products=[
        ProductItem(
            brand="Kellogg's", product_name="Frosted Flakes",
            variant="Original", canonical_search_name="Kellogg's Frosted Flakes Original",
            scoring=ScoreEnum.DOESNT_FIT,
            score_breakdown=ScoreBreakdown(
                hard_exclusion=True,
                hard_exclusion_reasons=["Contains high-fructose corn syrup, on your avoided-ingredients list"],
            ),
            reasoning="Contains high-fructose corn syrup, which is on your avoided-ingredient list; this alone triggers a hard exclusion regardless of other factors.",
            reasoning_by_factor=[
                "🚫 Avoided ingredients: Contains high-fructose corn syrup (on your avoid list) — hard exclusion",
                "🏭 Processing: NOVA 4 (ultra-processed) would also exceed your stated tolerance",
                "🎯 Goals: 12g added sugar conflicts with your 'less sugar' goal",
            ],
            bounding_box=[0.05, 0.02, 0.45, 0.30],
            data_source="usda_rag",
            processing_level=4,
            allergens=[],
            dietary_tags=["vegetarian"],
            crop_image=_mock_crop((230, 126, 34)),
            nutritional_facts=NutritionalFacts(
                calories=150, serving_size="1 cup (37g)",
                total_fat_g=0.5, saturated_fat_g=0.0, trans_fat_g=0.0,
                cholesterol_mg=0, sodium_mg=190,
                total_carbohydrate_g=37, dietary_fiber_g=1,
                total_sugars_g=14, added_sugars_g=12, protein_g=2,
                flagged_ingredients=["high-fructose corn syrup", "BHT"],
                detected_ingredients=["milled corn", "sugar", "high-fructose corn syrup", "malt flavor", "salt", "BHT"],
            ),
        ),
        ProductItem(
            brand="General Mills", product_name="Cheerios",
            variant="Original", canonical_search_name="General Mills Cheerios Original",
            scoring=ScoreEnum.JUST_OK,
            score_breakdown=ScoreBreakdown(
                hard_exclusion=False,
                philosophy_score=0, goal_score=1, ingredient_score=1,
                processing_score=0, nutrition_score=1, total_score=3,
            ),
            reasoning="No hard exclusions. Whole-grain oats and only 1g sugar support your goals moderately; NOVA 2 processing is within tolerance; total score 3 lands in the Just OK Fit band.",
            reasoning_by_factor=[
                "🎯 Goals: Only 1g sugar moderately supports your low-sugar goal",
                "🍽️ Ingredient quality: Simple, recognizable ingredients",
                "🏭 Processing: NOVA 2 — within your processing tolerance",
                "✅ Allergies: No allergy triggers detected",
            ],
            bounding_box=[0.05, 0.32, 0.45, 0.62],
            data_source="usda_rag",
            processing_level=2,
            allergens=[],
            dietary_tags=["vegetarian"],
            crop_image=_mock_crop((222, 184, 135)),
            nutritional_facts=NutritionalFacts(
                calories=100, serving_size="1 cup (28g)",
                total_fat_g=2, saturated_fat_g=0.5, trans_fat_g=0.0,
                cholesterol_mg=0, sodium_mg=140,
                total_carbohydrate_g=20, dietary_fiber_g=3,
                total_sugars_g=1, added_sugars_g=0, protein_g=3,
                flagged_ingredients=[],
                detected_ingredients=["whole grain oats", "modified corn starch", "sugar", "oat bran", "salt"],
            ),
        ),
        ProductItem(
            brand="Store Brand", product_name="Plain Sparkling Water",
            variant="Original", canonical_search_name="Store Brand Plain Sparkling Water",
            scoring=ScoreEnum.NEUTRAL,
            score_breakdown=ScoreBreakdown(
                hard_exclusion=False,
                philosophy_score=0, goal_score=0, ingredient_score=0,
                processing_score=1, nutrition_score=0, total_score=1,
            ),
            reasoning="No hard exclusions and no concerning ingredients, but plain carbonated water doesn't meaningfully advance any of your stated goals — total score 1 lands in the Neutral Fit band.",
            reasoning_by_factor=[
                "✅ Allergies: No allergy triggers detected",
                "🚫 Avoided ingredients: None found",
                "🏭 Processing: NOVA 1 — within your processing tolerance",
                "🎯 Goals: No notable nutrients, positive or negative",
            ],
            bounding_box=[0.90, 0.02, 0.98, 0.20],
            data_source="usda_rag",
            processing_level=1,
            allergens=[],
            dietary_tags=["vegan", "vegetarian"],
            crop_image=_mock_crop((173, 216, 230)),
            nutritional_facts=NutritionalFacts(
                calories=0, serving_size="12 fl oz (355ml)",
                total_fat_g=0, saturated_fat_g=0, trans_fat_g=0.0,
                cholesterol_mg=0, sodium_mg=10,
                total_carbohydrate_g=0, dietary_fiber_g=0,
                total_sugars_g=0, added_sugars_g=0, protein_g=0,
                flagged_ingredients=[],
                detected_ingredients=["carbonated water", "natural flavor"],
            ),
        ),
        ProductItem(
            brand="Kind", product_name="Dark Chocolate Nuts & Sea Salt",
            variant="Dark Chocolate Nuts & Sea Salt", canonical_search_name="Kind Dark Chocolate Nuts & Sea Salt Bar",
            scoring=ScoreEnum.GREAT,
            score_breakdown=ScoreBreakdown(
                hard_exclusion=False,
                philosophy_score=2, goal_score=2, ingredient_score=2,
                processing_score=0, nutrition_score=2, total_score=8,
            ),
            reasoning="Strongly aligns with your dietary philosophy and goals, clean ingredient list, and solid nutrition profile — total score 8 lands in the Great Fit band. Contains tree nuts, flagged for your Tree Nut Allergy.",
            reasoning_by_factor=[
                "📖 Philosophy: 5g net carbs well within your low-carb rules — strong alignment",
                "🎯 Goals: 15g healthy fats + 6g protein strongly support your goals",
                "⚠️ Allergies: Contains tree nuts — you selected Tree Nut Allergy, review before eating",
                "🏭 Processing: NOVA 2 — well within your processing tolerance",
            ],
            bounding_box=[0.48, 0.02, 0.88, 0.47],
            data_source="usda_rag",
            processing_level=2,
            allergens=["tree nuts", "peanuts", "soy"],
            dietary_tags=["gluten-free"],
            crop_image=_mock_crop((101, 67, 33)),
            nutritional_facts=NutritionalFacts(
                calories=200, serving_size="1 bar (40g)",
                total_fat_g=15, saturated_fat_g=2.5, trans_fat_g=0.0,
                cholesterol_mg=0, sodium_mg=125,
                total_carbohydrate_g=16, dietary_fiber_g=7,
                total_sugars_g=5, added_sugars_g=4, protein_g=6,
                flagged_ingredients=[],
                detected_ingredients=["almonds", "peanuts", "dark chocolate", "chicory root fiber", "honey", "sea salt", "soy lecithin"],
            ),
        ),
        ProductItem(
            brand="Unknown", product_name="Unidentified Product",
            variant=None, canonical_search_name=None,
            scoring=ScoreEnum.UNIDENTIFIED,
            score_breakdown=ScoreBreakdown(hard_exclusion=False),
            reasoning="Could not confidently identify this product from the photo. Cannot evaluate against your profile.",
            reasoning_by_factor=["❓ Not identified with enough confidence — no evaluation possible"],
            bounding_box=[0.48, 0.52, 0.88, 0.95],
            data_source="unidentified",
            processing_level=None,
            allergens=[],
            dietary_tags=[],
            nutritional_facts=NutritionalFacts(flagged_ingredients=[], detected_ingredients=[]),
        ),
    ],
    detections=[
        Detection(bounding_box=[0.05, 0.02, 0.45, 0.30], status="unique", product_index=0),
        Detection(bounding_box=[0.05, 0.32, 0.45, 0.62], status="unique", product_index=1),
        Detection(bounding_box=[0.90, 0.02, 0.98, 0.20], status="unique", product_index=2),
        Detection(bounding_box=[0.48, 0.02, 0.88, 0.47], status="unique", product_index=3),
        Detection(bounding_box=[0.48, 0.52, 0.88, 0.95], status="unidentified", product_index=4),
        # two duplicate facings -> inherit their unique twin's score/colour
        Detection(bounding_box=[0.05, 0.63, 0.45, 0.92], status="duplicate", product_index=3),
        Detection(bounding_box=[0.47, 0.02, 0.72, 0.30], status="duplicate", product_index=0),
    ],
    performance=PerformanceSummary(
        detect_ms=180, identify_ms=42000, usda_ms=3200, scoring_ms=9800,
        analysis_ms=13000, total_ms=55380,
        detected_count=7, identified_count=6, unique_count=4, duplicate_count=2, unidentified_count=1,
    ),
)


@router.post("/mock", response_model=ShelfAnalysisResponse)
async def mock_analyze(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_approved_user),
):
    await image.read()
    return MOCK_RESULT
