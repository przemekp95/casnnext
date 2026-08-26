#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
readonly harness="$repository_root/scripts/ci/with-disposable-app.sh"
readonly identity_library="$repository_root/scripts/ci/disposable-process-identity.sh"
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
  local harness_temp

  set +e
  for log in "$test_root"/*.log; do
    [[ -f "$log" ]] || continue

    container="$(sed -n 's/^\[disposable-app\] resources container=\([^ ]*\) temp_dir=[^ ]*$/\1/p' "$log" | tail -n 1)"
    if [[ "$container" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]]; then
      "$real_docker" container rm --force "$container" >/dev/null 2>&1
    fi

    harness_temp="$(sed -n 's/^\[disposable-app\] resources container=[^ ]* temp_dir=\([^ ]*\)$/\1/p' "$log" | tail -n 1)"
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

  container="$(sed -n 's/^\[disposable-app\] resources container=\([^ ]*\) temp_dir=[^ ]*$/\1/p' "$log" | tail -n 1)"
  [[ "$container" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]] \
    || fail "missing validated container ID in $log"
  container_inventory="$("$real_docker" container ls -a --format '{{.Names}}')" \
    || fail 'unable to query Docker resources after run'
  if grep -Fxq "$container" <<<"$container_inventory"; then
    fail "container remains after run: $container"
  fi

  app_pid="$(sed -n 's/^\[disposable-app\] Application healthy pid=\([0-9][0-9]*\) url=http:\/\/127\.0\.0\.1:31337$/\1/p' "$log" | tail -n 1)"
  [[ "$app_pid" =~ ^[0-9]+$ ]] || fail "missing app PID in $log"
  if kill -0 "$app_pid" 2>/dev/null; then
    fail "application PID remains after run: $app_pid"
  fi

  harness_temp="$(sed -n 's/^\[disposable-app\] resources container=[^ ]* temp_dir=\([^ ]*\)$/\1/p' "$log" | tail -n 1)"
  [[ "$harness_temp" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ ]] \
    || fail "missing validated harness temp directory in $log"
  [[ ! -e "$harness_temp" ]] || fail "harness temp directory remains: $harness_temp"

  port_output="$("$real_ss" -H -ltn 'sport = :31337')" \
    || fail 'unable to query port 31337 after run'
  [[ -z "$port_output" ]] || fail 'port 31337 remains occupied after run'

  mysql_port="$(sed -n 's/^\[disposable-app\] mysql_port=\([0-9][0-9]*\) image=mysql:8\.4$/\1/p' "$log" | head -n 1)"
  [[ "$mysql_port" =~ ^[0-9]+$ ]] || fail "missing random MySQL port in $log"
  printf '[disposable-app-regression] resources absent container=%s app_pid=%s temp_dir=%s mysql_port=%s app_port=31337\n' \
    "$container" "$app_pid" "$harness_temp" "$mysql_port"
}

write_identity_stat() {
  local root="$1"
  local pid="$2"
  local parent_pid="$3"
  local process_group="$4"
  local session_id="$5"
  local start_time="$6"

  mkdir -p "$root/$pid"
  printf '%s (owned command) S %s %s %s 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 %s\n' \
    "$pid" "$parent_pid" "$process_group" "$session_id" "$start_time" >"$root/$pid/stat"
}

run_identity_case() {
  local proc_root="$test_root/identity-proc"
  local pid='4242'
  local expected_start='5000'
  local expected_pgid='4242'
  local expected_parent='100'
  local expected_session='4242'
  local missing_output
  local missing_status
  local observed

  # shellcheck source=/dev/null
  source "$identity_library"

  write_identity_stat "$proc_root" "$pid" "$expected_parent" "$expected_pgid" "$expected_session" "$expected_start"
  observed="$(casn_read_process_identity "$pid" "$proc_root")"
  [[ "$observed" == "$expected_start $expected_pgid $expected_parent $expected_session" ]] \
    || fail "identity parser returned: $observed"
  casn_process_identity_matches \
    "$pid" "$expected_start" "$expected_pgid" "$expected_parent" "$expected_session" "$proc_root" \
    || fail 'matching durable identity was rejected'

  write_identity_stat "$proc_root" "$pid" "$expected_parent" "$expected_pgid" "$expected_session" '5001'
  if casn_process_identity_matches \
    "$pid" "$expected_start" "$expected_pgid" "$expected_parent" "$expected_session" "$proc_root"; then
    fail 'reused PID start time was accepted'
  fi

  write_identity_stat "$proc_root" "$pid" "$expected_parent" '4343' "$expected_session" "$expected_start"
  if casn_process_identity_matches \
    "$pid" "$expected_start" "$expected_pgid" "$expected_parent" "$expected_session" "$proc_root"; then
    fail 'changed process group was accepted'
  fi

  write_identity_stat "$proc_root" "$pid" '101' "$expected_pgid" "$expected_session" "$expected_start"
  if casn_process_identity_matches \
    "$pid" "$expected_start" "$expected_pgid" "$expected_parent" "$expected_session" "$proc_root"; then
    fail 'changed parent relationship was accepted'
  fi

  write_identity_stat "$proc_root" "$pid" "$expected_parent" "$expected_pgid" '4343' "$expected_start"
  if casn_process_identity_matches \
    "$pid" "$expected_start" "$expected_pgid" "$expected_parent" "$expected_session" "$proc_root"; then
    fail 'changed session relationship was accepted'
  fi

  rm -rf -- "${proc_root:?}/$pid"
  set +e
  missing_output="$(casn_read_process_identity "$pid" "$proc_root" 2>&1)"
  missing_status=$?
  set -e
  [[ "$missing_status" -eq 1 && -z "$missing_output" ]] \
    || fail "missing process identity was noisy: $missing_output"

  printf '[disposable-app-regression] identity-mismatch passed\n'
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

kill_owned_group_if_identity_matches() {
  local pid="$1"
  local expected_stat="$2"
  local process_group

  [[ "$pid" =~ ^[0-9]+$ && -r "/proc/$pid/stat" ]] || return 0
  [[ "$(<"/proc/$pid/stat")" == "$expected_stat" ]] || return 0
  process_group="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  [[ "$process_group" == "$pid" ]] || return 0
  kill -KILL -- "-$pid" 2>/dev/null || true
}

abort_term_run() {
  local harness_pid="$1"
  local harness_stat="$2"
  local child_pid="$3"
  local child_stat="$4"
  local attempt

  kill_owned_group_if_identity_matches "$child_pid" "$child_stat"
  kill_owned_group_if_identity_matches "$harness_pid" "$harness_stat"
  for ((attempt = 0; attempt < 20; attempt += 1)); do
    jobs -pr | grep -Fxq "$harness_pid" || break
    sleep 0.1
  done
  if ! jobs -pr | grep -Fxq "$harness_pid"; then
    wait "$harness_pid" 2>/dev/null || true
  fi
}

run_term_case() {
  local log="$test_root/term.log"
  local marker="$test_root/term.ready"
  local harness_pid
  local harness_stat
  local child_pid
  local child_stat
  local status
  local started_ms
  local signal_ms=''
  local signal_elapsed_ms
  local cleanup_finished_ms
  local cleanup_elapsed_ms
  local max_term_ms=$((3 * 1000))
  local attempt

  CASN_TERM_READY_FILE="$marker" \
    setsid --wait bash "$harness" bash -c '
      printf "%s\n" "$BASHPID" >"$CASN_TERM_READY_FILE"
      cat "/proc/$BASHPID/stat" >>"$CASN_TERM_READY_FILE"
      sleep 8
    ' >"$log" 2>&1 &
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

  harness_stat="$(<"/proc/$harness_pid/stat")"
  child_pid="$(sed -n '1p' "$marker")"
  child_stat="$(sed -n '2p' "$marker")"
  [[ "$child_pid" =~ ^[0-9]+$ && -n "$child_stat" ]] || fail 'TERM child identity record is invalid'

  started_ms="$(date +%s%3N)"
  kill -TERM "$harness_pid"

  for ((attempt = 0; attempt < 30; attempt += 1)); do
    if grep -Fq '[disposable-app] signal active command terminated status=143' "$log"; then
      signal_ms="$(date +%s%3N)"
      break
    fi
    jobs -pr | grep -Fxq "$harness_pid" || break
    sleep 0.1
  done
  [[ "$signal_ms" =~ ^[0-9]+$ ]] || {
    abort_term_run "$harness_pid" "$harness_stat" "$child_pid" "$child_stat"
    tail -n 80 "$log" >&2
    fail 'TERM active-command termination was not acknowledged within 3 seconds'
  }
  signal_elapsed_ms=$((signal_ms - started_ms))

  for ((attempt = 0; attempt < 150; attempt += 1)); do
    jobs -pr | grep -Fxq "$harness_pid" || break
    sleep 0.1
  done
  if jobs -pr | grep -Fxq "$harness_pid"; then
    abort_term_run "$harness_pid" "$harness_stat" "$child_pid" "$child_stat"
    fail 'TERM harness did not finish cleanup within 15 seconds'
  fi

  set +e
  wait "$harness_pid"
  status=$?
  set -e
  cleanup_finished_ms="$(date +%s%3N)"
  cleanup_elapsed_ms=$((cleanup_finished_ms - signal_ms))

  [[ "$status" -eq 143 ]] || {
    tail -n 80 "$log" >&2
    fail "TERM expected status 143, received $status"
  }
  ((signal_elapsed_ms < max_term_ms)) || {
    tail -n 80 "$log" >&2
    fail "TERM active-command termination was deferred for ${signal_elapsed_ms}ms"
  }
  grep -Fq 'verified=1' "$log" || fail 'TERM cleanup was not verified'
  assert_resources_absent "$log"
  printf '[disposable-app-regression] term passed signal_ms=%s cleanup_ms=%s\n' \
    "$signal_elapsed_ms" "$cleanup_elapsed_ms"
}

case "${1:-all}" in
  identity-mismatch)
    run_identity_case
    ;;
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
    run_identity_case
    run_cleanup_query_case docker-proof
    run_cleanup_query_case ss-proof
    run_child_status_case
    run_term_case
    ;;
  *)
    printf 'Usage: %s [identity-mismatch|docker-proof|ss-proof|child-status|term|all]\n' "$0" >&2
    exit 64
    ;;
esac
