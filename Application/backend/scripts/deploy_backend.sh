#!/usr/bin/env bash
set -euo pipefail

# Commit + push backend changes, build the Docker image, push it to ECR,
# force a new ECS Fargate deployment, wait for it to stabilize, and smoke-test
# the live endpoint. Mirrors README.md "Testing in the cloud" -> "Building
# and deploying a new image", plus the git commit/push step.
#
# Usage:
#   bash scripts/deploy_backend.sh "commit message"
#
# Env overrides:
#   CLUSTER    ECS cluster name       (default: nutritionell-cluster)
#   SERVICE    ECS service name       (default: nutritionell-backend)
#   REGION     AWS region             (default: us-east-1)
#   API_URL    Health-check base URL  (default: https://api.nutritionell.com)
#   SKIP_GIT=1 Skip git add/commit/push (build + deploy only)

COMMIT_MESSAGE="${1:-}"
SKIP_GIT="${SKIP_GIT:-0}"

CLUSTER="${CLUSTER:-nutritionell-cluster}"
SERVICE="${SERVICE:-nutritionell-backend}"
REGION="${REGION:-us-east-1}"
API_URL="${API_URL:-https://api.nutritionell.com}"

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"   # repo root
TF_DIR="$ROOT_DIR/infra/terraform"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# ---- 0. Preconditions ----------------------------------------------------

if [ "$SKIP_GIT" != "1" ] && [ -z "$COMMIT_MESSAGE" ]; then
  die "Usage: bash scripts/deploy_backend.sh \"commit message\"  (or set SKIP_GIT=1 to skip git)"
fi

for bin in git docker aws terraform curl; do
  command -v "$bin" >/dev/null 2>&1 || die "$bin is required but not installed"
done

aws sts get-caller-identity >/dev/null 2>&1 \
  || die "AWS CLI is not authenticated (run 'aws configure' / check credentials)"

cd "$ROOT_DIR"

# ---- 1. Commit + push backend changes ------------------------------------

if [ "$SKIP_GIT" != "1" ]; then
  if [ -n "$(git status --porcelain -- Application/backend)" ]; then
    log "Committing backend changes: \"$COMMIT_MESSAGE\""
    git add Application/backend
    git commit -m "$COMMIT_MESSAGE"
  else
    log "No changes under Application/backend to commit, skipping commit."
  fi

  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  log "Pushing $BRANCH to origin..."
  git push origin "$BRANCH"
else
  log "SKIP_GIT=1, skipping commit/push."
fi

GIT_SHA="$(git rev-parse --short HEAD)"

# ---- 2. Build the image (must be linux/amd64 for Fargate) ---------------

log "Building Docker image (git sha: $GIT_SHA)..."
docker build --platform linux/amd64 -f Application/backend/Dockerfile -t nutritionell-backend .

# ---- 3. Push to ECR, tagged :latest and :<git-sha> -----------------------

log "Looking up ECR repository URL..."
ECR_URL="$(cd "$TF_DIR" && terraform output -raw ecr_repository_url)"
[ -n "$ECR_URL" ] || die "Could not read ecr_repository_url from terraform output"

log "Logging in to ECR ($ECR_URL)..."
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ECR_URL%%/*}"

log "Tagging and pushing :latest and :$GIT_SHA..."
docker tag nutritionell-backend:latest "${ECR_URL}:latest"
docker tag nutritionell-backend:latest "${ECR_URL}:${GIT_SHA}"
docker push "${ECR_URL}:latest"
docker push "${ECR_URL}:${GIT_SHA}"

# ---- 4. Roll out on ECS ---------------------------------------------------

log "Forcing new ECS deployment on $SERVICE..."
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --force-new-deployment --region "$REGION" >/dev/null

log "Waiting for service to stabilize (this can take a few minutes)..."
if ! aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION"; then
  echo "ERROR: service did not stabilize. Debug with:" >&2
  echo "  aws ecs describe-services --cluster $CLUSTER --services $SERVICE --query \"services[0].events[:5]\"" >&2
  echo "  aws logs tail /ecs/$SERVICE --since 30m --region $REGION" >&2
  exit 1
fi

# ---- 5. Smoke test ---------------------------------------------------------

log "Smoke-testing $API_URL ..."

check_endpoint() {
  local path="$1" expect="$2" attempt body=""
  for attempt in $(seq 1 10); do
    body="$(curl -sS --max-time 10 "${API_URL}${path}" || true)"
    if echo "$body" | grep -q "$expect"; then
      echo "  $path -> $body"
      return 0
    fi
    sleep 6
  done
  echo "ERROR: $path did not return expected \"$expect\" after retries. Last response: $body" >&2
  return 1
}

check_endpoint "/health" '"status":"ok"' \
  || die "Health check failed, see debug commands above."
check_endpoint "/health/model" '"loaded":true' \
  || die "Model health check failed, see debug commands above."

log "Deploy complete. Image ${ECR_URL}:${GIT_SHA} is live and healthy."
