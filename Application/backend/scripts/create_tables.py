"""
Create all ORM-defined tables (SQLAlchemy metadata.create_all) against
whatever DATABASE_URL currently points at.

Run from the backend/ directory:
  python scripts/create_tables.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


async def main():
    from app.database import create_all_tables

    await create_all_tables()
    print("✅  Tables created.")


if __name__ == "__main__":
    asyncio.run(main())
