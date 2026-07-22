"""
Migration: add the optional `age_group` column to user_profiles.

Run from the backend/ directory:
  python scripts/migrate_add_age_group_column.py

Safe to run multiple times — uses ALTER TABLE IF NOT EXISTS pattern.
"""
import os, sys, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import asyncpg

async def migrate():
    from app.config import settings
    # Build a plain asyncpg DSN (no SQLAlchemy driver prefix)
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(dsn)
    try:
        stmt = """ALTER TABLE user_profiles
                  ADD COLUMN IF NOT EXISTS age_group VARCHAR(20)"""
        await conn.execute(stmt)
        print(f"✅  {stmt.strip()[:60]}…")
        print("\n✅  Migration complete.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
