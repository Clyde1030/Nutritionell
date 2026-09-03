"""Tests for the /api/profile endpoints.

These routes are now resolved from the bearer token — there is no profile id in
any URL or body, so a client cannot name (and therefore cannot reach) a profile
that isn't its own.
"""
import pytest

from tests.conftest import approve, signup


PROFILE_UPDATE = {
    "name": "Test User",
    "allergies_and_conditions": ["Peanut Allergy", "Celiac/Gluten-Free"],
    "free_text_goals": "I want more protein and less sugar.",
    "dietary_philosophy": "Keto",
    "avoided_ingredients": ["High-Fructose Corn Syrup"],
    "processed_food_tolerance": 2,
}


# ── Options (public reference data) ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_options_stays_public(client):
    """Static reference data, no user content — deliberately left unauthenticated."""
    r = await client.get("/api/profile/options")
    assert r.status_code == 200
    assert "dietary_philosophies" in r.json()


# ── Auth gate ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_profile_without_token_is_401(client):
    r = await client.get("/api/profile/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_update_profile_without_token_is_401(client):
    r = await client.put("/api/profile/me", json={"name": "Nobody"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_nutrition_plan_without_token_is_401(client):
    r = await client.post("/api/profile/nutrition-plan", json={})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_profile_id_routes_are_gone(client, account):
    """The old id-addressed routes must not exist at all — a 404/405 here, never
    a 200. Keeping them 'for compatibility' would keep the hole open."""
    r = await client.get(
        "/api/profile/00000000-0000-0000-0000-000000000000", headers=account["headers"]
    )
    assert r.status_code in (404, 405)


@pytest.mark.asyncio
async def test_create_profile_route_is_gone(client, account):
    """Signup provisions the single profile; a second one must not be creatable."""
    r = await client.post("/api/profile", json={}, headers=account["headers"])
    assert r.status_code in (404, 405)


# ── Read / update your own profile ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_own_profile(client, account):
    r = await client.get("/api/profile/me", headers=account["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == account["profile_id"]
    # Signup creates it empty; defaults should be sane.
    assert data["allergies_and_conditions"] == []
    assert data["processed_food_tolerance"] == 3


@pytest.mark.asyncio
async def test_update_own_profile(client, account):
    r = await client.put("/api/profile/me", json=PROFILE_UPDATE, headers=account["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Test User"
    assert data["dietary_philosophy"] == "Keto"
    assert "Peanut Allergy" in data["allergies_and_conditions"]
    assert data["processed_food_tolerance"] == 2
    assert "High-Fructose Corn Syrup" in data["avoided_ingredients"]


@pytest.mark.asyncio
async def test_partial_update_preserves_other_fields(client, account):
    await client.put("/api/profile/me", json=PROFILE_UPDATE, headers=account["headers"])
    r = await client.put(
        "/api/profile/me",
        json={"dietary_philosophy": "Vegan", "free_text_goals": "Go plant-based."},
        headers=account["headers"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["dietary_philosophy"] == "Vegan"
    assert data["free_text_goals"] == "Go plant-based."
    assert data["name"] == "Test User"


@pytest.mark.asyncio
async def test_update_persists(client, account):
    await client.put("/api/profile/me", json=PROFILE_UPDATE, headers=account["headers"])
    r = await client.get("/api/profile/me", headers=account["headers"])
    assert r.json()["name"] == "Test User"


# ── Isolation between accounts ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_two_accounts_see_only_their_own_profile(client, db_engine):
    """The actual security property this change exists for."""
    a = await signup(client, "alice@example.com")
    b = await signup(client, "bob@example.com")
    await approve(db_engine, a["user"]["id"])
    await approve(db_engine, b["user"]["id"])
    a_headers = {"Authorization": f"Bearer {a['access_token']}"}
    b_headers = {"Authorization": f"Bearer {b['access_token']}"}

    await client.put("/api/profile/me", json={"name": "Alice"}, headers=a_headers)
    await client.put("/api/profile/me", json={"name": "Bob"}, headers=b_headers)

    assert a["profile_id"] != b["profile_id"]
    assert (await client.get("/api/profile/me", headers=a_headers)).json()["name"] == "Alice"
    assert (await client.get("/api/profile/me", headers=b_headers)).json()["name"] == "Bob"


@pytest.mark.asyncio
async def test_cannot_reach_another_users_profile_by_id(client, db_engine):
    """Bob holds Alice's profile id and a valid token of his own — and still
    cannot read her profile, because no route accepts an id."""
    alice = await signup(client, "alice2@example.com")
    bob = await signup(client, "bob2@example.com")
    await approve(db_engine, bob["user"]["id"])
    bob_headers = {"Authorization": f"Bearer {bob['access_token']}"}

    r = await client.get(f"/api/profile/{alice['profile_id']}", headers=bob_headers)
    assert r.status_code in (404, 405)

    mine = await client.get("/api/profile/me", headers=bob_headers)
    assert mine.json()["id"] == bob["profile_id"]
