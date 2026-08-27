#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
readonly harness="$repository_root/scripts/ci/with-disposable-app.sh"
readonly identity_library="$repository_root/scripts/ci/disposable-process-identity.sh"
readonly process_supervisor="$repository_root/scripts/ci/disposable-process-supervisor.sh"
readonly registry_library="$repository_root/scripts/ci/disposable-process-registry.sh"
# shellcheck source=scripts/ci/disposable-process-identity.sh
source "$identity_library"
# shellcheck source=scripts/ci/disposable-process-registry.sh
source "$registry_library"
real_docker="$(command -v docker)"
real_ss="$(command -v ss)"
readonly real_docker real_ss
test_root="$(mktemp -d '/tmp/casn-quality-regression.XXXXXX')"
readonly test_root
readonly fake_bin="$test_root/bin"
invocation_id="$(openssl rand -hex 16)"
readonly invocation_id
readonly identity_registry="$test_root/registry.$invocation_id"
readonly temp_registry="$test_root/temp-registry.$invocation_id"
mkdir -m 0700 "$fake_bin" "$identity_registry" "$temp_registry"

fail() {
  printf '[disposable-app-regression] ERROR: %s\n' "$1" >&2
  return 1
}

register_invocation_identity() {
  local pid="$1"
  local identity="$2"
  local role="$3"

  casn_registry_write_identity \
    "$identity_registry" "$invocation_id" "$pid" "$identity" "$role" >/dev/null
}

register_invocation_temp_root() {
  local root="$1"
  local role="$2"
  local pending
  local entry
  local line

  [[ "$root" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ ]] || return 1
  casn_registry_role_is_valid "$role" || return 1
  [[ -d "$temp_registry" && ! -L "$temp_registry" ]] || return 1
  pending="$(mktemp "$temp_registry/.pending.XXXXXX")" || return 1
  chmod 0600 "$pending" || {
    rm -f -- "$pending"
    return 1
  }
  printf 'v1\t%s\t%s\t%s\n' "$invocation_id" "$root" "$role" >"$pending" || {
    rm -f -- "$pending"
    return 1
  }
  entry="$temp_registry/entry.${pending##*.}"
  [[ ! -e "$entry" ]] || {
    rm -f -- "$pending"
    return 1
  }
  mv -- "$pending" "$entry" || {
    rm -f -- "$pending"
    return 1
  }
  IFS= read -r line <"$entry" || return 1
  [[ "$line" == "v1"$'\t'"$invocation_id"$'\t'"$root"$'\t'"$role" \
    && "$(wc -l <"$entry")" -eq 1 ]]
}

read_invocation_temp_entry() {
  local entry="$1"
  local line
  local pattern

  [[ "$entry" == "$temp_registry"/entry.* && -f "$entry" && ! -L "$entry" ]] || return 1
  IFS= read -r line 2>/dev/null <"$entry" || return 1
  [[ "$(wc -l <"$entry")" -eq 1 ]] || return 1
  pattern=$'^v1\t([0-9a-f]{32})\t(/tmp/casn-quality\.[A-Za-z0-9]+)\t([a-z][a-z0-9-]{0,31})$'
  [[ "$line" =~ $pattern && "${BASH_REMATCH[1]}" == "$invocation_id" ]] || return 1
  printf '%s %s\n' "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
}

validate_invocation_registry() {
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role
  local key
  local malformed=0
  local -A seen=()

  casn_registry_directory_is_valid "$identity_registry" "$invocation_id" || return 1
  for entry in \
    "$identity_registry"/* "$identity_registry"/.[!.]* "$identity_registry"/..?*; do
    [[ -e "$entry" ]] || continue
    if [[ "$entry" == "$identity_registry"/.pending.* ]]; then
      malformed=1
      continue
    fi
    if ! record="$(casn_registry_read_entry "$entry" "$identity_registry" "$invocation_id")"; then
      malformed=1
      continue
    fi
    read -r pid start_time parent_pid process_group session_id role <<<"$record"
    key="$pid:$start_time:$parent_pid:$process_group:$session_id:$role"
    if [[ -n "${seen[$key]:-}" ]]; then
      malformed=1
    else
      seen[$key]=1
    fi
  done
  ((malformed == 0))
}

registry_stable_identity_matches() {
  local pid="$1"
  local start_time="$2"
  local process_group="$3"
  local session_id="$4"
  local current_identity
  local current_start_time
  local current_process_group
  local current_session_id

  current_identity="$(casn_read_process_identity "$pid")" || return 1
  read -r current_start_time current_process_group _ current_session_id <<<"$current_identity"
  [[ "$current_start_time" == "$start_time" \
    && "$current_process_group" == "$process_group" \
    && "$current_session_id" == "$session_id" ]]
}

registry_signal_identities() {
  local signal_name="$1"
  local excluded_pid="${2:-0}"
  local selected_class="${3:-all}"
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role
  local state
  local failed=0
  local pass
  local role_class

  for pass in descendant command supervisor harness; do
    [[ "$selected_class" == 'all' || "$selected_class" == "$pass" ]] || continue
    for entry in "$identity_registry"/entry.*; do
      [[ -e "$entry" ]] || continue
      if ! record="$(casn_registry_read_entry "$entry" "$identity_registry" "$invocation_id")"; then
        failed=1
        continue
      fi
      read -r pid start_time parent_pid process_group session_id role <<<"$record"
      [[ "$pid" != "$excluded_pid" && "$role" != *-observation ]] || continue
      role_class='command'
      [[ "$role" == *descendant* ]] && role_class=descendant
      [[ "$role" == *supervisor* ]] && role_class=supervisor
      [[ "$role" == *harness* ]] && role_class=harness
      [[ "$pass" == "$role_class" ]] || continue
      if casn_process_identity_matches \
        "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id"; then
        state="$(casn_read_process_state "$pid")" || {
          failed=1
          continue
        }
        [[ "$state" != 'Z' ]] || continue
        if ! casn_process_identity_matches \
          "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id"; then
          registry_stable_identity_matches "$pid" "$start_time" "$process_group" "$session_id" \
            && failed=1
          continue
        fi
        if ! kill -"$signal_name" "$pid"; then
          registry_stable_identity_matches "$pid" "$start_time" "$process_group" "$session_id" \
            && failed=1
        fi
      elif registry_stable_identity_matches "$pid" "$start_time" "$process_group" "$session_id"; then
        failed=1
      fi
    done
  done
  return "$failed"
}

reap_registered_children() {
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role
  local state

  for entry in "$identity_registry"/entry.*; do
    [[ -e "$entry" ]] || continue
    record="$(casn_registry_read_entry "$entry" "$identity_registry" "$invocation_id")" \
      || continue
    read -r pid start_time parent_pid process_group session_id role <<<"$record"
    [[ "$parent_pid" == "$$" ]] || continue
    if casn_process_identity_matches \
      "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id"; then
      state="$(casn_read_process_state "$pid")" || continue
      if [[ "$state" == 'Z' ]]; then
        set +e
        wait "$pid" 2>/dev/null
        set -e
      fi
    fi
  done
}

registered_identities_absent_once() {
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role
  local failed=0
  local group_status
  local group_key
  local -A groups_checked=()

  for entry in "$identity_registry"/.pending.*; do
    [[ -e "$entry" ]] || continue
    failed=1
  done
  for entry in "$identity_registry"/entry.*; do
    [[ -e "$entry" ]] || continue
    if ! record="$(casn_registry_read_entry "$entry" "$identity_registry" "$invocation_id")"; then
      failed=1
      continue
    fi
    read -r pid start_time parent_pid process_group session_id role <<<"$record"
    if casn_process_identity_matches \
      "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id" \
      || registry_stable_identity_matches "$pid" "$start_time" "$process_group" "$session_id"; then
      failed=1
    fi
    group_key="$process_group:$session_id"
    if [[ -z "${groups_checked[$group_key]:-}" ]]; then
      groups_checked[$group_key]=1
      if casn_process_group_has_members "$process_group" "$session_id" 0; then
        failed=1
      else
        group_status=$?
        ((group_status == 1)) || failed=1
      fi
    fi
  done
  return "$failed"
}

remove_registered_temp_roots() {
  local entry
  local record
  local root
  local role
  local failed=0

  for entry in "$temp_registry"/* "$temp_registry"/.[!.]* "$temp_registry"/..?*; do
    [[ -e "$entry" ]] || continue
    if [[ "$entry" == "$temp_registry"/.pending.* ]]; then
      failed=1
      continue
    fi
    if ! record="$(read_invocation_temp_entry "$entry")"; then
      failed=1
      continue
    fi
    read -r root role <<<"$record"
    if [[ -e "$root" ]]; then
      rm -rf -- "$root" || failed=1
    fi
    [[ ! -e "$root" ]] || failed=1
  done
  return "$failed"
}

registered_temp_roots_absent_once() {
  local entry
  local record
  local root
  local role
  local failed=0

  for entry in "$temp_registry"/.pending.*; do
    [[ -e "$entry" ]] || continue
    failed=1
  done
  for entry in "$temp_registry"/entry.*; do
    [[ -e "$entry" ]] || continue
    if ! record="$(read_invocation_temp_entry "$entry")"; then
      failed=1
      continue
    fi
    read -r root role <<<"$record"
    [[ ! -e "$root" ]] || failed=1
  done
  return "$failed"
}

registry_contains_identity_role() {
  local expected_pid="$1"
  local expected_identity="$2"
  local expected_role="$3"
  local expected_start_time
  local expected_process_group
  local expected_parent_pid
  local expected_session_id
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role

  read -r expected_start_time expected_process_group expected_parent_pid expected_session_id \
    <<<"$expected_identity"
  for entry in "$identity_registry"/entry.*; do
    [[ -e "$entry" ]] || continue
    record="$(casn_registry_read_entry "$entry" "$identity_registry" "$invocation_id")" \
      || continue
    read -r pid start_time parent_pid process_group session_id role <<<"$record"
    if [[ "$pid" == "$expected_pid" && "$start_time" == "$expected_start_time" \
      && "$parent_pid" == "$expected_parent_pid" \
      && "$process_group" == "$expected_process_group" \
      && "$session_id" == "$expected_session_id" && "$role" == "$expected_role" ]]; then
      return 0
    fi
  done
  return 1
}

promote_reparented_observations() {
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role
  local current_identity
  local current_start_time
  local current_process_group
  local current_parent_pid
  local current_session_id

  for entry in "$identity_registry"/entry.*; do
    [[ -e "$entry" ]] || continue
    record="$(casn_registry_read_entry "$entry" "$identity_registry" "$invocation_id")" \
      || return 1
    read -r pid start_time parent_pid process_group session_id role <<<"$record"
    [[ "$role" == 'reparent-observation' ]] || continue
    current_identity="$(casn_read_process_identity "$pid")" || continue
    read -r current_start_time current_process_group current_parent_pid current_session_id \
      <<<"$current_identity"
    [[ "$current_start_time" == "$start_time" \
      && "$current_process_group" == "$process_group" \
      && "$current_session_id" == "$session_id" ]] || return 1
    if registry_contains_identity_role "$pid" "$current_identity" registered-descendant; then
      continue
    fi
    if [[ "$current_parent_pid" == "$parent_pid" ]]; then
      casn_process_identity_matches \
        "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id" || return 1
    fi
    register_invocation_identity "$pid" "$current_identity" registered-descendant || return 1
  done
}

prove_invocation_stably_absent() {
  local attempts="${1:-5}"
  local attempt
  local observed=0

  for ((attempt = 0; attempt < attempts; attempt += 1)); do
    registered_identities_absent_once || observed=1
    registered_temp_roots_absent_once || observed=1
    sleep 0.1
  done
  ((observed == 0))
}

teardown_invocation_registry() {
  local cleanup_failed=0
  local attempt
  local role_class

  promote_reparented_observations || cleanup_failed=1
  validate_invocation_registry || cleanup_failed=1
  for role_class in descendant command supervisor harness; do
    registry_signal_identities TERM 0 "$role_class" || cleanup_failed=1
    for ((attempt = 0; attempt < 10; attempt += 1)); do
      reap_registered_children
      registered_authoritative_identities_absent_except 0 "$role_class" && break
      sleep 0.1
    done
    registry_signal_identities KILL 0 "$role_class" || cleanup_failed=1
    for ((attempt = 0; attempt < 50; attempt += 1)); do
      reap_registered_children
      registered_authoritative_identities_absent_except 0 "$role_class" && break
      sleep 0.1
    done
    registered_authoritative_identities_absent_except 0 "$role_class" \
      || cleanup_failed=1
  done
  remove_registered_temp_roots || cleanup_failed=1
  prove_invocation_stably_absent 5 || cleanup_failed=1
  if ((cleanup_failed == 0)); then
    printf '[disposable-app-regression] invocation teardown verified invocation=%s registry=%s\n' \
      "$invocation_id" "$identity_registry" >&2
  fi
  return "$cleanup_failed"
}

cleanup() {
  local incoming_status=$?
  local log
  local container
  local harness_temp
  local cleanup_failed=0
  local final_status

  trap - EXIT HUP INT TERM
  set +e
  teardown_invocation_registry || cleanup_failed=1
  for log in "$test_root"/*.log; do
    [[ -f "$log" ]] || continue

    container="$(sed -n 's/^\[disposable-app\] resources container=\([^ ]*\) temp_dir=[^ ]*$/\1/p' "$log" | tail -n 1)"
    if [[ "$container" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]]; then
      "$real_docker" container rm --force "$container" >/dev/null 2>&1 || true
    fi

    harness_temp="$(sed -n 's/^\[disposable-app\] resources container=[^ ]* temp_dir=\([^ ]*\)$/\1/p' "$log" | tail -n 1)"
    if [[ "$harness_temp" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ && -d "$harness_temp" ]]; then
      rm -rf -- "$harness_temp" || cleanup_failed=1
    fi
  done

  if ((cleanup_failed == 0)); then
    if [[ "$test_root" =~ ^/tmp/casn-quality-regression\.[A-Za-z0-9]+$ && -d "$test_root" ]]; then
      rm -rf -- "$test_root" || cleanup_failed=1
    else
      cleanup_failed=1
    fi
    [[ ! -e "$test_root" ]] || cleanup_failed=1
  fi

  final_status="$incoming_status"
  if ((incoming_status == 0 && cleanup_failed != 0)); then
    final_status=1
  fi
  exit "$final_status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

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

run_changed_ppid_signal_case() {
  local marker="$test_root/changed-ppid.ready"
  local hold_fifo="$test_root/changed-ppid.hold"
  local log="$test_root/changed-ppid.log"
  local parent_pid
  local parent_identity
  local pid
  local original_identity
  local current_identity
  local attempt
  local signal_status

  mkfifo -- "$hold_fifo"
  spawn_registered_session "$log" fixture-harness env \
    CHANGED_PPID_MARKER="$marker" \
    CHANGED_PPID_HOLD_FIFO="$hold_fifo" \
    IDENTITY_LIBRARY="$identity_library" \
    REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    bash -c '
    exec 9<>"$CHANGED_PPID_HOLD_FIFO"
    bash -c '\''
      set -euo pipefail
      trap "" TERM HUP INT
      source "$IDENTITY_LIBRARY"
      source "$REGISTRY_LIBRARY"
      owned_pid="$BASHPID"
      identity="$(casn_read_process_identity "$owned_pid")"
      casn_registry_write_identity \
        "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
        "$owned_pid" "$identity" reparent-observation >/dev/null
      marker_temp="${CHANGED_PPID_MARKER}.tmp.$owned_pid"
      printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$marker_temp"
      mv -- "$marker_temp" "$CHANGED_PPID_MARKER"
      while :; do read -r -t 1 _ <&9 || true; done
    '\'' &
    for _ in {1..500}; do
      [[ -s "$CHANGED_PPID_MARKER" ]] && exit 0
      read -r -t 0.01 _ <&9 || true
    done
    exit 97
  ' || fail 'unable to launch changed-PPID registered fixture'
  parent_pid="$spawned_pid"
  parent_identity="$spawned_identity"

  for ((attempt = 0; attempt < 100; attempt += 1)); do
    [[ -s "$marker" ]] && break
    sleep 0.05
  done
  [[ -s "$marker" ]] || fail 'changed-PPID fixture did not publish its identity'

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
  bounded_reap_test_job "$parent_pid" "$parent_identity" 50 \
    || fail 'changed-PPID parent did not become reapable'

  set +e
  signal_owned_test_process TERM "$pid" "$original_identity"
  signal_status=$?
  set -e
  if ((signal_status == 0)); then
    wait_exact_process_absent "$pid" "$original_identity" 50 || true
    fail 'stable signal helper accepted a changed expected PPID'
  fi

  promote_reparented_observations \
    || fail 'changed-PPID observation could not be promoted to current full identity'
  teardown_invocation_registry \
    || fail 'changed-PPID exact registry cleanup failed'
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
stop_owned_supervisor() {
  local supervisor_pid="$1"
  local supervisor_identity="$2"
  local control_fd="$3"

  test_identity_matches "$supervisor_pid" "$supervisor_identity" || return 1
  printf 'stop\n' >&"$control_fd"
}

run_owned_group_anchor_case() {
  local log="$test_root/owned-group-anchor.log"
  local marker="$test_root/owned-group-anchor.ready"
  local control_fifo="$test_root/owned-group-anchor.control"
  local descendant_pid
  local descendant_identity
  local status
  local attempt

  mkfifo -- "$control_fifo"
  run_owned_bounded "$log" 20 env \
    CASN_ANCHOR_READY_FILE="$marker" \
    CASN_ANCHOR_CONTROL_FIFO="$control_fifo" \
    IDENTITY_LIBRARY="$identity_library" \
    REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    bash -c '
      bash -c '\''
        trap "" TERM HUP INT
        source "$IDENTITY_LIBRARY"
        source "$REGISTRY_LIBRARY"
        owned_pid="$BASHPID"
        identity="$(casn_read_process_identity "$owned_pid")"
        casn_registry_write_identity \
          "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
          "$owned_pid" "$identity" reparent-observation >/dev/null
        printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$CASN_ANCHOR_READY_FILE"
        exec 9<>"$CASN_ANCHOR_CONTROL_FIFO"
        while :; do read -r -t 1 _ <&9 || true; done
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
    signal_owned_test_process KILL "$descendant_pid" "$descendant_identity" 2>/dev/null || true
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
  local log="$test_root/stopped-reap.log"
  local pid
  local identity
  local started_ms
  local elapsed_ms

  spawn_registered_session "$log" fixture-command sleep 30 \
    || fail 'unable to launch registered stopped-job fixture'
  pid="$spawned_pid"
  identity="$spawned_identity"
  signal_owned_test_process STOP "$pid" "$identity" \
    || fail 'stopped-job identity changed before STOP'

  started_ms="$(date +%s%3N)"
  if bounded_reap_test_job "$pid" "$identity" 5; then
    fail 'stopped job was incorrectly treated as reapable'
  fi
  elapsed_ms=$(($(date +%s%3N) - started_ms))
  ((elapsed_ms < 2000)) || fail "stopped-job reap bound took ${elapsed_ms}ms"

  signal_owned_test_process KILL "$pid" "$identity" \
    || fail 'stopped-job identity changed before KILL cleanup'
  bounded_reap_test_job "$pid" "$identity" 50 \
    || fail 'stopped job did not become reapable after owned KILL'
  teardown_invocation_registry \
    || fail 'stopped-job registry teardown was not stably verified'
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

run_abort_supervisor_case() {
  local log="$test_root/abort-supervisor.log"
  local marker="$test_root/abort-supervisor.ready"
  local supervisor_root
  local control_fifo
  local launch_fifo
  local status_file
  local ready_file
  local hold_fifo
  local launch_record
  local command_record
  local harness_pid
  local harness_identity
  local supervisor_pid
  local supervisor_identity
  local child_pid
  local child_identity
  local attempt

  supervisor_root="$(mktemp -d '/tmp/casn-quality.XXXXXX')"
  register_invocation_temp_root "$supervisor_root" abort-root \
    || fail 'unable to register abort-supervisor temporary root'
  control_fifo="$supervisor_root/active-1.control"
  launch_fifo="$supervisor_root/active-1.launch"
  status_file="$supervisor_root/active-1.status"
  ready_file="$supervisor_root/active-1.ready"
  hold_fifo="$supervisor_root/active-1.hold"
  launch_record="$supervisor_root/active-1.launch-ready"
  command_record="$supervisor_root/active-1.command-ready"
  mkfifo -- "$control_fifo" "$launch_fifo" "$hold_fifo"

  spawn_registered_session "$log" fixture-harness env \
    CASN_ABORT_READY_FILE="$marker" \
    CASN_ABORT_CONTROL_FIFO="$control_fifo" \
    CASN_ABORT_LAUNCH_FIFO="$launch_fifo" \
    CASN_ABORT_LAUNCH_RECORD="$launch_record" \
    CASN_ABORT_COMMAND_RECORD="$command_record" \
    CASN_ABORT_STATUS_FILE="$status_file" \
    CASN_ABORT_SUPERVISOR_READY_FILE="$ready_file" \
    CASN_ABORT_HOLD_FIFO="$hold_fifo" \
    REGISTERED_LAUNCHER="$repository_root/scripts/ci/disposable-registered-process-launcher.sh" \
    IDENTITY_LIBRARY="$identity_library" \
    CASN_REGRESSION_IDENTITY_LIBRARY="$identity_library" \
    CASN_REGRESSION_REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_PROCESS_SUPERVISOR="$process_supervisor" \
    CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    bash -c '
      exec 9<>"$CASN_ABORT_CONTROL_FIFO"
      exec 8<>"$CASN_ABORT_LAUNCH_FIFO"
      setsid bash "$REGISTERED_LAUNCHER" supervisor \
        8 "$CASN_ABORT_LAUNCH_RECORD" 9 "$CASN_ABORT_STATUS_FILE" \
        "$CASN_ABORT_SUPERVISOR_READY_FILE" "$CASN_ABORT_COMMAND_RECORD" \
        bash -c '\''
          trap "" TERM HUP INT
          source "$IDENTITY_LIBRARY"
          owned_pid="$BASHPID"
          identity="$(casn_read_process_identity "$owned_pid")"
          printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$CASN_ABORT_READY_FILE"
          exec 10<>"$CASN_ABORT_HOLD_FIFO"
          while :; do read -r -t 1 _ <&10 || true; done
      '\'' &
      supervisor_job=$!
      while [[ ! -s "$CASN_ABORT_LAUNCH_RECORD" ]]; do
        read -r -t 0.01 _ <&8 || true
      done
      printf "launch\\n" >&8
      exec 8>&-
      wait "$supervisor_job"
    ' || fail 'unable to launch registered abort-supervisor harness'
  harness_pid="$spawned_pid"
  harness_identity="$spawned_identity"

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

  if ! teardown_invocation_registry; then
    fail 'abort-supervisor cleanup did not prove exact process absence'
  fi

  if test_stable_identity_matches "$supervisor_pid" "$supervisor_identity"; then
    fail 'abort cleanup left the separately sessioned supervisor alive'
  fi

  [[ ! -e "$supervisor_root" ]] || fail 'abort cleanup left its exact temporary root'
  printf '[disposable-app-regression] abort-supervisor passed\n'
}

run_abort_lost_authority_case() {
  local log="$test_root/abort-lost-authority.log"
  local marker="$test_root/abort-lost-authority.ready"
  local supervisor_root
  local control_fifo
  local launch_fifo
  local status_file
  local ready_file
  local hold_fifo
  local sibling_record
  local launch_record
  local command_record
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
  register_invocation_temp_root "$supervisor_root" abort-root \
    || fail 'unable to register lost-authority temporary root'
  control_fifo="$supervisor_root/active-1.control"
  launch_fifo="$supervisor_root/active-1.launch"
  status_file="$supervisor_root/active-1.status"
  ready_file="$supervisor_root/active-1.ready"
  hold_fifo="$supervisor_root/active-1.hold"
  sibling_record="$supervisor_root/active-1.sibling-ready"
  launch_record="$supervisor_root/active-1.launch-ready"
  command_record="$supervisor_root/active-1.command-ready"
  mkfifo -- "$control_fifo" "$launch_fifo" "$hold_fifo"

  spawn_registered_session "$log" fixture-harness env \
    CASN_ABORT_READY_FILE="$marker" \
    CASN_ABORT_CONTROL_FIFO="$control_fifo" \
    CASN_ABORT_LAUNCH_FIFO="$launch_fifo" \
    CASN_ABORT_LAUNCH_RECORD="$launch_record" \
    CASN_ABORT_COMMAND_RECORD="$command_record" \
    CASN_ABORT_STATUS_FILE="$status_file" \
    CASN_ABORT_SUPERVISOR_READY_FILE="$ready_file" \
    CASN_ABORT_HOLD_FIFO="$hold_fifo" \
    CASN_ABORT_SIBLING_RECORD="$sibling_record" \
    REGISTERED_LAUNCHER="$repository_root/scripts/ci/disposable-registered-process-launcher.sh" \
    IDENTITY_LIBRARY="$identity_library" \
    CASN_REGRESSION_IDENTITY_LIBRARY="$identity_library" \
    CASN_REGRESSION_REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_PROCESS_SUPERVISOR="$process_supervisor" \
    CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    bash -c '
      exec 9<>"$CASN_ABORT_CONTROL_FIFO"
      exec 8<>"$CASN_ABORT_LAUNCH_FIFO"
      setsid bash "$REGISTERED_LAUNCHER" supervisor \
        8 "$CASN_ABORT_LAUNCH_RECORD" 9 "$CASN_ABORT_STATUS_FILE" \
        "$CASN_ABORT_SUPERVISOR_READY_FILE" "$CASN_ABORT_COMMAND_RECORD" \
        bash -c '\''
          trap "" TERM HUP INT
          source "$IDENTITY_LIBRARY"
          child_pid="$BASHPID"
          child_identity="$(casn_read_process_identity "$child_pid")"
          printf "%s\\n%s\\n" "$child_pid" "$child_identity" >"$CASN_ABORT_READY_FILE"
          exec 10<>"$CASN_ABORT_HOLD_FIFO"
          bash "$REGISTERED_LAUNCHER" hold \
            "$CASN_ABORT_SIBLING_RECORD" "$CASN_ABORT_HOLD_FIFO" fixture-descendant &
          sibling_pid=$!
          while [[ ! -s "$CASN_ABORT_SIBLING_RECORD" ]]; do
            read -r -t 0.01 _ <&10 || true
          done
          while :; do read -r -t 1 _ <&10 || true; done
      '\'' &
      supervisor_job=$!
      while [[ ! -s "$CASN_ABORT_LAUNCH_RECORD" ]]; do
        read -r -t 0.01 _ <&8 || true
      done
      printf "launch\\n" >&8
      exec 8>&-
      wait "$supervisor_job"
    ' || fail 'unable to launch registered lost-authority harness'
  harness_pid="$spawned_pid"
  harness_identity="$spawned_identity"

  for ((attempt = 0; attempt < 100; attempt += 1)); do
    if [[ -s "$marker" && -s "$sibling_record" ]]; then
      break
    fi
    test_identity_matches "$harness_pid" "$harness_identity" \
      || fail 'lost-authority harness exited before readiness'
    sleep 0.05
  done
  if [[ ! -s "$marker" || ! -s "$sibling_record" ]]; then
    tail -n 80 "$log" >&2
    fail 'lost-authority descendants did not become ready within five seconds'
    return 1
  fi

  child_pid="$(sed -n '1p' "$marker")"
  child_identity="$(sed -n '2p' "$marker")"
  sibling_pid="$(sed -n 's/^v1\t[0-9a-f]\{32\}\t\([0-9][0-9]*\)\t.*$/\1/p' "$sibling_record")"
  sibling_identity="$(validate_launcher_record \
    "$sibling_record" "$sibling_pid" fixture-descendant)"
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

  if teardown_invocation_registry; then
    abort_status=0
  else
    abort_status=$?
  fi
  eval "${original_read_definition/casn_read_process_identity_original ()/casn_read_process_identity ()}"

  if ((abort_status == 0)); then
    fail 'abort cleanup reported success after losing supervisor authority'
  fi
  if test_stable_identity_matches "$child_pid" "$child_identity" \
    || test_stable_identity_matches "$sibling_pid" "$sibling_identity"; then
    fail 'lost-authority abort did not clean both exact descendants'
  fi
  if test_stable_identity_matches "$supervisor_pid" "$supervisor_identity"; then
    fail 'lost-authority abort did not clean the exact supervisor'
  fi
  [[ ! -e "/proc/$harness_pid/stat" ]] \
    || fail 'lost-authority abort did not reap the outer harness'

  [[ ! -e "$supervisor_root" ]] || fail 'lost-authority cleanup left its exact temporary root'
  printf '[disposable-app-regression] abort-lost-authority passed\n'
}

run_term_case() {
  local log="$test_root/term.log"
  local marker="$test_root/term.ready"
  local hold_fifo="$test_root/term.hold"
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

  mkfifo -- "$hold_fifo"
  spawn_registered_session "$log" fixture-harness env \
    CASN_TERM_READY_FILE="$marker" \
    CASN_TERM_HOLD_FIFO="$hold_fifo" \
    IDENTITY_LIBRARY="$identity_library" \
    REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    bash "$harness" bash -c '
      set -euo pipefail
      source "$IDENTITY_LIBRARY"
      source "$REGISTRY_LIBRARY"
      owned_pid="$BASHPID"
      identity="$(casn_read_process_identity "$owned_pid")"
      read -r _ _ _ supervisor_pid <<<"$identity"
      supervisor_identity="$(casn_read_process_identity "$supervisor_pid")"
      casn_registry_write_identity \
        "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
        "$supervisor_pid" "$supervisor_identity" fixture-supervisor >/dev/null
      casn_registry_write_identity \
        "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
        "$owned_pid" "$identity" reparent-observation >/dev/null
      marker_temp="${CASN_TERM_READY_FILE}.tmp.$owned_pid"
      printf "%s\n%s\n" "$owned_pid" "$identity" >"$marker_temp"
      mv -- "$marker_temp" "$CASN_TERM_READY_FILE"
      exec 9<>"$CASN_TERM_HOLD_FIFO"
      while :; do read -r -t 1 _ <&9 || true; done
    ' || fail 'unable to launch registered TERM harness fixture'
  harness_pid="$spawned_pid"
  harness_identity="$spawned_identity"

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
    tail -n 80 "$log" >&2
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
  teardown_invocation_registry \
    || fail 'TERM registry teardown and stabilized proof failed'
  printf '[disposable-app-regression] term passed signal_ms=%s cleanup_ms=%s\n' \
    "$signal_elapsed_ms" "$cleanup_elapsed_ms"
}

run_ignored_term_descendant_case() {
  local log="$test_root/term-descendant.log"
  local marker="$test_root/term-descendant.ready"
  local hold_fifo="$test_root/term-descendant.hold"
  local descendant_pid
  local descendant_identity
  local status

  mkfifo -- "$hold_fifo"
  run_owned_bounded "$log" 2400 env \
    CASN_DESCENDANT_READY_FILE="$marker" \
    CASN_DESCENDANT_HOLD_FIFO="$hold_fifo" \
    IDENTITY_LIBRARY="$identity_library" \
    REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    bash "$harness" bash -c '
      set -euo pipefail
      source "$IDENTITY_LIBRARY"
      source "$REGISTRY_LIBRARY"
      command_pid="$BASHPID"
      command_identity="$(casn_read_process_identity "$command_pid")"
      read -r _ _ _ supervisor_pid <<<"$command_identity"
      supervisor_identity="$(casn_read_process_identity "$supervisor_pid")"
      casn_registry_write_identity \
        "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
        "$supervisor_pid" "$supervisor_identity" fixture-supervisor >/dev/null
      casn_registry_write_identity \
        "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
        "$command_pid" "$command_identity" fixture-command >/dev/null
      exec 9<>"$CASN_DESCENDANT_HOLD_FIFO"
      bash -c '\''
        set -euo pipefail
        trap "" TERM HUP INT
        source "$IDENTITY_LIBRARY"
        source "$REGISTRY_LIBRARY"
        owned_pid="$BASHPID"
        identity="$(casn_read_process_identity "$owned_pid")"
        casn_registry_write_identity \
          "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
          "$owned_pid" "$identity" reparent-observation >/dev/null
        marker_temp="${CASN_DESCENDANT_READY_FILE}.tmp.$owned_pid"
        printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$marker_temp"
        mv -- "$marker_temp" "$CASN_DESCENDANT_READY_FILE"
        while :; do read -r -t 1 _ <&9 || true; done
      '\'' &
      for _ in {1..500}; do
        [[ -s "$CASN_DESCENDANT_READY_FILE" ]] && exit 23
        read -r -t 0.01 _ <&9 || true
      done
      exit 97
    '
  status="$owned_run_status"

  descendant_pid="$(sed -n '1p' "$marker")"
  descendant_identity="$(sed -n '2p' "$marker")"
  [[ "$descendant_pid" =~ ^[0-9]+$ && -n "$descendant_identity" ]] \
    || fail 'ignored descendant identity record is invalid'

  if test_stable_identity_matches "$descendant_pid" "$descendant_identity"; then
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
  local hold_fifo="$test_root/term-descendant-signal.hold"
  local harness_pid
  local harness_identity
  local descendant_pid
  local descendant_identity
  local status
  local started_ms
  local signal_ms=''
  local signal_elapsed_ms
  local attempt

  mkfifo -- "$hold_fifo"
  spawn_registered_session "$log" fixture-harness env \
    CASN_DESCENDANT_READY_FILE="$marker" \
    CASN_DESCENDANT_HOLD_FIFO="$hold_fifo" \
    IDENTITY_LIBRARY="$identity_library" \
    REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    bash "$harness" bash -c '
      set -euo pipefail
      source "$IDENTITY_LIBRARY"
      source "$REGISTRY_LIBRARY"
      command_pid="$BASHPID"
      command_identity="$(casn_read_process_identity "$command_pid")"
      read -r _ _ _ supervisor_pid <<<"$command_identity"
      supervisor_identity="$(casn_read_process_identity "$supervisor_pid")"
      casn_registry_write_identity \
        "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
        "$supervisor_pid" "$supervisor_identity" fixture-supervisor >/dev/null
      casn_registry_write_identity \
        "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
        "$command_pid" "$command_identity" fixture-command >/dev/null
      exec 9<>"$CASN_DESCENDANT_HOLD_FIFO"
      bash -c '\''
        set -euo pipefail
        trap "" TERM HUP INT
        source "$IDENTITY_LIBRARY"
        source "$REGISTRY_LIBRARY"
        owned_pid="$BASHPID"
        identity="$(casn_read_process_identity "$owned_pid")"
        casn_registry_write_identity \
          "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
          "$owned_pid" "$identity" reparent-observation >/dev/null
        marker_temp="${CASN_DESCENDANT_READY_FILE}.tmp.$owned_pid"
        printf "%s\\n%s\\n" "$owned_pid" "$identity" >"$marker_temp"
        mv -- "$marker_temp" "$CASN_DESCENDANT_READY_FILE"
        while :; do read -r -t 1 _ <&9 || true; done
      '\'' &
      wait
    ' || fail 'unable to launch registered ignored-TERM signal harness'
  harness_pid="$spawned_pid"
  harness_identity="$spawned_identity"

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
    fail 'ignored-TERM signal acknowledgement exceeded 3 seconds'
  }
  signal_elapsed_ms=$((signal_ms - started_ms))

  for ((attempt = 0; attempt < 150; attempt += 1)); do
    bounded_reap_test_job "$harness_pid" "$harness_identity" 1 && break
  done
  if [[ -z "$reaped_status" ]]; then
    fail 'ignored-TERM signal harness did not finish cleanup within 15 seconds'
  fi
  status="$reaped_status"

  if test_stable_identity_matches "$descendant_pid" "$descendant_identity"; then
    fail 'ignored-TERM signal left the descendant alive'
  fi
  [[ "$status" -eq 143 ]] || fail "ignored-TERM signal expected status 143, received $status"
  ((signal_elapsed_ms < 3000)) || fail "ignored-TERM signal acknowledgement took ${signal_elapsed_ms}ms"
  grep -Fq 'active command required bounded KILL escalation' "$log" \
    || fail 'ignored-TERM signal did not exercise bounded KILL escalation'
  grep -Fq 'verified=1' "$log" || fail 'ignored-TERM signal cleanup was not verified'
  assert_resources_absent "$log"
  teardown_invocation_registry \
    || fail 'ignored-TERM signal registry teardown and stabilized proof failed'
  printf '[disposable-app-regression] ignored-term-signal passed signal_ms=%s\n' "$signal_elapsed_ms"
}

phase_name_is_valid() {
  case "$1" in
    identity-capture|readiness|timeout|termination|reap|status)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

phase_error_is_valid() {
  [[ "$1" =~ ^[a-z][a-z0-9-]{0,47}$ ]]
}

emit_phase_result() {
  local phase="$1"
  local error_class="$2"
  local result_dir="${CASN_REGRESSION_PHASE_RESULT_DIR:-}"
  local pending
  local result

  phase_name_is_valid "$phase" || return 1
  phase_error_is_valid "$error_class" || return 1
  [[ "$result_dir" == "$test_root"/phase.* && -d "$result_dir" && ! -L "$result_dir" ]] \
    || return 1
  pending="$(mktemp "$result_dir/.pending.XXXXXX")" || return 1
  chmod 0600 "$pending" || {
    rm -f -- "$pending"
    return 1
  }
  printf 'v1\t%s\t%s\t%s\n' "$invocation_id" "$phase" "$error_class" >"$pending" || {
    rm -f -- "$pending"
    return 1
  }
  result="$result_dir/result.$BASHPID.${pending##*.}"
  mv -- "$pending" "$result"
}

record_run_failure() {
  local phase="$1"
  local error_class="$2"

  if [[ -n "${CASN_REGRESSION_PHASE_RESULT_DIR:-}" ]]; then
    emit_phase_result "$phase" "$error_class" || return 1
  fi
  printf '[disposable-app-regression] run failure phase=%s error=%s invocation=%s\n' \
    "$phase" "$error_class" "$invocation_id" >&2
}

inject_run_phase_if_requested() {
  local phase="$1"
  local requested="${CASN_REGRESSION_INJECT_PHASE:-}"

  [[ "$requested" == "$phase" ]] || return 1
  record_run_failure "$phase" "injected-$phase" || return 2
  return 0
}

validate_exact_phase_result() {
  local result_dir="$1"
  local expected_phase="$2"
  local expected_error="$3"
  local -a results=()
  local candidate
  local line
  local pattern
  local observed_phase
  local observed_error
  local -A seen_candidates=()

  [[ "$result_dir" == "$test_root"/phase.* && -d "$result_dir" && ! -L "$result_dir" ]] \
    || {
      fail "phase result directory malformed expected=$expected_phase error=$expected_error"
      return 1
    }
  for candidate in "$result_dir"/* "$result_dir"/.[!.]* "$result_dir"/..?*; do
    [[ -e "$candidate" ]] || continue
    [[ -z "${seen_candidates[$candidate]:-}" ]] || continue
    seen_candidates[$candidate]=1
    results+=("$candidate")
  done
  if ((${#results[@]} == 0)); then
    fail "phase result missing expected=$expected_phase error=$expected_error"
    return 1
  fi
  if ((${#results[@]} != 1)); then
    fail "phase result duplicate expected=$expected_phase error=$expected_error count=${#results[@]}"
    return 1
  fi
  candidate="${results[0]}"
  [[ "$candidate" == "$result_dir"/result.* && -f "$candidate" && ! -L "$candidate" ]] || {
    fail "phase result malformed expected=$expected_phase error=$expected_error"
    return 1
  }
  IFS= read -r line 2>/dev/null <"$candidate" || {
    fail "phase result malformed expected=$expected_phase error=$expected_error"
    return 1
  }
  [[ "$(wc -l <"$candidate")" -eq 1 ]] || {
    fail "phase result malformed expected=$expected_phase error=$expected_error"
    return 1
  }
  pattern=$'^v1\t([0-9a-f]{32})\t([a-z][a-z0-9-]{0,31})\t([a-z][a-z0-9-]{0,47})$'
  [[ "$line" =~ $pattern && "${BASH_REMATCH[1]}" == "$invocation_id" ]] || {
    fail "phase result malformed expected=$expected_phase error=$expected_error"
    return 1
  }
  observed_phase="${BASH_REMATCH[2]}"
  observed_error="${BASH_REMATCH[3]}"
  if [[ "$observed_phase" != "$expected_phase" || "$observed_error" != "$expected_error" ]]; then
    fail "phase mismatch expected=$expected_phase observed=$observed_phase error=$observed_error expected_error=$expected_error"
    return 1
  fi
}

registered_authoritative_identities_absent_except() {
  local excluded_pid="$1"
  local selected_class="${2:-all}"
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role
  local role_class
  local failed=0

  for entry in "$identity_registry"/entry.*; do
    [[ -e "$entry" ]] || continue
    if ! record="$(casn_registry_read_entry "$entry" "$identity_registry" "$invocation_id")"; then
      failed=1
      continue
    fi
    read -r pid start_time parent_pid process_group session_id role <<<"$record"
    [[ "$pid" != "$excluded_pid" && "$role" != *-observation ]] || continue
    role_class='command'
    [[ "$role" == *descendant* ]] && role_class=descendant
    [[ "$role" == *supervisor* ]] && role_class=supervisor
    [[ "$role" == *harness* ]] && role_class=harness
    [[ "$selected_class" == 'all' || "$selected_class" == "$role_class" ]] || continue
    if casn_process_identity_matches \
      "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id" \
      || registry_stable_identity_matches "$pid" "$start_time" "$process_group" "$session_id"; then
      failed=1
    fi
  done
  return "$failed"
}

terminate_registered_run() {
  local supervisor_pid="$1"
  local supervisor_identity="$2"
  local control_fd="$3"
  local process_group
  local session_id
  local attempt
  local failed=0
  local group_status
  local role_class

  read -r _ process_group _ session_id <<<"$supervisor_identity"
  for role_class in descendant command supervisor harness; do
    registry_signal_identities TERM "$supervisor_pid" "$role_class" || failed=1
    for ((attempt = 0; attempt < 10; attempt += 1)); do
      registered_authoritative_identities_absent_except \
        "$supervisor_pid" "$role_class" && break
      sleep 0.1
    done
    registry_signal_identities KILL "$supervisor_pid" "$role_class" || failed=1
    for ((attempt = 0; attempt < 50; attempt += 1)); do
      reap_registered_children
      registered_authoritative_identities_absent_except \
        "$supervisor_pid" "$role_class" && break
      sleep 0.1
    done
    registered_authoritative_identities_absent_except \
      "$supervisor_pid" "$role_class" || failed=1
  done
  if casn_process_group_has_members "$process_group" "$session_id" "$supervisor_pid"; then
    failed=1
  else
    group_status=$?
    ((group_status == 1)) || failed=1
  fi
  if ((failed == 0)); then
    stop_owned_supervisor "$supervisor_pid" "$supervisor_identity" "$control_fd" || failed=1
  fi
  return "$failed"
}

validate_launcher_record() {
  local record_file="$1"
  local expected_pid="$2"
  local expected_role="$3"
  local line
  local pattern
  local identity

  [[ "$record_file" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.[a-z-]+$ \
    && -f "$record_file" && ! -L "$record_file" ]] || return 1
  IFS= read -r line 2>/dev/null <"$record_file" || return 1
  [[ "$(wc -l <"$record_file")" -eq 1 ]] || return 1
  pattern=$'^v1\t([0-9a-f]{32})\t([0-9]+)\t([0-9]+ [0-9]+ [0-9]+ [0-9]+)\t([a-z][a-z0-9-]{0,31})$'
  [[ "$line" =~ $pattern && "${BASH_REMATCH[1]}" == "$invocation_id" \
    && "${BASH_REMATCH[2]}" == "$expected_pid" \
    && "${BASH_REMATCH[4]}" == "$expected_role" ]] || return 1
  identity="${BASH_REMATCH[3]}"
  printf '%s\n' "$identity"
}

spawned_pid=''
spawned_identity=''
spawn_registered_session() {
  local log="$1"
  local role="$2"
  shift 2
  local root
  local launch_fifo
  local launch_record
  local launch_fd
  local pid
  local identity
  local attempt

  (($# > 0)) || return 64
  casn_registry_role_is_valid "$role" || return 64
  root="$(mktemp -d '/tmp/casn-quality.XXXXXX')"
  register_invocation_temp_root "$root" fixture-root || {
    rm -rf -- "$root"
    return 1
  }
  launch_fifo="$root/active-1.launch"
  launch_record="$root/active-1.launch-ready"
  mkfifo -- "$launch_fifo"
  exec {launch_fd}<>"$launch_fifo"
  CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    CASN_REGRESSION_IDENTITY_LIBRARY="$identity_library" \
    CASN_REGRESSION_REGISTRY_LIBRARY="$registry_library" \
    setsid bash "$repository_root/scripts/ci/disposable-registered-process-launcher.sh" \
      fixture "$launch_fd" "$launch_record" "$role" -- "$@" >"$log" 2>&1 &
  pid=$!
  for ((attempt = 0; attempt < 100; attempt += 1)); do
    [[ -f "$launch_record" ]] && break
    [[ -e "/proc/$pid/stat" ]] || break
    sleep 0.01
  done
  identity="$(validate_launcher_record "$launch_record" "$pid" "$role")" || {
    exec {launch_fd}>&-
    teardown_invocation_registry || true
    return 1
  }
  printf 'launch\n' >&"$launch_fd"
  exec {launch_fd}>&-
  spawned_pid="$pid"
  spawned_identity="$identity"
}

owned_run_cleanup_verified=0
run_owned_bounded() {
  local log="$1"
  local max_attempts="$2"
  shift 2
  local supervisor_root
  local control_fifo
  local launch_fifo
  local status_file
  local ready_file
  local launch_record
  local command_record
  local control_fd
  local launch_fd
  local supervisor_pid=''
  local supervisor_identity=''
  local command_status=''
  local attempt
  local timed_out=1
  local run_failed=0
  local cleanup_failed=0
  local injected_status

  owned_run_status=''
  owned_run_cleanup_verified=0
  supervisor_root="$(mktemp -d '/tmp/casn-quality.XXXXXX')"
  register_invocation_temp_root "$supervisor_root" bounded-root || {
    rm -rf -- "$supervisor_root"
    fail 'unable to register bounded-run temporary root'
    return 1
  }
  control_fifo="$supervisor_root/active-1.control"
  launch_fifo="$supervisor_root/active-1.launch"
  status_file="$supervisor_root/active-1.status"
  ready_file="$supervisor_root/active-1.ready"
  launch_record="$supervisor_root/active-1.launch-ready"
  command_record="$supervisor_root/active-1.command-ready"
  mkfifo -- "$control_fifo" "$launch_fifo"
  exec {control_fd}<>"$control_fifo"
  exec {launch_fd}<>"$launch_fifo"

  CASN_REGRESSION_IDENTITY_REGISTRY="$identity_registry" \
    CASN_REGRESSION_INVOCATION_ID="$invocation_id" \
    CASN_REGRESSION_IDENTITY_LIBRARY="$identity_library" \
    CASN_REGRESSION_REGISTRY_LIBRARY="$registry_library" \
    CASN_REGRESSION_PROCESS_SUPERVISOR="$process_supervisor" \
    setsid bash "$repository_root/scripts/ci/disposable-registered-process-launcher.sh" \
      supervisor "$launch_fd" "$launch_record" "$control_fd" "$status_file" \
      "$ready_file" "$command_record" "$@" >"$log" 2>&1 &
  supervisor_pid=$!

  for ((attempt = 0; attempt < 100; attempt += 1)); do
    [[ -f "$launch_record" ]] && break
    [[ -e "/proc/$supervisor_pid/stat" ]] || break
    sleep 0.01
  done
  if [[ -f "$launch_record" ]]; then
    supervisor_identity="$(validate_launcher_record \
      "$launch_record" "$supervisor_pid" bounded-supervisor)" || run_failed=1
  else
    run_failed=1
  fi
  if ((run_failed == 0)) && inject_run_phase_if_requested identity-capture; then
    run_failed=1
  else
    injected_status=$?
    if ((injected_status == 2)); then
      run_failed=1
    fi
  fi
  if ((run_failed != 0)) && [[ -n "${CASN_REGRESSION_PHASE_RESULT_DIR:-}" \
    && "${CASN_REGRESSION_INJECT_PHASE:-}" != 'identity-capture' ]]; then
    record_run_failure identity-capture identity-unavailable || true
  fi

  if ((run_failed == 0)); then
    printf 'launch\n' >&"$launch_fd"
    for ((attempt = 0; attempt < 500; attempt += 1)); do
      [[ -f "$ready_file" && -f "$command_record" ]] && break
      test_identity_matches "$supervisor_pid" "$supervisor_identity" || break
      sleep 0.01
    done
    if [[ ! -f "$ready_file" || ! -f "$command_record" ]]; then
      record_run_failure readiness readiness-missing || true
      run_failed=1
    elif ! validate_launcher_record "$command_record" \
      "$(sed -n 's/^v1\t[0-9a-f]\{32\}\t\([0-9][0-9]*\)\t.*$/\1/p' "$command_record")" \
      bounded-command >/dev/null; then
      record_run_failure readiness command-registry-invalid || true
      run_failed=1
    elif inject_run_phase_if_requested readiness; then
      run_failed=1
    else
      injected_status=$?
      ((injected_status != 2)) || run_failed=1
    fi
  fi

  if ((run_failed == 0)); then
    for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
      if [[ -f "$status_file" ]]; then
        timed_out=0
        break
      fi
      test_identity_matches "$supervisor_pid" "$supervisor_identity" || break
      sleep 0.1
    done
    if ((timed_out != 0)); then
      record_run_failure timeout bounded-timeout || true
      run_failed=1
    fi
  fi

  if ((run_failed == 0)); then
    command_status="$(<"$status_file")"
    if [[ ! "$command_status" =~ ^[0-9]+$ || "$command_status" -gt 255 ]]; then
      record_run_failure status malformed-status || true
      run_failed=1
    fi
  fi

  if ((run_failed == 0)) && ! promote_reparented_observations; then
    record_run_failure termination authority-transition-failed || true
    run_failed=1
  fi

  if ((run_failed == 0)); then
    if inject_run_phase_if_requested termination; then
      run_failed=1
    else
      injected_status=$?
      if ((injected_status == 2)); then
        run_failed=1
      elif ! terminate_registered_run "$supervisor_pid" "$supervisor_identity" "$control_fd"; then
        record_run_failure termination termination-failed || true
        run_failed=1
      fi
    fi
  fi

  if ((run_failed == 0)); then
    if inject_run_phase_if_requested reap; then
      run_failed=1
    else
      injected_status=$?
      if ((injected_status == 2)); then
        run_failed=1
      elif ! bounded_reap_test_job "$supervisor_pid" "$supervisor_identity" 50; then
        record_run_failure reap reap-failed || true
        run_failed=1
      fi
    fi
  fi

  exec {launch_fd}>&-
  exec {control_fd}>&-
  teardown_invocation_registry || cleanup_failed=1
  if ((cleanup_failed == 0)); then
    owned_run_cleanup_verified=1
  fi
  if ((run_failed != 0 || cleanup_failed != 0)); then
    return 1
  fi
  owned_run_status="$command_status"
}

run_bounded_error_cleanup_case() {
  local expected_phase="$1"
  local expected_error="$2"
  local actual_phase="${3:-$1}"
  local log="$test_root/bounded-${expected_phase}-${actual_phase}.log"
  local phase_dir="$test_root/phase.${expected_phase}.${actual_phase}.$RANDOM"
  local run_status
  local command='exit 0'

  phase_name_is_valid "$expected_phase" || fail "invalid expected phase: $expected_phase"
  phase_error_is_valid "$expected_error" || fail "invalid expected error: $expected_error"
  phase_name_is_valid "$actual_phase" || fail "invalid actual phase: $actual_phase"
  mkdir -m 0700 "$phase_dir"
  [[ "$actual_phase" != 'readiness' ]] || command='sleep 30'

  if CASN_REGRESSION_PHASE_RESULT_DIR="$phase_dir" \
    CASN_REGRESSION_INJECT_PHASE="$actual_phase" \
    run_owned_bounded "$log" 20 bash -c "$command"; then
    run_status=0
  else
    run_status=$?
  fi
  [[ "$run_status" -ne 0 ]] || fail "bounded-$expected_phase did not exercise its error branch"
  [[ "$owned_run_cleanup_verified" -eq 1 ]] \
    || fail "bounded-$expected_phase cleanup was not verified"
  validate_exact_phase_result "$phase_dir" "$expected_phase" "$expected_error" || return 1
  printf '[disposable-app-regression] bounded-%s-cleanup passed phase=%s error=%s invocation=%s\n' \
    "$expected_phase" "$expected_phase" "$expected_error" "$invocation_id"
}

run_reap_rejects_termination_case() {
  local log="$test_root/phase-reap-rejects-termination.log"
  local fixture_status

  if run_bounded_error_cleanup_case reap injected-reap termination >"$log" 2>&1; then
    fixture_status=0
  else
    fixture_status=$?
  fi
  printf '[disposable-app-regression] phase probe expected=reap observed=termination error=injected-termination status=%s invocation=%s\n' \
    "$fixture_status" "$invocation_id" >&2

  if ((fixture_status == 0)); then
    fail 'reap expectation credited an injected termination failure'
  fi
  grep -Fq 'phase mismatch expected=reap observed=termination error=injected-termination' "$log" \
    || fail 'reap/termination mismatch was not diagnosed exactly'
  prove_invocation_stably_absent 5 \
    || fail 'reap/termination mismatch cleanup was not stably absent'
  printf '[disposable-app-regression] phase-reap-rejects-termination passed\n'
}

run_phase_protocol_validation_case() {
  local missing_dir="$test_root/phase.validation.missing.$RANDOM"
  local duplicate_dir="$test_root/phase.validation.duplicate.$RANDOM"
  local malformed_dir="$test_root/phase.validation.malformed.$RANDOM"
  local exact_dir="$test_root/phase.validation.exact.$RANDOM"
  local log="$test_root/phase-validation.log"
  local pending
  local registry_pending="$identity_registry/.pending.validation"

  mkdir -m 0700 "$missing_dir" "$duplicate_dir" "$malformed_dir" "$exact_dir"
  if validate_exact_phase_result "$missing_dir" termination injected-termination >"$log" 2>&1; then
    fail 'missing phase result was accepted'
  fi
  grep -Fq 'phase result missing expected=termination error=injected-termination' "$log" \
    || fail 'missing phase result diagnostic was not exact'

  CASN_REGRESSION_PHASE_RESULT_DIR="$duplicate_dir" \
    emit_phase_result termination injected-termination
  CASN_REGRESSION_PHASE_RESULT_DIR="$duplicate_dir" \
    emit_phase_result termination injected-termination
  if validate_exact_phase_result "$duplicate_dir" termination injected-termination >"$log" 2>&1; then
    fail 'duplicate phase results were accepted'
  fi
  grep -Fq 'phase result duplicate expected=termination error=injected-termination count=2' "$log" \
    || fail 'duplicate phase result diagnostic was not exact'

  pending="$malformed_dir/.pending.fixture"
  printf 'v1\t%s\ttermination\n' "$invocation_id" >"$pending"
  mv -- "$pending" "$malformed_dir/result.fixture"
  if validate_exact_phase_result "$malformed_dir" termination injected-termination >"$log" 2>&1; then
    fail 'malformed phase result was accepted'
  fi
  grep -Fq 'phase result malformed expected=termination error=injected-termination' "$log" \
    || fail 'malformed phase result diagnostic was not exact'

  CASN_REGRESSION_PHASE_RESULT_DIR="$exact_dir" \
    emit_phase_result termination injected-termination
  validate_exact_phase_result "$exact_dir" termination injected-termination \
    || fail 'exact phase result was rejected'

  printf 'incomplete\n' >"$registry_pending"
  if validate_invocation_registry; then
    fail 'incomplete atomic registry write was accepted'
  fi
  rm -f -- "$registry_pending"
  validate_invocation_registry || fail 'registry remained invalid after pending-write probe'
  printf '[disposable-app-regression] phase-protocol-validation passed\n'
}

run_unexpected_phase_rejected_case() {
  local log="$test_root/phase-unexpected-readiness.log"
  local fixture_status

  if run_bounded_error_cleanup_case \
    termination injected-termination readiness >"$log" 2>&1; then
    fixture_status=0
  else
    fixture_status=$?
  fi
  printf '[disposable-app-regression] phase probe expected=termination observed=readiness error=injected-readiness status=%s invocation=%s\n' \
    "$fixture_status" "$invocation_id" >&2

  if ((fixture_status == 0)); then
    fail 'termination expectation accepted an unexpected readiness failure'
  fi
  grep -Fq 'phase mismatch expected=termination observed=readiness error=injected-readiness' "$log" \
    || fail 'unexpected readiness phase was not diagnosed exactly'
  prove_invocation_stably_absent 5 \
    || fail 'unexpected readiness phase cleanup was not stably absent'
  printf '[disposable-app-regression] phase-unexpected-rejected passed\n'
}

run_registered_survivor_proof_case() {
  local log="$test_root/registered-survivor.log"
  local supervisor_pid
  local supervisor_identity
  local status
  local attempt
  local survived=0

  spawn_registered_session "$log" fixture-supervisor sleep 30 \
    || fail 'unable to launch registered-survivor fixture'
  supervisor_pid="$spawned_pid"
  supervisor_identity="$spawned_identity"
  run_owned_bounded "$test_root/registered-survivor-run.log" 20 bash -c 'exit 0'
  status="$owned_run_status"

  for ((attempt = 0; attempt < 5; attempt += 1)); do
    if test_identity_matches "$supervisor_pid" "$supervisor_identity"; then
      survived=1
    else
      survived=0
      break
    fi
    sleep 0.1
  done
  printf '[disposable-app-regression] registered survivor probe invocation=%s pid=%s identity=%s role=supervisor status=%s stabilized_present=%s registry=%s\n' \
    "$invocation_id" "$supervisor_pid" "$supervisor_identity" "$status" "$survived" "$identity_registry" >&2

  if ((survived != 0)); then
    teardown_invocation_registry || true
    fail 'registered supervisor survived teardown and stabilized post-return proof'
  fi
  [[ "$status" -eq 0 ]] || fail "registered-survivor expected command status 0, received $status"
  prove_invocation_stably_absent 5 \
    || fail 'registered-survivor post-return proof was not stable'
  printf '[disposable-app-regression] registered-survivor-proof passed\n'
}

run_unregistered_process_authority_case() {
  local marker="$test_root/unregistered-authority.ready"
  local unregistered_pid
  local unregistered_identity
  local child_pid
  local child_identity
  local harness_pid
  local harness_identity
  local abort_status
  local attempt
  local unregistered_present
  local child_present

  IDENTITY_LIBRARY="$identity_library" UNREGISTERED_MARKER="$marker" setsid bash -c '
    set -euo pipefail
    source "$IDENTITY_LIBRARY"
    leader_pid="$BASHPID"
    leader_identity="$(casn_read_process_identity "$leader_pid")"
    sleep 30 &
    child_pid=$!
    child_identity="$(casn_read_process_identity "$child_pid")"
    marker_temp="${UNREGISTERED_MARKER}.tmp.$BASHPID"
    printf "%s\\n%s\\n%s\\n%s\\n" \
      "$leader_pid" "$leader_identity" "$child_pid" "$child_identity" >"$marker_temp"
    mv -- "$marker_temp" "$UNREGISTERED_MARKER"
    wait
  ' >/dev/null 2>&1 &
  unregistered_pid=$!
  unregistered_identity="$(capture_test_process_identity "$unregistered_pid")" \
    || fail 'unable to capture unregistered session-leader identity'

  for ((attempt = 0; attempt < 100; attempt += 1)); do
    [[ -s "$marker" ]] && break
    test_identity_matches "$unregistered_pid" "$unregistered_identity" \
      || fail 'unregistered session leader exited before readiness'
    sleep 0.01
  done
  [[ -s "$marker" ]] || fail 'unregistered authority fixture did not become ready'
  [[ "$(sed -n '1p' "$marker")" == "$unregistered_pid" ]] \
    || fail 'unregistered authority marker recorded a different leader'
  child_pid="$(sed -n '3p' "$marker")"
  child_identity="$(sed -n '4p' "$marker")"
  test_identity_matches "$child_pid" "$child_identity" \
    || fail 'unregistered authority child identity changed before probe'

  spawn_registered_session "$test_root/unregistered-authority-harness.log" \
    fixture-harness sleep 30 || fail 'unable to launch registered abort harness'
  harness_pid="$spawned_pid"
  harness_identity="$spawned_identity"
  teardown_invocation_registry && abort_status=0 || abort_status=$?

  test_stable_identity_matches "$unregistered_pid" "$unregistered_identity" \
    && unregistered_present=1 || unregistered_present=0
  test_stable_identity_matches "$child_pid" "$child_identity" \
    && child_present=1 || child_present=0
  printf '[disposable-app-regression] unregistered authority probe invocation=%s abort_status=%s leader_pid=%s leader_identity=%s leader_present=%s child_pid=%s child_identity=%s child_present=%s registry=%s\n' \
    "$invocation_id" "$abort_status" "$unregistered_pid" "$unregistered_identity" \
    "$unregistered_present" "$child_pid" "$child_identity" "$child_present" "$identity_registry" >&2

  if ((unregistered_present == 0 || child_present == 0)); then
    wait_exact_process_absent "$unregistered_pid" "$unregistered_identity" 50 || true
    set +e
    wait "$unregistered_pid" 2>/dev/null
    set -e
    fail 'unregistered process was signalled or adopted as cleanup authority'
  fi
  ((abort_status == 0)) || fail 'registered-only teardown failed during unregistered probe'
  test_stable_identity_matches "$harness_pid" "$harness_identity" \
    && fail 'registered abort harness survived registry teardown'

  register_invocation_identity "$unregistered_pid" "$unregistered_identity" fixture-supervisor \
    || fail 'unable to register proven-unrelated leader for fixture cleanup'
  register_invocation_identity "$child_pid" "$child_identity" fixture-descendant \
    || fail 'unable to register proven-unrelated child for fixture cleanup'
  teardown_invocation_registry \
    || fail 'registered unregistered-authority fixture cleanup failed'
  prove_invocation_stably_absent 5 \
    || fail 'unregistered-authority cleanup proof was not stable'
  printf '[disposable-app-regression] unregistered-authority passed\n'
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
    run_bounded_error_cleanup_case identity-capture injected-identity-capture
    run_bounded_error_cleanup_case readiness injected-readiness
    run_bounded_error_cleanup_case termination injected-termination
    run_bounded_error_cleanup_case reap injected-reap
    ;;
  bounded-termination-cleanup)
    run_bounded_error_cleanup_case termination injected-termination
    ;;
  bounded-reap-cleanup)
    run_bounded_error_cleanup_case reap injected-reap
    ;;
  phase-reap-rejects-termination)
    run_reap_rejects_termination_case
    ;;
  phase-protocol-validation)
    run_phase_protocol_validation_case
    ;;
  phase-unexpected-rejected)
    run_unexpected_phase_rejected_case
    ;;
  registered-survivor-proof)
    run_registered_survivor_proof_case
    ;;
  unregistered-authority)
    run_unregistered_process_authority_case
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
    run_bounded_error_cleanup_case identity-capture injected-identity-capture
    run_bounded_error_cleanup_case readiness injected-readiness
    run_bounded_error_cleanup_case termination injected-termination
    run_bounded_error_cleanup_case reap injected-reap
    run_phase_protocol_validation_case
    run_reap_rejects_termination_case
    run_unexpected_phase_rejected_case
    run_registered_survivor_proof_case
    run_unregistered_process_authority_case
    run_cleanup_query_case docker-proof
    run_cleanup_query_case ss-proof
    run_child_status_case
    run_term_case
    run_ignored_term_descendant_case
    run_ignored_term_signal_case
    ;;
  *)
    printf 'Usage: %s [identity-mismatch|stopped-reap|owned-group-anchor|abort-supervisor|abort-lost-authority|changed-ppid-signal|bounded-error-cleanup|bounded-termination-cleanup|bounded-reap-cleanup|phase-reap-rejects-termination|phase-protocol-validation|phase-unexpected-rejected|registered-survivor-proof|unregistered-authority|docker-proof|ss-proof|child-status|term|term-descendant|term-descendant-signal|all]\n' "$0" >&2
    exit 64
    ;;
esac
