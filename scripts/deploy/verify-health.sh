#!/usr/bin/env bash
set -euo pipefail

readonly expected_revision="${1:-}"
readonly attempts="${HEALTH_CHECK_ATTEMPTS:-30}"
readonly interval_seconds="${HEALTH_CHECK_INTERVAL_SECONDS:-10}"

if [[ ! "$expected_revision" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Expected health check revision must be a full lowercase 40-hex Git revision.' >&2
  exit 1
fi
if [[ ! "$attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo 'HEALTH_CHECK_ATTEMPTS must be a positive integer.' >&2
  exit 1
fi
if [[ ! "$interval_seconds" =~ ^[0-9]+$ ]]; then
  echo 'HEALTH_CHECK_INTERVAL_SECONDS must be a non-negative integer.' >&2
  exit 1
fi

for command_name in docker jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required health check command is unavailable: $command_name" >&2
    exit 1
  fi
done

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

for attempt in $(seq 1 "$attempts"); do
  : > "$response_file"
  if docker compose \
    --env-file .env \
    -f docker-compose.portainer.yml \
    exec -T app \
    wget -T 10 -qO- http://127.0.0.1:3000/api/health > "$response_file" \
    && jq -e --arg revision "$expected_revision" '
      type == "object"
      and .status == "ready"
      and .database == "connected"
      and .revision == $revision
    ' "$response_file" >/dev/null; then
    echo 'Health check passed for the expected revision.'
    exit 0
  fi

  echo "Health check attempt $attempt/$attempts did not confirm the expected revision." >&2
  if (( attempt < attempts )); then
    sleep "$interval_seconds"
  fi
done

echo 'Health check failed without confirming the expected revision.' >&2
exit 1
