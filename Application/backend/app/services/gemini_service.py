"""
Gemini multimodal AI service — shelf analysis + nutrition plan generation.
"""
import asyncio
import io
import json
import logging
from typing import Optional

from google import genai
from google.genai import errors, types
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import UserProfile
from app.schemas.ai_output import (
    NutritionalFacts,
    ProductItem,
    ScoreBreakdown,
    ScoreEnum,
    ShelfAnalysisResponse,
)
from app.schemas.user import (
    DIETARY_PHILOSOPHIES,
    NutritionPlanResponse,
    NutritionPlanStep,
)
from app.services.image_utils import (
    crop_boxes,
    crop_normalized_bbox,
    encode_jpeg_data_uri,
    pixel_bbox_to_normalized,
)
from app.services.rag_service import rag_service
from app.services.yolo_service import yolo_service

logger = logging.getLogger(__name__)

PHILOSOPHY_MAP = {p["key"]: p for p in DIETARY_PHILOSOPHIES}

# Codes worth retrying: 429 (rate limited) and the 5xx transient overload codes
# Gemini returns under load (we've seen live 503 "UNAVAILABLE" during scans).
_RETRYABLE_CODES = {429, 500, 503, 504}
_MAX_ATTEMPTS = 3
_RETRY_BASE_DELAY_SECONDS = 1.0

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
    eating_pattern_text = ""
    nutrition_phil_text = ""
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
            # Independent preference axes selected in the Profile tab
            # (Eating Pattern and Nutrition Philosophy), stored alongside the
            # Diet Type in philosophy_customizations.
            ep = c.get("eatingPattern")
            if ep and ep in PHILOSOPHY_MAP:
                eating_pattern_text = f"{ep}: {PHILOSOPHY_MAP[ep]['description']}"
            np_ = c.get("nutritionPhilosophy")
            if np_ and np_ in PHILOSOPHY_MAP:
                nutrition_phil_text = f"{np_}: {PHILOSOPHY_MAP[np_]['description']}"
        except Exception:
            pass

    if profile.custom_philosophy_text:
        phil_text = f"CUSTOM PHILOSOPHY: {profile.custom_philosophy_text}"

    extra_axes = ""
    if eating_pattern_text:
        extra_axes += f"\nEating Pattern: {eating_pattern_text}"
    if nutrition_phil_text:
        extra_axes += f"\nNutrition Philosophy: {nutrition_phil_text}"

    allergies = profile.allergies_and_conditions or []
    avoided = profile.avoided_ingredients or []
    tolerance = PROCESSING_LEVEL_LABELS.get(
        profile.processed_food_tolerance or 3, "moderate processing acceptable"
    )

    return f"""USER PROFILE:
Name: {profile.name or 'User'}
Sex: {profile.sex or 'Not specified'}
Age Group: {profile.age_group or 'Not specified'}
Dietary Philosophy: {phil_text}{customizations}{extra_axes}
Allergies & Conditions: {', '.join(allergies) if allergies else 'None'}
Health Goals: {profile.free_text_goals or 'None provided'}
Ingredients to Always Avoid: {', '.join(avoided) if avoided else 'None'}
Processed Food Tolerance: {tolerance} (NOVA scale: {profile.processed_food_tolerance or 3}/4)"""


_IDENTIFICATION_OUTPUT_SCHEMA = """{
  "brand": string,
  "product_name": string,
  "variant": string,
  "possible_variants": [string],

  "canonical_search_name": string,

  "detected_product": true,

  "visual_confidence": number,
  "nutrition_confidence": "High" | "Medium" | "Low",

  "identification_basis": [
    "brand logo",
    "package colors",
    "package artwork",
    "package layout",
    "shape",
    "visible text"
  ],

  "package_size": string | null,

  "food_category": string,

  "ingredients": [
    string
  ],

  "allergens": [
    string
  ],

  "dietary_tags": [
    string
  ],

  "nutrition": {
    "serving_size": string,
    "calories": number,
    "total_fat_g": number,
    "saturated_fat_g": number,
    "trans_fat_g": number,
    "cholesterol_mg": number,
    "sodium_mg": number,
    "total_carbohydrate_g": number,
    "dietary_fiber_g": number,
    "total_sugars_g": number,
    "added_sugars_g": number,
    "protein_g": number
  },

  "nova_processing_level": 1 | 2 | 3 | 4 | null,

  "reasoning": string
}"""

_IDENTIFICATION_PROMPT_BODY = """You are an expert grocery product recognition and nutrition knowledge AI.

Your job is NOT to perform OCR.

Your primary task is to identify the exact commercial grocery product represented by each crop using ALL available visual evidence.

Use every visual cue available, including but not limited to:

- Brand logos
- Package colors
- Typography
- Product photography
- Package artwork
- Package layout
- Package shape
- Flavor imagery
- Icons and symbols
- Recognizable branding
- Any readable text

Do NOT rely primarily on OCR.

Instead, use the complete visual appearance of the package to recognize the product.

Your objective is to identify the actual commercial product sold in stores.

--------------------------------------------------
IDENTIFICATION PROCESS
--------------------------------------------------

For each crop:

STEP 1
Identify the product family.

STEP 2
Identify the brand.

STEP 3
Identify the specific product.

STEP 4
Identify the flavor or variety if possible.

STEP 5
Estimate confidence.

--------------------------------------------------
CANONICAL PRODUCT INFORMATION
--------------------------------------------------

If the product is identified with HIGH confidence, populate the remaining fields using the STANDARD commercial product information associated with that product.

Do NOT attempt to read ingredients or nutrition facts directly from the image unless they are clearly visible.

Instead, use the canonical ingredients and nutrition facts normally associated with the identified product.

For example:

If the image is confidently identified as:

"Kellogg's Frosted Flakes"

return the standard ingredient list and nutrition facts for Kellogg's Frosted Flakes, even if those are not visible.

--------------------------------------------------
AMBIGUITY RULES
--------------------------------------------------

If multiple product variants are visually plausible:

DO NOT GUESS.

Instead:

- identify the product family
- identify the brand
- populate possible_variants
- lower confidence

Example:

brand:
Nature Valley

product_name:
Crunchy Granola Bars

variant:
Unknown

possible_variants:
[
"Oats & Honey",
"Peanut Butter",
"Maple Brown Sugar"
]

--------------------------------------------------
CONFIDENCE RULES
--------------------------------------------------

visual_confidence

Confidence that the image represents the identified product based on appearance.

0.95-1.00
Nearly certain

0.80-0.94
High confidence

0.60-0.79
Moderate confidence

Below 0.60
Low confidence

nutrition_confidence

Confidence that the returned nutrition information corresponds to the identified product.

Possible values:

"High"
"Medium"
"Low"

Use "Medium" when the exact flavor or formulation cannot be determined.

--------------------------------------------------
FIELD SOURCE RULES
--------------------------------------------------

brand
-> visual recognition

product_name
-> visual recognition

variant
-> visual recognition

package_size
-> visual recognition only if visible

ingredients
-> canonical ingredients for the identified commercial product

nutrition
-> canonical nutrition facts

allergens
-> derived from canonical ingredients

dietary_tags
-> derived from canonical ingredients

nova_processing_level
-> estimated from canonical ingredients

--------------------------------------------------
DO NOT
--------------------------------------------------

Do NOT invent products.

Do NOT invent brands.

Do NOT fabricate nutrition facts when the product cannot be reasonably identified.

Do NOT use OCR as the primary identification method.

Do NOT guess flavors when multiple variants are equally plausible.
"""


def _build_crop_identification_prompt(num_crops: int) -> str:
    """Build the product-identification prompt for YOLO-cropped shelf photos.

    Mirrors the canonical-recognition template: brand/package visual
    recognition first, canonical ingredients/nutrition for high-confidence
    matches, explicit possible_variants + lowered confidence when ambiguous
    rather than guessing.
    """
    return (
        f"You are given {num_crops} cropped images. Each crop contains EXACTLY ONE grocery product, "
        f"in order (Crop 1, Crop 2, ..., Crop {num_crops}).\n\n"
        f"{_IDENTIFICATION_PROMPT_BODY}\n"
        "--------------------------------------------------\n"
        "OUTPUT\n"
        "--------------------------------------------------\n\n"
        "Return EXACTLY one JSON object for each crop. Each object MUST contain these fields:\n\n"
        f"{_IDENTIFICATION_OUTPUT_SCHEMA}\n\n"
        "--------------------------------------------------\n"
        "OUTPUT REQUIREMENTS\n"
        "--------------------------------------------------\n\n"
        f"Return EXACTLY {num_crops} JSON objects in the same order as the input crops.\n\n"
        "Return ONLY the JSON array.\n\n"
        "No markdown.\n\n"
        "No explanations.\n\n"
        "No additional text."
    )


def _build_whole_image_identification_prompt() -> str:
    """Whole-image fallback identification prompt (no YOLO crops available).

    Same visual-recognition-first / canonical-data approach as the crop
    prompt, but identifies every visible product in one image and must also
    return each product's bounding box since there's no YOLO box to attach.
    """
    return (
        "You are given one photo of a grocery shelf or product display that may contain "
        "MULTIPLE grocery products. Identify EVERY visible product in the image.\n\n"
        f"{_IDENTIFICATION_PROMPT_BODY}\n"
        "--------------------------------------------------\n"
        "OUTPUT\n"
        "--------------------------------------------------\n\n"
        "Return one JSON object per distinct product visible in the image. Each object MUST "
        "contain these fields, PLUS a bounding_box field:\n\n"
        "  bounding_box: [ymin, xmin, ymax, xmax] normalised 0.0-1.0\n\n"
        f"{_IDENTIFICATION_OUTPUT_SCHEMA}\n\n"
        "--------------------------------------------------\n"
        "OUTPUT REQUIREMENTS\n"
        "--------------------------------------------------\n\n"
        "Return ONLY the JSON array.\n\n"
        "No markdown.\n\n"
        "No explanations.\n\n"
        "No additional text."
    )


_SCORING_SAFETY_BLOCK = """--------------------------------------------------
SAFETY
--------------------------------------------------

Do not promote unhealthy eating behaviors.

Never encourage:

- excessive calorie restriction
- fear-based messaging
- labeling foods as morally "good" or "bad"
- skipping meals
- extreme dieting

Keep explanations factual, neutral, and evidence-based.

Discuss only how well a product aligns with the user's stated preferences."""

_SCORING_METHODOLOGY_BLOCK = """--------------------------------------------------
SCORING METHODOLOGY
--------------------------------------------------

Evaluate products in FOUR steps.

==============================
STEP 1 - HARD EXCLUSIONS
==============================

Immediately assign:

"Doesn't Fit"

if ANY of the following are true.

1.
Contains a user allergy.

2.
Contains an ingredient explicitly listed under "Avoid Ingredients."

3.
Conflicts with the user's dietary philosophy.

Examples:

- meat for vegan
- dairy for dairy-free
- gluten for celiac
- alcohol when avoided

4.
Exceeds the user's stated processing tolerance.

5.
Conflicts with a medical condition explicitly listed in the profile.

If ANY hard exclusion exists:

final_score = "Doesn't Fit"

Skip Steps 2-3.

Still provide reasoning.

==============================
STEP 2 - DIMENSION SCORING
==============================

If no hard exclusions exist, score the product in FIVE independent dimensions.

------------------------------

A. Dietary Philosophy

Score:

+2 = Strongly aligns
+1 = Mostly aligns
0 = Neutral
-1 = Minor conflict
-2 = Major conflict

------------------------------

B. Health Goal Alignment

Evaluate ALL stated health goals.

Examples:

- increase protein
- reduce sodium
- increase fiber
- lower added sugar
- lower cholesterol
- Mediterranean eating

If multiple goals exist:

Average the goal scores.

Scoring:

+2 = Strongly supports
+1 = Moderately supports
0 = Neutral
-1 = Moderately conflicts
-2 = Strongly conflicts

------------------------------

C. Ingredient Quality

Evaluate ingredient quality ONLY.

Do NOT double-count nutrition.

Examples of positive qualities:

- whole foods
- simple ingredients
- recognizable ingredients

Examples of negative qualities:

- artificial colors
- artificial preservatives
- hydrogenated oils
- high fructose corn syrup
- ingredients the user prefers to limit

Scoring:

+2 = Excellent ingredient quality
+1 = Good
0 = Neutral
-1 = Several concerning ingredients
-2 = Many concerning ingredients

------------------------------

D. Processing Level

Use NOVA.

NOVA 1: +1
NOVA 2: 0
NOVA 3: -0.5
NOVA 4: -1

If NOVA is unknown: 0

------------------------------

E. Nutrition Quality

Evaluate only nutrition facts.

Consider:

- protein
- fiber
- added sugar
- sodium
- saturated fat
- trans fat
- cholesterol

Evaluate relative to the user's goals.

Scoring:

+2 = Excellent
+1 = Good
0 = Neutral
-1 = Poor
-2 = Very poor

==============================
STEP 3 - TOTAL SCORE
==============================

Compute:

total_score =
  philosophy_score
  + goal_score
  + ingredient_score
  + processing_score
  + nutrition_score

Do NOT modify the score.

Do NOT use intuition.

Do NOT rebalance categories.

Assign:

7-9         Great Fit
4-6         Just OK Fit
0-3         Neutral Fit
Below 0     Doesn't Fit

==============================
STEP 4 - REASONING
==============================

Generate reasoning ONLY AFTER scoring.

The reasoning MUST be consistent with the scores.

The reasoning should reference only relevant factors.

Mention:

- philosophy compatibility
- allergies
- avoided ingredients
- processing level
- nutrition profile
- health goals

Do NOT mention factors that are irrelevant.

Maximum 400 characters."""

_SCORING_CONSISTENCY_BLOCK = """--------------------------------------------------
CONSISTENCY RULES
--------------------------------------------------

Products with similar nutrition and ingredients should receive similar scores.

Do NOT score based on:

- package design
- marketing claims
- popularity
- brand reputation

Only use:

- ingredients
- nutrition facts
- dietary tags
- allergens
- NOVA
- user profile

If information is missing:

Treat the missing category as Neutral.

Do NOT infer unknown values."""

_SCORING_OUTPUT_SCHEMA = """{
  "brand": string,

  "product_name": string,

  "variant": string,

  "canonical_search_name": string,

  "scoring":
    "Great Fit" |
    "Just OK Fit" |
    "Neutral Fit" |
    "Doesn't Fit" |
    "Unidentified",

  "score_breakdown": {

      "hard_exclusion": true|false,

      "hard_exclusion_reasons":[
          string
      ],

      "philosophy_score": number,

      "goal_score": number,

      "ingredient_score": number,

      "processing_score": number,

      "nutrition_score": number,

      "total_score": number
  },

  "reasoning": string,

  "reasoning_by_factor":[
      string
  ],

  "flagged_ingredients":[
      string
  ],

  "processing_level": integer,

  "ingredients":[
      string
  ],

  "allergens":[
      string
  ],

  "dietary_tags":[
      string
  ],

  "nutrition": {

      "serving_size": string,

      "calories": number,

      "protein_g": number,

      "total_fat_g": number,

      "saturated_fat_g": number,

      "trans_fat_g": number,

      "cholesterol_mg": number,

      "sodium_mg": number,

      "total_carbohydrate_g": number,

      "dietary_fiber_g": number,

      "total_sugars_g": number,

      "added_sugars_g": number

  }

}"""


def _build_scoring_prompt(profile_ctx: str, identified_products: str) -> str:
    """Deterministic four-step nutrition scoring prompt.

    Mirrors the canonical scoring methodology: hard exclusions first (instant
    "Doesn't Fit"), then five independently-scored dimensions summed into a
    total_score that is banded into the final rating — not left to the
    model's intuition. Reasoning is generated last, after scoring, so it
    stays consistent with score_breakdown.
    """
    return f"""You are a deterministic nutrition scoring AI.

You are given:

1. A structured user nutrition profile.
2. A list of identified grocery products with canonical nutrition information.

Your job is to evaluate how well EACH product fits the user's dietary preferences, restrictions, goals, and nutrition philosophy using the EXACT scoring methodology below.

Your job is NOT to provide subjective opinions.

Your job is to consistently apply the same rules to every product.

--------------------------------------------------
USER PROFILE
--------------------------------------------------

{profile_ctx}

--------------------------------------------------
PRODUCTS
--------------------------------------------------

{identified_products}

{_SCORING_SAFETY_BLOCK}

{_SCORING_METHODOLOGY_BLOCK}

{_SCORING_CONSISTENCY_BLOCK}

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return one JSON object per product. Return EXACTLY these fields:

{_SCORING_OUTPUT_SCHEMA}

Return EXACTLY one JSON object per input product.

Return ONLY the JSON array.

No markdown.

No explanations.

No additional text."""


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

    async def _generate_content(self, **kwargs):
        """generate_content with retry/backoff for transient Gemini errors (429/5xx).

        Non-retryable errors (e.g. bad request, auth) and errors that persist past
        the last attempt are re-raised to the caller.
        """
        for attempt in range(_MAX_ATTEMPTS):
            try:
                return self.client.models.generate_content(**kwargs)
            except errors.APIError as exc:
                if exc.code not in _RETRYABLE_CODES or attempt == _MAX_ATTEMPTS - 1:
                    raise
                delay = _RETRY_BASE_DELAY_SECONDS * (2 ** attempt)
                logger.warning(
                    "Gemini API error %s (attempt %d/%d), retrying in %.1fs: %s",
                    exc.code, attempt + 1, _MAX_ATTEMPTS, delay, exc.message,
                )
                await asyncio.sleep(delay)

    # ── Shelf analysis ────────────────────────────────────────────────────────

    @staticmethod
    def _dedupe_identified(products: list[dict]) -> list[dict]:
        """Collapse duplicate product facings to a unique list.

        The same product appears many times on a shelf (multiple facings), so we
        keep one entry per (brand, product_name). Products are already ordered by
        YOLO confidence, so the first — highest-confidence — occurrence is kept.
        Unidentified / Unknown items are never merged (they aren't comparable).
        """
        seen: set[tuple[str, str]] = set()
        out: list[dict] = []
        for p in products:
            name = (p.get("product_name") or "").strip().lower()
            brand = (p.get("brand") or "").strip().lower()
            if not name or name in ("unidentified product", "unidentified", "unknown"):
                out.append(p)
                continue
            key = (brand, name)
            if key in seen:
                continue
            seen.add(key)
            out.append(p)
        return out

    async def analyze_shelf(
        self,
        image_bytes: bytes,
        mime_type: str,
        profile: UserProfile,
        db: AsyncSession,
    ) -> ShelfAnalysisResponse:
        raw_products = await self._detect_and_identify(image_bytes, mime_type, profile)
        raw_products = self._dedupe_identified(raw_products)

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

    async def analyze_shelf_stream(
        self,
        image_bytes: bytes,
        mime_type: str,
        profile: UserProfile,
        db: AsyncSession,
    ):
        """Same pipeline as analyze_shelf, but yields progress events for the UI.

        Yields dicts: {"stage": "detected", "count": N},
                      {"stage": "progress", "done": i, "total": N},
                      {"stage": "scoring"},
                      {"stage": "complete", "result": <ShelfAnalysisResponse json>}.
        """
        raw_products = await self._detect_and_identify(image_bytes, mime_type, profile)
        raw_products = self._dedupe_identified(raw_products)
        total = len(raw_products)
        yield {"stage": "detected", "count": total}

        enriched = []
        for i, item in enumerate(raw_products):
            usda_food = await rag_service.lookup(
                product_name=item.get("product_name", ""),
                brand=item.get("brand", ""),
                db=db,
            )
            item["_usda"] = usda_food
            enriched.append(item)
            yield {"stage": "progress", "done": i + 1, "total": total}

        yield {"stage": "scoring"}
        products = await self._scoring_pass(enriched, profile)
        response = ShelfAnalysisResponse(products=products, total_products_found=len(products))
        yield {"stage": "complete", "result": response.model_dump(mode="json")}

    async def _detect_and_identify(
        self, image_bytes: bytes, mime_type: str, profile: UserProfile
    ) -> list[dict]:
        """Localise products with YOLO, then identify each crop with Gemini.

        Falls back to the whole-image Gemini vision pass (which does its own,
        less precise, localisation) when YOLO finds nothing -- e.g. a close-up
        photo of a single product rather than a shelf.
        """
        try:
            boxes = yolo_service.detect(
                image_bytes,
                conf=settings.yolo_conf_threshold,
                iou=settings.yolo_iou_threshold,
            )
        except Exception as exc:
            logger.error("YOLO detection failed, falling back to whole-image vision pass: %s", exc)
            boxes = []

        if not boxes:
            return await self._vision_pass(image_bytes, mime_type, profile)

        boxes.sort(key=lambda b: b["confidence"], reverse=True)
        boxes = boxes[: settings.yolo_max_detections]

        return await self._vision_pass_from_crops(image_bytes, boxes, profile)

    async def _vision_pass_from_crops(
        self, image_bytes: bytes, boxes: list[dict], profile: UserProfile
    ) -> list[dict]:
        img_w, img_h = Image.open(io.BytesIO(image_bytes)).size
        crops = crop_boxes(image_bytes, boxes)

        system_prompt = _build_crop_identification_prompt(len(crops))
        contents: list = [system_prompt]
        for i, crop_bytes in enumerate(crops):
            contents.append(f"Crop {i + 1}:")
            contents.append(types.Part.from_bytes(data=crop_bytes, mime_type="image/jpeg"))

        response = await self._generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=0.1, response_mime_type="application/json"
            ),
        )

        try:
            raw = json.loads(response.text)
            if not isinstance(raw, list):
                raw = raw.get("products", raw.get("items", [raw]))
        except Exception as exc:
            logger.error("Crop identification pass parse error: %s", exc)
            raw = []

        products = []
        for i, box in enumerate(boxes):
            item = raw[i] if i < len(raw) else {}
            item["bounding_box"] = pixel_bbox_to_normalized(box["bbox"], img_w, img_h)
            # Same crop that was sent to Gemini for identification -- keeping the two
            # in lockstep by index guarantees the crop shown to the user always
            # matches the product it was identified from.
            item["crop_image"] = encode_jpeg_data_uri(crops[i])
            products.append(item)

        return products

    async def _vision_pass(
        self, image_bytes: bytes, mime_type: str, profile: UserProfile
    ) -> list[dict]:
        system_prompt = _build_whole_image_identification_prompt()
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        response = await self._generate_content(
            model="gemini-2.5-flash",
            contents=[system_prompt, image_part],
            config=types.GenerateContentConfig(
                temperature=0.1, response_mime_type="application/json"
            ),
        )
        try:
            raw = json.loads(response.text)
            if not isinstance(raw, list):
                raw = raw.get("products", raw.get("items", [raw]))
        except Exception as exc:
            logger.error("Vision pass parse error: %s", exc)
            return []

        # No YOLO boxes on this path -- crop the source image ourselves using
        # each product's own (Gemini-supplied) bounding box, so every product
        # still gets the crop it was identified from.
        for item in raw:
            bbox = item.get("bounding_box")
            if isinstance(bbox, list) and len(bbox) == 4:
                try:
                    item["crop_image"] = encode_jpeg_data_uri(crop_normalized_bbox(image_bytes, bbox))
                except Exception as exc:
                    logger.warning("Whole-image crop failed for a product: %s", exc)

        return raw

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
            variant = item.get("variant") or "Unknown"
            possible_variants = item.get("possible_variants") or []
            ingredients = item.get("ingredients") or []
            allergens = item.get("allergens") or []
            dietary_tags = item.get("dietary_tags") or []
            canonical_nutrition = item.get("nutrition") or {}
            nova_level = item.get("nova_processing_level")
            visual_confidence = item.get("visual_confidence")
            nutrition_confidence = item.get("nutrition_confidence")

            summary_lines = [
                f"[{i}] {item.get('brand', 'Unknown')} – {item.get('product_name', 'Unidentified')} "
                f"(variant: {variant})",
            ]
            if possible_variants:
                summary_lines.append(f"  Possible variants (ambiguous): {', '.join(possible_variants)}")
            summary_lines.append(
                f"  Identification confidence: visual={visual_confidence if visual_confidence is not None else 'unknown'}, "
                f"nutrition={nutrition_confidence or 'unknown'}"
            )
            summary_lines.append(
                f"  Canonical ingredients: {', '.join(ingredients) if ingredients else 'unknown'}"
            )
            summary_lines.append(
                f"  Canonical allergens: {', '.join(allergens) if allergens else 'none identified'}"
            )
            summary_lines.append(
                f"  Dietary tags: {', '.join(dietary_tags) if dietary_tags else 'none'}"
            )
            summary_lines.append(f"  NOVA processing level (canonical estimate): {nova_level or 'unknown'}")
            if canonical_nutrition:
                summary_lines.append(f"  Canonical nutrition facts: {json.dumps(canonical_nutrition)}")
            summary_lines.append(f"  {usda_text}")
            product_summaries.append("\n".join(summary_lines))

        system_prompt = _build_scoring_prompt(profile_ctx, chr(10).join(product_summaries))

        response = await self._generate_content(
            model="gemini-2.5-flash",
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

            nutrition = sd.get("nutrition") or {}
            breakdown_raw = sd.get("score_breakdown") or {}
            score_breakdown = ScoreBreakdown(
                hard_exclusion=bool(breakdown_raw.get("hard_exclusion", False)),
                hard_exclusion_reasons=breakdown_raw.get("hard_exclusion_reasons", []),
                philosophy_score=breakdown_raw.get("philosophy_score"),
                goal_score=breakdown_raw.get("goal_score"),
                ingredient_score=breakdown_raw.get("ingredient_score"),
                processing_score=breakdown_raw.get("processing_score"),
                nutrition_score=breakdown_raw.get("nutrition_score"),
                total_score=breakdown_raw.get("total_score"),
            )

            results.append(ProductItem(
                brand=sd.get("brand") or item.get("brand", "Unknown"),
                product_name=sd.get("product_name") or item.get("product_name", "Unidentified Product"),
                variant=sd.get("variant") or item.get("variant"),
                canonical_search_name=sd.get("canonical_search_name") or item.get("canonical_search_name"),
                nutritional_facts=NutritionalFacts(
                    calories=nutrition.get("calories"),
                    serving_size=nutrition.get("serving_size"),
                    total_fat_g=nutrition.get("total_fat_g"),
                    saturated_fat_g=nutrition.get("saturated_fat_g"),
                    trans_fat_g=nutrition.get("trans_fat_g"),
                    cholesterol_mg=nutrition.get("cholesterol_mg"),
                    sodium_mg=nutrition.get("sodium_mg"),
                    total_carbohydrate_g=nutrition.get("total_carbohydrate_g"),
                    dietary_fiber_g=nutrition.get("dietary_fiber_g"),
                    total_sugars_g=nutrition.get("total_sugars_g"),
                    added_sugars_g=nutrition.get("added_sugars_g"),
                    protein_g=nutrition.get("protein_g"),
                    flagged_ingredients=sd.get("flagged_ingredients", []),
                    detected_ingredients=sd.get("ingredients", item.get("ingredients", [])),
                ),
                scoring=score_val,
                score_breakdown=score_breakdown,
                reasoning=sd.get("reasoning", "Could not evaluate this product."),
                reasoning_by_factor=sd.get("reasoning_by_factor", []),
                bounding_box=bbox,
                data_source=data_source,
                processing_level=sd.get("processing_level", item.get("nova_processing_level")),
                allergens=sd.get("allergens", item.get("allergens", [])),
                dietary_tags=sd.get("dietary_tags", item.get("dietary_tags", [])),
                crop_image=item.get("crop_image"),
            ))

        return results

    # ── Nutrition plan ────────────────────────────────────────────────────────

    async def generate_nutrition_plan(self, profile: UserProfile) -> NutritionPlanResponse:
        profile_ctx = _build_profile_context(profile)

        prompt = f"""You are a professional registered dietitian creating a personalised nutrition plan.

{profile_ctx}

SAFETY RULE (overrides all other instructions): Do not promote any eating
habits, language, or framing that could encourage disordered eating (e.g.
extreme calorie restriction, glorifying "good" vs. "bad" foods in a
moralising way, fear-based messaging about food, or praising skipping
meals). Every target and step must reflect sound, sustainable nutrition
science — never appearance, weight, or willpower framing. If the user's
stated goals suggest an unhealthy relationship with food or extreme
restriction, favour the more moderate, sustainable interpretation.

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

        response = await self._generate_content(
            model="gemini-2.5-flash",
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
