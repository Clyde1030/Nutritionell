"""
Enable the Postgres extensions required by the schema (pgvector, uuid-ossp).

Equivalent to running scripts/init_db.sql through psql, but works without a
psql client installed -- useful when connecting through an SSM tunnel.

Run from the backend/ directory:
  python scripts/init_extensions.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import asyncpg


async def main():
    from app.config import settings

    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
        print("✅  Extensions enabled (vector, uuid-ossp).")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
