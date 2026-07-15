#!/usr/bin/env bash
set -euo pipefail

# Open an SSM port-forward tunnel from localhost to the real RDS instance,
# through the SSM bastion (infra/terraform/bastion.tf, enable_bastion=true).
#
# Requires: session-manager-plugin (`brew install --cask session-manager-plugin`),
# AWS CLI credentials, and the bastion applied (`terraform apply -var enable_bastion=true`).
#
# Usage:
#   bash scripts/tunnel_rds.sh [local_port]   # default local_port: 5433
#
# Then point DATABASE_URL at localhost:<local_port> to reach the real RDS instance,
# e.g.:
#   DATABASE_URL="postgresql+asyncpg://nutritionell:<password>@localhost:5433/nutritionell_db"

LOCAL_PORT="${1:-5433}"
REGION="us-east-1"

ROOT_DIR="$(cd "$(dirname "$0")/../../../infra/terraform" && pwd)"

BASTION_ID="$(cd "$ROOT_DIR" && terraform output -raw bastion_instance_id)"
RDS_ENDPOINT="$(cd "$ROOT_DIR" && terraform output -raw rds_endpoint | cut -d: -f1)"

if [ -z "$BASTION_ID" ] || [ "$BASTION_ID" = "null" ]; then
  echo "No bastion instance found. Apply it first:" >&2
  echo "  cd infra/terraform && terraform apply -var enable_bastion=true" >&2
  exit 1
fi

echo "Bastion: $BASTION_ID"
echo "RDS endpoint: $RDS_ENDPOINT"
echo "Tunneling localhost:${LOCAL_PORT} -> ${RDS_ENDPOINT}:5432 ..."

aws ssm start-session --target "$BASTION_ID" --region "$REGION" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${RDS_ENDPOINT}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
