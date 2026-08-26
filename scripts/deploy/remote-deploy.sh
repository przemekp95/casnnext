#!/usr/bin/env bash
set -euo pipefail

readonly compose_file='docker-compose.portainer.yml'
readonly revision_pattern='^[0-9a-f]{40}$'
readonly digest_image_pattern='^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$'

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${DEPLOY_OPERATION:?DEPLOY_OPERATION is required}"

if [[ "$DEPLOY_OPERATION" == 'deploy' && -z "${HEALTH_CHECK_URL:-}" ]]; then
  echo 'HEALTH_CHECK_URL is required for deployment' >&2
  exit 1
fi

cd "$DEPLOY_PATH"
scripts/deploy/login-registry.sh

if [[ "$DEPLOY_OPERATION" == 'authenticate-only' ]]; then
  echo 'Remote GHCR authentication completed; deployment intentionally skipped.'
  exit 0
fi
if [[ "$DEPLOY_OPERATION" != 'deploy' ]]; then
  echo "Unsupported DEPLOY_OPERATION: $DEPLOY_OPERATION" >&2
  exit 1
fi

: "${APP_IMAGE:?APP_IMAGE is required}"
: "${NGINX_IMAGE:?NGINX_IMAGE is required}"
: "${APP_REVISION:?APP_REVISION is required}"
: "${EXPECTED_APP_REVISION:?EXPECTED_APP_REVISION is required}"

if [[ ! -f .env || ! -f "$compose_file" ]]; then
  echo 'Deployment requires an existing .env and docker-compose.portainer.yml.' >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Remote deployment checkout has tracked local changes.' >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  local value
  local count
  count="$(awk -v target="$key" '$0 ~ "^[[:space:]]*(export[[:space:]]+)?" target "[[:space:]]*=" {count++} END {print count+0}' .env)"
  if [[ "$count" != '1' ]]; then
    echo "$key must have exactly one assignment in the deployment environment." >&2
    return 1
  fi
  value="$(awk -F= -v target="$key" '$1 == target {sub(/^[^=]*=/, ""); print; exit}' .env)"
  printf '%s' "$value"
}

validate_release() {
  local app_image="$1"
  local nginx_image="$2"
  local revision="$3"
  [[ "$app_image" =~ $digest_image_pattern ]] || { echo 'Stored APP_IMAGE is not digest-pinned.' >&2; return 1; }
  [[ "$nginx_image" =~ $digest_image_pattern ]] || { echo 'Stored NGINX_IMAGE is not digest-pinned.' >&2; return 1; }
  [[ "$revision" =~ $revision_pattern ]] || { echo 'Stored APP_REVISION is not a full lowercase revision.' >&2; return 1; }
}

public_health_check() {
  local attempt
  local attempts="${HEALTH_CHECK_ATTEMPTS:-30}"
  local delay="${HEALTH_CHECK_DELAY_SECONDS:-10}"
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl --fail --silent --show-error "$HEALTH_CHECK_URL" >/dev/null; then
      return 0
    fi
    if ((attempt < attempts)); then
      sleep "$delay"
    fi
  done
  return 1
}

start_release() {
  local app_image="$1"
  local nginx_image="$2"
  docker pull "$app_image"
  docker pull "$nginx_image"
  docker compose --env-file .env -f "$compose_file" config --quiet
  docker compose --env-file .env -f "$compose_file" up -d --wait --wait-timeout 180 --remove-orphans
  docker compose --env-file .env -f "$compose_file" exec -T app curl -fsS http://127.0.0.1:3000/api/health >/dev/null
  public_health_check
}

previous_revision="$(git rev-parse HEAD)"
previous_app_image="$(read_env_value APP_IMAGE)"
previous_nginx_image="$(read_env_value NGINX_IMAGE)"
previous_env_revision="$(read_env_value APP_REVISION)"
validate_release "$previous_app_image" "$previous_nginx_image" "$previous_env_revision"
if [[ "$previous_env_revision" != "$previous_revision" ]]; then
  echo 'Existing .env APP_REVISION does not match the checked-out release.' >&2
  exit 1
fi
if [[ ! "$APP_REVISION" =~ $revision_pattern || "$APP_REVISION" != "$EXPECTED_APP_REVISION" ]]; then
  echo 'Candidate application revision is invalid or unexpected.' >&2
  exit 1
fi
validate_release "$APP_IMAGE" "$NGINX_IMAGE" "$APP_REVISION"
git cat-file -e "$APP_REVISION^{commit}"

env_backup="$(mktemp "$DEPLOY_PATH/.env.rollback.XXXXXX")"
chmod 600 "$env_backup"
cp -- .env "$env_backup"
rollback_active=1

trap 'rm -f -- "$env_backup"' EXIT

rollback() {
  local rollback_status=0
  local restore_tmp
  rollback_active=0
  restore_tmp="$(mktemp "$DEPLOY_PATH/.env.restore.XXXXXX")" || return 1
  cp -- "$env_backup" "$restore_tmp" || rollback_status=$?
  chmod 600 "$restore_tmp" || rollback_status=$?
  if ((rollback_status == 0)); then
    mv -- "$restore_tmp" .env || rollback_status=$?
  else
    rm -f -- "$restore_tmp"
  fi
  git checkout --detach "$previous_revision" || rollback_status=$?
  if ((rollback_status == 0)); then
    start_release "$previous_app_image" "$previous_nginx_image" || rollback_status=$?
  fi
  if ((rollback_status == 0)); then
    echo 'Candidate deployment failed; previous immutable deployment restored and healthy.' >&2
  else
    echo 'CRITICAL: candidate deployment failed and the previous deployment could not be proven healthy.' >&2
  fi
  return "$rollback_status"
}

trap 'if ((rollback_active == 1)); then rollback || true; fi; exit 129' HUP
trap 'if ((rollback_active == 1)); then rollback || true; fi; exit 130' INT
trap 'if ((rollback_active == 1)); then rollback || true; fi; exit 143' TERM

git checkout --detach "$APP_REVISION"
scripts/deploy/write-artifact-env.sh .env

if start_release "$APP_IMAGE" "$NGINX_IMAGE"; then
  rollback_active=0
  echo "Immutable deployment is healthy at revision $APP_REVISION."
  exit 0
else
  candidate_status=$?
fi

if ((rollback_active == 1)); then
  rollback || true
fi
exit "$candidate_status"
