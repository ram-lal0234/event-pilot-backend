#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS_LAYER="${ROOT_DIR}/layers/dependencies/nodejs"
SHARED_LAYER="${ROOT_DIR}/layers/shared-code/nodejs"
LINUX_PRISMA_ENGINE="libquery_engine-linux-arm64-openssl-3.0.x.so.node"

rm -rf \
  "${ROOT_DIR}/layers/dependencies" \
  "${ROOT_DIR}/layers/shared-code" \
  "${ROOT_DIR}/layers/webhook-code" \
  "${ROOT_DIR}/layers/dialer-code" \
  "${ROOT_DIR}/layers/processor-code" \
  "${ROOT_DIR}/layers/audit-code"

mkdir -p \
  "${DEPS_LAYER}" \
  "${SHARED_LAYER}/src"

copy_src() {
  local target_layer="$1"
  local source_path="$2"
  local source="${ROOT_DIR}/src/${source_path}"
  local target="${target_layer}/src/${source_path}"

  mkdir -p "$(dirname "${target}")"
  cp "${source}" "${target}"
}

rsync -a "${ROOT_DIR}/node_modules" "${DEPS_LAYER}/" \
  --exclude 'prisma' \
  --exclude '@prisma/engines' \
  --exclude '.prisma/client/libquery_engine-darwin-*' \
  --exclude '.cache'

find "${DEPS_LAYER}/node_modules" -type d \( \
  -name '.bin' -o \
  -name 'test' -o \
  -name 'tests' -o \
  -name '__tests__' -o \
  -name 'docs' -o \
  -name 'example' -o \
  -name 'examples' \
\) -prune -exec rm -rf {} +

find "${DEPS_LAYER}/node_modules" -type f \( \
  -name '*.md' -o \
  -name '*.map' -o \
  -name 'CHANGELOG*' -o \
  -name 'HISTORY*' \
\) -delete

if [ ! -f "${DEPS_LAYER}/node_modules/.prisma/client/${LINUX_PRISMA_ENGINE}" ]; then
  echo "Missing Prisma engine for Lambda arm64: ${LINUX_PRISMA_ENGINE}" >&2
  echo "Run npm run prisma:generate after confirming binaryTargets includes linux-arm64-openssl-3.0.x." >&2
  exit 1
fi

if find "${DEPS_LAYER}/node_modules" -name 'libquery_engine-darwin-*' | grep -q .; then
  echo "Darwin Prisma engine found in dependency layer; refusing to package Mac-only engine for Lambda." >&2
  exit 1
fi

copy_src "${SHARED_LAYER}" "constants/plivo-webhook-routes.js"
copy_src "${SHARED_LAYER}" "config/db.js"
copy_src "${SHARED_LAYER}" "config/env.js"
copy_src "${SHARED_LAYER}" "queue/queue.service.js"
copy_src "${SHARED_LAYER}" "repositories/audit.repository.js"
copy_src "${SHARED_LAYER}" "repositories/call.repository.js"
copy_src "${SHARED_LAYER}" "repositories/guest.repository.js"
copy_src "${SHARED_LAYER}" "repositories/ivr.repository.js"
copy_src "${SHARED_LAYER}" "services/audit.service.js"
copy_src "${SHARED_LAYER}" "services/call-state.service.js"
copy_src "${SHARED_LAYER}" "services/ivr.service.js"
copy_src "${SHARED_LAYER}" "services/call-dialer.service.js"
copy_src "${SHARED_LAYER}" "services/voice-call.service.js"
copy_src "${SHARED_LAYER}" "services/callback-schedule.service.js"
copy_src "${SHARED_LAYER}" "services/scheduled-callback.service.js"
copy_src "${SHARED_LAYER}" "services/voice-ai.service.js"
copy_src "${SHARED_LAYER}" "services/voice-ai-transcript.service.js"
copy_src "${SHARED_LAYER}" "services/voice-ai-error.service.js"
copy_src "${SHARED_LAYER}" "services/plivo.service.js"
copy_src "${SHARED_LAYER}" "services/plivo-signature.service.js"
copy_src "${SHARED_LAYER}" "services/plivo-webhook-auth.service.js"
copy_src "${SHARED_LAYER}" "services/plivo-webhook-ingress.service.js"
copy_src "${SHARED_LAYER}" "services/plivo-webhook-consumer.service.js"
copy_src "${SHARED_LAYER}" "services/plivo-ivr-xml.service.js"
copy_src "${SHARED_LAYER}" "utils/AppError.js"
copy_src "${SHARED_LAYER}" "utils/logger.js"
copy_src "${SHARED_LAYER}" "utils/phone.util.js"
copy_src "${SHARED_LAYER}" "utils/parse-callback-time.js"
copy_src "${SHARED_LAYER}" "utils/realtime-auth.js"
copy_src "${SHARED_LAYER}" "utils/realtime-client-id.js"
copy_src "${SHARED_LAYER}" "utils/resolve-websocket-endpoint.js"
copy_src "${SHARED_LAYER}" "services/realtime-connection-lifecycle.service.js"
copy_src "${SHARED_LAYER}" "repositories/realtime-connection.repository.js"
copy_src "${SHARED_LAYER}" "local/realtime-local-hub.js"
copy_src "${SHARED_LAYER}" "services/realtime-push.service.js"
copy_src "${SHARED_LAYER}" "services/realtime-events.js"

cp "${ROOT_DIR}/package.json" "${DEPS_LAYER}/package.json"
cp "${ROOT_DIR}/package-lock.json" "${DEPS_LAYER}/package-lock.json"
