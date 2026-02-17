#!/usr/bin/env bash
set -euo pipefail

STRAPI_HOST="${STRAPI_HOST:-127.0.0.1}"
STRAPI_PORT="${STRAPI_PORT:-1337}"
STRAPI_BASE_URL="${STRAPI_BASE_URL:-http://${STRAPI_HOST}:${STRAPI_PORT}}"
STRAPI_START_TIMEOUT_SEC="${STRAPI_START_TIMEOUT_SEC:-120}"
STRAPI_LOG_FILE="${STRAPI_LOG_FILE:-/tmp/strapi-smoke.log}"

STRAPI_PID=""

cleanup() {
  if [[ -n "$STRAPI_PID" ]] && kill -0 "$STRAPI_PID" 2>/dev/null; then
    kill "$STRAPI_PID" || true
    wait "$STRAPI_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Starting Strapi for smoke tests..."
npm --prefix strapi run start >"$STRAPI_LOG_FILE" 2>&1 &
STRAPI_PID="$!"

wait_for_200() {
  local url="$1"
  local started_at
  started_at="$(date +%s)"

  while true; do
    local code
    code="$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi

    local now
    now="$(date +%s)"
    if (( now - started_at >= STRAPI_START_TIMEOUT_SEC )); then
      echo "Timed out waiting for Strapi endpoint: $url (last code: $code)"
      echo "----- Strapi logs -----"
      tail -n 200 "$STRAPI_LOG_FILE" || true
      return 1
    fi

    sleep 2
  done
}

expect_status() {
  local url="$1"
  local expected="$2"
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$code" != "$expected" ]]; then
    echo "Unexpected status for $url: got $code, expected $expected"
    echo "----- Strapi logs -----"
    tail -n 200 "$STRAPI_LOG_FILE" || true
    return 1
  fi
}

echo "Waiting for Strapi public API..."
wait_for_200 "${STRAPI_BASE_URL}/api/authors?pagination[pageSize]=1"

echo "Verifying public read endpoints..."
expect_status "${STRAPI_BASE_URL}/api/authors?pagination[pageSize]=1" "200"
expect_status "${STRAPI_BASE_URL}/api/analyses?pagination[pageSize]=1" "200"
expect_status "${STRAPI_BASE_URL}/api/issue-collections?pagination[pageSize]=1" "200"

echo "Verifying public role is read-only..."
write_code="$(
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${STRAPI_BASE_URL}/api/authors" \
    -H "Content-Type: application/json" \
    --data '{"data":{"name":"CI Author","displayName":"CI Author","slug":"ci-author"}}'
)"
if [[ "$write_code" != "401" && "$write_code" != "403" ]]; then
  echo "Expected POST /api/authors to be blocked for anonymous user, got $write_code"
  echo "----- Strapi logs -----"
  tail -n 200 "$STRAPI_LOG_FILE" || true
  exit 1
fi

echo "Strapi smoke tests passed."
