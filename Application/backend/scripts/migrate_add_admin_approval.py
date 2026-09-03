"""
Migration: add the temporary admin-approval columns to `users`.

  is_approved  bool NOT NULL DEFAULT false
  is_admin     bool NOT NULL DEFAULT false

Run from the backend/ directory:
  python scripts/migrate_add_admin_approval.py

Safe to run multiple times — ADD COLUMN IF NOT EXISTS.

Existing accounts created before this gate existed default to `is_approved =
false`, i.e. they become pending. That is intentional: the point of the gate is
that nobody has access until it is granted. Approve them with the admin
endpoints, or by hand in psql.

TEMPORARY FEATURE. Removing the gate later means dropping these two columns
(and app/routers/admin.py + get_current_approved_user); nothing else depends on
them.
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
            """ALTER TABLE users
                   ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false""",
            """ALTER TABLE users
                   ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false""",
            # The pending list is the one query Mel runs repeatedly.
            """CREATE INDEX IF NOT EXISTS ix_users_is_approved
                   ON users (is_approved)""",
        ]
        for stmt in stmts:
            await conn.execute(stmt)
            print(f"✅  {' '.join(stmt.split())[:70]}…")

        pending = await conn.fetchval("SELECT count(*) FROM users WHERE is_approved = false")
        admins = await conn.fetchval("SELECT count(*) FROM users WHERE is_admin = true")
        print(f"\nℹ️   {pending} account(s) currently pending approval.")
        if admins == 0:
            print(
                "ℹ️   No admin account exists yet. Nothing can create one through the API "
                "by design — sign up normally, then run:\n"
                "       UPDATE users SET is_admin = true, is_approved = true "
                "WHERE email = '<your email>';\n"
                "     See infra/AWS_SETUP_LOGIN_FEATURE.md § 'Bootstrapping the first admin'."
            )
        else:
            print(f"ℹ️   {admins} admin account(s) present.")

        print("\n✅  Migration complete.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
