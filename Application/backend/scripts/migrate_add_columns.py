"""
Migration: add new columns to user_profiles that were added in v0.2.

Run from the backend/ directory:
  python scripts/migrate_add_columns.py

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
        stmts = [
            """ALTER TABLE user_profiles
               ADD COLUMN IF NOT EXISTS philosophy_customizations TEXT""",
            """ALTER TABLE user_profiles
               ADD COLUMN IF NOT EXISTS custom_philosophy_text TEXT""",
            """ALTER TABLE user_profiles
               ADD COLUMN IF NOT EXISTS avoided_ingredients VARCHAR(200)[]
               NOT NULL DEFAULT '{}'""",
            """ALTER TABLE user_profiles
               ADD COLUMN IF NOT EXISTS processed_food_tolerance INTEGER
               NOT NULL DEFAULT 3""",
        ]
        for stmt in stmts:
            await conn.execute(stmt)
            print(f"✅  {stmt.strip()[:60]}…")
        print("\n✅  Migration complete.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
