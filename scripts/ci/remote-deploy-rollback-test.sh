#!/usr/bin/env bash
set -euo pipefail

readonly REMOTE_DEPLOY_SCRIPT='scripts/deploy/remote-deploy.sh'
readonly PREVIOUS_REVISION='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly CANDIDATE_REVISION='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
readonly PREVIOUS_APP_IMAGE='ghcr.io/example/casn@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly PREVIOUS_NGINX_IMAGE='ghcr.io/example/casn-nginx@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
readonly CANDIDATE_APP_IMAGE='ghcr.io/example/casn@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
readonly CANDIDATE_NGINX_IMAGE='ghcr.io/example/casn-nginx@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'

if [[ ! -f "$REMOTE_DEPLOY_SCRIPT" ]]; then
  echo "Missing remote deployment script: $REMOTE_DEPLOY_SCRIPT" >&2
  exit 1
fi

test_root="$(mktemp -d)"
cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

deploy_path="$test_root/deploy"
fake_bin="$test_root/bin"
mkdir -p "$deploy_path/scripts/deploy" "$fake_bin"
cp scripts/deploy/write-artifact-env.sh "$deploy_path/scripts/deploy/write-artifact-env.sh"
cp scripts/deploy/login-registry.sh "$deploy_path/scripts/deploy/login-registry.sh"
chmod 700 "$deploy_path/scripts/deploy/"*.sh
: >"$deploy_path/docker-compose.portainer.yml"

git_state="$test_root/git-state"
git_log="$test_root/git.log"
docker_log="$test_root/docker.log"
curl_log="$test_root/curl.log"
printf '%s\n' "$PREVIOUS_REVISION" >"$git_state"

cat >"$fake_bin/git" <<'EOF_GIT'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-} ${2:-}" in
  'diff --quiet') exit 0 ;;
  'diff --cached') [[ "${3:-}" == '--quiet' ]] && exit 0 ;;
  'rev-parse HEAD') cat "$FAKE_GIT_STATE" ;;
  'cat-file -e') exit 0 ;;
  'checkout --detach')
    printf '%s\n' "$3" >"$FAKE_GIT_STATE"
    printf 'checkout %s\n' "$3" >>"$FAKE_GIT_LOG"
    ;;
  *)
    printf 'unexpected git invocation: %s\n' "$*" >&2
    exit 90
    ;;
esac
EOF_GIT

cat >"$fake_bin/docker" <<'EOF_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
exit 0
EOF_DOCKER

cat >"$fake_bin/curl" <<'EOF_CURL'
#!/usr/bin/env bash
set -euo pipefail
revision="$(awk -F= '$1 == "APP_REVISION" { print $2 }' "$DEPLOY_PATH/.env")"
printf '%s\n' "$revision" >>"$FAKE_CURL_LOG"
if [[ "$revision" == "$CANDIDATE_REVISION" ]]; then
  exit 22
fi
[[ "$revision" == "$PREVIOUS_REVISION" ]]
EOF_CURL

chmod 700 "$fake_bin/git" "$fake_bin/docker" "$fake_bin/curl"

write_previous_env() {
  cat >"$deploy_path/.env" <<EOF_ENV
APP_IMAGE=$PREVIOUS_APP_IMAGE
NGINX_IMAGE=$PREVIOUS_NGINX_IMAGE
APP_REVISION=$PREVIOUS_REVISION
MYSQL_PASSWORD=preserve-secret
REVALIDATE_SECRET=preserve-revalidation-secret
EOF_ENV
  chmod 600 "$deploy_path/.env"
  cp "$deploy_path/.env" "$test_root/expected.env"
}

run_remote_deploy() {
  env \
    PATH="$fake_bin:$PATH" \
    DEPLOY_PATH="$deploy_path" \
    DEPLOY_OPERATION=deploy \
    APP_IMAGE="$CANDIDATE_APP_IMAGE" \
    NGINX_IMAGE="$CANDIDATE_NGINX_IMAGE" \
    APP_REVISION="$CANDIDATE_REVISION" \
    EXPECTED_APP_REVISION="$CANDIDATE_REVISION" \
    HEALTH_CHECK_URL='https://health.example.invalid/api/health' \
    HEALTH_CHECK_ATTEMPTS=1 \
    HEALTH_CHECK_DELAY_SECONDS=0 \
    GHCR_TOKEN='test-token' \
    GHCR_USERNAME='test-user' \
    FAKE_GIT_STATE="$git_state" \
    FAKE_GIT_LOG="$git_log" \
    FAKE_DOCKER_LOG="$docker_log" \
    FAKE_CURL_LOG="$curl_log" \
    PREVIOUS_REVISION="$PREVIOUS_REVISION" \
    CANDIDATE_REVISION="$CANDIDATE_REVISION" \
    bash "$REMOTE_DEPLOY_SCRIPT"
}

write_previous_env
set +e
run_remote_deploy >"$test_root/deploy.out" 2>"$test_root/deploy.err"
candidate_status=$?
set -e
if [[ "$candidate_status" -eq 0 ]]; then
  echo 'Candidate health failure unexpectedly succeeded.' >&2
  exit 1
fi

cmp "$test_root/expected.env" "$deploy_path/.env"
test "$(cat "$git_state")" = "$PREVIOUS_REVISION"
grep -Fx "checkout $CANDIDATE_REVISION" "$git_log" >/dev/null
grep -Fx "checkout $PREVIOUS_REVISION" "$git_log" >/dev/null
grep -F "pull $CANDIDATE_APP_IMAGE" "$docker_log" >/dev/null
grep -F "pull $PREVIOUS_APP_IMAGE" "$docker_log" >/dev/null
test "$(sed -n '1p' "$curl_log")" = "$CANDIDATE_REVISION"
test "$(sed -n '2p' "$curl_log")" = "$PREVIOUS_REVISION"
grep -F 'Candidate deployment failed; previous immutable deployment restored and healthy.' "$test_root/deploy.err" >/dev/null

printf '%s\n' "$PREVIOUS_REVISION" >"$git_state"
: >"$git_log"
: >"$docker_log"
: >"$curl_log"
write_previous_env
set +e
env \
  PATH="$fake_bin:$PATH" \
  DEPLOY_PATH="$deploy_path" \
  DEPLOY_OPERATION=deploy \
  APP_IMAGE="$CANDIDATE_APP_IMAGE" \
  NGINX_IMAGE="$CANDIDATE_NGINX_IMAGE" \
  APP_REVISION="$CANDIDATE_REVISION" \
  EXPECTED_APP_REVISION="$CANDIDATE_REVISION" \
  GHCR_TOKEN='test-token' \
  GHCR_USERNAME='test-user' \
  FAKE_GIT_STATE="$git_state" \
  FAKE_GIT_LOG="$git_log" \
  FAKE_DOCKER_LOG="$docker_log" \
  FAKE_CURL_LOG="$curl_log" \
  PREVIOUS_REVISION="$PREVIOUS_REVISION" \
  CANDIDATE_REVISION="$CANDIDATE_REVISION" \
  bash "$REMOTE_DEPLOY_SCRIPT" >"$test_root/missing-health.out" 2>"$test_root/missing-health.err"
missing_health_status=$?
set -e
if [[ "$missing_health_status" -eq 0 ]]; then
  echo 'Deployment unexpectedly accepted a missing HEALTH_CHECK_URL.' >&2
  exit 1
fi

cmp "$test_root/expected.env" "$deploy_path/.env"
test "$(cat "$git_state")" = "$PREVIOUS_REVISION"
test ! -s "$git_log"
test ! -s "$docker_log"
test ! -s "$curl_log"
grep -F 'HEALTH_CHECK_URL is required for deployment' "$test_root/missing-health.err" >/dev/null

echo 'Remote deployment rollback behavior passed.'
