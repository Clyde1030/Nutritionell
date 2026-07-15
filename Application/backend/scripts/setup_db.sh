#!/usr/bin/env bash
set -euo pipefail

# Initialize + seed a Postgres database: extensions, tables, migrations, USDA seed data.
# Works against local Postgres (docker-compose) or real RDS through an SSM tunnel --
# whichever DATABASE_URL points at.
#
# Usage:
#   Local (uses .env as-is):
#     bash scripts/setup_db.sh
#
#   Real RDS via SSM tunnel (see scripts/tunnel_rds.sh to open the tunnel first):
#     DATABASE_URL="postgresql+asyncpg://nutritionell:<password>@localhost:5433/nutritionell_db" \
#       bash scripts/setup_db.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Enabling extensions (vector, uuid-ossp)..."
python scripts/init_extensions.py

echo "==> Creating tables..."
python scripts/create_tables.py

echo "==> Running column migrations..."
python scripts/migrate_add_columns.py

echo "==> Seeding USDA data..."
python scripts/seed_usda.py

echo "✅  Database setup complete."
