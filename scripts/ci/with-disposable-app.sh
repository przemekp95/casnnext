#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly script_directory
# shellcheck source=scripts/ci/disposable-process-identity.sh
source "$script_directory/disposable-process-identity.sh"
readonly process_supervisor="$script_directory/disposable-process-supervisor.sh"

readonly app_host='127.0.0.1'
readonly app_port='31337'
readonly app_base_url="http://${app_host}:${app_port}"
readonly mysql_image='mysql:8.4'
readonly mysql_database='casn'
readonly mysql_user='casn'
mysql_password="$(openssl rand -hex 18)"
mysql_root_password="$(openssl rand -hex 18)"
container_name="casn-quality-${$}-$(openssl rand -hex 6)-mysql"
readonly mysql_password mysql_root_password container_name

temp_dir=''
app_pid=''
mysql_port=''
active_pid=''
active_pgid=''
active_start_time=''
active_parent_pid=''
active_session_id=''
active_control_fd=''
active_control_fifo=''
active_status_file=''
active_ready_file=''
active_sequence=0
app_start_time=''
app_pgid=''
app_parent_pid=''
app_session_id=''
app_identity=''
ownership_verification_failed=0

fail() {
  printf '[disposable-app] ERROR: %s\n' "$1" >&2
  exit 1
}

port_is_listening() {
  local output

  if ! output="$(ss -H -ltn "sport = :${app_port}" 2>&1)"; then
    printf '[disposable-app] Unable to query port %s: %s\n' "$app_port" "$output" >&2
    return 2
  fi
  [[ -n "$output" ]]
}

mysql_is_running() {
  [[ "$(docker container inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null)" == 'true' ]]
}

capture_owned_process_identity() {
  local pid="$1"
  local require_group_leader="$2"
  local identity
  local process_group
  local parent_pid
  local session_id
  local attempt

  for ((attempt = 0; attempt < 500; attempt += 1)); do
    if identity="$(casn_read_process_identity "$pid")"; then
      read -r _ process_group parent_pid session_id <<<"$identity"
      if [[ "$parent_pid" == "$$" ]]; then
        if [[ "$require_group_leader" == '0' \
          || ("$process_group" == "$pid" && "$session_id" == "$pid") ]]; then
          printf '%s\n' "$identity"
          return 0
        fi
      fi
    elif [[ ! -e "/proc/$pid/stat" ]]; then
      return 1
    fi
    sleep 0.01
  done
  return 1
}

active_identity_matches() {
  casn_process_identity_matches \
    "$active_pid" "$active_start_time" "$active_pgid" "$active_parent_pid" "$active_session_id"
}

app_identity_matches() {
  casn_process_identity_matches \
    "$app_pid" "$app_start_time" "$app_pgid" "$app_parent_pid" "$app_session_id"
}

signal_owned_app() {
  local signal_name="$1"

  app_identity_matches || return 1
  kill -"$signal_name" "$app_pid"
}

reap_owned_app_bounded() {
  local max_attempts="$1"
  local state
  local attempt

  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    if app_identity_matches; then
      state="$(casn_read_process_state "$app_pid")" || return 2
      if [[ "$state" == 'Z' ]]; then
        wait "$app_pid" 2>/dev/null || true
        return 0
      fi
    elif [[ ! -e "/proc/$app_pid/stat" ]]; then
      wait "$app_pid" 2>/dev/null || true
      return 0
    else
      return 2
    fi
    sleep 0.1
  done
  return 1
}

clear_active_identity() {
  if [[ "$active_control_fd" =~ ^[0-9]+$ ]]; then
    exec {active_control_fd}>&- || true
  fi
  if [[ -n "$active_control_fifo" && "$active_control_fifo" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.control$ ]]; then
    rm -f -- "$active_control_fifo"
  fi
  if [[ -n "$active_status_file" && "$active_status_file" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.status$ ]]; then
    rm -f -- "$active_status_file"
  fi
  if [[ -n "$active_ready_file" && "$active_ready_file" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.ready$ ]]; then
    rm -f -- "$active_ready_file"
  fi
  active_pid=''
  active_pgid=''
  active_start_time=''
  active_parent_pid=''
  active_session_id=''
  active_control_fd=''
  active_control_fifo=''
  active_status_file=''
  active_ready_file=''
}

active_group_has_members() {
  casn_process_group_has_members "$active_pgid" "$active_session_id" "$active_pid"
}

signal_active_group() {
  local signal_name="$1"

  active_identity_matches || return 1
  kill -"$signal_name" -- "-$active_pgid"
}

request_active_supervisor_stop() {
  active_identity_matches || return 1
  printf 'stop\n' >&"$active_control_fd"
}

reap_active_supervisor_bounded() {
  local max_attempts="$1"
  local state
  local attempt

  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    if active_identity_matches; then
      state="$(casn_read_process_state "$active_pid")" || return 2
      if [[ "$state" == 'Z' ]]; then
        wait "$active_pid" 2>/dev/null || true
        return 0
      fi
    elif [[ ! -e "/proc/$active_pid/stat" ]]; then
      wait "$active_pid" 2>/dev/null || true
      return 0
    else
      return 2
    fi
    sleep 0.1
  done
  return 1
}

wait_for_active_group_members_to_exit() {
  local max_attempts="$1"
  local attempt

  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    active_group_has_members || return 0
    sleep 0.1
  done
  ! active_group_has_members
}

terminate_active_command() {
  local termination_failed=0

  [[ "$active_pid" =~ ^[0-9]+$ ]] || return 0

  if ! active_identity_matches; then
    if [[ -e "/proc/$active_pid/stat" ]]; then
      printf '[disposable-app] Refusing to signal active PID %s: durable identity mismatch.\n' "$active_pid" >&2
      ownership_verification_failed=1
      termination_failed=1
    else
      if ! reap_active_supervisor_bounded 1; then
        termination_failed=1
      fi
    fi
    clear_active_identity
    return "$termination_failed"
  fi

  if ! signal_active_group TERM; then
    printf '[disposable-app] Unable to signal the durably owned active group %s with TERM.\n' "$active_pgid" >&2
    ownership_verification_failed=1
    termination_failed=1
  elif ! wait_for_active_group_members_to_exit 10; then
    if signal_active_group KILL; then
      printf '[disposable-app] active command required bounded KILL escalation group=%s\n' "$active_pgid" >&2
    else
      printf '[disposable-app] Refusing KILL for active group %s: supervisor identity changed.\n' "$active_pgid" >&2
      ownership_verification_failed=1
      termination_failed=1
    fi
  else
    request_active_supervisor_stop || {
      printf '[disposable-app] Unable to stop the durably owned active supervisor %s.\n' "$active_pid" >&2
      ownership_verification_failed=1
      termination_failed=1
    }
  fi

  if ! reap_active_supervisor_bounded 50; then
    printf '[disposable-app] Active supervisor did not become safely reapable within 5 seconds: %s\n' "$active_pid" >&2
    ownership_verification_failed=1
    termination_failed=1
  fi
  if ! wait_for_active_group_members_to_exit 50; then
    printf '[disposable-app] Owned active group still has members after bounded cleanup: %s\n' "$active_pgid" >&2
    ownership_verification_failed=1
    termination_failed=1
  fi
  clear_active_identity
  return "$termination_failed"
}

handle_signal() {
  local signal_status="$1"
  printf '[disposable-app] signal received status=%s\n' "$signal_status" >&2
  if terminate_active_command; then
    printf '[disposable-app] signal active command terminated status=%s\n' "$signal_status" >&2
  else
    printf '[disposable-app] signal active command ownership verification failed status=%s\n' "$signal_status" >&2
  fi
  exit "$signal_status"
}

run_interruptible() {
  local command_status
  local identity
  local attempt
  local finalization_failed=0

  active_sequence=$((active_sequence + 1))
  active_control_fifo="$temp_dir/active-${active_sequence}.control"
  active_status_file="$temp_dir/active-${active_sequence}.status"
  active_ready_file="$temp_dir/active-${active_sequence}.ready"
  mkfifo -- "$active_control_fifo"
  exec {active_control_fd}<>"$active_control_fifo"

  setsid "$process_supervisor" \
    "$active_control_fd" "$active_status_file" "$active_ready_file" "$@" &
  active_pid=$!
  active_pgid=$active_pid

  if identity="$(capture_owned_process_identity "$active_pid" 1)"; then
    read -r active_start_time active_pgid active_parent_pid active_session_id <<<"$identity"
  elif [[ -e "/proc/$active_pid/stat" ]]; then
    printf '[disposable-app] Unable to capture durable identity for active PID %s.\n' "$active_pid" >&2
    ownership_verification_failed=1
    return 1
  fi

  for ((attempt = 0; attempt < 500; attempt += 1)); do
    [[ -f "$active_ready_file" ]] && break
    active_identity_matches || break
    sleep 0.01
  done
  [[ -f "$active_ready_file" ]] || {
    printf '[disposable-app] Active supervisor failed readiness: %s\n' "$active_pid" >&2
    terminate_active_command || true
    return 1
  }

  while [[ ! -f "$active_status_file" ]]; do
    if ! active_identity_matches; then
      printf '[disposable-app] Active supervisor exited before recording command status: %s\n' "$active_pid" >&2
      ownership_verification_failed=1
      reap_active_supervisor_bounded 1 || true
      clear_active_identity
      return 1
    fi
    sleep 0.05
  done

  command_status="$(<"$active_status_file")"
  [[ "$command_status" =~ ^[0-9]+$ && "$command_status" -le 255 ]] || {
    printf '[disposable-app] Active supervisor recorded invalid command status: %s\n' "$command_status" >&2
    terminate_active_command || true
    return 1
  }

  if active_group_has_members; then
    terminate_active_command || finalization_failed=1
  else
    request_active_supervisor_stop || finalization_failed=1
    reap_active_supervisor_bounded 50 || finalization_failed=1
    clear_active_identity
  fi

  if ((finalization_failed != 0)); then
    ownership_verification_failed=1
    ((command_status != 0)) || command_status=1
  fi
  return "$command_status"
}

cleanup() {
  local original_status="$1"
  local cleanup_failed="$ownership_verification_failed"
  local attempt
  local container_inventory=''
  local port_status=0

  trap - EXIT INT TERM
  set +e

  terminate_active_command || cleanup_failed=1
  ((ownership_verification_failed == 0)) || cleanup_failed=1

  if [[ "$app_pid" =~ ^[0-9]+$ ]]; then
    if app_identity_matches; then
      signal_owned_app TERM || cleanup_failed=1
      for attempt in {1..50}; do
        if app_identity_matches; then
          if [[ "$(casn_read_process_state "$app_pid")" == 'Z' ]]; then
            break
          fi
          sleep 0.1
        else
          if [[ -e "/proc/$app_pid/stat" ]]; then
            printf '[disposable-app] Refusing further signals to app PID %s: durable identity changed.\n' "$app_pid" >&2
            cleanup_failed=1
          fi
          break
        fi
      done
      if app_identity_matches; then
        if [[ "$(casn_read_process_state "$app_pid")" != 'Z' ]]; then
          signal_owned_app KILL || cleanup_failed=1
        fi
      fi
    elif [[ -e "/proc/$app_pid/stat" ]]; then
      printf '[disposable-app] Refusing to signal app PID %s: durable identity mismatch.\n' "$app_pid" >&2
      cleanup_failed=1
    fi
    reap_owned_app_bounded 50 || cleanup_failed=1
    if app_identity_matches; then
      printf '[disposable-app] Owned application process still exists after cleanup: %s\n' "$app_pid" >&2
      cleanup_failed=1
    fi
  fi

  if [[ "$container_name" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]]; then
    docker container rm --force "$container_name" >/dev/null 2>&1 || true
  else
    printf '[disposable-app] Refusing cleanup for invalid container name: %s\n' "$container_name" >&2
    cleanup_failed=1
  fi

  if [[ -n "$temp_dir" ]]; then
    if [[ "$temp_dir" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ && -d "$temp_dir" ]]; then
      rm -rf -- "$temp_dir" || cleanup_failed=1
    elif [[ -e "$temp_dir" ]]; then
      printf '[disposable-app] Refusing cleanup for invalid temp directory: %s\n' "$temp_dir" >&2
      cleanup_failed=1
    fi
  fi
  if [[ -n "$temp_dir" && -e "$temp_dir" ]]; then
    printf '[disposable-app] Temp directory still exists after cleanup: %s\n' "$temp_dir" >&2
    cleanup_failed=1
  fi

  if ! container_inventory="$(docker container ls -a --format '{{.Names}}' 2>&1)"; then
    printf '[disposable-app] Unable to verify Docker container absence: %s\n' "$container_inventory" >&2
    cleanup_failed=1
  elif grep -Fxq "$container_name" <<<"$container_inventory"; then
    printf '[disposable-app] Container still exists after cleanup: %s\n' "$container_name" >&2
    cleanup_failed=1
  fi

  for ((attempt = 0; attempt < 20; attempt += 1)); do
    if port_is_listening; then
      port_status=0
    else
      port_status=$?
      break
    fi
    sleep 0.1
  done
  if ((port_status == 0)); then
    printf '[disposable-app] Port %s is still occupied after cleanup.\n' "$app_port" >&2
    cleanup_failed=1
  elif ((port_status == 2)); then
    cleanup_failed=1
  fi

  printf '[disposable-app] cleanup container=%s app_pid=%s temp_dir=%s verified=%s\n' \
    "$container_name" "${app_pid:-none}" "${temp_dir:-none}" "$((cleanup_failed == 0))"

  if ((original_status == 0 && cleanup_failed != 0)); then
    exit 1
  fi
  exit "$original_status"
}

trap 'cleanup "$?"' EXIT
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

wait_for_mysql() {
  local deadline=$((SECONDS + 180))
  local logs
  local ready_phases

  while ((SECONDS < deadline)); do
    if ! mysql_is_running; then
      docker logs "$container_name" >&2 2>/dev/null || true
      fail "MySQL container exited before final-server readiness: $container_name"
    fi

    logs="$(docker logs "$container_name" 2>&1 || true)"
    ready_phases="$(grep -c 'ready for connections' <<<"$logs" || true)"

    if ((ready_phases >= 2)) && grep -Eq 'ready for connections.*port: 3306' <<<"$logs"; then
      if docker exec \
        --env "MYSQL_PWD=${mysql_password}" \
        "$container_name" \
        mysql --protocol=TCP --host=127.0.0.1 --port=3306 \
          --user="$mysql_user" --database="$mysql_database" \
          --batch --skip-column-names --execute='SELECT 1' 2>/dev/null \
          | grep -qx '1'; then
        printf '[disposable-app] MySQL final server ready phases=%s application_user_select=ok\n' "$ready_phases"
        return
      fi
    fi

    sleep 1
  done

  docker logs "$container_name" >&2 2>/dev/null || true
  fail 'MySQL readiness timed out after 180 seconds.'
}

wait_for_app() {
  local deadline=$((SECONDS + 180))

  while ((SECONDS < deadline)); do
    if ! mysql_is_running; then
      fail "MySQL container exited while waiting for the application: $container_name"
    fi
    if ! app_identity_matches; then
      sed -n '1,240p' "$temp_dir/app.log" >&2 || true
      if [[ -e "/proc/$app_pid/stat" ]]; then
        fail "Application PID identity changed before health readiness: $app_pid"
      fi
      fail "Application process exited before health readiness: $app_pid"
    fi
    if curl --fail --silent --show-error --max-time 2 "$app_base_url/api/health" >/dev/null 2>&1; then
      printf '[disposable-app] Application healthy pid=%s url=%s\n' "$app_pid" "$app_base_url"
      return
    fi
    sleep 1
  done

  sed -n '1,240p' "$temp_dir/app.log" >&2 || true
  fail 'Application health readiness timed out after 180 seconds.'
}

if (($# == 0)); then
  fail 'Usage: with-disposable-app.sh <command> [args...]'
fi

[[ -x "$process_supervisor" ]] \
  || fail "Disposable process supervisor is unavailable or not executable: $process_supervisor"

for required_command in curl docker mktemp npm node openssl setsid ss; do
  command -v "$required_command" >/dev/null 2>&1 || fail "Required command is unavailable: $required_command"
done

if port_is_listening; then
  fail "Refusing to start because ${app_host}:${app_port} is already occupied."
else
  port_status=$?
  ((port_status == 1)) || fail "Unable to verify that ${app_host}:${app_port} is free."
fi

[[ "$container_name" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]] \
  || fail "Generated invalid container name: $container_name"

temp_dir="$(mktemp -d '/tmp/casn-quality.XXXXXX')"
[[ "$temp_dir" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+$ && -d "$temp_dir" ]] \
  || fail "Generated invalid temp directory: $temp_dir"

printf '[disposable-app] resources container=%s temp_dir=%s\n' "$container_name" "$temp_dir"

docker run --detach \
  --name "$container_name" \
  --env "MYSQL_ROOT_PASSWORD=${mysql_root_password}" \
  --env "MYSQL_DATABASE=${mysql_database}" \
  --env "MYSQL_USER=${mysql_user}" \
  --env "MYSQL_PASSWORD=${mysql_password}" \
  --publish '127.0.0.1::3306' \
  "$mysql_image" >/dev/null

mysql_port="$(docker port "$container_name" 3306/tcp | sed -n 's/^127\.0\.0\.1:\([0-9][0-9]*\)$/\1/p')"
[[ "$mysql_port" =~ ^[0-9]+$ ]] || fail 'Docker did not allocate a loopback MySQL port.'
((mysql_port >= 1 && mysql_port <= 65535)) || fail "Docker allocated invalid MySQL port: $mysql_port"

readonly database_url="mysql://${mysql_user}:${mysql_password}@127.0.0.1:${mysql_port}/${mysql_database}"
printf '[disposable-app] mysql_port=%s image=%s\n' "$mysql_port" "$mysql_image"

wait_for_mysql

run_interruptible env \
  RUN_DB_MIGRATIONS=1 \
  DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS \
  DATABASE_URL="$database_url" \
  npm run migration:run

mysql_is_running || fail "MySQL container exited after migrations: $container_name"

run_interruptible npm run build

mysql_is_running || fail "MySQL container exited during application build: $container_name"

HOSTNAME="$app_host" \
PORT="$app_port" \
NODE_ENV=production \
DATABASE_URL="$database_url" \
node server.cjs >"$temp_dir/app.log" 2>&1 &
app_pid=$!

if app_identity="$(capture_owned_process_identity "$app_pid" 0)"; then
  read -r app_start_time app_pgid app_parent_pid app_session_id <<<"$app_identity"
else
  if [[ -e "/proc/$app_pid/stat" ]]; then
    ownership_verification_failed=1
  fi
  fail "Unable to capture durable identity for application PID: $app_pid"
fi

wait_for_app

set +e
run_interruptible env \
  DATABASE_URL="$database_url" \
  LIVE_BASE_URL="$app_base_url" \
  CYPRESS_baseUrl="$app_base_url" \
  "$@"
child_status=$?
set -e

infrastructure_failed=0
if ! mysql_is_running; then
  printf '[disposable-app] MySQL container exited while the child command ran: %s\n' "$container_name" >&2
  infrastructure_failed=1
fi
if ! app_identity_matches; then
  printf '[disposable-app] Application process exited while the child command ran: %s\n' "$app_pid" >&2
  infrastructure_failed=1
fi
if ((child_status == 0 && infrastructure_failed != 0)); then
  child_status=1
fi

exit "$child_status"
