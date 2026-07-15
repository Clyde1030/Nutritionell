"""
Local smoke test for the YOLO -> Gemini shelf-analysis pipeline.

Exercises the real YOLO model and the real Gemini API (needs GEMINI_API_KEY
in .env) against the sample photo at app/assets/sample_shelf.jpg. This is a
manual script, not part of the pytest suite: it makes real network calls,
spends real Gemini tokens, and takes a few seconds to run.

USDA/RAG enrichment is intentionally skipped (set to None) so this script has
no database dependency -- it only checks the YOLO -> Gemini identification ->
Gemini scoring chain, which is what changed.

Run from the backend/ directory:
  python scripts/smoke_test_pipeline.py
"""
import asyncio
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from pathlib import Path  # noqa: E402

SAMPLE_IMAGE = Path(__file__).resolve().parents[1] / "app" / "assets" / "sample_shelf.jpg"

# Keep the smoke test cheap: only send this many crops to Gemini, even if
# YOLO finds more on a dense shelf.
MAX_CROPS_FOR_TEST = 10


def _header(n: int, title: str) -> None:
    print(f"\n{'=' * 70}\nSTEP {n}: {title}\n{'=' * 70}")


async def main() -> None:
    if not SAMPLE_IMAGE.exists():
        print(f"FAIL: sample image not found at {SAMPLE_IMAGE}")
        sys.exit(1)
    image_bytes = SAMPLE_IMAGE.read_bytes()

    # ── Step 1: YOLO returns bounding boxes ─────────────────────────────────
    _header(1, "YOLO detection on sample_shelf.jpg")
    from app.services.yolo_service import yolo_service

    yolo_service.load()
    boxes = yolo_service.detect(image_bytes)
    print(f"Detected {len(boxes)} product boxes")
    if not boxes:
        print("FAIL: YOLO returned zero boxes -- check Model/yolov11n_all_final.pkl and the image.")
        sys.exit(1)

    boxes.sort(key=lambda b: b["confidence"], reverse=True)
    for i, b in enumerate(boxes[:10]):
        print(f"  [{i}] bbox={[round(v, 1) for v in b['bbox']]} conf={b['confidence']:.2f}")
    if len(boxes) > 10:
        print(f"  ... and {len(boxes) - 10} more")
    print("PASS: YOLO produced bounding boxes")

    boxes = boxes[:MAX_CROPS_FOR_TEST]
    print(f"\nUsing top {len(boxes)} boxes by confidence for the rest of this test")

    # ── Step 2: crops correctly passed into Gemini for identification ──────
    _header(2, "Crops passed into Gemini for identification")
    if not os.getenv("GEMINI_API_KEY"):
        print("FAIL: GEMINI_API_KEY not set in .env -- cannot call Gemini.")
        sys.exit(1)

    from app.services.gemini_service import GeminiService

    gemini = GeminiService()
    identified = await gemini._vision_pass_from_crops(image_bytes, boxes, profile=None)
    print(f"Gemini identified {len(identified)} products from {len(boxes)} crops")
    for i, item in enumerate(identified):
        print(
            f"  [{i}] brand={item.get('brand')!r} product_name={item.get('product_name')!r} "
            f"bbox={[round(v, 3) for v in item['bounding_box']]}"
        )
    if len(identified) != len(boxes):
        print(f"FAIL: expected {len(boxes)} identified products, got {len(identified)}")
        sys.exit(1)
    print("PASS: every crop round-tripped through Gemini into an identified product with a bounding_box")

    # ── Step 3: build a realistic profile (mirrors ProfileTab.tsx fields) ──
    _header(3, "Build a diet profile using the frontend template's fields")
    from app.models.user import UserProfile

    profile = UserProfile(
        id=str(uuid.uuid4()),
        name="Smoke Test User",
        dietary_philosophy="Keto",
        philosophy_customizations=json.dumps(
            {"stricter": [], "lenient": [], "extra": ["Prioritise organic"]}
        ),
        custom_philosophy_text=None,
        allergies_and_conditions=["Dairy/Lactose Intolerance", "Type 2 Diabetes"],
        avoided_ingredients=["Refined Sugars", "High-Fructose Corn Syrup", "Seed Oils"],
        processed_food_tolerance=1,
        free_text_goals="Lose body fat while keeping blood sugar stable.",
    )
    print(f"  name: {profile.name}")
    print(f"  dietary_philosophy: {profile.dietary_philosophy}")
    print(f"  allergies_and_conditions: {profile.allergies_and_conditions}")
    print(f"  avoided_ingredients: {profile.avoided_ingredients}")
    print(f"  processed_food_tolerance: {profile.processed_food_tolerance}")
    print(f"  free_text_goals: {profile.free_text_goals!r}")
    print("PASS: profile object constructed from the same fields ProfileTab.tsx collects")

    # ── Step 4: Gemini produces an appropriate scored response ─────────────
    _header(4, "Gemini scoring pass against the profile")
    enriched = [dict(item, _usda=None) for item in identified]
    scored = await gemini._scoring_pass(enriched, profile)

    for p in scored:
        print(f"\n  {p.brand} — {p.product_name}")
        print(f"    scoring: {p.scoring.value}")
        print(f"    reasoning: {p.reasoning}")
        print(f"    bounding_box: {[round(v, 3) for v in p.bounding_box]}")

    valid_scores = {"Great", "OK", "Avoid", "Unidentified"}
    bad = [p for p in scored if p.scoring.value not in valid_scores or not p.reasoning]
    if not scored or bad:
        print(f"\nFAIL: {len(bad)} of {len(scored)} products had an invalid score or empty reasoning")
        sys.exit(1)
    print(f"\nPASS: {len(scored)} products scored with valid enum values and non-empty reasoning")

    print("\nAll 4 steps passed.")


if __name__ == "__main__":
    asyncio.run(main())
