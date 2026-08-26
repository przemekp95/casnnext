#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Usage: write-artifact-env.sh DEPLOYMENT_ENV_FILE' >&2
  exit 2
fi

readonly deployment_env_file="$1"
: "${APP_IMAGE:?APP_IMAGE is required}"
: "${NGINX_IMAGE:?NGINX_IMAGE is required}"
: "${APP_REVISION:?APP_REVISION is required}"
: "${EXPECTED_APP_REVISION:?EXPECTED_APP_REVISION is required}"

readonly digest_image_pattern='^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$'
readonly revision_pattern='^[0-9a-f]{40}$'

if [[ ! "$APP_IMAGE" =~ $digest_image_pattern ]]; then
  echo 'APP_IMAGE must be a GHCR image pinned by a sha256 digest.' >&2
  exit 1
fi

if [[ ! "$NGINX_IMAGE" =~ $digest_image_pattern ]]; then
  echo 'NGINX_IMAGE must be a GHCR image pinned by a sha256 digest.' >&2
  exit 1
fi

if [[ ! "$APP_REVISION" =~ $revision_pattern ]]; then
  echo 'APP_REVISION must be a full lowercase 40-hex Git revision.' >&2
  exit 1
fi

if [[ ! "$EXPECTED_APP_REVISION" =~ $revision_pattern ]]; then
  echo 'EXPECTED_APP_REVISION must be a full lowercase 40-hex Git revision.' >&2
  exit 1
fi

if [[ "$APP_REVISION" != "$EXPECTED_APP_REVISION" ]]; then
  echo 'APP_REVISION does not match the intended application revision.' >&2
  exit 1
fi

if [[ ! -f "$deployment_env_file" ]]; then
  echo "Deployment environment file does not exist: $deployment_env_file" >&2
  exit 1
fi

deployment_env_dir="$(dirname -- "$deployment_env_file")"
deployment_env_name="$(basename -- "$deployment_env_file")"
deployment_env_tmp="$(mktemp "$deployment_env_dir/.${deployment_env_name}.artifacts.XXXXXX")"

cleanup() {
  rm -f "$deployment_env_tmp"
}
trap cleanup EXIT

awk \
  -v app_image="$APP_IMAGE" \
  -v nginx_image="$NGINX_IMAGE" \
  -v app_revision="$APP_REVISION" \
  '
    /^[[:space:]]*(export[[:space:]]+)?APP_IMAGE[[:space:]]*=/ { next }
    /^[[:space:]]*(export[[:space:]]+)?NGINX_IMAGE[[:space:]]*=/ { next }
    /^[[:space:]]*(export[[:space:]]+)?APP_REVISION[[:space:]]*=/ { next }
    { print }
    END {
      print "APP_IMAGE=" app_image;
      print "NGINX_IMAGE=" nginx_image;
      print "APP_REVISION=" app_revision;
    }
  ' "$deployment_env_file" >"$deployment_env_tmp"

chmod 600 "$deployment_env_tmp"
mv -- "$deployment_env_tmp" "$deployment_env_file"
trap - EXIT

echo "Updated immutable deployment artifact references in $deployment_env_file."
