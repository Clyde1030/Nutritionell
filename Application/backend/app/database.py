from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,          # set True to log SQL during debugging
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        yield session


async def create_all_tables() -> None:
    """Create all tables on startup (dev convenience — use Alembic for prod)."""
    # pgvector must be registered before SQLAlchemy reflects the vector column
    from pgvector.sqlalchemy import Vector  # noqa: F401
    import app.models.user   # noqa: F401 — ensure models are imported
    import app.models.usda   # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
