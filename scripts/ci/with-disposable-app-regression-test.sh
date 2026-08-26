#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
readonly harness="$repository_root/scripts/ci/with-disposable-app.sh"
real_docker="$(command -v docker)"
real_ss="$(command -v ss)"
readonly real_docker real_ss
test_root="$(mktemp -d '/tmp/casn-quality-regression.XXXXXX')"
readonly test_root
readonly fake_bin="$test_root/bin"
mkdir -p "$fake_bin"

fail() {
  printf '[disposable-app-regression] ERROR: %s\n' "$1" >&2
  return 1
}

cleanup() {
  local log
  local container
  local app_pid
  local listener_pid
  local harness_temp

  set +e
  for log in "$test_root"/*.log; do
    [[ -f "$log" ]] || continue

    container="$(sed -n 's/.*resources container=\([^ ]*\).*/\1/p' "$log" | tail -n 1)"
    if [[ "$container" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]]; then
      "$real_docker" container rm --force "$container" >/dev/null 2>&1
    fi

    app_pid="$(sed -n 's/.*Application healthy pid=\([0-9][0-9]*\).*/\1/p' "$log" | tail -n 1)"
    listener_pid="$("$real_ss" -H -ltnp 'sport = :31337' 2>/dev/null \
      | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n 1)"
    if [[ "$app_pid" =~ ^[0-9]+$ && "$listener_pid" == "$app_pid" ]] \
      && tr '\0' ' ' <"/proc/$app_pid/cmdline" 2>/dev/null | grep -Fq 'server.cjs'; then
      kill "$app_pid" 2>/dev/null
    fi

    harness_temp="$(sed -n 's/.*resources container=[^ ]* temp_dir=\([^ ]*\).*/\1/p' "$log" | tail -n 1)"
    if [[ "$harness_temp" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ && -d "$harness_temp" ]]; then
      rm -rf -- "$harness_temp"
    fi
  done

  if [[ "$test_root" =~ ^/tmp/casn-quality-regression\.[A-Za-z0-9]+$ && -d "$test_root" ]]; then
    rm -rf -- "$test_root"
  fi
}
trap cleanup EXIT

cat >"$fake_bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${CASN_FAIL_DOCKER_VERIFICATION:-0}" == '1' \
  && -f "${CASN_FAILURE_ARM_FILE:?}" \
  && "${1:-}" == 'container' \
  && "${2:-}" == 'ls' ]]; then
  exit 70
fi
exec "${REAL_DOCKER_BIN:?}" "$@"
SH

cat >"$fake_bin/ss" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${CASN_FAIL_SS_VERIFICATION:-0}" == '1' && -f "${CASN_FAILURE_ARM_FILE:?}" ]]; then
  exit 71
fi
exec "${REAL_SS_BIN:?}" "$@"
SH

chmod 0700 "$fake_bin/docker" "$fake_bin/ss"

assert_resources_absent() {
  local log="$1"
  local container
  local app_pid
  local harness_temp
  local mysql_port
  local container_inventory
  local port_output

  container="$(sed -n 's/.*resources container=\([^ ]*\).*/\1/p' "$log" | tail -n 1)"
  [[ "$container" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]] \
    || fail "missing validated container ID in $log"
  container_inventory="$("$real_docker" container ls -a --format '{{.Names}}')" \
    || fail 'unable to query Docker resources after run'
  if grep -Fxq "$container" <<<"$container_inventory"; then
    fail "container remains after run: $container"
  fi

  app_pid="$(sed -n 's/.*Application healthy pid=\([0-9][0-9]*\).*/\1/p' "$log" | tail -n 1)"
  [[ "$app_pid" =~ ^[0-9]+$ ]] || fail "missing app PID in $log"
  if kill -0 "$app_pid" 2>/dev/null; then
    fail "application PID remains after run: $app_pid"
  fi

  harness_temp="$(sed -n 's/.*resources container=[^ ]* temp_dir=\([^ ]*\).*/\1/p' "$log" | tail -n 1)"
  [[ "$harness_temp" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ ]] \
    || fail "missing validated harness temp directory in $log"
  [[ ! -e "$harness_temp" ]] || fail "harness temp directory remains: $harness_temp"

  port_output="$("$real_ss" -H -ltn 'sport = :31337')" \
    || fail 'unable to query port 31337 after run'
  [[ -z "$port_output" ]] || fail 'port 31337 remains occupied after run'

  mysql_port="$(sed -n 's/.*mysql_port=\([0-9][0-9]*\).*/\1/p' "$log" | head -n 1)"
  [[ "$mysql_port" =~ ^[0-9]+$ ]] || fail "missing random MySQL port in $log"
  printf '[disposable-app-regression] resources absent container=%s app_pid=%s temp_dir=%s mysql_port=%s app_port=31337\n' \
    "$container" "$app_pid" "$harness_temp" "$mysql_port"
}

run_cleanup_query_case() {
  local query="$1"
  local log="$test_root/${query}.log"
  local arm="$test_root/${query}.arm"
  local status
  local -a failure_env=()

  if [[ "$query" == 'docker-proof' ]]; then
    failure_env+=(CASN_FAIL_DOCKER_VERIFICATION=1)
  else
    failure_env+=(CASN_FAIL_SS_VERIFICATION=1)
  fi

  set +e
  env \
    PATH="$fake_bin:$PATH" \
    REAL_DOCKER_BIN="$real_docker" \
    REAL_SS_BIN="$real_ss" \
    CASN_FAILURE_ARM_FILE="$arm" \
    "${failure_env[@]}" \
    timeout --signal=TERM --kill-after=10s 240s \
      bash "$harness" bash -c 'touch "$CASN_FAILURE_ARM_FILE"' >"$log" 2>&1
  status=$?
  set -e

  [[ "$status" -eq 1 ]] || {
    tail -n 80 "$log" >&2
    fail "$query expected status 1, received $status"
  }
  grep -Fq 'verified=0' "$log" || {
    tail -n 80 "$log" >&2
    fail "$query did not report failed cleanup verification"
  }
  assert_resources_absent "$log"
  printf '[disposable-app-regression] %s passed\n' "$query"
}

run_child_status_case() {
  local log="$test_root/child-status.log"
  local status

  set +e
  timeout --signal=TERM --kill-after=10s 240s \
    bash "$harness" bash -c '
      app_pid="$(ss -H -ltnp "sport = :31337" | sed -n "s/.*pid=\\([0-9][0-9]*\\).*/\\1/p" | head -n 1)"
      test -n "$app_pid"
      kill "$app_pid"
      for _ in {1..50}; do
        kill -0 "$app_pid" 2>/dev/null || break
        sleep 0.1
      done
      ! kill -0 "$app_pid" 2>/dev/null
      exit 23
    ' >"$log" 2>&1
  status=$?
  set -e

  [[ "$status" -eq 23 ]] || {
    tail -n 80 "$log" >&2
    fail "child-status expected 23, received $status"
  }
  grep -Fq 'Application process exited while the child command ran' "$log" || {
    tail -n 80 "$log" >&2
    fail 'child-status did not report the infrastructure failure'
  }
  grep -Fq 'verified=1' "$log" || fail 'child-status cleanup was not verified'
  assert_resources_absent "$log"
  printf '[disposable-app-regression] child-status passed\n'
}

run_term_case() {
  local log="$test_root/term.log"
  local marker="$test_root/term.ready"
  local harness_pid
  local status
  local started_ms
  local finished_ms
  local elapsed_ms
  local max_term_ms=$((3 * 1000))
  local attempt

  CASN_TERM_READY_FILE="$marker" \
    bash "$harness" bash -c 'printf ready >"$CASN_TERM_READY_FILE"; sleep 8' >"$log" 2>&1 &
  harness_pid=$!

  for ((attempt = 0; attempt < 1200; attempt += 1)); do
    [[ -s "$marker" ]] && break
    if ! kill -0 "$harness_pid" 2>/dev/null; then
      wait "$harness_pid" || true
      tail -n 80 "$log" >&2
      fail 'TERM harness exited before the child became ready'
      return
    fi
    sleep 0.2
  done
  [[ -s "$marker" ]] || {
    kill -TERM "$harness_pid" 2>/dev/null || true
    wait "$harness_pid" || true
    fail 'TERM child did not become ready within 240 seconds'
  }

  started_ms="$(date +%s%3N)"
  kill -TERM "$harness_pid"
  set +e
  wait "$harness_pid"
  status=$?
  set -e
  finished_ms="$(date +%s%3N)"
  elapsed_ms=$((finished_ms - started_ms))

  [[ "$status" -eq 143 ]] || {
    tail -n 80 "$log" >&2
    fail "TERM expected status 143, received $status"
  }
  ((elapsed_ms < max_term_ms)) || {
    tail -n 80 "$log" >&2
    fail "TERM cleanup was deferred for ${elapsed_ms}ms"
  }
  grep -Fq 'verified=1' "$log" || fail 'TERM cleanup was not verified'
  assert_resources_absent "$log"
  printf '[disposable-app-regression] term passed elapsed_ms=%s\n' "$elapsed_ms"
}

case "${1:-all}" in
  docker-proof)
    run_cleanup_query_case docker-proof
    ;;
  ss-proof)
    run_cleanup_query_case ss-proof
    ;;
  child-status)
    run_child_status_case
    ;;
  term)
    run_term_case
    ;;
  all)
    run_cleanup_query_case docker-proof
    run_cleanup_query_case ss-proof
    run_child_status_case
    run_term_case
    ;;
  *)
    printf 'Usage: %s [docker-proof|ss-proof|child-status|term|all]\n' "$0" >&2
    exit 64
    ;;
esac
