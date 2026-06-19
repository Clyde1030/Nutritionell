#!/usr/bin/env bash
set -euo pipefail

# Simple WSL helper to create a venv, install deps, and seed the DB.
# Run from inside the backend/ folder in WSL:
# bash scripts/setup_wsl.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -d .venv ]; then
  echo "Found existing .venv -- removing to ensure a clean Linux virtualenv"
  rm -rf .venv
fi

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "Seeding USDA sample data..."
python scripts/seed_usda.py

echo "WSL backend setup complete. Activate with: source .venv/bin/activate"
