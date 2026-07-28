"""
Gemini multimodal AI service — shelf analysis + nutrition plan generation.
"""
import asyncio
import io
import json
import logging
import random
import time
from typing import Optional

from google import genai
from google.genai import errors, types
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import UserProfile
from app.schemas.ai_output import (
    Detection,
    NutritionalFacts,
    PerformanceSummary,
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

# Crop identification is parallelised: the detected crops are split into batches
# that are sent to Gemini CONCURRENTLY (big latency win vs one serial call over all
# crops). The semaphore caps how many Gemini requests are in flight at once so we
# don't trip rate limits.
IDENTIFY_BATCH_SIZE = 6
IDENTIFY_MAX_CONCURRENCY = 5

# Canonical enrichment (I2): identification now returns IDENTITY ONLY (brand / name /
# variant) for every raw facing. The heavy canonical ingredients + nutrition are then
# fetched only for the UNIQUE deduped products — a text-only pass, chunked and run
# concurrently — instead of being generated for all ~40 facings (most of which are
# duplicates thrown away by dedup). This shrinks the timeout-prone identification stage.
ENRICH_CHUNK_SIZE = 8
ENRICH_MAX_CONCURRENCY = 4

# Scoring is chunked + run CONCURRENTLY (S3): wall-clock becomes the slowest chunk
# instead of one serial call whose output grows with every product.
SCORING_CHUNK_SIZE = 5
SCORING_MAX_CONCURRENCY = 4

# ── Hybrid streaming pipeline (call-count-conscious) ──────────────────────────
# Results still stream in as they're ready, but we keep the Gemini call count low
# to stay under rate/token limits (a fully one-crop-at-a-time scan made ~3x the
# calls — brutal on a throttled key):
#   • identification runs in SMALL batches (several crops per call), and each
#     batch's products are emitted the moment that batch lands — so products
#     still appear incrementally, just a few at a time instead of one at a time.
#   • analysis merges canonical enrichment AND scoring into a SINGLE call per
#     product (was two), streamed as each product finishes.
# Concurrency is deliberately modest so a burst of image-heavy calls doesn't
# spike tokens-per-minute and trip a 429.
IDENTIFY_STREAM_BATCH_SIZE = 4   # crops per identification call
IDENTIFY_STREAM_CONCURRENCY = 4  # concurrent identification calls
ANALYZE_STREAM_CONCURRENCY = 4   # concurrent per-product analysis calls (enrich+score merged)


def _eta_ms(t_start: float, done: int, total: int) -> int:
    """Estimated time remaining (ms) for a stage, from the average per-item time
    so far. 0 once we can't improve the estimate (nothing done yet, or finished)."""
    if done <= 0 or total <= done:
        return 0
    elapsed = time.monotonic() - t_start
    return int(round((elapsed / done) * (total - done) * 1000))

# Codes worth retrying: 429 (RESOURCE_EXHAUSTED / "TooManyRequests" — the Gemini
# rate limit) plus the 5xx transient overload codes it returns when busy (we've seen
# live 503 "UNAVAILABLE"). Retries use exponential backoff WITH JITTER so a burst of
# concurrent calls that all get throttled don't re-fire in lockstep and re-trip the
# same per-minute limit. NOTE: retries help ride out short RPM spikes, but they cannot
# create quota — a persistently rate-limited (free-tier) key needs a higher limit or
# fewer calls per scan, not more retries.
_RETRYABLE_CODES = {429, 500, 503, 504}
_MAX_ATTEMPTS = 5
_RETRY_BASE_DELAY_SECONDS = 1.5

# Disabling Gemini "thinking" on the mechanical recall passes (identification +
# enrichment) is a large latency win (I1) with little quality cost — those passes are
# visual recognition / canonical lookup, not multi-step reasoning. Built once and
# feature-detected so an older google-genai SDK that predates thinking budgets simply
# leaves thinking on rather than crashing. (Scoring keeps its default thinking.)
try:
    _THINKING_OFF = types.ThinkingConfig(thinking_budget=0)
except Exception:  # pragma: no cover - SDK too old for thinking budgets
    _THINKING_OFF = None


def _json_config(temperature: float, disable_thinking: bool = False) -> types.GenerateContentConfig:
    """GenerateContentConfig for a JSON response, optionally with thinking disabled.

    thinking_config is only attached when the installed SDK supports it, so callers
    are safe across google-genai versions.
    """
    if disable_thinking and _THINKING_OFF is not None:
        try:
            return types.GenerateContentConfig(
                temperature=temperature,
                response_mime_type="application/json",
                thinking_config=_THINKING_OFF,
            )
        except Exception:  # pragma: no cover - defensive: field unsupported
            pass
    return types.GenerateContentConfig(
        temperature=temperature, response_mime_type="application/json",
    )

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


# Identification returns IDENTITY ONLY (I2). Canonical ingredients/nutrition are
# fetched afterwards, for unique products only, via the enrichment pass below.
_IDENTITY_OUTPUT_SCHEMA = """{
  "brand": string,
  "product_name": string,
  "variant": string,
  "possible_variants": [string],
  "canonical_search_name": string,
  "detected_product": true,
  "visual_confidence": number,
  "nutrition_confidence": "High" | "Medium" | "Low",
  "food_category": string,
  "package_size": string | null
}"""

_IDENTIFICATION_PROMPT_BODY = """You are an expert grocery product recognition AI.

Your job is NOT to perform OCR.

Your task is to identify the exact commercial grocery product shown, using ALL available visual evidence:

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

Do NOT rely primarily on OCR. Use the complete visual appearance of the package to recognize the product actually sold in stores.

--------------------------------------------------
IDENTIFICATION PROCESS
--------------------------------------------------

STEP 1  Identify the product family.
STEP 2  Identify the brand.
STEP 3  Identify the specific product.
STEP 4  Identify the flavor or variety if possible.
STEP 5  Estimate confidence.

--------------------------------------------------
AMBIGUITY RULES
--------------------------------------------------

If multiple product variants are visually plausible, DO NOT GUESS. Instead:

- identify the product family
- identify the brand
- populate possible_variants
- lower confidence

Example:

brand: Nature Valley
product_name: Crunchy Granola Bars
variant: Unknown
possible_variants: ["Oats & Honey", "Peanut Butter", "Maple Brown Sugar"]

--------------------------------------------------
CONFIDENCE RULES
--------------------------------------------------

visual_confidence — confidence the image represents the identified product based on appearance:

  0.95-1.00  Nearly certain
  0.80-0.94  High confidence
  0.60-0.79  Moderate confidence
  Below 0.60 Low confidence

nutrition_confidence — confidence that the product identity is precise enough to look up its nutrition later. One of "High" / "Medium" / "Low". Use "Medium" when the exact flavor or formulation cannot be determined.

--------------------------------------------------
DO NOT
--------------------------------------------------

Do NOT invent products.
Do NOT invent brands.
Do NOT guess flavors when multiple variants are equally plausible.
Do NOT output ingredients or nutrition facts — return IDENTITY ONLY. Ingredients and nutrition are looked up in a later step.
"""

# Canonical enrichment (I2): given IDENTIFIED products (text only, no image), return
# the standard ingredients + nutrition facts for each. Run only over the unique set.
_ENRICH_OUTPUT_SCHEMA = """{
  "ingredients": [string],
  "allergens": [string],
  "dietary_tags": [string],
  "nova_processing_level": 1 | 2 | 3 | 4 | null,
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
  }
}"""


def _build_enrichment_prompt(products_block: str, num: int) -> str:
    """Text-only canonical-data lookup for already-identified products (I2)."""
    return f"""You are a grocery product nutrition knowledge base.

You are given {num} identified grocery products (brand + product name + variant). For EACH product, return the STANDARD canonical ingredients and nutrition facts normally associated with that commercial product — the information a shopper would find on the actual package.

Use the canonical ingredients and nutrition facts for the identified product even though no image is provided. For example, for "Kellogg's Frosted Flakes" return the standard ingredient list and nutrition facts for that product.

Derive allergens and dietary_tags from the canonical ingredients. Estimate nova_processing_level (1-4) from the canonical ingredients.

If a product cannot be confidently matched to a real commercial product, return an empty ingredients list, empty allergens, and null nutrition values rather than inventing data.

--------------------------------------------------
PRODUCTS
--------------------------------------------------

{products_block}

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return EXACTLY {num} JSON objects, one per product, in the SAME order. Each object MUST contain these fields:

{_ENRICH_OUTPUT_SCHEMA}

Return ONLY the JSON array. No markdown. No explanations. No additional text."""


def _build_crop_identification_prompt(num_crops: int) -> str:
    """Build the IDENTITY-ONLY identification prompt for YOLO-cropped shelf photos.

    Visual recognition first; explicit possible_variants + lowered confidence
    when ambiguous rather than guessing. Canonical ingredients/nutrition are
    NOT requested here — they're fetched later for unique products only (I2).
    """
    return (
        f"You are given {num_crops} cropped images. Each crop contains EXACTLY ONE grocery product, "
        f"in order (Crop 1, Crop 2, ..., Crop {num_crops}).\n\n"
        f"{_IDENTIFICATION_PROMPT_BODY}\n"
        "--------------------------------------------------\n"
        "OUTPUT\n"
        "--------------------------------------------------\n\n"
        "Return EXACTLY one JSON object for each crop. Each object MUST contain these fields:\n\n"
        f"{_IDENTITY_OUTPUT_SCHEMA}\n\n"
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

    Same IDENTITY-ONLY visual-recognition approach as the crop prompt, but
    identifies every visible product in one image and must also return each
    product's bounding box since there's no YOLO box to attach.
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
        f"{_IDENTITY_OUTPUT_SCHEMA}\n\n"
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

# SCORING OUTPUT IS DECISION-ONLY (S1). The nutrition facts, ingredients, allergens,
# dietary tags and NOVA level are NOT re-emitted here — the backend already holds the
# canonical values from the identification + enrichment passes and merges them onto
# the result. Regenerating them was the bulk of the scoring call's output tokens.
_SCORING_OUTPUT_SCHEMA = """{
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
  ]
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


# Merged canonical-enrichment + scoring for ONE product in a single call (hybrid
# pipeline). One JSON object: Part A canonical data + Part B scoring decision.
_ANALYSIS_OUTPUT_SCHEMA = """{
  "ingredients": [string],
  "allergens": [string],
  "dietary_tags": [string],
  "nova_processing_level": 1 | 2 | 3 | 4 | null,
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
  "scoring": "Great Fit" | "Just OK Fit" | "Neutral Fit" | "Doesn't Fit" | "Unidentified",
  "score_breakdown": {
    "hard_exclusion": true|false,
    "hard_exclusion_reasons": [string],
    "philosophy_score": number,
    "goal_score": number,
    "ingredient_score": number,
    "processing_score": number,
    "nutrition_score": number,
    "total_score": number
  },
  "reasoning": string,
  "reasoning_by_factor": [string],
  "flagged_ingredients": [string]
}"""


def _build_combined_analysis_prompt(profile_ctx: str, product_block: str) -> str:
    """One-call canonical enrichment + deterministic scoring for a single product."""
    return f"""You are a nutrition analysis AI. You are given ONE identified grocery product and a user's nutrition profile. Do TWO things, in order, in a single JSON response.

==============================
PART A - CANONICAL PRODUCT DATA
==============================
Recall the STANDARD canonical ingredients and nutrition facts for this exact commercial product — what a shopper would find on the actual package. Derive allergens and dietary_tags from those canonical ingredients, and estimate nova_processing_level (1-4). If the product cannot be confidently matched to a real commercial product, return an empty ingredients list, empty allergens, and null nutrition values rather than inventing data.

==============================
PART B - SCORE AGAINST THE PROFILE
==============================
Then score the product against the user's profile using the EXACT deterministic methodology below — the same rules every time, not subjective opinion.

--------------------------------------------------
USER PROFILE
--------------------------------------------------

{profile_ctx}

--------------------------------------------------
PRODUCT
--------------------------------------------------

{product_block}

{_SCORING_SAFETY_BLOCK}

{_SCORING_METHODOLOGY_BLOCK}

{_SCORING_CONSISTENCY_BLOCK}

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONE JSON object containing BOTH the canonical data (Part A) AND the scoring (Part B), in exactly these fields:

{_ANALYSIS_OUTPUT_SCHEMA}

Return ONLY the JSON object. No markdown. No explanations. No additional text."""


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

        The google-genai `generate_content` is a BLOCKING (synchronous) HTTP call, so
        it is run in a worker thread via asyncio.to_thread. This keeps the event loop
        free — which is what makes the per-crop / per-product calls actually run
        concurrently AND lets the SSE progress stream keep flushing while a call is in
        flight (a blocking call here previously froze the whole stream, so nothing
        streamed and the connection idled out).

        Non-retryable errors (e.g. bad request, auth) and errors that persist past
        the last attempt are re-raised to the caller.
        """
        client = self.client   # resolve (and lazy-init) on the event loop, not in the thread
        for attempt in range(_MAX_ATTEMPTS):
            try:
                return await asyncio.to_thread(client.models.generate_content, **kwargs)
            except errors.APIError as exc:
                if exc.code not in _RETRYABLE_CODES or attempt == _MAX_ATTEMPTS - 1:
                    raise
                delay = _RETRY_BASE_DELAY_SECONDS * (2 ** attempt) + random.uniform(0, 0.75)
                logger.warning(
                    "Gemini API error %s (attempt %d/%d), retrying in %.1fs: %s",
                    exc.code, attempt + 1, _MAX_ATTEMPTS, delay, exc.message,
                )
                await asyncio.sleep(delay)

    # ── Shelf analysis ────────────────────────────────────────────────────────

    @staticmethod
    def _is_identified(item: dict) -> bool:
        """True if Gemini gave this crop a real product name (not Unknown/Unidentified)."""
        name = (item.get("product_name") or "").strip().lower()
        return bool(name) and name not in ("unidentified product", "unidentified", "unknown")

    @classmethod
    def _plan_dedup(cls, raw: list[dict]) -> tuple[list[dict], list[dict]]:
        """Split identified facings into (unique-list-to-score, per-box roles).

        Returns:
          unique_list : the items that go to USDA lookup + scoring (unidentified
                        items + the FIRST facing of each identified product) — this
                        is exactly the old `_dedupe_identified` output, same order,
                        so scoring behaviour is unchanged.
          roles       : one per input box, aligned to `raw`, each
                        {"status": "unique"|"duplicate"|"unidentified",
                         "product_index": <index into unique_list / products>}.
        Duplicate facings are NOT scored; they inherit their unique twin's score.
        """
        unique_list: list[dict] = []
        key_to_idx: dict[tuple[str, str], int] = {}
        roles: list[dict] = []
        for p in raw:
            if not cls._is_identified(p):
                idx = len(unique_list); unique_list.append(p)
                roles.append({"status": "unidentified", "product_index": idx})
                continue
            key = ((p.get("brand") or "").strip().lower(), (p.get("product_name") or "").strip().lower())
            if key in key_to_idx:
                roles.append({"status": "duplicate", "product_index": key_to_idx[key]})
            else:
                idx = len(unique_list); unique_list.append(p); key_to_idx[key] = idx
                roles.append({"status": "unique", "product_index": idx})
        return unique_list, roles

    @staticmethod
    def _build_detections(raw: list[dict], roles: list[dict]) -> list[Detection]:
        out: list[Detection] = []
        for item, role in zip(raw, roles):
            bbox = item.get("bounding_box") or [0.0, 0.0, 1.0, 1.0]
            try:
                bbox = [float(v) for v in bbox[:4]]
                while len(bbox) < 4:
                    bbox.append(0.0)
            except Exception:
                bbox = [0.0, 0.0, 1.0, 1.0]
            out.append(Detection(bounding_box=bbox, status=role["status"], product_index=role["product_index"]))
        return out

    @staticmethod
    def _detection_cap(max_detections: Optional[int]) -> int:
        """Resolve the per-scan detection cap: caller override (clamped 1-100) or the
        configured default. Controls how many crops go on to Gemini identification."""
        if max_detections is None:
            return settings.yolo_max_detections
        return max(1, min(int(max_detections), 100))

    def _detect(
        self,
        image_bytes: bytes,
        max_detections: Optional[int] = None,
        yolo_model: Optional[str] = None,
    ) -> list[dict]:
        """YOLO localisation only — returns pixel boxes sorted by confidence, capped. [] if none.

        The user-selected per-scan cap (Settings → Maximum products per scan) is applied
        at the YOLO model itself via `max_det` AND enforced again by slicing, so the shelf
        is never over-detected. `yolo_model` picks which detector to run (Settings →
        Detection model): yolo11n / yolo26s / yolo26s_p2.
        """
        cap = self._detection_cap(max_detections)
        try:
            boxes = yolo_service.detect(
                image_bytes,
                conf=settings.yolo_conf_threshold,
                iou=settings.yolo_iou_threshold,
                max_det=cap,
                model_key=yolo_model,
            )
        except Exception as exc:
            logger.error("YOLO detection failed, will fall back to whole-image vision pass: %s", exc)
            return []
        boxes.sort(key=lambda b: b["confidence"], reverse=True)
        return boxes[:cap]

    async def analyze_shelf(
        self,
        image_bytes: bytes,
        mime_type: str,
        profile: UserProfile,
        db: AsyncSession,
        max_detections: Optional[int] = None,
        yolo_model: Optional[str] = None,
    ) -> ShelfAnalysisResponse:
        raw_products = await self._detect_and_identify(
            image_bytes, mime_type, profile,
            max_detections=max_detections, yolo_model=yolo_model,
        )
        unique_list, roles = self._plan_dedup(raw_products)

        # Canonical ingredients/nutrition for the UNIQUE identified products only (I2).
        await self._enrich_products(unique_list)

        enriched = []
        for item in unique_list:
            usda_food = await rag_service.lookup(
                product_name=item.get("product_name", ""),
                brand=item.get("brand", ""),
                db=db,
            )
            item["_usda"] = usda_food
            enriched.append(item)

        products = await self._scoring_pass(enriched, profile)
        detections = self._build_detections(raw_products, roles)
        return ShelfAnalysisResponse(
            products=products,
            total_products_found=len(products),
            detections=detections,
        )

    async def analyze_shelf_stream(
        self,
        image_bytes: bytes,
        mime_type: str,
        profile: UserProfile,
        db: AsyncSession,
        max_detections: Optional[int] = None,
        yolo_model: Optional[str] = None,
    ):
        """Hybrid streamed analysis: identify products in SMALL BATCHES and analyse
        each product in a SINGLE merged (enrich+score) call, emitting each product the
        moment it's ready. Fewer Gemini calls than one-at-a-time (which is brutal on a
        rate-limited key) while results still flow into the UI incrementally.

        Products flow into the UI as they land — a new (non-duplicate) product is
        added on identification; its analysis fills in when scored. Duplicate facings
        are NOT surfaced as products. Both stages report per-item progress + an ETA.

        Event stages (each a dict with "stage" + fields):
          detecting                          -> YOLO started
          detected         count, boxes, detect_ms
          identifying      total             -> identification started (batched)
          identified_item  box_index, bbox, status(unique|duplicate|unidentified),
                           product_index, is_duplicate, product?{brand,product_name,
                           variant,crop_image}, done, total, eta_ms
          identified       identified_count, identify_ms   (stage summary)
          analyzing        total             -> per-product analysis started
          analyzed_item    product_index, product(ProductItem json), done, total, eta_ms
          complete         result (ShelfAnalysisResponse json, incl. detections + performance)
        """
        t0 = time.monotonic()
        profile_ctx = _build_profile_context(profile)

        # ── Stage 1: detection (YOLO) ──────────────────────────────────────────
        # YOLO inference + cropping are blocking/CPU work — run them in a thread so
        # they don't stall the event loop (which would delay the SSE stream).
        yield {"stage": "detecting"}
        t_det = time.monotonic()
        boxes = await asyncio.to_thread(
            self._detect, image_bytes, max_detections=max_detections, yolo_model=yolo_model
        )
        detect_ms = (time.monotonic() - t_det) * 1000
        img_w, img_h = Image.open(io.BytesIO(image_bytes)).size
        det_boxes = [pixel_bbox_to_normalized(b["bbox"], img_w, img_h) for b in boxes]
        yield {"stage": "detected", "count": len(boxes), "boxes": det_boxes, "detect_ms": round(detect_ms)}

        crops = await asyncio.to_thread(crop_boxes, image_bytes, boxes) if boxes else []

        # Shared per-scan state, filled as items stream in.
        products: list[Optional[ProductItem]] = []   # final products, indexed by product_index
        pending: dict[int, dict] = {}                # product_index -> identity dict awaiting analysis
        key_to_pidx: dict[tuple, int] = {}           # (brand,name) -> product_index (dedup)
        det_list: list[tuple] = []                   # (bbox, status, product_index) per detection

        def _register(ident: dict):
            """Dedup one identified/unidentified item; assign its product_index and
            role. Returns (status, product_index, is_new_unique)."""
            bbox = ident.get("bounding_box") or [0.0, 0.0, 1.0, 1.0]
            if not self._is_identified(ident):
                pidx = len(products)
                products.append(self._to_product_item(ident, {}))   # Unidentified, finalized now
                det_list.append((bbox, "unidentified", pidx))
                return "unidentified", pidx, False
            key = ((ident.get("brand") or "").strip().lower(),
                   (ident.get("product_name") or "").strip().lower())
            if key in key_to_pidx:
                pidx = key_to_pidx[key]
                det_list.append((bbox, "duplicate", pidx))
                return "duplicate", pidx, False
            pidx = len(products)
            products.append(None)                                   # placeholder; filled by analysis
            pending[pidx] = ident
            key_to_pidx[key] = pidx
            det_list.append((bbox, "unique", pidx))
            return "unique", pidx, True

        # ── Stage 2: identification — one crop at a time, streamed ──────────────
        yield {"stage": "identifying", "total": len(boxes)}
        t_id = time.monotonic()
        identified_count = 0

        if boxes:
            # Identify in SMALL batches (several crops per call), emitting each product
            # the moment its batch lands — far fewer calls than one-per-crop, still
            # incremental (products appear a few at a time).
            sem = asyncio.Semaphore(IDENTIFY_STREAM_CONCURRENCY)
            batches = [list(range(i, min(i + IDENTIFY_STREAM_BATCH_SIZE, len(boxes))))
                       for i in range(0, len(boxes), IDENTIFY_STREAM_BATCH_SIZE)]

            async def _id_batch(idxs: list[int]):
                return idxs, await self._identify_batch([crops[i] for i in idxs], sem)

            id_done = 0
            for fut in asyncio.as_completed([_id_batch(idxs) for idxs in batches]):
                idxs, res = await fut
                for local, i in enumerate(idxs):
                    ident = (res[local] if local < len(res) else {}) or {}
                    ident["bounding_box"] = pixel_bbox_to_normalized(boxes[i]["bbox"], img_w, img_h)
                    ident["crop_image"] = encode_jpeg_data_uri(crops[i])
                    status, pidx, is_new = _register(ident)
                    id_done += 1
                    if self._is_identified(ident):
                        identified_count += 1
                    ev = {
                        "stage": "identified_item", "box_index": i, "bbox": ident["bounding_box"],
                        "status": status, "product_index": pidx, "is_duplicate": status == "duplicate",
                        "done": id_done, "total": len(boxes), "eta_ms": _eta_ms(t_id, id_done, len(boxes)),
                    }
                    if is_new:   # only a brand-new, non-duplicate product carries an identity payload
                        ev["product"] = {
                            "brand": ident.get("brand", "Unknown"),
                            "product_name": ident.get("product_name", "Unidentified Product"),
                            "variant": ident.get("variant"),
                            "crop_image": ident.get("crop_image"),
                        }
                    yield ev
        else:
            # Whole-image fallback (close-up / no YOLO boxes): identify then stream each.
            raw = await self._vision_pass(image_bytes, mime_type, profile)
            for n, ident in enumerate(raw):
                status, pidx, is_new = _register(ident)
                if self._is_identified(ident):
                    identified_count += 1
                ev = {
                    "stage": "identified_item", "box_index": n,
                    "bbox": ident.get("bounding_box") or [0.0, 0.0, 1.0, 1.0],
                    "status": status, "product_index": pidx, "is_duplicate": status == "duplicate",
                    "done": n + 1, "total": len(raw), "eta_ms": _eta_ms(t_id, n + 1, len(raw)),
                }
                if is_new:
                    ev["product"] = {
                        "brand": ident.get("brand", "Unknown"),
                        "product_name": ident.get("product_name", "Unidentified Product"),
                        "variant": ident.get("variant"),
                        "crop_image": ident.get("crop_image"),
                    }
                yield ev

        identify_ms = (time.monotonic() - t_id) * 1000
        yield {"stage": "identified", "identified_count": identified_count, "identify_ms": round(identify_ms)}

        # ── Stage 3: analysis — one product per call (enrich+score merged), streamed ──
        yield {"stage": "analyzing", "total": len(pending)}
        t_an = time.monotonic()
        if pending:
            sem = asyncio.Semaphore(ANALYZE_STREAM_CONCURRENCY)
            db_lock = asyncio.Lock()

            async def _an_one(pidx: int, item: dict):
                return pidx, await self._analyze_product(item, profile_ctx, db, sem, db_lock)

            an_done = 0
            an_total = len(pending)
            for fut in asyncio.as_completed([_an_one(p, it) for p, it in pending.items()]):
                pidx, prod = await fut
                products[pidx] = prod
                an_done += 1
                yield {
                    "stage": "analyzed_item", "product_index": pidx,
                    "product": prod.model_dump(mode="json"),
                    "done": an_done, "total": an_total, "eta_ms": _eta_ms(t_an, an_done, an_total),
                }
        analysis_ms = (time.monotonic() - t_an) * 1000

        # ── Complete ────────────────────────────────────────────────────────────
        final_products = [p if p is not None else self._to_product_item({}, {}) for p in products]
        detections = [Detection(bounding_box=bb, status=st, product_index=pi) for bb, st, pi in det_list]
        dup_count = sum(1 for _, st, _ in det_list if st == "duplicate")
        unid_count = sum(1 for _, st, _ in det_list if st == "unidentified")
        performance = PerformanceSummary(
            detect_ms=round(detect_ms), identify_ms=round(identify_ms),
            analysis_ms=round(analysis_ms), total_ms=round((time.monotonic() - t0) * 1000),
            detected_count=len(det_list), identified_count=identified_count,
            unique_count=len(pending), duplicate_count=dup_count, unidentified_count=unid_count,
        )
        response = ShelfAnalysisResponse(
            products=final_products, total_products_found=len(final_products),
            detections=detections, performance=performance,
        )
        yield {"stage": "complete", "result": response.model_dump(mode="json")}

    async def _detect_and_identify(
        self, image_bytes: bytes, mime_type: str, profile: UserProfile,
        max_detections: Optional[int] = None, yolo_model: Optional[str] = None,
    ) -> list[dict]:
        """Localise products with YOLO, then identify each crop with Gemini.

        Falls back to the whole-image Gemini vision pass (which does its own,
        less precise, localisation) when YOLO finds nothing -- e.g. a close-up
        photo of a single product rather than a shelf.
        """
        boxes = self._detect(image_bytes, max_detections=max_detections, yolo_model=yolo_model)
        if not boxes:
            return await self._vision_pass(image_bytes, mime_type, profile)
        return await self._vision_pass_from_crops(image_bytes, boxes, profile)

    @staticmethod
    def _make_crop_batches(crops: list[bytes]) -> list[list[bytes]]:
        return [crops[i:i + IDENTIFY_BATCH_SIZE] for i in range(0, len(crops), IDENTIFY_BATCH_SIZE)]

    @staticmethod
    def _attach_identity(
        raw: list[dict], boxes: list[dict], crops: list[bytes], img_w: int, img_h: int
    ) -> list[dict]:
        """Attach each product's normalised YOLO box + its exact crop image, by index.

        Keeping the identity dict, the box, and the crop in lockstep by index
        guarantees the crop shown to the user matches the product it came from.
        """
        products = []
        for i, box in enumerate(boxes):
            item = raw[i] if i < len(raw) else {}
            item["bounding_box"] = pixel_bbox_to_normalized(box["bbox"], img_w, img_h)
            item["crop_image"] = encode_jpeg_data_uri(crops[i])
            products.append(item)
        return products

    async def _identify_batch(self, batch_crops: list[bytes], sem: asyncio.Semaphore) -> list[dict]:
        """Identify one batch of crops in a single Gemini call (identity only, no
        thinking — I1). Returns exactly len(batch_crops) items (empty dicts pad any
        short/failed parse).

        API errors (429/quota, persistent 5xx) are allowed to propagate so the
        endpoint's quota handling can surface them; only JSON parsing is caught here.
        """
        prompt = _build_crop_identification_prompt(len(batch_crops))
        contents: list = [prompt]
        for j, crop_bytes in enumerate(batch_crops):
            contents.append(f"Crop {j + 1}:")
            contents.append(types.Part.from_bytes(data=crop_bytes, mime_type="image/jpeg"))

        async with sem:
            response = await self._generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=_json_config(0.1, disable_thinking=True),
            )

        try:
            parsed = json.loads(response.text)
            if not isinstance(parsed, list):
                parsed = parsed.get("products", parsed.get("items", [parsed]))
        except Exception as exc:
            logger.error("Crop identification batch parse error: %s", exc)
            parsed = []
        return [(parsed[k] if k < len(parsed) else {}) for k in range(len(batch_crops))]

    async def _vision_pass_from_crops(
        self, image_bytes: bytes, boxes: list[dict], profile: UserProfile
    ) -> list[dict]:
        img_w, img_h = Image.open(io.BytesIO(image_bytes)).size
        crops = crop_boxes(image_bytes, boxes)

        # Identify crops in CONCURRENT batches (instead of one serial call over all crops).
        batches = self._make_crop_batches(crops)
        sem = asyncio.Semaphore(IDENTIFY_MAX_CONCURRENCY)
        batch_results = await asyncio.gather(*(self._identify_batch(b, sem) for b in batches))
        raw = [item for batch in batch_results for item in batch]   # flatten -> original crop order
        return self._attach_identity(raw, boxes, crops, img_w, img_h)

    async def _enrich_batch(self, chunk: list[dict], sem: asyncio.Semaphore) -> list[dict]:
        """Look up canonical ingredients/nutrition for one chunk of identified products
        in a single text-only Gemini call (no thinking — I1). Returns len(chunk) items.

        API errors propagate for the endpoint's quota handling; only JSON parsing is
        caught here, degrading to empty dicts so the scan still completes.
        """
        lines = []
        for j, p in enumerate(chunk):
            variant = p.get("variant") or "Unknown"
            possible = p.get("possible_variants") or []
            line = (f"Product {j + 1}: {p.get('brand', 'Unknown')} — "
                    f"{p.get('product_name', 'Unknown')} (variant: {variant})")
            if possible:
                line += f" [possible variants: {', '.join(possible)}]"
            lines.append(line)
        prompt = _build_enrichment_prompt("\n".join(lines), len(chunk))

        async with sem:
            response = await self._generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=_json_config(0.1, disable_thinking=True),
            )

        try:
            parsed = json.loads(response.text)
            if not isinstance(parsed, list):
                parsed = parsed.get("products", parsed.get("items", [parsed]))
        except Exception as exc:
            logger.error("Enrichment batch parse error: %s", exc)
            parsed = []
        return [(parsed[k] if k < len(parsed) else {}) for k in range(len(chunk))]

    async def _enrich_products(self, products: list[dict]) -> None:
        """Fill canonical ingredients/nutrition/allergens/dietary_tags/NOVA onto each
        IDENTIFIED product dict IN PLACE (I2). Unidentified items are skipped (no
        canonical data possible). Chunked + run concurrently. Best-effort: on failure
        the products keep whatever they had and scoring treats missing data as neutral.
        """
        targets = [p for p in products if self._is_identified(p)]
        if not targets:
            return
        chunks = [targets[i:i + ENRICH_CHUNK_SIZE] for i in range(0, len(targets), ENRICH_CHUNK_SIZE)]
        sem = asyncio.Semaphore(ENRICH_MAX_CONCURRENCY)
        chunk_results = await asyncio.gather(*(self._enrich_batch(c, sem) for c in chunks))
        flat = [item for chunk in chunk_results for item in chunk]
        for p, data in zip(targets, flat):
            if not data:
                continue
            p["ingredients"] = data.get("ingredients") or p.get("ingredients", [])
            p["allergens"] = data.get("allergens") or p.get("allergens", [])
            p["dietary_tags"] = data.get("dietary_tags") or p.get("dietary_tags", [])
            if data.get("nova_processing_level") is not None:
                p["nova_processing_level"] = data.get("nova_processing_level")
            if data.get("nutrition"):
                p["nutrition"] = data.get("nutrition")

    async def _vision_pass(
        self, image_bytes: bytes, mime_type: str, profile: UserProfile
    ) -> list[dict]:
        system_prompt = _build_whole_image_identification_prompt()
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        response = await self._generate_content(
            model="gemini-2.5-flash",
            contents=[system_prompt, image_part],
            config=_json_config(0.1, disable_thinking=True),
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

    @staticmethod
    def _product_summary(idx: int, item: dict) -> str:
        """One product's scoring INPUT block (canonical identity + nutrition + USDA).

        `idx` is the product's position within its scoring chunk; results are mapped
        back to products by position, so the label is only for the model's readability.
        """
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
            f"[{idx}] {item.get('brand', 'Unknown')} – {item.get('product_name', 'Unidentified')} "
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
        return "\n".join(summary_lines)

    async def _score_chunk(
        self, chunk: list[dict], profile_ctx: str, sem: asyncio.Semaphore
    ) -> list[dict]:
        """Score one chunk of products in a single Gemini call. Returns len(chunk)
        decision dicts (empty dicts pad any short/failed parse). Scoring keeps its
        default thinking — it's the reasoning step."""
        block = chr(10).join(self._product_summary(j, it) for j, it in enumerate(chunk))
        system_prompt = _build_scoring_prompt(profile_ctx, block)
        async with sem:
            response = await self._generate_content(
                model="gemini-2.5-flash",
                contents=system_prompt,
                config=_json_config(0.1),
            )
        try:
            scored = json.loads(response.text)
            if not isinstance(scored, list):
                scored = scored.get("products", [scored])
        except Exception as exc:
            logger.error("Scoring chunk parse error: %s", exc)
            scored = []
        return [(scored[k] if k < len(scored) else {}) for k in range(len(chunk))]

    # ── Per-product analysis (hybrid streaming pipeline) ──────────────────────

    @staticmethod
    def _usda_block(usda) -> str:
        """The USDA hint line(s) for a scoring/analysis prompt ('No USDA data' if none)."""
        if not usda:
            return "No USDA data found."
        nutrients = usda.nutrient_dict()
        top = {k: v for k, v in list(nutrients.items())[:12]}
        return (
            f"USDA: {usda.brand or 'N/A'} – {usda.product_name}\n"
            f"  Ingredients: {usda.ingredients or 'N/A'}\n"
            f"  Nutrients/100g: {json.dumps(top)}\n"
            f"  Allergen flags: gluten={usda.contains_gluten}, peanuts={usda.contains_peanuts}, "
            f"dairy={usda.contains_dairy}, soy={usda.contains_soy}"
        )

    async def _analyze_product(
        self, item: dict, profile_ctx: str, db: AsyncSession, sem: asyncio.Semaphore,
        db_lock: asyncio.Lock,
    ) -> ProductItem:
        """One product's full analysis in a SINGLE Gemini call: canonical enrichment
        (ingredients/nutrition/allergens/NOVA) AND deterministic scoring, merged. USDA
        lookup (no Gemini) provides a grounding hint. Returns a finished ProductItem."""
        # AsyncSession doesn't support concurrent operations; this method runs
        # concurrently (one per product) via analyze_shelf_stream's asyncio.as_completed,
        # all sharing the single request-scoped session, so DB access must be serialized.
        async with db_lock:
            usda_food = await rag_service.lookup(
                product_name=item.get("product_name", ""),
                brand=item.get("brand", ""),
                db=db,
            )
        item["_usda"] = usda_food

        variant = item.get("variant") or "Unknown"
        possible = item.get("possible_variants") or []
        line = (f"Product: {item.get('brand', 'Unknown')} — "
                f"{item.get('product_name', 'Unknown')} (variant: {variant})")
        if possible:
            line += f" [possible variants: {', '.join(possible)}]"
        product_block = f"{line}\n{self._usda_block(usda_food)}"

        prompt = _build_combined_analysis_prompt(profile_ctx, product_block)
        async with sem:
            response = await self._generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=_json_config(0.1),
            )
        try:
            data = json.loads(response.text)
            if isinstance(data, list):
                data = data[0] if data else {}
        except Exception as exc:
            logger.error("Combined analysis parse error: %s", exc)
            data = {}

        # Merge Part A (canonical) onto the item, pass Part B (scoring) as the decision.
        if data.get("ingredients"):
            item["ingredients"] = data["ingredients"]
        if data.get("allergens"):
            item["allergens"] = data["allergens"]
        if data.get("dietary_tags"):
            item["dietary_tags"] = data["dietary_tags"]
        if data.get("nova_processing_level") is not None:
            item["nova_processing_level"] = data["nova_processing_level"]
        if data.get("nutrition"):
            item["nutrition"] = data["nutrition"]
        sd = {
            "scoring": data.get("scoring", "Neutral Fit"),
            "score_breakdown": data.get("score_breakdown"),
            "reasoning": data.get("reasoning", "Could not evaluate this product."),
            "reasoning_by_factor": data.get("reasoning_by_factor", []),
            "flagged_ingredients": data.get("flagged_ingredients", []),
        }
        return self._to_product_item(item, sd)

    @staticmethod
    def _to_product_item(item: dict, sd: dict) -> ProductItem:
        """Build one ProductItem from an enriched identity dict + its scoring decision.

        Canonical nutrition / ingredients / allergens / tags / NOVA come from the
        identification + enrichment item; scoring (`sd`) supplies only the decision,
        score_breakdown, reasoning and flagged_ingredients (S1). An empty `sd`
        yields an Unidentified product (used for crops YOLO found but Gemini couldn't
        name)."""
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

        nutrition = item.get("nutrition") or {}
        ingredients = item.get("ingredients") or []
        allergens = item.get("allergens") or []
        dietary_tags = item.get("dietary_tags") or []
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
        return ProductItem(
            brand=item.get("brand", "Unknown"),
            product_name=item.get("product_name", "Unidentified Product"),
            variant=item.get("variant"),
            canonical_search_name=item.get("canonical_search_name"),
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
                detected_ingredients=ingredients,
            ),
            scoring=score_val,
            score_breakdown=score_breakdown,
            reasoning=sd.get("reasoning", "Could not evaluate this product."),
            reasoning_by_factor=sd.get("reasoning_by_factor", []),
            bounding_box=bbox,
            data_source=data_source,
            processing_level=item.get("nova_processing_level"),
            allergens=allergens,
            dietary_tags=dietary_tags,
            crop_image=item.get("crop_image"),
        )

    async def _scoring_pass(
        self, enriched_products: list[dict], profile: UserProfile
    ) -> list[ProductItem]:
        if not enriched_products:
            return []

        profile_ctx = _build_profile_context(profile)

        # Chunk + score CONCURRENTLY (S3). Each chunk is a separate Gemini call; the
        # per-product methodology is deterministic, so splitting is safe.
        chunks = [enriched_products[i:i + SCORING_CHUNK_SIZE]
                  for i in range(0, len(enriched_products), SCORING_CHUNK_SIZE)]
        sem = asyncio.Semaphore(SCORING_MAX_CONCURRENCY)
        chunk_results = await asyncio.gather(
            *(self._score_chunk(c, profile_ctx, sem) for c in chunks)
        )
        scored = [sd for chunk in chunk_results for sd in chunk]  # aligned to enriched_products

        return [
            self._to_product_item(item, scored[i] if i < len(scored) else {})
            for i, item in enumerate(enriched_products)
        ]

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
