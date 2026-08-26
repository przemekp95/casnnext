#!/usr/bin/env sh
set -eu

: "${GHCR_TOKEN:?GHCR_TOKEN is required}"
: "${GHCR_USERNAME:?GHCR_USERNAME is required}"

docker_bin="${DOCKER_BIN:-docker}"
printf '%s' "$GHCR_TOKEN" | "$docker_bin" login ghcr.io --username "$GHCR_USERNAME" --password-stdin
