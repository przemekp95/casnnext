#!/usr/bin/env bash
set -euo pipefail

readonly health_check_url="${1:-}"
readonly expected_revision="${2:-}"
readonly attempts="${HEALTH_CHECK_ATTEMPTS:-30}"
readonly interval_seconds="${HEALTH_CHECK_INTERVAL_SECONDS:-10}"

if [[ "$health_check_url" != https://* ]]; then
  echo 'Health check URL must use HTTPS.' >&2
  exit 1
fi
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

for command_name in curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required health check command is unavailable: $command_name" >&2
    exit 1
  fi
done

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

for attempt in $(seq 1 "$attempts"); do
  : > "$response_file"
  http_status=''
  if http_status="$(curl \
    --fail \
    --silent \
    --show-error \
    --max-time 10 \
    --header 'Accept: application/json' \
    --output "$response_file" \
    --write-out '%{http_code}' \
    "$health_check_url")" \
    && [[ "$http_status" == '200' ]] \
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
