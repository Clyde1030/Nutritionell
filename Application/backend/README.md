# Nutritionell Backend

FastAPI service that powers `/api/analyze` (YOLO product detection + Gemini
identification/scoring against a user's diet profile) and profile management.

## Prerequisites

- Python 3.12+ (Dockerfile uses `python:3.12-slim`)
- Docker (for local Postgres via `docker-compose.yml`, and for building the deploy image)
- A Gemini API key ([ai.google.dev](https://ai.google.dev)) for anything that calls `/api/analyze`
- The YOLO model file `Model/yolov11n_all_final.pkl` present at the **repo root** `Model/`
  directory (outside `Application/backend/`) — `app/services/yolo_service.py` looks for it
  there in local dev, or at `/Model/yolov11n_all_final.pkl` inside the container

## 1. Install

```bash
cd Application/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Configure environment

Create `Application/backend/.env` (gitignored):

```ini
DATABASE_URL=postgresql+asyncpg://nutritionell:nutritionell_secret@localhost:5432/nutritionell_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=nutritionell
POSTGRES_PASSWORD=nutritionell_secret
POSTGRES_DB=nutritionell_db

GEMINI_API_KEY=<your-gemini-api-key>

API_HOST=0.0.0.0
API_PORT=8000

# Optional — tunable YOLO detection thresholds, defaults shown
YOLO_CONF_THRESHOLD=0.25
YOLO_IOU_THRESHOLD=0.4
YOLO_MAX_DETECTIONS=40
```

All fields are defined in [app/config.py](app/config.py).

## 3. Start Postgres and load the schema

From the **repo root**:

```bash
docker compose up -d postgres
```

Then, from `Application/backend`:

```bash
bash scripts/setup_db.sh
```

This runs, in order: `scripts/init_extensions.py` (pgvector, uuid-ossp),
`scripts/create_tables.py`, `scripts/migrate_add_columns.py`, `scripts/seed_usda.py`.
It's idempotent — safe to re-run.

## 4. Run the server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- `GET /health` — liveness check
- `GET /health/model` — confirms the YOLO model loaded and runs a smoke-test detection

## Testing locally

### Unit/integration tests (mocked, no external dependencies)

```bash
pytest tests/ -v
```

Everything here runs against an in-memory SQLite DB and a mocked Gemini client
(see [tests/conftest.py](tests/conftest.py)) — no Docker, no API key, no network calls,
no real YOLO inference required. This is what you run on every change.

### Manual end-to-end smoke test (real YOLO + real Gemini)

```bash
python scripts/smoke_test_pipeline.py
```

Runs the actual pipeline against `app/assets/sample_shelf.jpg`: real YOLO detection,
real Gemini identification of the crops, and a real Gemini scoring pass against a
sample diet profile. Requires `GEMINI_API_KEY` and the YOLO model file to be present;
makes real network calls and spends real Gemini tokens, so it's not part of `pytest` —
run it by hand when you touch anything in the detection/identification/scoring chain.
It intentionally skips USDA/RAG enrichment, so it doesn't need Postgres running.

## Testing in the cloud

The deployed stack (see [infra/terraform](../../infra/terraform)) is ECS Fargate behind
an ALB, RDS Postgres, and an ECR repository for the backend image. There's no CI pipeline
yet, so "cloud" testing means exercising the real deployed pieces directly:

### Against the real RDS database (without deploying)

Open an SSM tunnel to RDS (requires the bastion applied — see
[infra/terraform/README.md](../../infra/terraform/README.md) — and
`brew install --cask session-manager-plugin`):

```bash
bash scripts/tunnel_rds.sh        # tunnels localhost:5433 -> RDS :5432
```

In another terminal, load `DATABASE_URL` and `GEMINI_API_KEY` from Secrets Manager
(requires AWS CLI credentials with `secretsmanager:GetSecretValue` — see
[infra/terraform/data_stores.tf](../../infra/terraform/data_stores.tf)) and re-run
setup/tests against real data:

```bash
source scripts/load_secrets.sh    # exports DATABASE_URL (-> localhost:5433) and GEMINI_API_KEY
bash scripts/setup_db.sh
pytest tests/ -v
```

`load_secrets.sh` must be `source`d, not run, so the exports land in your shell. It
pulls the real DB password and Gemini key straight from Secrets Manager, so you never
need to type or paste either one by hand.

### Against the deployed service

```bash
cd infra/terraform
terraform output alb_url          # public API endpoint
```

Smoke-test the live endpoint directly:

```bash
ALB="$(cd ../../infra/terraform && terraform output -raw alb_url)"

curl "$ALB/health"
curl "$ALB/health/model"
```

`/api/analyze` needs a real `profile_id` — create one first (all fields are optional,
see [app/schemas/user.py](app/schemas/user.py)):

```bash
PROFILE_ID=$(curl -sS -X POST "$ALB/api/profile" \
  -H "Content-Type: application/json" \
  -d '{"dietary_philosophy": "Vegan", "allergies_and_conditions": ["Peanut Allergy"]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

curl -X POST "$ALB/api/analyze" \
  -F "image=@app/assets/sample_shelf.jpg" \
  -F "profile_id=$PROFILE_ID"
```

### Building and deploying a new image

See [deploy-to-ecr.md](deploy-to-ecr.md) for the full step-by-step runbook
(prerequisites, checklist, `scripts/deploy_backend.sh` usage, common variations, and
troubleshooting). Quick version:

```bash
bash scripts/deploy_backend.sh "commit message"
```

## Running locally in Docker

```bash
# From the repo root
docker build -f Application/backend/Dockerfile -t nutritionell-backend .
docker run --rm -p 8000:8000 --env-file Application/backend/.env nutritionell-backend
```

Note `.env`'s `DATABASE_URL` will need to point somewhere reachable from inside the
container (e.g. `host.docker.internal` instead of `localhost` for a docker-compose
Postgres on the host).

## Admin approval (temporary)

> **This section — and the feature it documents — is meant to come back out.**
> While the app is being rebuilt, signup stays open but a new account can't reach
> any real feature until it's approved by hand. When open signup is ready,
> deleting `app/routers/admin.py`, `get_current_approved_user` /
> `get_current_admin_user` in `app/services/auth_service.py`, and the
> `users.is_approved` / `users.is_admin` columns removes the whole gate.

A brand-new account can log in and call `GET /api/auth/me`, and nothing else —
every feature endpoint answers `403 {"detail": "pending_approval"}` until you
approve it. You get an email at `nutritionell@gmail.com` when someone signs up.

> There is now also a **UI** for all of this: sign in as an admin in the web app
> and pick **Admin** from the account menu (top right). It shows the same two
> lists and the same four actions as the curl below. The curl stays documented
> because it's useful for scripting and for when the frontend isn't deployed.

Set the API host once (`http://localhost:8000` for a local run):

```bash
API=https://api.nutritionell.com
```

### 1. Get an admin token

Log in as your admin account — same login endpoint as any user:

```bash
TOKEN=$(curl -sS -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourmail.com","password":"<your password>"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

echo "$TOKEN"
```

If you don't have an admin account yet, see *Bootstrapping the first admin* in
`infra/AWS_SETUP_LOGIN_FEATURE.md` — there is deliberately no endpoint that can
create one.

### 2. See who's waiting

```bash
curl -sS "$API/api/admin/users/pending" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

```json
[
  {
    "id": "3f1c8e2a-...",
    "email": "someone@example.com",
    "is_approved": false,
    "is_admin": false,
    "created_at": "2026-09-02T14:03:11+00:00"
  }
]
```

Oldest first. For everyone, approved or not:

```bash
curl -sS "$API/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### 3. Approve

Copy the `id` from the pending list:

```bash
USER_ID=3f1c8e2a-...

curl -sS -X POST "$API/api/admin/users/$USER_ID/approve" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

The user gets access immediately, on their existing token — approval is read from
the database per request, so they don't need to log in again.

### 4. Revoke

Undoes an approval:

```bash
curl -sS -X POST "$API/api/admin/users/$USER_ID/revoke" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Note revoking an **admin** doesn't remove their access — `is_admin` grants access
on its own. The response says so. Use `remove-admin` (below) as well to fully
lock one out.

### 5. Grant / remove admin rights

Promoting someone no longer needs a database connection:

```bash
curl -sS -X POST "$API/api/admin/users/$USER_ID/make-admin" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

```json
{
  "user": { "id": "…", "email": "someone@example.com", "is_approved": false, "is_admin": true },
  "message": "someone@example.com is now an admin."
}
```

`make-admin` does **not** set `is_approved` — it doesn't need to, because an admin
is always treated as approved.

```bash
curl -sS -X POST "$API/api/admin/users/$USER_ID/remove-admin" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Two things to know about `remove-admin`:

- It leaves `is_approved` alone (mirroring `revoke`, which leaves `is_admin`
  alone). So removing admin from someone who was never separately approved drops
  them to **no access at all** — the response message says so when that happens.
- **You can't remove your own admin rights**, and it returns `400` if you try.
  That's the difference between undoing a mis-promotion and the only admin
  account locking itself out. Another admin can remove yours; failing that, it's
  a database edit.

The first admin still has to be made by hand — nothing reachable over the network
can grant itself admin. See *Bootstrapping the first admin* in
`infra/AWS_SETUP_LOGIN_FEATURE.md`.

### Notes

- Every `/api/admin/*` route requires an admin token. A normal approved user gets
  `403`, same as a pending one.
- `POST /api/auth/login` still succeeds for an unapproved account and returns a
  token — login isn't what's gated, feature access is. `GET /api/auth/me` also
  keeps working while pending, and reports `is_approved` / `is_admin` so a client
  can show the right state.
- Approve is idempotent; re-approving an already-approved user is a no-op `200`.
