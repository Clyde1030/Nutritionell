"""
Mock analyze endpoint — returns 4 hardcoded products with full reasoning_by_factor.
POST /api/analyze/mock
"""
from fastapi import APIRouter, File, Form, UploadFile
from app.schemas.ai_output import (
    NutritionalFacts, ProductItem, ScoreEnum, ShelfAnalysisResponse,
)

router = APIRouter(prefix="/api/analyze", tags=["mock"])

MOCK_RESULT = ShelfAnalysisResponse(
    total_products_found=4,
    analysis_notes="Mock response — no Gemini call made.",
    products=[
        ProductItem(
            brand="Kellogg's", product_name="Frosted Flakes",
            scoring=ScoreEnum.AVOID,
            reasoning="Contains 12g added sugar per serving which conflicts with your low-sugar goal; high-fructose corn syrup is on your avoided ingredient list; NOVA score 4 exceeds your processing tolerance.",
            reasoning_by_factor=[
                "🎯 Goals: 12g added sugar directly conflicts with 'less sugar' goal",
                "🚫 Avoided ingredients: Contains high-fructose corn syrup (on your avoid list)",
                "🏭 Processing: NOVA 4 (ultra-processed) exceeds your tolerance of moderate",
                "📖 Philosophy: High net carbs (36g) conflicts with Keto rules (<10g net carbs)",
            ],
            bounding_box=[0.05, 0.02, 0.45, 0.30],
            data_source="usda_rag",
            processing_level=4,
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
            scoring=ScoreEnum.OK,
            reasoning="Whole grain oats are a decent choice with only 1g sugar; however 20g total carbs is moderate for Keto. Clean ingredient list with no avoided items.",
            reasoning_by_factor=[
                "📖 Philosophy: 20g carbs is moderate — borderline for Keto threshold",
                "🎯 Goals: Only 1g sugar — aligns well with low-sugar goal",
                "✅ Allergies: No allergy triggers detected",
                "🏭 Processing: NOVA 2 — within your processing tolerance",
            ],
            bounding_box=[0.05, 0.32, 0.45, 0.62],
            data_source="usda_rag",
            processing_level=2,
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
            brand="Kind", product_name="Dark Chocolate Nuts & Sea Salt",
            scoring=ScoreEnum.GREAT,
            reasoning="High healthy fats (15g), only 5g net carbs, 6g protein — ideal for Keto. Clean label with no avoided ingredients. NOVA 2 within your tolerance.",
            reasoning_by_factor=[
                "📖 Philosophy: 5g net carbs well within Keto limit — Great",
                "🎯 Goals: 15g healthy fats + 6g protein support your goals",
                "✅ Allergies: Contains tree nuts — flagged since you selected Tree Nut Allergy",
                "🏭 Processing: NOVA 2 — well within your processing tolerance",
            ],
            bounding_box=[0.48, 0.02, 0.88, 0.47],
            data_source="usda_rag",
            processing_level=2,
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
            scoring=ScoreEnum.UNIDENTIFIED,
            reasoning="Label text is illegible in this image. Cannot evaluate against your profile.",
            reasoning_by_factor=["❓ Cannot read label — no evaluation possible"],
            bounding_box=[0.48, 0.52, 0.88, 0.95],
            data_source="unidentified",
            processing_level=None,
            nutritional_facts=NutritionalFacts(flagged_ingredients=[], detected_ingredients=[]),
        ),
    ],
)


@router.post("/mock", response_model=ShelfAnalysisResponse)
async def mock_analyze(
    image: UploadFile = File(...),
    profile_id: str = Form(...),
):
    await image.read()
    return MOCK_RESULT
