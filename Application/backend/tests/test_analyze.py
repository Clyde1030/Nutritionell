"""
Tests for the /api/analyze endpoint.
Gemini is mocked so these run without an API key or network access.
"""
import io
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from PIL import Image

# ── Shared mock Gemini response ───────────────────────────────────────────────

MOCK_VISION_RESPONSE = json.dumps([
    {
        "brand": "Kellogg's",
        "product_name": "Frosted Flakes",
        "bounding_box": [0.1, 0.05, 0.45, 0.5],
        "visible_text": "Kellogg's Frosted Flakes",
    }
])

MOCK_SCORING_RESPONSE = json.dumps([
    {
        "brand": "Kellogg's",
        "product_name": "Frosted Flakes",
        "scoring": "Avoid",
        "reasoning": "High added sugar conflicts with your low-sugar goal.",
        "calories": 150.0,
        "serving_size": "1 cup (37g)",
        "total_fat_g": 0.5,
        "saturated_fat_g": 0.0,
        "trans_fat_g": 0.0,
        "cholesterol_mg": 0.0,
        "sodium_mg": 190.0,
        "total_carbohydrate_g": 37.0,
        "dietary_fiber_g": 1.0,
        "total_sugars_g": 14.0,
        "added_sugars_g": 12.0,
        "protein_g": 2.0,
        "flagged_ingredients": ["high-fructose corn syrup"],
    }
])

# Response shape for the YOLO-crop identification pass: no bounding_box, since
# YOLO already supplies pixel-accurate boxes for that path.
MOCK_CROP_IDENTIFICATION_RESPONSE = json.dumps([
    {
        "brand": "Kellogg's",
        "product_name": "Frosted Flakes",
        "visible_text": "Kellogg's Frosted Flakes",
        "detected_ingredients": ["corn", "sugar"],
    },
    {
        "brand": "Quaker",
        "product_name": "Oats",
        "visible_text": "Quaker Oats",
        "detected_ingredients": ["oats"],
    },
])

MOCK_SCORING_RESPONSE_2 = json.dumps([
    {
        "brand": "Kellogg's",
        "product_name": "Frosted Flakes",
        "scoring": "Avoid",
        "reasoning": "High added sugar conflicts with your low-sugar goal.",
        "calories": 150.0,
        "flagged_ingredients": ["sugar"],
    },
    {
        "brand": "Quaker",
        "product_name": "Oats",
        "scoring": "Great",
        "reasoning": "Whole-grain oats align with your goals.",
        "calories": 150.0,
        "flagged_ingredients": [],
    },
])


def _make_test_jpeg(width: int = 100, height: int = 100) -> bytes:
    image = Image.new("RGB", (width, height), color=(200, 30, 30))
    buf = io.BytesIO()
    image.save(buf, format="JPEG")
    return buf.getvalue()


def _make_mock_client(vision_text: str, scoring_text: str):
    """Build a mock genai.Client that returns preset responses."""
    mock_client = MagicMock()

    call_count = {"n": 0}

    def generate_content(*args, **kwargs):
        call_count["n"] += 1
        resp = MagicMock()
        resp.text = vision_text if call_count["n"] == 1 else scoring_text
        return resp

    mock_client.models.generate_content.side_effect = generate_content
    return mock_client


async def _create_profile(client) -> str:
    r = await client.post("/api/profile", json={
        "name": "Tester",
        "dietary_philosophy": "Keto",
        "allergies_and_conditions": [],
        "free_text_goals": "Less sugar",
    })
    return r.json()["id"]


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_analyze_returns_products(client):
    profile_id = await _create_profile(client)
    mock_client = _make_mock_client(MOCK_VISION_RESPONSE, MOCK_SCORING_RESPONSE)

    with patch("app.services.gemini_service.GeminiService.client", new_callable=lambda: property(lambda self: mock_client)), \
         patch("app.services.gemini_service.yolo_service.detect", return_value=[]):
        # Minimal 1x1 white JPEG
        tiny_jpeg = (
            b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
            b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t'
            b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a'
            b'\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\x1e\xc0'
            b'\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00'
            b'\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01'
            b'\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00'
            b'?\x00\xfb\xd4\xff\xd9'
        )
        r = await client.post(
            "/api/analyze",
            files={"image": ("shelf.jpg", tiny_jpeg, "image/jpeg")},
            data={"profile_id": profile_id},
        )

    assert r.status_code == 200
    data = r.json()
    assert "products" in data
    assert data["total_products_found"] >= 0


@pytest.mark.asyncio
async def test_analyze_missing_profile(client):
    tiny_jpeg = b'\xff\xd8\xff\xd9'  # minimal JPEG
    r = await client.post(
        "/api/analyze",
        files={"image": ("shelf.jpg", tiny_jpeg, "image/jpeg")},
        data={"profile_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_analyze_invalid_profile_id(client):
    tiny_jpeg = b'\xff\xd8\xff\xd9'
    r = await client.post(
        "/api/analyze",
        files={"image": ("shelf.jpg", tiny_jpeg, "image/jpeg")},
        data={"profile_id": "not-a-uuid"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_analyze_unsupported_image_type(client):
    profile_id = await _create_profile(client)
    r = await client.post(
        "/api/analyze",
        files={"image": ("doc.pdf", b"%PDF", "application/pdf")},
        data={"profile_id": profile_id},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_analyze_schema_output_structure(client):
    """Validate that scoring values are one of the four allowed enums."""
    profile_id = await _create_profile(client)
    mock_client = _make_mock_client(MOCK_VISION_RESPONSE, MOCK_SCORING_RESPONSE)

    with patch("app.services.gemini_service.GeminiService.client", new_callable=lambda: property(lambda self: mock_client)), \
         patch("app.services.gemini_service.yolo_service.detect", return_value=[]):
        tiny_jpeg = (
            b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
            b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t'
            b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a'
            b'\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\x1e\xc0'
            b'\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00'
            b'\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01'
            b'\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00'
            b'?\x00\xfb\xd4\xff\xd9'
        )
        r = await client.post(
            "/api/analyze",
            files={"image": ("shelf.jpg", tiny_jpeg, "image/jpeg")},
            data={"profile_id": profile_id},
        )

    assert r.status_code == 200
    for product in r.json()["products"]:
        assert product["scoring"] in ("Great", "OK", "Avoid", "Unidentified")
        assert "bounding_box" in product
        assert len(product["bounding_box"]) == 4
        assert "nutritional_facts" in product
        assert "reasoning" in product


@pytest.mark.asyncio
async def test_analyze_uses_yolo_bounding_boxes(client):
    """When YOLO finds products, its pixel boxes -- not Gemini's -- drive bounding_box."""
    profile_id = await _create_profile(client)
    mock_client = _make_mock_client(MOCK_CROP_IDENTIFICATION_RESPONSE, MOCK_SCORING_RESPONSE_2)

    yolo_boxes = [
        {"bbox": [10.0, 10.0, 40.0, 90.0], "confidence": 0.9, "class_id": 0},
        {"bbox": [50.0, 10.0, 90.0, 90.0], "confidence": 0.8, "class_id": 0},
    ]

    with patch("app.services.gemini_service.GeminiService.client", new_callable=lambda: property(lambda self: mock_client)), \
         patch("app.services.gemini_service.yolo_service.detect", return_value=yolo_boxes):
        r = await client.post(
            "/api/analyze",
            files={"image": ("shelf.jpg", _make_test_jpeg(100, 100), "image/jpeg")},
            data={"profile_id": profile_id},
        )

    assert r.status_code == 200
    products = r.json()["products"]
    assert len(products) == 2
    assert products[0]["bounding_box"] == pytest.approx([0.1, 0.1, 0.9, 0.4])
    assert products[1]["bounding_box"] == pytest.approx([0.1, 0.5, 0.9, 0.9])
    assert products[0]["brand"] == "Kellogg's"
    assert products[1]["brand"] == "Quaker"
