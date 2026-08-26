#!/usr/bin/env bash
set -euo pipefail

readonly DEPLOY_WORKFLOW='.github/workflows/deploy.yml'
readonly ARTIFACT_ENV_WRITER='scripts/deploy/write-artifact-env.sh'
readonly ACTIONLINT_IMAGE='rhysd/actionlint:1.7.7@sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9'
readonly APP_IMAGE_FIXTURE='ghcr.io/example/casn@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly NGINX_IMAGE_FIXTURE='ghcr.io/example/casn-nginx@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
readonly REVISION_FIXTURE='cccccccccccccccccccccccccccccccccccccccc'

policy_tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$policy_tmp_dir"
}
trap cleanup EXIT

assert_single_assignment() {
  local key="$1"
  local env_file="$2"
  local assignment_count
  assignment_count="$(awk -v target="$key" '$0 ~ "^[[:space:]]*(export[[:space:]]+)?" target "[[:space:]]*=" {count++} END {print count+0}' "$env_file")"
  if [[ "$assignment_count" != '1' ]]; then
    echo "$key must have exactly one Compose-valid assignment, found: $assignment_count" >&2
    return 1
  fi
}

if rg -n '^  push:' "$DEPLOY_WORKFLOW"; then
  echo 'Deployment workflow must require explicit immutable artifact inputs.' >&2
  exit 1
fi

if rg -n '(docker pull|App image:|Nginx image:).*:(main|dev|latest)([^[:alnum:]_-]|$)' "$DEPLOY_WORKFLOW"; then
  echo 'Deployment workflow advertises or pulls a mutable production image.' >&2
  exit 1
fi

if rg -n "ghcr\\.io/[^[:space:]\"']+:(main|dev|latest)([^[:alnum:]_-]|$)" "$DEPLOY_WORKFLOW"; then
  echo 'Deployment workflow contains a mutable GHCR production image.' >&2
  exit 1
fi

for required_source in \
  'app_image:' \
  'nginx_image:' \
  'app_revision:' \
  "EXPECTED_APP_REVISION: \${{ github.sha }}" \
  'envs: APP_IMAGE,NGINX_IMAGE,APP_REVISION,EXPECTED_APP_REVISION' \
  'scripts/deploy/write-artifact-env.sh .env' \
  "docker pull \"\$APP_IMAGE\"" \
  "docker pull \"\$NGINX_IMAGE\"" \
  'docker compose --env-file .env -f docker-compose.portainer.yml config --quiet' \
  'org.opencontainers.image.revision'; do
  if ! rg -Fq "$required_source" "$DEPLOY_WORKFLOW"; then
    echo "Deployment workflow is missing immutable-artifact control: $required_source" >&2
    exit 1
  fi
done

if [[ ! -x "$ARTIFACT_ENV_WRITER" ]]; then
  echo "$ARTIFACT_ENV_WRITER must exist and be executable" >&2
  exit 1
fi

deployment_env="$policy_tmp_dir/deployment.env"
printf '%s\n' \
  'MYSQL_PASSWORD=preserve-this-secret' \
  'MYSQL_ROOT_PASSWORD=compose-policy-root-secret' \
  'MYSQL_DATABASE=casn_policy' \
  'MYSQL_USER=casn_policy_user' \
  'DIRECTUS_KEY=compose-policy-directus-key' \
  'DIRECTUS_SECRET=compose-policy-directus-secret' \
  'DIRECTUS_ADMIN_EMAIL=compose-policy-operator@example.invalid' \
  'DIRECTUS_ADMIN_PASSWORD=compose-policy-admin-secret' \
  'REVALIDATE_SECRET=preserve-this-too' \
  'NEXTAUTH_SECRET=compose-policy-nextauth-secret' \
  'APP_IMAGE=old-app-value' \
  'APP_IMAGE=duplicate-old-app-value' \
  '  export APP_IMAGE=ghcr.io/example/casn:main' \
  'NGINX_IMAGE=old-nginx-value' \
  ' export NGINX_IMAGE=ghcr.io/example/casn-nginx:main' \
  'APP_REVISION=old-revision' \
  '  export APP_REVISION=dddddddddddddddddddddddddddddddddddddddd' \
  '# APP_IMAGE=commented-value-must-survive' \
  'UNRELATED_SETTING=preserve-this-value' >"$deployment_env"
chmod 600 "$deployment_env"

APP_IMAGE="$APP_IMAGE_FIXTURE" \
NGINX_IMAGE="$NGINX_IMAGE_FIXTURE" \
APP_REVISION="$REVISION_FIXTURE" \
EXPECTED_APP_REVISION="$REVISION_FIXTURE" \
  "$ARTIFACT_ENV_WRITER" "$deployment_env"

test "$(stat -c '%a' "$deployment_env")" = '600'
assert_single_assignment APP_IMAGE "$deployment_env"
assert_single_assignment NGINX_IMAGE "$deployment_env"
assert_single_assignment APP_REVISION "$deployment_env"
rg -Fxq "APP_IMAGE=$APP_IMAGE_FIXTURE" "$deployment_env"
rg -Fxq "NGINX_IMAGE=$NGINX_IMAGE_FIXTURE" "$deployment_env"
rg -Fxq "APP_REVISION=$REVISION_FIXTURE" "$deployment_env"
rg -Fxq 'MYSQL_PASSWORD=preserve-this-secret' "$deployment_env"
rg -Fxq 'REVALIDATE_SECRET=preserve-this-too' "$deployment_env"
rg -Fxq '# APP_IMAGE=commented-value-must-survive' "$deployment_env"
rg -Fxq 'UNRELATED_SETTING=preserve-this-value' "$deployment_env"

rendered_compose="$policy_tmp_dir/rewritten-compose.json"
env -i PATH="$PATH" docker compose \
  --env-file "$deployment_env" \
  -f docker-compose.portainer.yml \
  config --format json >"$rendered_compose"
jq -e \
  --arg app_image "$APP_IMAGE_FIXTURE" \
  --arg nginx_image "$NGINX_IMAGE_FIXTURE" \
  --arg app_revision "$REVISION_FIXTURE" \
  '.services.app.image == $app_image
    and .services.nginx.image == $nginx_image
    and .services.app.environment.APP_REVISION == $app_revision' \
  "$rendered_compose" >/dev/null

if APP_IMAGE='ghcr.io/example/casn:main' \
  NGINX_IMAGE="$NGINX_IMAGE_FIXTURE" \
  APP_REVISION="$REVISION_FIXTURE" \
  EXPECTED_APP_REVISION="$REVISION_FIXTURE" \
  "$ARTIFACT_ENV_WRITER" "$deployment_env" >/dev/null 2>&1; then
  echo 'Artifact environment writer accepted a mutable app image.' >&2
  exit 1
fi

if APP_IMAGE="$APP_IMAGE_FIXTURE" \
  NGINX_IMAGE='ghcr.io/example/casn-nginx:main' \
  APP_REVISION="$REVISION_FIXTURE" \
  EXPECTED_APP_REVISION="$REVISION_FIXTURE" \
  "$ARTIFACT_ENV_WRITER" "$deployment_env" >/dev/null 2>&1; then
  echo 'Artifact environment writer accepted a mutable nginx image.' >&2
  exit 1
fi

if APP_IMAGE="$APP_IMAGE_FIXTURE" \
  NGINX_IMAGE="$NGINX_IMAGE_FIXTURE" \
  APP_REVISION='ccccccccccccccccccccccccccccccccccccccc' \
  EXPECTED_APP_REVISION='ccccccccccccccccccccccccccccccccccccccc' \
  "$ARTIFACT_ENV_WRITER" "$deployment_env" >/dev/null 2>&1; then
  echo 'Artifact environment writer accepted a non-40-hex application revision.' >&2
  exit 1
fi

if APP_IMAGE="$APP_IMAGE_FIXTURE" \
  NGINX_IMAGE="$NGINX_IMAGE_FIXTURE" \
  APP_REVISION="$REVISION_FIXTURE" \
  EXPECTED_APP_REVISION='dddddddddddddddddddddddddddddddddddddddd' \
  "$ARTIFACT_ENV_WRITER" "$deployment_env" >/dev/null 2>&1; then
  echo 'Artifact environment writer accepted a mismatched application revision.' >&2
  exit 1
fi

if command -v actionlint >/dev/null 2>&1; then
  actionlint "$DEPLOY_WORKFLOW" .github/workflows/docker.yml
else
  docker run --rm -v "$PWD:/repo:ro" -w /repo "$ACTIONLINT_IMAGE" \
    -color=false "$DEPLOY_WORKFLOW" .github/workflows/docker.yml
fi

echo 'Deployment artifact policy passed.'
