"""
Tests for the TEMPORARY admin-approval gate.

Covers the three properties that matter: a pending account is fully blocked, only
an admin can reach /api/admin/*, and approving actually unblocks the account.

SES is mocked by the autouse `mock_ses` fixture in conftest.
"""
import pytest

from tests.conftest import auth_headers, signup


# ── The gate blocks pending accounts ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_new_signup_is_pending_by_default(client):
    data = await signup(client, "brandnew@example.com")
    assert data["user"]["is_approved"] is False
    assert data["user"]["is_admin"] is False


@pytest.mark.asyncio
async def test_pending_user_is_403_pending_approval(client, pending_account):
    r = await client.get("/api/profile/me", headers=pending_account["headers"])
    assert r.status_code == 403
    # The frontend keys its waiting notice off this exact string.
    assert r.json()["detail"] == "pending_approval"


@pytest.mark.asyncio
async def test_approved_user_is_not_blocked(client, approved_account):
    r = await client.get("/api/profile/me", headers=approved_account["headers"])
    assert r.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/profile/me"),
        ("put", "/api/profile/me"),
        ("post", "/api/profile/nutrition-plan"),
    ],
)
async def test_pending_user_blocked_across_protected_routes(
    client, pending_account, method, path
):
    kwargs = {"headers": pending_account["headers"]}
    if method in ("put", "post"):
        kwargs["json"] = {}
    r = await getattr(client, method)(path, **kwargs)
    assert r.status_code == 403
    assert r.json()["detail"] == "pending_approval"


@pytest.mark.asyncio
async def test_pending_user_blocked_from_analyze(client, pending_account):
    tiny_jpeg = b"\xff\xd8\xff\xd9"
    for path in ("/api/analyze", "/api/analyze/stream", "/api/analyze/mock"):
        r = await client.post(
            path,
            headers=pending_account["headers"],
            files={"image": ("shelf.jpg", tiny_jpeg, "image/jpeg")},
        )
        assert r.status_code == 403, path
        assert r.json()["detail"] == "pending_approval", path


# ── Login and /me keep working while pending ─────────────────────────────────

@pytest.mark.asyncio
async def test_pending_user_can_still_log_in(client, pending_account):
    """Login is not the thing being gated — access to features is."""
    r = await client.post(
        "/api/auth/login",
        json={"email": pending_account["email"], "password": "correct-horse-battery"},
    )
    assert r.status_code == 200
    assert r.json()["access_token"]
    assert r.json()["user"]["is_approved"] is False


@pytest.mark.asyncio
async def test_me_works_while_pending_and_reports_status(client, pending_account):
    """/me must stay on plain auth: the frontend has to be able to ask
    'what is my status' without that call itself being blocked."""
    r = await client.get("/api/auth/me", headers=pending_account["headers"])
    assert r.status_code == 200
    assert r.json()["user"]["is_approved"] is False
    assert r.json()["user"]["is_admin"] is False


@pytest.mark.asyncio
async def test_me_reports_approved_status(client, approved_account):
    r = await client.get("/api/auth/me", headers=approved_account["headers"])
    assert r.status_code == 200
    assert r.json()["user"]["is_approved"] is True


# ── /api/admin/* is admin-only ───────────────────────────────────────────────

ADMIN_ROUTES = [
    ("get", "/api/admin/users/pending"),
    ("get", "/api/admin/users"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_admin_routes_reject_anonymous(client, method, path):
    r = await getattr(client, method)(path)
    assert r.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_admin_routes_reject_pending_user(client, pending_account, method, path):
    r = await getattr(client, method)(path, headers=pending_account["headers"])
    assert r.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_admin_routes_reject_approved_non_admin(client, approved_account, method, path):
    """Being approved is not being an admin."""
    r = await getattr(client, method)(path, headers=approved_account["headers"])
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_approve_and_revoke_reject_non_admin(client, approved_account, pending_account):
    uid = pending_account["user_id"]
    for path in (f"/api/admin/users/{uid}/approve", f"/api/admin/users/{uid}/revoke"):
        r = await client.post(path, headers=approved_account["headers"])
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list_users(client, admin_account, pending_account):
    r = await client.get("/api/admin/users", headers=admin_account["headers"])
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()}
    assert admin_account["email"] in emails
    assert pending_account["email"] in emails


@pytest.mark.asyncio
async def test_admin_can_list_pending_users(client, admin_account, pending_account, approved_account):
    r = await client.get("/api/admin/users/pending", headers=admin_account["headers"])
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()}
    assert pending_account["email"] in emails
    assert approved_account["email"] not in emails


@pytest.mark.asyncio
async def test_admin_has_access_without_being_approved(client, admin_account):
    """is_admin implies access — the bootstrap footgun this avoids."""
    assert (await client.get("/api/auth/me", headers=admin_account["headers"])).json()[
        "user"
    ]["is_approved"] is False
    r = await client.get("/api/profile/me", headers=admin_account["headers"])
    assert r.status_code == 200


# ── Approve / revoke round trip ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approving_unblocks_the_user_end_to_end(client, admin_account, pending_account):
    """The behaviour the whole feature exists for: 403 before, 200 after."""
    before = await client.get("/api/profile/me", headers=pending_account["headers"])
    assert before.status_code == 403
    assert before.json()["detail"] == "pending_approval"

    approve = await client.post(
        f"/api/admin/users/{pending_account['user_id']}/approve",
        headers=admin_account["headers"],
    )
    assert approve.status_code == 200
    assert approve.json()["user"]["is_approved"] is True

    after = await client.get("/api/profile/me", headers=pending_account["headers"])
    assert after.status_code == 200

    # The same token keeps working — approval is read per-request from the DB,
    # so the user does not have to log in again.
    assert after.json()["id"] == pending_account["profile_id"]


@pytest.mark.asyncio
async def test_revoking_reblocks_the_user(client, admin_account, approved_account):
    assert (
        await client.get("/api/profile/me", headers=approved_account["headers"])
    ).status_code == 200

    r = await client.post(
        f"/api/admin/users/{approved_account['user_id']}/revoke",
        headers=admin_account["headers"],
    )
    assert r.status_code == 200
    assert r.json()["user"]["is_approved"] is False

    after = await client.get("/api/profile/me", headers=approved_account["headers"])
    assert after.status_code == 403


@pytest.mark.asyncio
async def test_approve_is_idempotent(client, admin_account, pending_account):
    path = f"/api/admin/users/{pending_account['user_id']}/approve"
    first = await client.post(path, headers=admin_account["headers"])
    second = await client.post(path, headers=admin_account["headers"])
    assert first.status_code == second.status_code == 200
    assert second.json()["user"]["is_approved"] is True


@pytest.mark.asyncio
async def test_revoking_an_admin_says_it_did_not_remove_access(client, admin_account):
    """Revoking an admin is a no-op for access; the response must say so rather
    than implying the admin was locked out."""
    r = await client.post(
        f"/api/admin/users/{admin_account['user_id']}/revoke",
        headers=admin_account["headers"],
    )
    assert r.status_code == 200
    assert "still have access" in r.json()["message"]
    assert (
        await client.get("/api/profile/me", headers=admin_account["headers"])
    ).status_code == 200


@pytest.mark.asyncio
async def test_approve_unknown_user_is_404(client, admin_account):
    r = await client.post(
        "/api/admin/users/00000000-0000-0000-0000-000000000000/approve",
        headers=admin_account["headers"],
    )
    assert r.status_code == 404


# ── Signup notification ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_signup_notifies_the_admin_address(client, mock_ses):
    from app.config import settings

    await signup(client, "watched@example.com")

    assert len(mock_ses) == 1
    sent = mock_ses[0]
    assert sent["Destination"]["ToAddresses"] == [settings.admin_notification_email]
    # The admin needs to know WHO to look up.
    assert "watched@example.com" in sent["Message"]["Body"]["Text"]["Data"]


@pytest.mark.asyncio
async def test_signup_succeeds_even_if_the_notification_fails(client, monkeypatch):
    """A broken or rate-limited SES must never cost someone their signup."""
    import app.services.email_service as email_service

    def _boom():
        raise RuntimeError("SES is down")

    monkeypatch.setattr(email_service, "_client", _boom)

    r = await client.post(
        "/api/auth/signup",
        json={"email": "resilient@example.com", "password": "a-good-password"},
    )
    assert r.status_code == 201
    assert r.json()["access_token"]
