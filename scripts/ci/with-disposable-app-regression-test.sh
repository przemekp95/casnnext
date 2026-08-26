#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
readonly harness="$repository_root/scripts/ci/with-disposable-app.sh"
readonly identity_library="$repository_root/scripts/ci/disposable-process-identity.sh"
readonly process_supervisor="$repository_root/scripts/ci/disposable-process-supervisor.sh"
# shellcheck source=scripts/ci/disposable-process-identity.sh
source "$identity_library"
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
  if [[ -e "/proc/$app_pid/stat" ]]; then
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

  write_identity_stat "$proc_root" "$pid" "$expected_parent" "$expected_pgid" "$expected_session" "$expected_start"
  observed="$(casn_read_process_identity "$pid" "$proc_root")"
  [[ "$observed" == "$expected_start $expected_pgid $expected_parent $expected_session" ]] \
    || fail "identity parser returned: $observed"
  casn_process_identity_matches \
    "$pid" "$expected_start" "$expected_pgid" "$expected_parent" "$expected_session" "$proc_root" \
    || fail 'matching durable identity was rejected'
  [[ "$(casn_read_process_state "$pid" "$proc_root")" == 'S' ]] \
    || fail 'process state parser rejected a valid stat record'

  write_identity_stat "$proc_root" '4343' "$pid" "$expected_pgid" "$expected_session" '6000'
  casn_process_group_has_members "$expected_pgid" "$expected_session" "$pid" "$proc_root" \
    || fail 'owned process-group member was not detected'
  rm -rf -- "${proc_root:?}/4343"
  if casn_process_group_has_members "$expected_pgid" "$expected_session" "$pid" "$proc_root"; then
    fail 'excluded supervisor was reported as a process-group member'
  fi

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

capture_test_process_identity() {
  local pid="$1"
  local identity
  local start_time
  local process_group
  local parent_pid
  local session_id
  local attempt

  for ((attempt = 0; attempt < 100; attempt += 1)); do
    if identity="$(casn_read_process_identity "$pid")"; then
      read -r start_time process_group parent_pid session_id <<<"$identity"
      if [[ "$parent_pid" == "$$" && "$process_group" == "$pid" && "$session_id" == "$pid" ]]; then
        printf '%s\n' "$identity"
        return 0
      fi
    elif [[ ! -e "/proc/$pid/stat" ]]; then
      return 1
    fi
    sleep 0.01
  done
  return 1
}

test_identity_matches() {
  local pid="$1"
  local identity="$2"
  local start_time
  local process_group
  local parent_pid
  local session_id

  read -r start_time process_group parent_pid session_id <<<"$identity"
  casn_process_identity_matches "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id"
}

test_stable_identity_matches() {
  local pid="$1"
  local identity="$2"
  local expected_start_time
  local expected_process_group
  local expected_session_id
  local current_identity
  local current_start_time
  local current_process_group
  local current_session_id

  read -r expected_start_time expected_process_group _ expected_session_id <<<"$identity"
  current_identity="$(casn_read_process_identity "$pid")" || return 1
  read -r current_start_time current_process_group _ current_session_id <<<"$current_identity"
  [[ "$current_start_time" == "$expected_start_time" \
    && "$current_process_group" == "$expected_process_group" \
    && "$current_session_id" == "$expected_session_id" ]]
}

signal_stably_owned_test_process() {
  local signal_name="$1"
  local pid="$2"
  local identity="$3"
  test_identity_matches "$pid" "$identity" || return 1
  kill -"$signal_name" "$pid"
}

wait_exact_process_absent() {
  local pid="$1"
  local identity="$2"
  local max_attempts="$3"
  local attempt

  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    test_stable_identity_matches "$pid" "$identity" || return 0
    sleep 0.1
  done
  ! test_stable_identity_matches "$pid" "$identity"
}

cleanup_exact_test_process() {
  local pid="$1"
  local identity="$2"

  if test_identity_matches "$pid" "$identity"; then
    signal_owned_test_process KILL "$pid" "$identity" || return 1
  elif test_stable_identity_matches "$pid" "$identity"; then
    local current_identity
    current_identity="$(casn_read_process_identity "$pid")" || return 1
    signal_owned_test_process KILL "$pid" "$current_identity" || return 1
  fi
  wait_exact_process_absent "$pid" "$identity" 50
}

cleanup_exact_test_group() {
  local pid="$1"
  local identity="$2"
  local current_identity
  local process_group
  local session_id

  test_stable_identity_matches "$pid" "$identity" || return 0
  current_identity="$(casn_read_process_identity "$pid")" || return 1
  read -r _ process_group _ session_id <<<"$current_identity"
  [[ "$process_group" == "$pid" && "$session_id" == "$pid" ]] || return 1
  signal_owned_test_group KILL "$pid" "$current_identity" || return 1
  wait_exact_process_absent "$pid" "$identity" 50
}

run_changed_ppid_signal_case() {
  local marker="$test_root/changed-ppid.ready"
  local pid
  local original_identity
  local current_identity
  local attempt
  local signal_status

  IDENTITY_LIBRARY="$identity_library" CHANGED_PPID_MARKER="$marker" bash -c '
    setsid bash -c '\''
      owned_pid="$BASHPID"
      identity="$(. "$IDENTITY_LIBRARY"; casn_read_process_identity "$owned_pid")"
      printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$CHANGED_PPID_MARKER"
      exec sleep 30
    '\'' &
    for _ in {1..500}; do
      [[ -s "$CHANGED_PPID_MARKER" ]] && exit 0
      sleep 0.01
    done
    exit 97
  '

  pid="$(sed -n '1p' "$marker")"
  original_identity="$(sed -n '2p' "$marker")"
  [[ "$pid" =~ ^[0-9]+$ && -n "$original_identity" ]] \
    || fail 'changed-PPID identity record is invalid'

  current_identity=''
  for ((attempt = 0; attempt < 50; attempt += 1)); do
    if current_identity="$(casn_read_process_identity "$pid")" \
      && [[ "$current_identity" != "$original_identity" ]]; then
      break
    fi
    sleep 0.1
  done
  [[ -n "$current_identity" && "$current_identity" != "$original_identity" ]] \
    || fail 'changed-PPID fixture did not reparent within five seconds'

  set +e
  signal_stably_owned_test_process TERM "$pid" "$original_identity"
  signal_status=$?
  set -e
  if ((signal_status == 0)); then
    wait_exact_process_absent "$pid" "$original_identity" 50 || true
    fail 'stable signal helper accepted a changed expected PPID'
  fi

  cleanup_exact_test_process "$pid" "$current_identity" \
    || fail 'changed-PPID exact cleanup failed'
  printf '[disposable-app-regression] changed-ppid-signal passed\n'
}

test_process_state() {
  local pid="$1"
  local identity="$2"
  local stat_line
  local fields

  test_identity_matches "$pid" "$identity" || return 1
  IFS= read -r stat_line 2>/dev/null <"/proc/$pid/stat" || return 1
  fields="${stat_line##*) }"
  [[ "$fields" != "$stat_line" ]] || return 1
  printf '%s\n' "${fields%% *}"
}

signal_owned_test_process() {
  local signal_name="$1"
  local pid="$2"
  local identity="$3"

  test_identity_matches "$pid" "$identity" || return 1
  kill -"$signal_name" "$pid"
}

signal_owned_test_group() {
  local signal_name="$1"
  local pid="$2"
  local identity="$3"
  local start_time
  local process_group
  local parent_pid
  local session_id

  read -r start_time process_group parent_pid session_id <<<"$identity"
  [[ "$process_group" == "$pid" && "$session_id" == "$pid" ]] || return 1
  casn_process_identity_matches "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id" || return 1
  kill -"$signal_name" -- "-$process_group"
}

reaped_status=''
bounded_reap_test_job() {
  local pid="$1"
  local identity="$2"
  local max_attempts="$3"
  local state
  local attempt

  reaped_status=''
  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    if state="$(test_process_state "$pid" "$identity")"; then
      if [[ "$state" == 'Z' ]]; then
        set +e
        wait "$pid" 2>/dev/null
        reaped_status=$?
        set -e
        return 0
      fi
    elif [[ ! -e "/proc/$pid/stat" ]]; then
      set +e
      wait "$pid" 2>/dev/null
      reaped_status=$?
      set -e
      return 0
    else
      return 2
    fi
    sleep 0.1
  done
  return 1
}

owned_run_status=''
owned_group_has_members() {
  local supervisor_pid="$1"
  local supervisor_identity="$2"
  local start_time
  local process_group
  local parent_pid
  local session_id

  read -r start_time process_group parent_pid session_id <<<"$supervisor_identity"
  casn_process_identity_matches \
    "$supervisor_pid" "$start_time" "$process_group" "$parent_pid" "$session_id" \
    || return 2
  casn_process_group_has_members "$process_group" "$session_id" "$supervisor_pid"
}

wait_owned_group_empty() {
  local supervisor_pid="$1"
  local supervisor_identity="$2"
  local max_attempts="$3"
  local attempt
  local group_status

  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    if owned_group_has_members "$supervisor_pid" "$supervisor_identity"; then
      :
    else
      group_status=$?
      ((group_status == 1)) && return 0
      return 2
    fi
    sleep 0.1
  done
  ! owned_group_has_members "$supervisor_pid" "$supervisor_identity"
}

wait_process_group_empty() {
  local process_group="$1"
  local session_id="$2"
  local excluded_pid="$3"
  local max_attempts="$4"
  local attempt

  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    casn_process_group_has_members "$process_group" "$session_id" "$excluded_pid" || return 0
    sleep 0.1
  done
  ! casn_process_group_has_members "$process_group" "$session_id" "$excluded_pid"
}

stop_owned_supervisor() {
  local supervisor_pid="$1"
  local supervisor_identity="$2"
  local control_fd="$3"

  test_identity_matches "$supervisor_pid" "$supervisor_identity" || return 1
  printf 'stop\n' >&"$control_fd"
}

terminate_owned_group() {
  local supervisor_pid="$1"
  local supervisor_identity="$2"
  local control_fd="$3"
  local process_group
  local session_id

  read -r _ process_group _ session_id <<<"$supervisor_identity"

  if owned_group_has_members "$supervisor_pid" "$supervisor_identity"; then
    signal_owned_test_group TERM "$supervisor_pid" "$supervisor_identity" || return 1
    if ! wait_owned_group_empty "$supervisor_pid" "$supervisor_identity" 10; then
      signal_owned_test_group KILL "$supervisor_pid" "$supervisor_identity" || return 1
      wait_process_group_empty "$process_group" "$session_id" "$supervisor_pid" 50 || return 1
      return 0
    fi
  fi

  stop_owned_supervisor "$supervisor_pid" "$supervisor_identity" "$control_fd"
}

cleanup_failed_owned_run() {
  local supervisor_pid="$1"
  local supervisor_identity="$2"
  local control_fd="$3"
  local supervisor_root="$4"
  local current_identity
  local start_time
  local process_group
  local parent_pid
  local session_id
  local cleanup_failed=0

  if [[ -z "$supervisor_identity" ]]; then
    if current_identity="$(casn_read_process_identity "$supervisor_pid")"; then
      read -r start_time process_group parent_pid session_id <<<"$current_identity"
      if [[ "$parent_pid" == "$$" && "$process_group" == "$supervisor_pid" \
        && "$session_id" == "$supervisor_pid" ]]; then
        supervisor_identity="$current_identity"
      else
        cleanup_failed=1
      fi
    elif [[ -e "/proc/$supervisor_pid/stat" ]]; then
      cleanup_failed=1
    fi
  fi

  if [[ -n "$supervisor_identity" ]]; then
    read -r _ process_group _ session_id <<<"$supervisor_identity"
    if test_identity_matches "$supervisor_pid" "$supervisor_identity"; then
      if ! signal_owned_test_group KILL "$supervisor_pid" "$supervisor_identity"; then
        [[ ! -e "/proc/$supervisor_pid/stat" ]] || cleanup_failed=1
      fi
    elif test_stable_identity_matches "$supervisor_pid" "$supervisor_identity"; then
      current_identity="$(casn_read_process_identity "$supervisor_pid")" || cleanup_failed=1
      if [[ -n "$current_identity" ]]; then
        read -r _ process_group _ session_id <<<"$current_identity"
        if [[ "$process_group" == "$supervisor_pid" && "$session_id" == "$supervisor_pid" ]]; then
          if ! signal_owned_test_group KILL "$supervisor_pid" "$current_identity"; then
            [[ ! -e "/proc/$supervisor_pid/stat" ]] || cleanup_failed=1
          fi
        else
          cleanup_failed=1
        fi
      fi
    elif [[ -e "/proc/$supervisor_pid/stat" ]]; then
      cleanup_failed=1
    fi

    if ! bounded_reap_test_job "$supervisor_pid" "$supervisor_identity" 50; then
      [[ ! -e "/proc/$supervisor_pid/stat" ]] || cleanup_failed=1
    fi
    wait_process_group_empty "$process_group" "$session_id" "$supervisor_pid" 50 \
      || cleanup_failed=1
  fi

  if [[ "$control_fd" =~ ^[0-9]+$ ]]; then
    exec {control_fd}>&-
  fi
  [[ ! -e "/proc/$supervisor_pid/stat" ]] || cleanup_failed=1

  if [[ "$supervisor_root" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ ]]; then
    rm -rf -- "$supervisor_root"
  else
    cleanup_failed=1
  fi
  [[ ! -e "$supervisor_root" ]] || cleanup_failed=1

  ((cleanup_failed == 0)) && \
    printf '[disposable-app-regression] bounded error cleanup verified pid=%s temp_dir=%s\n' \
      "$supervisor_pid" "$supervisor_root" >&2
  return "$cleanup_failed"
}

run_owned_bounded() {
  local log="$1"
  local max_attempts="$2"
  shift 2
  local supervisor_root
  local control_fifo
  local status_file
  local ready_file
  local control_fd
  local supervisor_pid=''
  local supervisor_identity=''
  local command_status
  local attempt
  local timed_out=1

  supervisor_root="$(mktemp -d '/tmp/casn-quality.XXXXXX')"
  control_fifo="$supervisor_root/active-1.control"
  status_file="$supervisor_root/active-1.status"
  ready_file="$supervisor_root/active-1.ready"
  mkfifo -- "$control_fifo"
  exec {control_fd}<>"$control_fifo"

  setsid "$process_supervisor" "$control_fd" "$status_file" "$ready_file" "$@" >"$log" 2>&1 &
  supervisor_pid=$!
  if ! supervisor_identity="$(capture_test_process_identity "$supervisor_pid")"; then
    if ! cleanup_failed_owned_run "$supervisor_pid" "$supervisor_identity" "$control_fd" "$supervisor_root"; then
      fail "bounded-run identity-capture cleanup was not verified for PID $supervisor_pid"
      return 1
    fi
    fail "unable to capture bounded-run supervisor identity for PID $supervisor_pid"
    return 1
  fi

  if [[ "${CASN_REGRESSION_FORCE_READINESS_FAILURE:-0}" == '1' ]]; then
    for ((attempt = 0; attempt < 500; attempt += 1)); do
      [[ -f "$ready_file" ]] && break
      sleep 0.01
    done
    rm -f -- "$ready_file"
  fi

  for ((attempt = 0; attempt < 500; attempt += 1)); do
    [[ -f "$ready_file" ]] && break
    test_identity_matches "$supervisor_pid" "$supervisor_identity" || break
    sleep 0.01
  done
  [[ -f "$ready_file" ]] || {
    if ! cleanup_failed_owned_run "$supervisor_pid" "$supervisor_identity" "$control_fd" "$supervisor_root"; then
      fail "bounded-run readiness cleanup was not verified for PID $supervisor_pid"
      return 1
    fi
    fail "bounded-run supervisor failed readiness for PID $supervisor_pid"
    return 1
  }

  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    if [[ -f "$status_file" ]]; then
      timed_out=0
      break
    fi
    test_identity_matches "$supervisor_pid" "$supervisor_identity" || break
    sleep 0.1
  done

  if ! terminate_owned_group "$supervisor_pid" "$supervisor_identity" "$control_fd"; then
    if ! cleanup_failed_owned_run "$supervisor_pid" "$supervisor_identity" "$control_fd" "$supervisor_root"; then
      fail "bounded-run termination cleanup was not verified for PID $supervisor_pid"
      return 1
    fi
    fail "bounded run could not terminate owned supervisor group $supervisor_pid"
    return 1
  fi
  bounded_reap_test_job "$supervisor_pid" "$supervisor_identity" 50 \
    || {
      if ! cleanup_failed_owned_run "$supervisor_pid" "$supervisor_identity" "$control_fd" "$supervisor_root"; then
        fail "bounded-run reap cleanup was not verified for PID $supervisor_pid"
        return 1
      fi
      fail "bounded run could not reap owned supervisor PID $supervisor_pid"
      return 1
    }
  exec {control_fd}>&-

  if ((timed_out != 0)); then
    if ! cleanup_failed_owned_run "$supervisor_pid" "$supervisor_identity" '' "$supervisor_root"; then
      fail "bounded-run timeout cleanup was not verified for PID $supervisor_pid"
      return 1
    fi
    fail "bounded run timed out for owned supervisor PID $supervisor_pid"
    return 1
  fi

  command_status="$(<"$status_file")"
  [[ "$command_status" =~ ^[0-9]+$ && "$command_status" -le 255 ]] || {
    if ! cleanup_failed_owned_run "$supervisor_pid" "$supervisor_identity" '' "$supervisor_root"; then
      fail "bounded-run status cleanup was not verified for PID $supervisor_pid"
      return 1
    fi
    fail "bounded-run supervisor recorded invalid command status: $command_status"
    return 1
  }
  owned_run_status="$command_status"
  rm -rf -- "$supervisor_root"
}

run_bounded_error_cleanup_case() {
  local stage="$1"
  local log="$test_root/bounded-${stage}.log"
  local marker="$test_root/bounded-${stage}.identity"
  local original_capture_definition
  local original_terminate_definition
  local original_reap_definition
  local run_status
  local supervisor_pid=''
  local supervisor_identity=''
  local supervisor_root

  original_capture_definition="$(declare -f capture_test_process_identity)"
  original_capture_definition="${original_capture_definition/capture_test_process_identity ()/capture_test_process_identity_original ()}"
  eval "$original_capture_definition"
  capture_test_process_identity() {
    local pid="$1"
    local identity
    local argument
    local root=''
    local attempt

    for ((attempt = 0; attempt < 100; attempt += 1)); do
      identity="$(casn_read_process_identity "$pid")" || return 1
      root=''
      while IFS= read -r -d '' argument; do
        if [[ "$argument" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-1\.status$ ]]; then
          root="${argument%/*}"
          break
        fi
      done <"/proc/$pid/cmdline"
      [[ -n "$root" ]] && break
      sleep 0.01
    done
    [[ "$root" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ ]] || return 1
    printf '%s\n%s\n%s\n' "$pid" "$identity" "$root" >"$marker"
    [[ "$stage" != 'identity-capture' ]] || return 1
    printf '%s\n' "$identity"
  }

  if [[ "$stage" == 'termination' || "$stage" == 'readiness' ]]; then
    original_terminate_definition="$(declare -f terminate_owned_group)"
    original_terminate_definition="${original_terminate_definition/terminate_owned_group ()/terminate_owned_group_original ()}"
    eval "$original_terminate_definition"
    terminate_owned_group() {
      eval "${original_terminate_definition/terminate_owned_group_original ()/terminate_owned_group ()}"
      return 1
    }
  elif [[ "$stage" == 'reap' ]]; then
    original_reap_definition="$(declare -f bounded_reap_test_job)"
    original_reap_definition="${original_reap_definition/bounded_reap_test_job ()/bounded_reap_test_job_original ()}"
    eval "$original_reap_definition"
    bounded_reap_test_job() {
      eval "${original_reap_definition/bounded_reap_test_job_original ()/bounded_reap_test_job ()}"
      return 1
    }
  fi

  if [[ "$stage" == 'readiness' ]]; then
    if CASN_REGRESSION_FORCE_READINESS_FAILURE=1 \
      run_owned_bounded "$log" 20 bash -c 'sleep 30'; then
      run_status=0
    else
      run_status=$?
    fi
  else
    if run_owned_bounded "$log" 20 bash -c 'exit 0'; then
      run_status=0
    else
      run_status=$?
    fi
  fi

  eval "${original_capture_definition/capture_test_process_identity_original ()/capture_test_process_identity ()}"
  if [[ "$stage" == 'termination' || "$stage" == 'readiness' ]]; then
    eval "${original_terminate_definition/terminate_owned_group_original ()/terminate_owned_group ()}"
  elif [[ "$stage" == 'reap' ]]; then
    eval "${original_reap_definition/bounded_reap_test_job_original ()/bounded_reap_test_job ()}"
  fi

  [[ "$run_status" -ne 0 ]] || fail "bounded-${stage} did not exercise its error branch"
  supervisor_pid="$(sed -n '1p' "$marker")"
  supervisor_identity="$(sed -n '2p' "$marker")"
  supervisor_root="$(sed -n '3p' "$marker")"
  [[ "$supervisor_pid" =~ ^[0-9]+$ && -n "$supervisor_identity" \
    && "$supervisor_root" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ ]] \
    || fail "bounded-${stage} did not record exact owned resources"

  if test_stable_identity_matches "$supervisor_pid" "$supervisor_identity"; then
    cleanup_exact_test_group "$supervisor_pid" "$supervisor_identity" || true
    rm -rf -- "$supervisor_root"
    fail "bounded-${stage} returned with its exact supervisor still present"
  fi
  if [[ -e "$supervisor_root" ]]; then
    rm -rf -- "$supervisor_root"
    fail "bounded-${stage} returned with its exact temporary directory present"
  fi
  printf '[disposable-app-regression] bounded-%s-cleanup passed\n' "$stage"
}

run_owned_group_anchor_case() {
  local log="$test_root/owned-group-anchor.log"
  local marker="$test_root/owned-group-anchor.ready"
  local descendant_pid
  local descendant_identity
  local status
  local attempt

  run_owned_bounded "$log" 20 env \
    CASN_ANCHOR_READY_FILE="$marker" \
    IDENTITY_LIBRARY="$identity_library" \
    bash -c '
      bash -c '\''
        trap "" TERM HUP INT
        owned_pid="$BASHPID"
        identity="$(. "$IDENTITY_LIBRARY"; casn_read_process_identity "$owned_pid")"
        printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$CASN_ANCHOR_READY_FILE"
        while :; do sleep 1; done
      '\'' &
      for _ in {1..500}; do
        [[ -s "$CASN_ANCHOR_READY_FILE" ]] && exit 23
        sleep 0.01
      done
      exit 97
    '
  status="$owned_run_status"

  descendant_pid="$(sed -n '1p' "$marker")"
  descendant_identity="$(sed -n '2p' "$marker")"
  [[ "$descendant_pid" =~ ^[0-9]+$ && -n "$descendant_identity" ]] \
    || fail 'owned-group anchor descendant identity record is invalid'

  if test_stable_identity_matches "$descendant_pid" "$descendant_identity"; then
    signal_stably_owned_test_process KILL "$descendant_pid" "$descendant_identity" 2>/dev/null || true
    for ((attempt = 0; attempt < 50; attempt += 1)); do
      test_stable_identity_matches "$descendant_pid" "$descendant_identity" || break
      sleep 0.1
    done
    fail 'bounded runner returned while its durably owned process group still had a descendant'
  fi

  [[ "$status" -eq 23 ]] || fail "owned-group anchor expected status 23, received $status"
  printf '[disposable-app-regression] owned-group-anchor passed\n'
}

run_stopped_reap_case() {
  local pid
  local identity
  local started_ms
  local elapsed_ms

  setsid --wait sleep 30 >/dev/null 2>&1 &
  pid=$!
  identity="$(capture_test_process_identity "$pid")" \
    || fail 'unable to capture stopped-job identity'
  signal_owned_test_process STOP "$pid" "$identity" \
    || fail 'stopped-job identity changed before STOP'

  started_ms="$(date +%s%3N)"
  if bounded_reap_test_job "$pid" "$identity" 5; then
    signal_owned_test_group KILL "$pid" "$identity" 2>/dev/null || true
    fail 'stopped job was incorrectly treated as reapable'
  fi
  elapsed_ms=$(($(date +%s%3N) - started_ms))
  ((elapsed_ms < 2000)) || fail "stopped-job reap bound took ${elapsed_ms}ms"

  signal_owned_test_group KILL "$pid" "$identity" \
    || fail 'stopped-job identity changed before KILL cleanup'
  bounded_reap_test_job "$pid" "$identity" 50 \
    || fail 'stopped job did not become reapable after owned KILL'
  printf '[disposable-app-regression] stopped-reap passed elapsed_ms=%s\n' "$elapsed_ms"
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

  run_owned_bounded "$log" 2400 env \
    PATH="$fake_bin:$PATH" \
    REAL_DOCKER_BIN="$real_docker" \
    REAL_SS_BIN="$real_ss" \
    CASN_FAILURE_ARM_FILE="$arm" \
    "${failure_env[@]}" \
    bash "$harness" bash -c 'touch "$CASN_FAILURE_ARM_FILE"'
  status="$owned_run_status"

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

  run_owned_bounded "$log" 2400 env IDENTITY_LIBRARY="$identity_library" \
    bash "$harness" bash -c '
      source "$IDENTITY_LIBRARY"
      app_pid="$(ss -H -ltnp "sport = :31337" | sed -n "s/.*pid=\\([0-9][0-9]*\\).*/\\1/p" | head -n 1)"
      test -n "$app_pid"
      identity="$(casn_read_process_identity "$app_pid")"
      read -r start_time process_group parent_pid session_id <<<"$identity"
      casn_process_identity_matches "$app_pid" "$start_time" "$process_group" "$parent_pid" "$session_id"
      kill -TERM "$app_pid"
      for _ in {1..50}; do
        casn_process_identity_matches "$app_pid" "$start_time" "$process_group" "$parent_pid" "$session_id" || break
        sleep 0.1
      done
      ! casn_process_identity_matches "$app_pid" "$start_time" "$process_group" "$parent_pid" "$session_id"
      exit 23
    '
  status="$owned_run_status"

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

signal_exact_owned_group_members() {
  local process_group="$1"
  local session_id="$2"
  local stat_path
  local pid
  local identity
  local member_process_group
  local member_session_id

  [[ "$process_group" =~ ^[0-9]+$ && "$session_id" =~ ^[0-9]+$ ]] || return 1
  for stat_path in /proc/[0-9]*/stat; do
    [[ -r "$stat_path" ]] || continue
    pid="${stat_path%/stat}"
    pid="${pid##*/}"
    identity="$(casn_read_process_identity "$pid")" || continue
    read -r _ member_process_group _ member_session_id <<<"$identity"
    if [[ "$member_process_group" == "$process_group" \
      && "$member_session_id" == "$session_id" ]]; then
      signal_owned_test_process KILL "$pid" "$identity" || return 1
    fi
  done
}

abort_term_run() {
  local harness_pid="$1"
  local harness_identity="$2"
  local child_pid="$3"
  local child_identity="$4"
  local child_process_group=''
  local child_session_id=''
  local supervisor_pid=''
  local supervisor_identity=''
  local supervisor_process_group=''
  local supervisor_session_id=''
  local abort_failed=0
  local authority_failed=0
  local harness_reaped=0
  local reap_result
  local attempt

  if test_identity_matches "$child_pid" "$child_identity"; then
    read -r _ child_process_group _ child_session_id <<<"$child_identity"
    supervisor_pid="$child_session_id"
  else
    authority_failed=1
    if test_stable_identity_matches "$child_pid" "$child_identity"; then
      read -r _ child_process_group _ child_session_id <<<"$child_identity"
      supervisor_pid="$child_session_id"
    fi
  fi

  if [[ "$supervisor_pid" =~ ^[0-9]+$ ]]; then
    for ((attempt = 0; attempt < 2; attempt += 1)); do
      if supervisor_identity="$(casn_read_process_identity "$supervisor_pid")"; then
        read -r _ supervisor_process_group _ supervisor_session_id <<<"$supervisor_identity"
        if [[ "$child_process_group" == "$supervisor_pid" \
          && "$supervisor_process_group" == "$supervisor_pid" \
          && "$supervisor_session_id" == "$supervisor_pid" ]]; then
          break
        fi
      fi
      supervisor_identity=''
      authority_failed=1
    done
  else
    authority_failed=1
  fi

  if [[ -n "$supervisor_identity" ]]; then
    signal_owned_test_group KILL "$supervisor_pid" "$supervisor_identity" \
      || abort_failed=1
  elif [[ -n "$child_process_group" && -n "$child_session_id" ]]; then
    signal_exact_owned_group_members "$child_process_group" "$child_session_id" \
      || abort_failed=1
  else
    abort_failed=1
  fi

  if bounded_reap_test_job "$harness_pid" "$harness_identity" 10; then
    harness_reaped=1
  else
    reap_result=$?
    if ((reap_result == 1)); then
      signal_owned_test_group KILL "$harness_pid" "$harness_identity" \
        || abort_failed=1
      if bounded_reap_test_job "$harness_pid" "$harness_identity" 50; then
        harness_reaped=1
      else
        abort_failed=1
      fi
    else
      abort_failed=1
    fi
  fi
  ((harness_reaped == 1)) || abort_failed=1

  if [[ -n "$child_process_group" && -n "$child_session_id" ]]; then
    wait_process_group_empty "$child_process_group" "$child_session_id" 0 50 \
      || abort_failed=1
  fi
  if [[ -n "$supervisor_identity" ]]; then
    wait_exact_process_absent "$supervisor_pid" "$supervisor_identity" 50 \
      || abort_failed=1
  fi

  ((authority_failed == 0)) || abort_failed=1
  return "$abort_failed"
}

run_abort_supervisor_case() {
  local log="$test_root/abort-supervisor.log"
  local marker="$test_root/abort-supervisor.ready"
  local supervisor_root
  local control_fifo
  local status_file
  local ready_file
  local harness_pid
  local harness_identity
  local supervisor_pid
  local supervisor_identity
  local child_pid
  local child_identity
  local attempt

  supervisor_root="$(mktemp -d '/tmp/casn-quality.XXXXXX')"
  control_fifo="$supervisor_root/active-1.control"
  status_file="$supervisor_root/active-1.status"
  ready_file="$supervisor_root/active-1.ready"
  mkfifo -- "$control_fifo"

  CASN_ABORT_READY_FILE="$marker" \
    CASN_ABORT_CONTROL_FIFO="$control_fifo" \
    CASN_ABORT_STATUS_FILE="$status_file" \
    CASN_ABORT_SUPERVISOR_READY_FILE="$ready_file" \
    PROCESS_SUPERVISOR="$process_supervisor" \
    IDENTITY_LIBRARY="$identity_library" \
    setsid --wait bash -c '
      exec 9<>"$CASN_ABORT_CONTROL_FIFO"
      setsid "$PROCESS_SUPERVISOR" \
        9 "$CASN_ABORT_STATUS_FILE" "$CASN_ABORT_SUPERVISOR_READY_FILE" \
        bash -c '\''
          trap "" TERM HUP INT
          owned_pid="$BASHPID"
          identity="$(. "$IDENTITY_LIBRARY"; casn_read_process_identity "$owned_pid")"
          printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$CASN_ABORT_READY_FILE"
          while :; do sleep 1; done
      '\'' &
      wait
    ' >"$log" 2>&1 &
  harness_pid=$!
  harness_identity="$(capture_test_process_identity "$harness_pid")" \
    || fail 'unable to capture abort-supervisor harness identity'

  for ((attempt = 0; attempt < 100; attempt += 1)); do
    [[ -s "$marker" ]] && break
    test_identity_matches "$harness_pid" "$harness_identity" \
      || fail 'abort-supervisor harness exited before readiness'
    sleep 0.05
  done
  [[ -s "$marker" ]] || fail 'abort-supervisor child did not become ready within 5 seconds'

  child_pid="$(sed -n '1p' "$marker")"
  child_identity="$(sed -n '2p' "$marker")"
  [[ "$child_pid" =~ ^[0-9]+$ && -n "$child_identity" ]] \
    || fail 'abort-supervisor child identity record is invalid'
  test_identity_matches "$child_pid" "$child_identity" \
    || fail 'abort-supervisor child identity changed before supervisor capture'
  read -r _ _ _ supervisor_pid <<<"$child_identity"
  supervisor_identity="$(casn_read_process_identity "$supervisor_pid")" \
    || fail 'unable to capture abort-supervisor identity'
  test_stable_identity_matches "$supervisor_pid" "$supervisor_identity" \
    || fail 'abort-supervisor identity changed before abort'

  if ! abort_term_run "$harness_pid" "$harness_identity" "$child_pid" "$child_identity"; then
    signal_owned_test_process KILL "$child_pid" "$child_identity" 2>/dev/null || true
    signal_stably_owned_test_process KILL "$supervisor_pid" "$supervisor_identity" 2>/dev/null || true
    signal_owned_test_group KILL "$harness_pid" "$harness_identity" 2>/dev/null || true
    bounded_reap_test_job "$harness_pid" "$harness_identity" 50 || true
    rm -rf -- "$supervisor_root"
    fail 'abort-supervisor cleanup did not prove exact process absence'
  fi

  if test_stable_identity_matches "$supervisor_pid" "$supervisor_identity"; then
    signal_stably_owned_test_process KILL "$supervisor_pid" "$supervisor_identity" 2>/dev/null || true
    for ((attempt = 0; attempt < 50; attempt += 1)); do
      test_stable_identity_matches "$supervisor_pid" "$supervisor_identity" || break
      sleep 0.1
    done
    rm -rf -- "$supervisor_root"
    fail 'abort cleanup left the separately sessioned supervisor alive'
  fi

  rm -rf -- "$supervisor_root"
  printf '[disposable-app-regression] abort-supervisor passed\n'
}

run_abort_lost_authority_case() {
  local log="$test_root/abort-lost-authority.log"
  local marker="$test_root/abort-lost-authority.ready"
  local supervisor_root
  local control_fifo
  local status_file
  local ready_file
  local harness_pid
  local harness_identity
  local supervisor_pid
  local supervisor_identity
  local child_pid
  local child_identity
  local sibling_pid
  local sibling_identity
  local abort_status
  local attempt
  local sabotage_marker="$test_root/abort-lost-authority.sabotaged"
  local original_read_definition

  supervisor_root="$(mktemp -d '/tmp/casn-quality.XXXXXX')"
  control_fifo="$supervisor_root/active-1.control"
  status_file="$supervisor_root/active-1.status"
  ready_file="$supervisor_root/active-1.ready"
  mkfifo -- "$control_fifo"

  CASN_ABORT_READY_FILE="$marker" \
    CASN_ABORT_CONTROL_FIFO="$control_fifo" \
    CASN_ABORT_STATUS_FILE="$status_file" \
    CASN_ABORT_SUPERVISOR_READY_FILE="$ready_file" \
    PROCESS_SUPERVISOR="$process_supervisor" \
    IDENTITY_LIBRARY="$identity_library" \
    setsid --wait bash -c '
      exec 9<>"$CASN_ABORT_CONTROL_FIFO"
      setsid "$PROCESS_SUPERVISOR" \
        9 "$CASN_ABORT_STATUS_FILE" "$CASN_ABORT_SUPERVISOR_READY_FILE" \
        bash -c '\''
          trap "" TERM HUP INT
          child_pid="$BASHPID"
          child_identity="$(. "$IDENTITY_LIBRARY"; casn_read_process_identity "$child_pid")"
          printf "%s\\n%s\\n" "$child_pid" "$child_identity" >"$CASN_ABORT_READY_FILE"
          sleep 30 &
          sibling_pid=$!
          sibling_identity="$(. "$IDENTITY_LIBRARY"; casn_read_process_identity "$sibling_pid")"
          printf "%s\\n%s\\n" "$sibling_pid" "$sibling_identity" >>"$CASN_ABORT_READY_FILE"
          while [[ "$(wc -l <"$CASN_ABORT_READY_FILE")" -lt 4 ]]; do sleep 0.01; done
          while :; do sleep 1; done
      '\'' &
      wait
    ' >"$log" 2>&1 &
  harness_pid=$!
  harness_identity="$(capture_test_process_identity "$harness_pid")" \
    || fail 'unable to capture lost-authority harness identity'

  for ((attempt = 0; attempt < 100; attempt += 1)); do
    if [[ -f "$marker" && "$(wc -l <"$marker")" -ge 4 ]]; then
      break
    fi
    test_identity_matches "$harness_pid" "$harness_identity" \
      || fail 'lost-authority harness exited before readiness'
    sleep 0.05
  done
  [[ -s "$marker" && "$(wc -l <"$marker")" -ge 4 ]] \
    || fail 'lost-authority descendants did not become ready within five seconds'

  child_pid="$(sed -n '1p' "$marker")"
  child_identity="$(sed -n '2p' "$marker")"
  sibling_pid="$(sed -n '3p' "$marker")"
  sibling_identity="$(sed -n '4p' "$marker")"
  [[ "$child_pid" =~ ^[0-9]+$ && -n "$child_identity" \
    && "$sibling_pid" =~ ^[0-9]+$ && -n "$sibling_identity" ]] \
    || fail 'lost-authority identity records are invalid'
  test_identity_matches "$child_pid" "$child_identity" \
    || fail 'lost-authority child identity changed before supervisor loss'
  test_identity_matches "$sibling_pid" "$sibling_identity" \
    || fail 'lost-authority sibling identity changed before supervisor loss'
  read -r _ _ _ supervisor_pid <<<"$child_identity"
  supervisor_identity="$(casn_read_process_identity "$supervisor_pid")" \
    || fail 'unable to capture lost-authority supervisor identity'
  lost_authority_target_pid="$supervisor_pid"

  original_read_definition="$(declare -f casn_read_process_identity)"
  original_read_definition="${original_read_definition/casn_read_process_identity ()/casn_read_process_identity_original ()}"
  eval "$original_read_definition"
  casn_read_process_identity() {
    local pid="$1"
    local identity
    local start_time
    local process_group
    local parent_pid
    local session_id

    identity="$(casn_read_process_identity_original "$@")" || return 1
    if [[ "$pid" == "$lost_authority_target_pid" && ! -e "$sabotage_marker" ]]; then
      : >"$sabotage_marker"
      read -r start_time process_group parent_pid session_id <<<"$identity"
      printf '%s %s %s %s\n' "$start_time" "$((process_group + 1))" "$parent_pid" "$session_id"
      return 0
    fi
    printf '%s\n' "$identity"
  }

  if abort_term_run "$harness_pid" "$harness_identity" "$child_pid" "$child_identity"; then
    abort_status=0
  else
    abort_status=$?
  fi
  eval "${original_read_definition/casn_read_process_identity_original ()/casn_read_process_identity ()}"

  if ((abort_status == 0)); then
    cleanup_exact_test_process "$sibling_pid" "$sibling_identity" || true
    cleanup_exact_test_process "$child_pid" "$child_identity" || true
    cleanup_exact_test_group "$supervisor_pid" "$supervisor_identity" || true
    signal_owned_test_group KILL "$harness_pid" "$harness_identity" 2>/dev/null || true
    bounded_reap_test_job "$harness_pid" "$harness_identity" 50 || true
    rm -rf -- "$supervisor_root"
    fail 'abort cleanup reported success after losing supervisor authority'
  fi
  if test_stable_identity_matches "$child_pid" "$child_identity" \
    || test_stable_identity_matches "$sibling_pid" "$sibling_identity"; then
    cleanup_exact_test_process "$sibling_pid" "$sibling_identity" || true
    cleanup_exact_test_process "$child_pid" "$child_identity" || true
    cleanup_exact_test_group "$supervisor_pid" "$supervisor_identity" || true
    signal_owned_test_group KILL "$harness_pid" "$harness_identity" 2>/dev/null || true
    bounded_reap_test_job "$harness_pid" "$harness_identity" 50 || true
    rm -rf -- "$supervisor_root"
    fail 'lost-authority abort did not clean both exact descendants'
  fi
  if test_stable_identity_matches "$supervisor_pid" "$supervisor_identity"; then
    cleanup_exact_test_group "$supervisor_pid" "$supervisor_identity" || true
    signal_owned_test_group KILL "$harness_pid" "$harness_identity" 2>/dev/null || true
    bounded_reap_test_job "$harness_pid" "$harness_identity" 50 || true
    rm -rf -- "$supervisor_root"
    fail 'lost-authority abort did not clean the exact supervisor'
  fi
  [[ ! -e "/proc/$harness_pid/stat" ]] \
    || fail 'lost-authority abort did not reap the outer harness'

  rm -rf -- "$supervisor_root"
  printf '[disposable-app-regression] abort-lost-authority passed\n'
}

run_term_case() {
  local log="$test_root/term.log"
  local marker="$test_root/term.ready"
  local harness_pid
  local harness_identity
  local child_pid
  local child_identity
  local status
  local started_ms
  local signal_ms=''
  local signal_elapsed_ms
  local cleanup_finished_ms
  local cleanup_elapsed_ms
  local max_term_ms=$((3 * 1000))
  local attempt

  CASN_TERM_READY_FILE="$marker" \
    IDENTITY_LIBRARY="$identity_library" \
    setsid --wait bash "$harness" bash -c '
      source "$IDENTITY_LIBRARY"
      owned_pid="$BASHPID"
      identity="$(casn_read_process_identity "$owned_pid")"
      printf "%s\n%s\n" "$owned_pid" "$identity" >"$CASN_TERM_READY_FILE"
      sleep 8
    ' >"$log" 2>&1 &
  harness_pid=$!
  harness_identity="$(capture_test_process_identity "$harness_pid")" \
    || fail 'unable to capture TERM harness identity'

  for ((attempt = 0; attempt < 1200; attempt += 1)); do
    [[ -s "$marker" ]] && break
    if ! test_identity_matches "$harness_pid" "$harness_identity"; then
      bounded_reap_test_job "$harness_pid" "$harness_identity" 1 || true
      tail -n 80 "$log" >&2
      fail 'TERM harness exited before the child became ready'
      return
    fi
    sleep 0.2
  done
  [[ -s "$marker" ]] || {
    signal_owned_test_process TERM "$harness_pid" "$harness_identity" 2>/dev/null || true
    if ! bounded_reap_test_job "$harness_pid" "$harness_identity" 100; then
      signal_owned_test_group KILL "$harness_pid" "$harness_identity" 2>/dev/null || true
      bounded_reap_test_job "$harness_pid" "$harness_identity" 50 || true
    fi
    fail 'TERM child did not become ready within 240 seconds'
  }

  child_pid="$(sed -n '1p' "$marker")"
  child_identity="$(sed -n '2p' "$marker")"
  [[ "$child_pid" =~ ^[0-9]+$ && -n "$child_identity" ]] || fail 'TERM child identity record is invalid'

  started_ms="$(date +%s%3N)"
  signal_owned_test_process TERM "$harness_pid" "$harness_identity" \
    || fail 'TERM harness identity changed before trigger'

  for ((attempt = 0; attempt < 30; attempt += 1)); do
    if grep -Fq '[disposable-app] signal received status=143' "$log"; then
      signal_ms="$(date +%s%3N)"
      break
    fi
    test_identity_matches "$harness_pid" "$harness_identity" || break
    sleep 0.1
  done
  [[ "$signal_ms" =~ ^[0-9]+$ ]] || {
    abort_term_run "$harness_pid" "$harness_identity" "$child_pid" "$child_identity"
    tail -n 80 "$log" >&2
    fail 'TERM active-command termination was not acknowledged within 3 seconds'
  }
  signal_elapsed_ms=$((signal_ms - started_ms))

  for ((attempt = 0; attempt < 150; attempt += 1)); do
    if bounded_reap_test_job "$harness_pid" "$harness_identity" 1; then
      break
    fi
  done
  if [[ -z "$reaped_status" ]]; then
    abort_term_run "$harness_pid" "$harness_identity" "$child_pid" "$child_identity"
    fail 'TERM harness did not finish cleanup within 15 seconds'
  fi

  status="$reaped_status"
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

run_ignored_term_descendant_case() {
  local log="$test_root/term-descendant.log"
  local marker="$test_root/term-descendant.ready"
  local descendant_pid
  local descendant_identity
  local status
  local attempt

  run_owned_bounded "$log" 2400 env \
    CASN_DESCENDANT_READY_FILE="$marker" \
    IDENTITY_LIBRARY="$identity_library" \
    bash "$harness" bash -c '
      bash -c '\''
        trap "" TERM HUP INT
        owned_pid="$BASHPID"
        identity="$(. "$IDENTITY_LIBRARY"; casn_read_process_identity "$owned_pid")"
        printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$CASN_DESCENDANT_READY_FILE"
        while :; do sleep 1; done
      '\'' &
      for _ in {1..500}; do
        [[ -s "$CASN_DESCENDANT_READY_FILE" ]] && exit 23
        sleep 0.01
      done
      exit 97
    '
  status="$owned_run_status"

  descendant_pid="$(sed -n '1p' "$marker")"
  descendant_identity="$(sed -n '2p' "$marker")"
  [[ "$descendant_pid" =~ ^[0-9]+$ && -n "$descendant_identity" ]] \
    || fail 'ignored descendant identity record is invalid'

  if test_stable_identity_matches "$descendant_pid" "$descendant_identity"; then
    signal_stably_owned_test_process KILL "$descendant_pid" "$descendant_identity" 2>/dev/null || true
    for ((attempt = 0; attempt < 50; attempt += 1)); do
      test_stable_identity_matches "$descendant_pid" "$descendant_identity" || break
      sleep 0.1
    done
    tail -n 80 "$log" >&2
    fail 'TERM left an ignored descendant alive after the owned group leader exited'
  fi

  [[ "$status" -eq 23 ]] || fail "ignored-descendant expected status 23, received $status"
  grep -Fq 'active command required bounded KILL escalation' "$log" \
    || fail 'ignored descendant did not exercise bounded KILL escalation'
  grep -Fq 'verified=1' "$log" || fail 'ignored-descendant cleanup was not verified'
  assert_resources_absent "$log"
  printf '[disposable-app-regression] ignored-term-descendant passed\n'
}

run_ignored_term_signal_case() {
  local log="$test_root/term-descendant-signal.log"
  local marker="$test_root/term-descendant-signal.ready"
  local harness_pid
  local harness_identity
  local descendant_pid
  local descendant_identity
  local status
  local started_ms
  local signal_ms=''
  local signal_elapsed_ms
  local attempt

  CASN_DESCENDANT_READY_FILE="$marker" \
    IDENTITY_LIBRARY="$identity_library" \
    setsid --wait bash "$harness" bash -c '
      bash -c '\''
        trap "" TERM HUP INT
        owned_pid="$BASHPID"
        identity="$(. "$IDENTITY_LIBRARY"; casn_read_process_identity "$owned_pid")"
        printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$CASN_DESCENDANT_READY_FILE"
        while :; do sleep 1; done
      '\'' &
      wait
    ' >"$log" 2>&1 &
  harness_pid=$!
  harness_identity="$(capture_test_process_identity "$harness_pid")" \
    || fail 'unable to capture ignored-TERM signal harness identity'

  for ((attempt = 0; attempt < 1200; attempt += 1)); do
    [[ -s "$marker" ]] && break
    test_identity_matches "$harness_pid" "$harness_identity" \
      || fail 'ignored-TERM signal harness exited before readiness'
    sleep 0.2
  done
  [[ -s "$marker" ]] || fail 'ignored-TERM signal descendant did not become ready within 240 seconds'

  descendant_pid="$(sed -n '1p' "$marker")"
  descendant_identity="$(sed -n '2p' "$marker")"
  [[ "$descendant_pid" =~ ^[0-9]+$ && -n "$descendant_identity" ]] \
    || fail 'ignored-TERM signal descendant identity record is invalid'

  started_ms="$(date +%s%3N)"
  signal_owned_test_process TERM "$harness_pid" "$harness_identity" \
    || fail 'ignored-TERM signal harness identity changed before TERM'
  for ((attempt = 0; attempt < 30; attempt += 1)); do
    if grep -Fq '[disposable-app] active command required bounded KILL escalation' "$log"; then
      signal_ms="$(date +%s%3N)"
      break
    fi
    test_identity_matches "$harness_pid" "$harness_identity" || break
    sleep 0.1
  done
  [[ "$signal_ms" =~ ^[0-9]+$ ]] || {
    tail -n 100 "$log" >&2
    abort_term_run "$harness_pid" "$harness_identity" "$descendant_pid" "$descendant_identity"
    signal_stably_owned_test_process KILL "$descendant_pid" "$descendant_identity" 2>/dev/null || true
    fail 'ignored-TERM signal acknowledgement exceeded 3 seconds'
  }
  signal_elapsed_ms=$((signal_ms - started_ms))

  for ((attempt = 0; attempt < 150; attempt += 1)); do
    bounded_reap_test_job "$harness_pid" "$harness_identity" 1 && break
  done
  if [[ -z "$reaped_status" ]]; then
    abort_term_run "$harness_pid" "$harness_identity" "$descendant_pid" "$descendant_identity"
    signal_stably_owned_test_process KILL "$descendant_pid" "$descendant_identity" 2>/dev/null || true
    fail 'ignored-TERM signal harness did not finish cleanup within 15 seconds'
  fi
  status="$reaped_status"

  if test_stable_identity_matches "$descendant_pid" "$descendant_identity"; then
    signal_stably_owned_test_process KILL "$descendant_pid" "$descendant_identity" 2>/dev/null || true
    fail 'ignored-TERM signal left the descendant alive'
  fi
  [[ "$status" -eq 143 ]] || fail "ignored-TERM signal expected status 143, received $status"
  ((signal_elapsed_ms < 3000)) || fail "ignored-TERM signal acknowledgement took ${signal_elapsed_ms}ms"
  grep -Fq 'active command required bounded KILL escalation' "$log" \
    || fail 'ignored-TERM signal did not exercise bounded KILL escalation'
  grep -Fq 'verified=1' "$log" || fail 'ignored-TERM signal cleanup was not verified'
  assert_resources_absent "$log"
  printf '[disposable-app-regression] ignored-term-signal passed signal_ms=%s\n' "$signal_elapsed_ms"
}

case "${1:-all}" in
  identity-mismatch)
    run_identity_case
    ;;
  stopped-reap)
    run_stopped_reap_case
    ;;
  owned-group-anchor)
    run_owned_group_anchor_case
    ;;
  abort-supervisor)
    run_abort_supervisor_case
    ;;
  abort-lost-authority)
    run_abort_lost_authority_case
    ;;
  changed-ppid-signal)
    run_changed_ppid_signal_case
    ;;
  bounded-error-cleanup)
    run_bounded_error_cleanup_case identity-capture
    run_bounded_error_cleanup_case readiness
    run_bounded_error_cleanup_case termination
    run_bounded_error_cleanup_case reap
    ;;
  bounded-termination-cleanup)
    run_bounded_error_cleanup_case termination
    ;;
  bounded-reap-cleanup)
    run_bounded_error_cleanup_case reap
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
  term-descendant)
    run_ignored_term_descendant_case
    ;;
  term-descendant-signal)
    run_ignored_term_signal_case
    ;;
  all)
    run_identity_case
    run_stopped_reap_case
    run_owned_group_anchor_case
    run_abort_supervisor_case
    run_abort_lost_authority_case
    run_changed_ppid_signal_case
    run_bounded_error_cleanup_case identity-capture
    run_bounded_error_cleanup_case readiness
    run_bounded_error_cleanup_case termination
    run_bounded_error_cleanup_case reap
    run_cleanup_query_case docker-proof
    run_cleanup_query_case ss-proof
    run_child_status_case
    run_term_case
    run_ignored_term_descendant_case
    run_ignored_term_signal_case
    ;;
  *)
    printf 'Usage: %s [identity-mismatch|stopped-reap|owned-group-anchor|abort-supervisor|abort-lost-authority|changed-ppid-signal|bounded-error-cleanup|docker-proof|ss-proof|child-status|term|term-descendant|term-descendant-signal|all]\n' "$0" >&2
    exit 64
    ;;
esac
