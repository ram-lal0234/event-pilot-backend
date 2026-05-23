#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS_LAYER="${ROOT_DIR}/layers/dependencies/nodejs"
SHARED_LAYER="${ROOT_DIR}/layers/shared-code/nodejs"

rm -rf "${ROOT_DIR}/layers/dependencies" "${ROOT_DIR}/layers/shared-code"

mkdir -p "${DEPS_LAYER}" "${SHARED_LAYER}/src"

rsync -a "${ROOT_DIR}/node_modules" "${DEPS_LAYER}/" \
  --exclude 'prisma' \
  --exclude '@prisma/engines' \
  --exclude '.prisma/client/libquery_engine-darwin-*' \
  --exclude '.cache'

rsync -a "${ROOT_DIR}/src/" "${SHARED_LAYER}/src/" \
  --exclude 'lambda'

cp "${ROOT_DIR}/package.json" "${DEPS_LAYER}/package.json"
cp "${ROOT_DIR}/package-lock.json" "${DEPS_LAYER}/package-lock.json"
