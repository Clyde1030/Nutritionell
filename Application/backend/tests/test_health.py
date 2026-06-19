"""Tests for the health check and profile options endpoints."""
import pytest


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_profile_options_has_philosophies(client):
    r = await client.get("/api/profile/options")
    assert r.status_code == 200
    data = r.json()
    assert "dietary_philosophies" in data
    keys = [p["key"] for p in data["dietary_philosophies"]]
    assert "Keto" in keys
    assert "Vegan" in keys


@pytest.mark.asyncio
async def test_profile_options_has_allergies(client):
    r = await client.get("/api/profile/options")
    data = r.json()
    assert "allergies_and_conditions" in data
    keys = [a["key"] for a in data["allergies_and_conditions"]]
    assert "Peanut Allergy" in keys
    assert "Celiac/Gluten-Free" in keys
    # Confirm descriptions are included
    first = data["allergies_and_conditions"][0]
    assert "description" in first
