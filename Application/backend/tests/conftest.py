"""
Pytest fixtures for the Nutritionell backend test suite.

Uses an in-memory SQLite database so tests run without Docker.
PostgreSQL-specific types (ARRAY, Vector) are patched to SQLite-compatible
equivalents before any app code is imported.

Gemini and AWS SES are both mocked — the suite never makes a real API call.
"""
import os
import sys

# Must be set before app.config is imported: Settings() reads the environment at
# import time, and the app refuses to issue tokens with an empty signing key.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import MagicMock
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# ── Patch pgvector before any app import touches it ──────────────────────────
import sqlalchemy.types as sa_types

class _FakeVector(sa_types.JSON):
    """Stand-in for pgvector.sqlalchemy.Vector during tests."""
    def __init__(self, dim=None):
        super().__init__()

fake_pgvector_module = MagicMock()
fake_pgvector_module.sqlalchemy.Vector = _FakeVector
sys.modules.setdefault("pgvector", fake_pgvector_module)
sys.modules.setdefault("pgvector.sqlalchemy", fake_pgvector_module.sqlalchemy)

# ── Patch PostgreSQL ARRAY to JSON so SQLite accepts it ───────────────────────
# Must happen before app.models.user is imported (which uses ARRAY).
from sqlalchemy.dialects.postgresql import ARRAY as _PG_ARRAY  # noqa: E402

class _FakeArray(sa_types.JSON):
    """Stand-in for PostgreSQL ARRAY during tests."""
    def __init__(self, *args, **kwargs):
        super().__init__()

# Monkey-patch the dialect's ARRAY so the ORM column definition resolves to JSON
import sqlalchemy.dialects.postgresql as _pg_dialect  # noqa: E402
_pg_dialect.ARRAY = _FakeArray

# Also patch the import path used in the model file
import sqlalchemy.dialects.postgresql.base as _pg_base  # noqa: E402
_pg_base.ARRAY = _FakeArray

# ── Now safe to import app modules ────────────────────────────────────────────
from app.database import Base, get_db          # noqa: E402
from app.models import user, usda              # noqa: F401, E402  — register with Base
from main import app                           # noqa: E402

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def db_engine():
    import uuid as _uuid

    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Register gen_random_uuid() as a SQLite user function
    from sqlalchemy import event as sa_event

    @sa_event.listens_for(engine.sync_engine, "connect")
    def _register_uuid_func(dbapi_conn, _):
        dbapi_conn.create_function("gen_random_uuid", 0, lambda: str(_uuid.uuid4()))

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(db_engine):
    """AsyncClient wired to the FastAPI app with the in-memory DB."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # Run the startup event so tables exist and app state is initialised
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ── AWS SES ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_ses(monkeypatch):
    """Stub the SES client for every test, so no test can make a real AWS call.

    Autouse rather than opt-in: a forgotten mock in one new test would otherwise
    try to reach AWS from CI.
    """
    sent: list[dict] = []

    class _FakeSes:
        def send_email(self, **kwargs):
            sent.append(kwargs)
            return {"MessageId": "test-message-id"}

    import app.services.email_service as email_service

    monkeypatch.setattr(email_service, "_client", lambda: _FakeSes())
    return sent


# ── Auth helpers ─────────────────────────────────────────────────────────────

DEFAULT_TEST_EMAIL = "tester@example.com"
DEFAULT_TEST_PASSWORD = "correct-horse-battery"


async def signup(client, email: str = DEFAULT_TEST_EMAIL,
                 password: str = DEFAULT_TEST_PASSWORD) -> dict:
    """Create an account and return the parsed signup response."""
    r = await client.post("/api/auth/signup", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _set_flags(db_engine, user_id: str, *, approved=None, admin=None) -> None:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.user import User

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(select(User).where(User.id == str(user_id)))
        user = result.scalar_one()
        if approved is not None:
            user.is_approved = approved
        if admin is not None:
            user.is_admin = admin
        await session.commit()


@pytest_asyncio.fixture(scope="function")
async def account(client, db_engine):
    """A registered account that can use the app: {token, headers, user_id,
    email, profile_id}.

    Approved on creation. Signup leaves accounts pending (the temporary approval
    gate), but the feature tests that use this fixture are about profiles and
    analysis, not about the gate — the gate has its own tests in test_admin.py.
    """
    data = await signup(client)
    await _set_flags(db_engine, data["user"]["id"], approved=True)
    return {
        "token": data["access_token"],
        "headers": auth_headers(data["access_token"]),
        "user_id": data["user"]["id"],
        "email": data["user"]["email"],
        "profile_id": data["profile_id"],
    }


# ── Approval-gate fixtures (temporary feature) ───────────────────────────────
# Signup creates accounts unapproved, so "approved" and "admin" are made by
# flipping the columns directly — which is exactly how the first admin is
# bootstrapped in production too.

async def approve(db_engine, user_id: str) -> None:
    """Mark an account approved — the temporary gate leaves new signups pending,
    so any test exercising a real feature has to clear it first."""
    await _set_flags(db_engine, user_id, approved=True)


def emails_matching(sent: list, needle: str) -> list:
    """Sends whose subject contains `needle`.

    Signup now emits an admin notification as well as any reset mail, so tests
    must select the message they mean rather than indexing blindly.
    """
    return [m for m in sent if needle.lower() in m["Message"]["Subject"]["Data"].lower()]


@pytest_asyncio.fixture(scope="function")
async def pending_account(client):
    """A signed-up account that has NOT been approved — the default state."""
    data = await signup(client, "pending@example.com")
    return {
        "token": data["access_token"],
        "headers": auth_headers(data["access_token"]),
        "user_id": data["user"]["id"],
        "email": data["user"]["email"],
        "profile_id": data["profile_id"],
    }


@pytest_asyncio.fixture(scope="function")
async def approved_account(client, db_engine):
    data = await signup(client, "approved@example.com")
    await _set_flags(db_engine, data["user"]["id"], approved=True)
    return {
        "token": data["access_token"],
        "headers": auth_headers(data["access_token"]),
        "user_id": data["user"]["id"],
        "email": data["user"]["email"],
        "profile_id": data["profile_id"],
    }


@pytest_asyncio.fixture(scope="function")
async def admin_account(client, db_engine):
    """An admin. Deliberately left is_approved=False to prove is_admin alone
    grants access — the bootstrap footgun this feature is meant to avoid."""
    data = await signup(client, "admin@example.com")
    await _set_flags(db_engine, data["user"]["id"], admin=True)
    return {
        "token": data["access_token"],
        "headers": auth_headers(data["access_token"]),
        "user_id": data["user"]["id"],
        "email": data["user"]["email"],
        "profile_id": data["profile_id"],
    }
