#!/usr/bin/env bash
# Source this to export DATABASE_URL and GEMINI_API_KEY from Secrets Manager into
# your shell, instead of typing/pasting the RDS password by hand.
#
# DATABASE_URL is pulled from nutritionell/database-url and rewritten to point at
# the local SSM tunnel opened by scripts/tunnel_rds.sh. RDS requires SSL (rejects
# plaintext connections), so SSL stays on -- asyncpg negotiates it fine through the
# tunnel as long as the RDS security group actually allows the bastion through.
#
# Usage (after `bash scripts/tunnel_rds.sh` is running in another terminal):
#   source scripts/load_secrets.sh [local_port]   # default local_port: 5433
#
# Requires AWS CLI credentials with secretsmanager:GetSecretValue on
# nutritionell/database-url and nutritionell/gemini-api-key (see
# infra/terraform/data_stores.tf).

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This script must be sourced, not executed:" >&2
  echo "  source scripts/load_secrets.sh" >&2
  exit 1
fi

LOCAL_PORT="${1:-5433}"
REGION="us-east-1"

RAW_DATABASE_URL="$(aws secretsmanager get-secret-value \
  --secret-id nutritionell/database-url --region "$REGION" \
  --query SecretString --output text)" || return 1

export GEMINI_API_KEY="$(aws secretsmanager get-secret-value \
  --secret-id nutritionell/gemini-api-key --region "$REGION" \
  --query SecretString --output text)" || return 1

export DATABASE_URL="$(python3 -c "
import re, sys
print(re.sub(r'@[^/]+/', '@localhost:${LOCAL_PORT}/', sys.argv[1]))
" "$RAW_DATABASE_URL")"

echo "Exported DATABASE_URL (-> localhost:${LOCAL_PORT}) and GEMINI_API_KEY from Secrets Manager." >&2
