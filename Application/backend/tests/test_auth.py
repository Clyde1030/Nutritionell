"""
Tests for /api/auth — signup, login, session restore, and password reset.

SES is mocked by the autouse `mock_ses` fixture in conftest; no AWS call is made.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from tests.conftest import (
    DEFAULT_TEST_EMAIL,
    DEFAULT_TEST_PASSWORD,
    auth_headers,
    emails_matching,
    signup,
)


# ── Signup ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_signup_creates_user_token_and_profile(client):
    r = await client.post(
        "/api/auth/signup",
        json={"email": "new@example.com", "password": "a-good-password"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["user"]["email"] == "new@example.com"
    # Signup must provision the one profile the account gets, in the same call.
    assert data["profile_id"]


@pytest.mark.asyncio
async def test_signup_lowercases_email(client):
    r = await client.post(
        "/api/auth/signup",
        json={"email": "MixedCase@Example.COM", "password": "a-good-password"},
    )
    assert r.status_code == 201
    assert r.json()["user"]["email"] == "mixedcase@example.com"


@pytest.mark.asyncio
async def test_signup_duplicate_email_conflicts(client):
    await signup(client, "dupe@example.com")
    r = await client.post(
        "/api/auth/signup",
        json={"email": "dupe@example.com", "password": "another-password"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_signup_duplicate_is_case_insensitive(client):
    """Bob@x.com and bob@x.com must be one account, not two."""
    await signup(client, "case@example.com")
    r = await client.post(
        "/api/auth/signup",
        json={"email": "CASE@Example.com", "password": "another-password"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_signup_rejects_short_password(client):
    r = await client.post(
        "/api/auth/signup", json={"email": "short@example.com", "password": "abc123"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_signup_rejects_malformed_email(client):
    r = await client.post(
        "/api/auth/signup", json={"email": "not-an-email", "password": "a-good-password"}
    )
    assert r.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client):
    await signup(client)
    r = await client.post(
        "/api/auth/login",
        json={"email": DEFAULT_TEST_EMAIL, "password": DEFAULT_TEST_PASSWORD},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
    assert data["user"]["email"] == DEFAULT_TEST_EMAIL
    assert data["profile_id"]


@pytest.mark.asyncio
async def test_login_wrong_password_is_401(client):
    await signup(client)
    r = await client.post(
        "/api/auth/login", json={"email": DEFAULT_TEST_EMAIL, "password": "wrong-password"}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_is_401(client):
    r = await client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "any-password"}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_does_not_reveal_which_field_was_wrong(client):
    """Identical response for unknown-user and wrong-password, or this endpoint
    becomes an account-existence oracle."""
    await signup(client)
    wrong_pw = await client.post(
        "/api/auth/login", json={"email": DEFAULT_TEST_EMAIL, "password": "wrong-password"}
    )
    unknown = await client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "any-password"}
    )
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


# ── /me ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_me_with_valid_token(client, account):
    r = await client.get("/api/auth/me", headers=account["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["id"] == account["user_id"]
    assert data["profile_id"] == account["profile_id"]


@pytest.mark.asyncio
async def test_me_without_token_is_401(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_with_garbage_token_is_401(client):
    r = await client.get("/api/auth/me", headers=auth_headers("not.a.jwt"))
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_with_wrong_scheme_is_401(client, account):
    r = await client.get("/api/auth/me", headers={"Authorization": account["token"]})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_with_token_signed_by_another_key_is_401(client, account):
    """A token we didn't sign must not be accepted, however well-formed."""
    import jwt as pyjwt

    forged = pyjwt.encode({"sub": account["user_id"]}, "some-other-secret", algorithm="HS256")
    r = await client.get("/api/auth/me", headers=auth_headers(forged))
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_is_401(client, account):
    import jwt as pyjwt
    from app.config import settings

    past = datetime.now(timezone.utc) - timedelta(days=1)
    expired = pyjwt.encode(
        {"sub": account["user_id"], "exp": int(past.timestamp())},
        settings.jwt_secret_key,
        algorithm="HS256",
    )
    r = await client.get("/api/auth/me", headers=auth_headers(expired))
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_token_for_deleted_user_is_401(client, account, db_session):
    from app.models.user import User

    result = await db_session.execute(select(User).where(User.id == account["user_id"]))
    user = result.scalar_one()
    await db_session.delete(user)
    await db_session.commit()

    r = await client.get("/api/auth/me", headers=account["headers"])
    assert r.status_code == 401


# ── Forgot / reset password ───────────────────────────────────────────────────

async def _request_reset(client, email: str) -> str | None:
    """Trigger forgot-password and dig the raw token out of the stored row.

    The raw token only ever exists in the email body, so the round-trip test
    reconstructs it the way a user would: by reading the link that was sent.
    """
    r = await client.post("/api/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    return r


@pytest.mark.asyncio
async def test_forgot_password_always_200_for_unknown_email(client, mock_ses):
    r = await client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r.status_code == 200
    # ...and crucially sends no reset mail, so the 200 is not a delivery signal.
    assert emails_matching(mock_ses, "Reset your Nutritionell password") == []


@pytest.mark.asyncio
async def test_forgot_password_response_is_identical_known_vs_unknown(client):
    await signup(client)
    known = await client.post("/api/auth/forgot-password", json={"email": DEFAULT_TEST_EMAIL})
    unknown = await client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


@pytest.mark.asyncio
async def test_forgot_password_sends_email_with_reset_link(client, mock_ses):
    await signup(client)
    await _request_reset(client, DEFAULT_TEST_EMAIL)

    sent = _reset_email(mock_ses)
    assert sent["Destination"]["ToAddresses"] == [DEFAULT_TEST_EMAIL]
    body = sent["Message"]["Body"]["Text"]["Data"]
    assert "reset_token=" in body


def _reset_email(sent: list) -> dict:
    """The password-reset message. Signup also sends an admin notification, so
    the reset mail has to be picked by subject rather than by position."""
    matches = emails_matching(sent, "Reset your Nutritionell password")
    assert matches, f"no reset email among {[m['Message']['Subject']['Data'] for m in sent]}"
    return matches[-1]


def _token_from_email(sent: dict) -> str:
    body = sent["Message"]["Body"]["Text"]["Data"]
    return body.split("reset_token=")[1].split()[0].strip()


@pytest.mark.asyncio
async def test_forgot_then_reset_round_trip(client, mock_ses):
    await signup(client)
    await _request_reset(client, DEFAULT_TEST_EMAIL)
    token = _token_from_email(_reset_email(mock_ses))

    r = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brand-new-password"}
    )
    assert r.status_code == 200

    # Old password no longer works, new one does.
    old = await client.post(
        "/api/auth/login", json={"email": DEFAULT_TEST_EMAIL, "password": DEFAULT_TEST_PASSWORD}
    )
    assert old.status_code == 401
    new = await client.post(
        "/api/auth/login", json={"email": DEFAULT_TEST_EMAIL, "password": "brand-new-password"}
    )
    assert new.status_code == 200


@pytest.mark.asyncio
async def test_reset_token_is_single_use(client, mock_ses):
    await signup(client)
    await _request_reset(client, DEFAULT_TEST_EMAIL)
    token = _token_from_email(_reset_email(mock_ses))

    first = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "first-new-password"}
    )
    assert first.status_code == 200

    second = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "second-new-password"}
    )
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_reset_with_bogus_token_is_400(client):
    r = await client.post(
        "/api/auth/reset-password",
        json={"token": "not-a-real-token", "new_password": "brand-new-password"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_reset_with_expired_token_is_400(client, mock_ses, db_session):
    from app.models.user import PasswordResetToken

    await signup(client)
    await _request_reset(client, DEFAULT_TEST_EMAIL)
    token = _token_from_email(_reset_email(mock_ses))

    # Age the row past its expiry rather than sleeping.
    result = await db_session.execute(select(PasswordResetToken))
    row = result.scalars().first()
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()

    r = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brand-new-password"}
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_reset_rejects_weak_new_password(client, mock_ses):
    await signup(client)
    await _request_reset(client, DEFAULT_TEST_EMAIL)
    token = _token_from_email(_reset_email(mock_ses))

    r = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "short"}
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_reset_stores_only_a_hash_of_the_token(client, mock_ses, db_session):
    """A database read must not be replayable into a password reset."""
    from app.models.user import PasswordResetToken

    await signup(client)
    await _request_reset(client, DEFAULT_TEST_EMAIL)
    raw = _token_from_email(_reset_email(mock_ses))

    result = await db_session.execute(select(PasswordResetToken))
    row = result.scalars().first()
    assert row.token_hash != raw
    assert raw not in row.token_hash
