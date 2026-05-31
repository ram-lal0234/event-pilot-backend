#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

set -a
# shellcheck disable=SC1091
source .env
set +a

run_prisma_migrations() {
  echo "==> Prisma: apply pending migrations"
  npx prisma migrate deploy

  echo "==> Prisma: migration check (database must be up to date)"
  npx prisma migrate status
}

COMMAND="${1:-deploy}"

case "$COMMAND" in
  deploy)
    run_prisma_migrations
    echo "==> Prisma: regenerate client (enum/schema changes)"
    npx prisma generate
    ./scripts/prepare-layers.sh
    npx serverless@3 deploy --stage dev --region ap-south-1 --aws-profile event-pilot
    ;;
  package)
    npx prisma generate
    ./scripts/prepare-layers.sh
    npx serverless@3 package --stage dev --region ap-south-1 --aws-profile event-pilot
    ;;
  migrate)
    run_prisma_migrations
    ;;
  *)
    echo "Usage: $0 [deploy|package|migrate]"
    echo "  deploy   — prisma migrate check/apply, then serverless deploy"
    echo "  package  — prisma generate + serverless package (no DB)"
    echo "  migrate  — prisma migrate status + deploy only"
    exit 1
    ;;
esac
