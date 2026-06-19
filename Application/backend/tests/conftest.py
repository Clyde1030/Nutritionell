"""
Pytest fixtures for the Nutritionell backend test suite.

Uses an in-memory SQLite database so tests run without Docker.
PostgreSQL-specific types (ARRAY, Vector) are patched to SQLite-compatible
equivalents before any app code is imported.
"""
import sys
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
