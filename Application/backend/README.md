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

The whole flow below (commit, build, push to ECR, redeploy, smoke test) is wrapped in
[scripts/deploy_backend.sh](scripts/deploy_backend.sh):

```bash
bash scripts/deploy_backend.sh "commit message"
```

Fargate defaults to the `X86_64` runtime platform. If you're building on Apple
Silicon, `docker build` produces an `arm64` image by default — pass `--platform
linux/amd64` explicitly or the task will fail to start after deploy:

```bash
# From the repo root (build context needs Model/ alongside Application/)
docker build --platform linux/amd64 -f Application/backend/Dockerfile -t nutritionell-backend .

ECR_URL="$(cd infra/terraform && terraform output -raw ecr_repository_url)"
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "${ECR_URL%%/*}"

docker tag nutritionell-backend:latest "${ECR_URL}:latest"
docker push "${ECR_URL}:latest"
```

Then force a new ECS deployment and wait for it to roll out:

```bash
aws ecs update-service --cluster nutritionell-cluster --service nutritionell-backend \
  --force-new-deployment --region us-east-1
aws ecs wait services-stable --cluster nutritionell-cluster --services nutritionell-backend \
  --region us-east-1
```

(Use `terraform apply` instead if the task definition itself changed, e.g. new env
vars or secrets.) Re-run the smoke-test curls above once the wait returns.

## Running locally in Docker

```bash
# From the repo root
docker build -f Application/backend/Dockerfile -t nutritionell-backend .
docker run --rm -p 8000:8000 --env-file Application/backend/.env nutritionell-backend
```

Note `.env`'s `DATABASE_URL` will need to point somewhere reachable from inside the
container (e.g. `host.docker.internal` instead of `localhost` for a docker-compose
Postgres on the host).
