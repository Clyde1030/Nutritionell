# Deploying the backend: build, push to ECR, and roll out

Step-by-step runbook for shipping a new backend image using
[`scripts/deploy_backend.sh`](../scripts/deploy_backend.sh). This is the same flow
described in [README.md > Testing in the cloud](../README.md#testing-in-the-cloud),
pulled out on its own so the team has a quick reference to follow every release.

## What the script does (local build + cloud deploy)

Running `deploy_backend.sh` performs, in order:

1. Commits and pushes any changes under `Application/backend` to the current branch.
2. Builds the Docker image for `linux/amd64` (required by Fargate).
3. Logs in to ECR and pushes the image tagged `:latest` and `:<git-sha>`.
4. Forces a new ECS Fargate deployment and waits for it to stabilize.
5. Smoke-tests `/health` and `/health/model` on the live endpoint.

The script stops (`set -euo pipefail`) on the first failure, so if a step fails you'll
see exactly which one and why.

## Prerequisites (local + cloud)

Before running the script, make sure you have:

- `git`, `docker`, `aws` CLI, `terraform`, and `curl` installed and on your `PATH`.
- AWS CLI authenticated with an account that can push to ECR and update the ECS
  service (`aws sts get-caller-identity` should succeed).
- Docker running locally.
- A clean understanding of what's committed — the script will commit and push
  **everything currently changed** under `Application/backend`.
- `infra/terraform` already applied, so `terraform output ecr_repository_url` resolves.

## Step-by-step: standard deploy (cloud deployment)

1. **Make and test your backend changes locally** (see README.md sections 1–4 and
   "Testing locally"). Run `pytest tests/ -v` before deploying.

2. **From the repo root**, run the deploy script with a commit message:

   ```bash
   bash Application/backend/scripts/deploy_backend.sh "short description of the change"
   ```

   (If you're already inside `Application/backend`, use `bash scripts/deploy_backend.sh "..."`.)

3. **Watch the log output.** You should see, in order:

   ```
   ==> Committing backend changes: "short description of the change"
   ==> Pushing <branch> to origin...
   ==> Building Docker image (git sha: <sha>)...
   ==> Looking up ECR repository URL...
   ==> Logging in to ECR (<ecr-url>)...
   ==> Tagging and pushing :latest and :<sha>...
   ==> Forcing new ECS deployment on nutritionell-backend...
   ==> Waiting for service to stabilize (this can take a few minutes)...
   ==> Smoke-testing https://api.nutritionell.com ...
   ==> Deploy complete. Image <ecr-url>:<sha> is live and healthy.
   ```

4. **Confirm the deploy.** The script's own smoke test already checks `/health` and
   `/health/model`, but you can re-verify manually:

   ```bash
   curl https://api.nutritionell.com/health
   curl https://api.nutritionell.com/health/model
   ```

That's it — the new image is built, pushed to ECR, and live on ECS.

## Repeatable checklist (cloud deployment)

Use this each time you ship a backend change:

- [ ] Local tests pass (`pytest tests/ -v`)
- [ ] Changes are ones you're OK auto-committing under `Application/backend`
- [ ] `aws sts get-caller-identity` succeeds (AWS session not expired)
- [ ] Docker Desktop (or daemon) is running
- [ ] Run `bash Application/backend/scripts/deploy_backend.sh "commit message"` from the repo root
- [ ] Script reports `Deploy complete.` with a healthy smoke test
- [ ] Spot-check the live endpoint if the change is user-facing

## Common variations (cloud deployment)

**Skip the git commit/push** (e.g. you already committed and pushed manually, or you're
redeploying the current commit as-is):

```bash
SKIP_GIT=1 bash Application/backend/scripts/deploy_backend.sh
```

**Deploy against a different cluster/service/region/API URL** (e.g. staging):

```bash
CLUSTER=my-cluster SERVICE=my-service REGION=us-west-2 API_URL=https://staging.nutritionell.com \
  bash Application/backend/scripts/deploy_backend.sh "commit message"
```

**Task definition changed** (new env vars, secrets, CPU/memory, etc.) — the script only
pushes a new image and forces a redeploy of the *existing* task definition. If the task
definition itself needs to change, run `terraform apply` in `infra/terraform` first,
then run the deploy script (or just the ECS update/wait steps) to roll out the image.

## If something fails (cloud deployment troubleshooting)

- **Build fails**: check the Dockerfile and that you're running from the repo root (the
  build context needs `Model/` alongside `Application/`).
- **ECR login/push fails**: re-check `aws sts get-caller-identity` and that your AWS
  credentials have ECR push permissions on the repository from
  `terraform output ecr_repository_url`.
- **`aws ecs wait services-stable` times out**: the script prints two debug commands —
  run them to see recent service events and container logs:

  ```bash
  aws ecs describe-services --cluster nutritionell-cluster --services nutritionell-backend \
    --query "services[0].events[:5]"
  aws logs tail /ecs/nutritionell-backend --since 30m --region us-east-1
  ```

- **Smoke test fails after a successful rollout**: the new task is running but the app
  isn't healthy (e.g. the YOLO model failed to load, or a startup error). Check the logs
  above, fix the issue locally, and redeploy.

## Manual step-by-step equivalent (local build + cloud deploy, without the script)

Only needed if you want to run a step in isolation for debugging. From the repo root:

```bash
# 1. Build (must be linux/amd64 for Fargate, even on Apple Silicon)
docker build --platform linux/amd64 -f Application/backend/Dockerfile -t nutritionell-backend .

# 2. Look up the ECR repo and log in
ECR_URL="$(cd infra/terraform && terraform output -raw ecr_repository_url)"
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "${ECR_URL%%/*}"

# 3. Tag and push
GIT_SHA="$(git rev-parse --short HEAD)"
docker tag nutritionell-backend:latest "${ECR_URL}:latest"
docker tag nutritionell-backend:latest "${ECR_URL}:${GIT_SHA}"
docker push "${ECR_URL}:latest"
docker push "${ECR_URL}:${GIT_SHA}"

# 4. Force a new ECS deployment and wait
aws ecs update-service --cluster nutritionell-cluster --service nutritionell-backend \
  --force-new-deployment --region us-east-1
aws ecs wait services-stable --cluster nutritionell-cluster --services nutritionell-backend \
  --region us-east-1

# 5. Smoke test
curl https://api.nutritionell.com/health
curl https://api.nutritionell.com/health/model
```
