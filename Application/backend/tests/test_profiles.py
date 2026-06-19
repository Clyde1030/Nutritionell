"""Tests for the /api/profile CRUD endpoints."""
import pytest


VALID_PROFILE = {
    "name": "Test User",
    "allergies_and_conditions": ["Peanut Allergy", "Celiac/Gluten-Free"],
    "free_text_goals": "I want more protein and less sugar.",
    "dietary_philosophy": "Keto",
    "avoided_ingredients": ["High-Fructose Corn Syrup"],
    "processed_food_tolerance": 2,
}


@pytest.mark.asyncio
async def test_create_profile(client):
    r = await client.post("/api/profile", json=VALID_PROFILE)
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    assert data["name"] == "Test User"
    assert data["dietary_philosophy"] == "Keto"
    assert "Peanut Allergy" in data["allergies_and_conditions"]
    assert data["processed_food_tolerance"] == 2
    assert "High-Fructose Corn Syrup" in data["avoided_ingredients"]


@pytest.mark.asyncio
async def test_create_profile_minimal(client):
    """A profile with no optional fields should still succeed."""
    r = await client.post("/api/profile", json={})
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    assert data["allergies_and_conditions"] == []


@pytest.mark.asyncio
async def test_get_profile(client):
    create = await client.post("/api/profile", json=VALID_PROFILE)
    profile_id = create.json()["id"]

    r = await client.get(f"/api/profile/{profile_id}")
    assert r.status_code == 200
    assert r.json()["id"] == profile_id
    assert r.json()["name"] == "Test User"


@pytest.mark.asyncio
async def test_get_profile_not_found(client):
    r = await client.get("/api/profile/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_profile_invalid_uuid(client):
    r = await client.get("/api/profile/not-a-uuid")
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_profile(client):
    create = await client.post("/api/profile", json=VALID_PROFILE)
    profile_id = create.json()["id"]

    r = await client.put(
        f"/api/profile/{profile_id}",
        json={"dietary_philosophy": "Vegan", "free_text_goals": "Go plant-based."},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["dietary_philosophy"] == "Vegan"
    assert data["free_text_goals"] == "Go plant-based."
    # Unchanged fields should be preserved
    assert data["name"] == "Test User"


@pytest.mark.asyncio
async def test_update_profile_not_found(client):
    r = await client.put(
        "/api/profile/00000000-0000-0000-0000-000000000000",
        json={"name": "Ghost"},
    )
    assert r.status_code == 404
