"""
Migration: add the accounts tables (`users`, `password_reset_tokens`) and link
`user_profiles` to an owner via `user_id`.

Run from the backend/ directory:
  python scripts/migrate_add_user_auth.py

Safe to run multiple times — CREATE TABLE / ADD COLUMN / CREATE INDEX all use
IF NOT EXISTS.

Note on existing rows: profiles created before accounts existed keep
`user_id IS NULL`. There is no backfill, by decision — an orphaned profile has no
owner to assign. `user_id` therefore stays nullable at the column level, and the
API never exposes those rows because every profile lookup resolves through the
authenticated user.
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
            # gen_random_uuid() lives in pgcrypto on older servers; built in from
            # PG13. Requested here so this script stands alone if run before
            # init_extensions.py.
            """CREATE EXTENSION IF NOT EXISTS pgcrypto""",

            """CREATE TABLE IF NOT EXISTS users (
                   id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                   email           VARCHAR(320) NOT NULL,
                   hashed_password VARCHAR(255) NOT NULL,
                   created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                   updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
               )""",

            # Emails are stored already-lowercased by the app; this unique index
            # is what actually stops the same address registering twice.
            """CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email
                   ON users (email)""",

            """CREATE TABLE IF NOT EXISTS password_reset_tokens (
                   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                   user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                   token_hash VARCHAR(128) NOT NULL,
                   expires_at TIMESTAMPTZ NOT NULL,
                   used_at    TIMESTAMPTZ,
                   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
               )""",

            """CREATE UNIQUE INDEX IF NOT EXISTS ix_password_reset_tokens_token_hash
                   ON password_reset_tokens (token_hash)""",

            """CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id
                   ON password_reset_tokens (user_id)""",

            # Nullable on purpose — see the module docstring.
            """ALTER TABLE user_profiles
                   ADD COLUMN IF NOT EXISTS user_id UUID""",

            """CREATE UNIQUE INDEX IF NOT EXISTS ix_user_profiles_user_id
                   ON user_profiles (user_id)""",
        ]
        for stmt in stmts:
            await conn.execute(stmt)
            print(f"✅  {' '.join(stmt.split())[:70]}…")

        # The FK is added separately: ADD CONSTRAINT has no IF NOT EXISTS, so
        # re-running would error. Check the catalog first instead.
        exists = await conn.fetchval(
            """SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_profiles_user_id'"""
        )
        if exists:
            print("✅  fk_user_profiles_user_id already present — skipped")
        else:
            await conn.execute(
                """ALTER TABLE user_profiles
                       ADD CONSTRAINT fk_user_profiles_user_id
                       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"""
            )
            print("✅  ALTER TABLE user_profiles ADD CONSTRAINT fk_user_profiles_user_id…")

        orphans = await conn.fetchval(
            """SELECT count(*) FROM user_profiles WHERE user_id IS NULL"""
        )
        if orphans:
            print(
                f"\nℹ️   {orphans} pre-auth profile row(s) have no owner. Left as-is by "
                "decision — they are unreachable through the API and can be deleted "
                "manually whenever you want."
            )

        print("\n✅  Migration complete.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
