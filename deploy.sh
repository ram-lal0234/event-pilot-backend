#!/bin/bash

set -euo pipefail

set -a
source .env
set +a

./scripts/prepare-layers.sh

COMMAND="${1:-deploy}"

case "$COMMAND" in
  deploy)
    npx serverless@3 deploy --stage dev --region ap-south-1 --aws-profile event-pilot
    ;;
  package)
    npx serverless@3 package --stage dev --region ap-south-1 --aws-profile event-pilot
    ;;
  *)
    echo "Usage: $0 [deploy|package]"
    exit 1
    ;;
esac
