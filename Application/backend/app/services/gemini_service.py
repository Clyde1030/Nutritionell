"""
Gemini multimodal AI service — shelf analysis + nutrition plan generation.
"""
import json
import logging
from typing import Optional

from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import UserProfile
from app.schemas.ai_output import (
    NutritionalFacts,
    ProductItem,
    ScoreEnum,
    ShelfAnalysisResponse,
)
from app.schemas.user import (
    DIETARY_PHILOSOPHIES,
    NutritionPlanResponse,
    NutritionPlanStep,
)
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)

PHILOSOPHY_MAP = {p["key"]: p for p in DIETARY_PHILOSOPHIES}

PROCESSING_LEVEL_LABELS = {
    0: "unprocessed whole foods only",
    1: "minimally processed only",
    2: "low processing acceptable",
    3: "moderate processing acceptable",
    4: "no restriction on processing",
}


def _build_profile_context(profile: UserProfile) -> str:
    """Serialise a user profile into a rich prompt context string."""
    philosophy_key = profile.dietary_philosophy or "No Preference"
    phil_data = PHILOSOPHY_MAP.get(philosophy_key, PHILOSOPHY_MAP["No Preference"])
    phil_text = f"{philosophy_key}: {phil_data['description']}"

    customizations = ""
    if profile.philosophy_customizations:
        try:
            c = json.loads(profile.philosophy_customizations)
            parts = []
            if c.get("stricter"):
                parts.append(f"Made stricter: {', '.join(c['stricter'])}")
            if c.get("lenient"):
                parts.append(f"Made more lenient: {', '.join(c['lenient'])}")
            if c.get("extra"):
                parts.append(f"Extra rules: {', '.join(c['extra'])}")
            if parts:
                customizations = "\n  Customisations: " + "; ".join(parts)
        except Exception:
            pass

    if profile.custom_philosophy_text:
        phil_text = f"CUSTOM PHILOSOPHY: {profile.custom_philosophy_text}"

    allergies = profile.allergies_and_conditions or []
    avoided = profile.avoided_ingredients or []
    tolerance = PROCESSING_LEVEL_LABELS.get(
        profile.processed_food_tolerance or 3, "moderate processing acceptable"
    )

    return f"""USER PROFILE:
Name: {profile.name or 'User'}
Dietary Philosophy: {phil_text}{customizations}
Allergies & Conditions: {', '.join(allergies) if allergies else 'None'}
Health Goals: {profile.free_text_goals or 'None provided'}
Ingredients to Always Avoid: {', '.join(avoided) if avoided else 'None'}
Processed Food Tolerance: {tolerance} (NOVA scale: {profile.processed_food_tolerance or 3}/4)"""


class GeminiService:
    def __init__(self):
        self._client: Optional[genai.Client] = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            if not settings.gemini_api_key:
                raise RuntimeError("GEMINI_API_KEY is not set in .env")
            self._client = genai.Client(api_key=settings.gemini_api_key)
        return self._client

    # ── Shelf analysis ────────────────────────────────────────────────────────

    async def analyze_shelf(
        self,
        image_bytes: bytes,
        mime_type: str,
        profile: UserProfile,
        db: AsyncSession,
    ) -> ShelfAnalysisResponse:
        raw_products = await self._vision_pass(image_bytes, mime_type, profile)

        enriched = []
        for item in raw_products:
            usda_food = await rag_service.lookup(
                product_name=item.get("product_name", ""),
                brand=item.get("brand", ""),
                db=db,
            )
            item["_usda"] = usda_food
            enriched.append(item)

        products = await self._scoring_pass(enriched, profile)
        return ShelfAnalysisResponse(
            products=products,
            total_products_found=len(products),
        )

    async def _vision_pass(
        self, image_bytes: bytes, mime_type: str, profile: UserProfile
    ) -> list[dict]:
        system_prompt = (
            "You are a grocery shelf analysis AI. "
            "Identify EVERY visible food product in the image.\n\n"
            "For each product return a JSON object with these exact keys:\n"
            "  brand          : string (brand name or 'Unknown')\n"
            "  product_name   : string (product name or 'Unidentified Product')\n"
            "  bounding_box   : [ymin, xmin, ymax, xmax] normalised 0.0-1.0\n"
            "  visible_text   : string (all text visible on the label)\n"
            "  detected_ingredients : array of strings (ingredient names you can read)\n\n"
            "Return ONLY a JSON array. No markdown, no commentary."
        )
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        response = self.client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[system_prompt, image_part],
            config=types.GenerateContentConfig(
                temperature=0.1, response_mime_type="application/json"
            ),
        )
        try:
            raw = json.loads(response.text)
            if not isinstance(raw, list):
                raw = raw.get("products", raw.get("items", [raw]))
            return raw
        except Exception as exc:
            logger.error("Vision pass parse error: %s", exc)
            return []

    async def _scoring_pass(
        self, enriched_products: list[dict], profile: UserProfile
    ) -> list[ProductItem]:
        if not enriched_products:
            return []

        profile_ctx = _build_profile_context(profile)

        product_summaries = []
        for i, item in enumerate(enriched_products):
            usda = item.get("_usda")
            usda_text = "No USDA data found."
            if usda:
                nutrients = usda.nutrient_dict()
                top = {k: v for k, v in list(nutrients.items())[:12]}
                usda_text = (
                    f"USDA: {usda.brand or 'N/A'} – {usda.product_name}\n"
                    f"  Ingredients: {usda.ingredients or 'N/A'}\n"
                    f"  Nutrients/100g: {json.dumps(top)}\n"
                    f"  Allergen flags: gluten={usda.contains_gluten}, peanuts={usda.contains_peanuts}, "
                    f"dairy={usda.contains_dairy}, soy={usda.contains_soy}"
                )
            detected_ingredients = item.get("detected_ingredients", [])
            product_summaries.append(
                f"[{i}] {item.get('brand','Unknown')} – {item.get('product_name','Unidentified')}\n"
                f"  Visible text: {item.get('visible_text','')}\n"
                f"  Detected ingredients: {', '.join(detected_ingredients) if detected_ingredients else 'unknown'}\n"
                f"  {usda_text}"
            )

        system_prompt = f"""You are a precision nutrition scoring AI.

{profile_ctx}

SCORING RULES:
- "Great"        : Well-aligned with ALL profile criteria
- "OK"           : Acceptable with minor concerns
- "Avoid"        : Conflicts with philosophy, triggers allergy, contains avoided ingredient, OR exceeds processing tolerance
- "Unidentified" : Label illegible, cannot evaluate

IMPORTANT: Your reasoning MUST explicitly address EACH of these factors IF relevant:
1. Dietary philosophy compatibility
2. Any allergy or medical condition triggers
3. Any avoided ingredients found in this product
4. Processing level vs user's tolerance (NOVA 1-4)
5. How it relates to user's stated health goals

PRODUCTS TO SCORE:
{chr(10).join(product_summaries)}

Return a JSON array (one object per product, same order) with:
  brand, product_name, scoring, reasoning (full sentence addressing all relevant factors, max 400 chars),
  reasoning_by_factor (array of short bullet strings, one per relevant factor),
  calories, serving_size, total_fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg,
  sodium_mg, total_carbohydrate_g, dietary_fiber_g, total_sugars_g, added_sugars_g, protein_g,
  flagged_ingredients (array of concerning ingredients found),
  detected_ingredients (full array of all ingredients),
  processing_level (integer 1-4 NOVA score or null)

Return ONLY the JSON array."""

        response = self.client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=system_prompt,
            config=types.GenerateContentConfig(
                temperature=0.1, response_mime_type="application/json"
            ),
        )

        try:
            scored = json.loads(response.text)
            if not isinstance(scored, list):
                scored = scored.get("products", [scored])
        except Exception as exc:
            logger.error("Scoring pass parse error: %s", exc)
            scored = []

        results: list[ProductItem] = []
        for i, item in enumerate(enriched_products):
            sd = scored[i] if i < len(scored) else {}
            bbox = item.get("bounding_box", [0.0, 0.0, 1.0, 1.0])
            try:
                bbox = [float(v) for v in bbox[:4]]
                while len(bbox) < 4:
                    bbox.append(0.0)
            except Exception:
                bbox = [0.0, 0.0, 1.0, 1.0]

            usda = item.get("_usda")
            data_source = "usda_rag" if usda else (
                "unidentified" if sd.get("scoring") == "Unidentified" else "vision_only"
            )

            try:
                score_val = ScoreEnum(sd.get("scoring", "Unidentified"))
            except ValueError:
                score_val = ScoreEnum.UNIDENTIFIED

            results.append(ProductItem(
                brand=sd.get("brand") or item.get("brand", "Unknown"),
                product_name=sd.get("product_name") or item.get("product_name", "Unidentified Product"),
                nutritional_facts=NutritionalFacts(
                    calories=sd.get("calories"),
                    serving_size=sd.get("serving_size"),
                    total_fat_g=sd.get("total_fat_g"),
                    saturated_fat_g=sd.get("saturated_fat_g"),
                    trans_fat_g=sd.get("trans_fat_g"),
                    cholesterol_mg=sd.get("cholesterol_mg"),
                    sodium_mg=sd.get("sodium_mg"),
                    total_carbohydrate_g=sd.get("total_carbohydrate_g"),
                    dietary_fiber_g=sd.get("dietary_fiber_g"),
                    total_sugars_g=sd.get("total_sugars_g"),
                    added_sugars_g=sd.get("added_sugars_g"),
                    protein_g=sd.get("protein_g"),
                    flagged_ingredients=sd.get("flagged_ingredients", []),
                    detected_ingredients=sd.get("detected_ingredients", item.get("detected_ingredients", [])),
                ),
                scoring=score_val,
                reasoning=sd.get("reasoning", "Could not evaluate this product."),
                reasoning_by_factor=sd.get("reasoning_by_factor", []),
                bounding_box=bbox,
                data_source=data_source,
                processing_level=sd.get("processing_level"),
            ))

        return results

    # ── Nutrition plan ────────────────────────────────────────────────────────

    async def generate_nutrition_plan(self, profile: UserProfile) -> NutritionPlanResponse:
        profile_ctx = _build_profile_context(profile)

        prompt = f"""You are a professional registered dietitian creating a personalised nutrition plan.

{profile_ctx}

Generate a detailed, actionable nutrition plan. Return ONLY a JSON object with these exact keys:
  summary              : string (2-3 sentence overview of this person's nutritional approach)
  daily_targets        : object mapping nutrient names to target values/ranges (e.g. {{"Protein": "120-150g", "Net Carbs": "<50g"}})
  weekly_focus_areas   : array of strings (3-5 focus areas for the week)
  steps                : array of objects each with {{title: string, detail: string, priority: "high"|"medium"|"low"}}
                         (8-12 concrete actionable steps)
  foods_to_emphasise   : array of strings (10-15 specific foods to eat more of)
  foods_to_limit       : array of strings (8-12 specific foods to reduce or eliminate)
  supplements_to_consider : array of strings (relevant supplements with brief reason, or empty if none)
  lifestyle_notes      : array of strings (timing, meal frequency, other lifestyle factors)

Return ONLY the JSON object. No markdown."""

        response = self.client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3, response_mime_type="application/json"
            ),
        )

        try:
            data = json.loads(response.text)
        except Exception as exc:
            logger.error("Nutrition plan parse error: %s", exc)
            data = {}

        steps = [
            NutritionPlanStep(
                title=s.get("title", "Step"),
                detail=s.get("detail", ""),
                priority=s.get("priority", "medium"),
            )
            for s in data.get("steps", [])
        ]

        return NutritionPlanResponse(
            summary=data.get("summary", "Unable to generate plan."),
            daily_targets=data.get("daily_targets", {}),
            weekly_focus_areas=data.get("weekly_focus_areas", []),
            steps=steps,
            foods_to_emphasise=data.get("foods_to_emphasise", []),
            foods_to_limit=data.get("foods_to_limit", []),
            supplements_to_consider=data.get("supplements_to_consider", []),
            lifestyle_notes=data.get("lifestyle_notes", []),
        )
