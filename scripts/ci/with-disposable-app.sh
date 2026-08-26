#!/usr/bin/env bash
set -euo pipefail

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

fail() {
  printf '[disposable-app] ERROR: %s\n' "$1" >&2
  exit 1
}

port_is_listening() {
  ss -H -ltn "sport = :${app_port}" 2>/dev/null | grep -q .
}

mysql_is_running() {
  [[ "$(docker container inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null)" == 'true' ]]
}

cleanup() {
  local original_status="$1"
  local cleanup_failed=0
  local attempt

  trap - EXIT INT TERM
  set +e

  if [[ "$app_pid" =~ ^[0-9]+$ ]]; then
    if kill -0 "$app_pid" 2>/dev/null; then
      kill "$app_pid" 2>/dev/null
      for attempt in {1..50}; do
        kill -0 "$app_pid" 2>/dev/null || break
        sleep 0.1
      done
      if kill -0 "$app_pid" 2>/dev/null; then
        kill -KILL "$app_pid" 2>/dev/null
      fi
    fi
    wait "$app_pid" 2>/dev/null
  fi

  if [[ "$container_name" =~ ^casn-quality-[0-9]+-[0-9a-f]{12}-mysql$ ]]; then
    if docker container inspect "$container_name" >/dev/null 2>&1; then
      docker container rm --force "$container_name" >/dev/null 2>&1 || cleanup_failed=1
    fi
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

  if docker container inspect "$container_name" >/dev/null 2>&1; then
    printf '[disposable-app] Container still exists after cleanup: %s\n' "$container_name" >&2
    cleanup_failed=1
  fi

  for ((attempt = 0; attempt < 20; attempt += 1)); do
    port_is_listening || break
    sleep 0.1
  done
  if port_is_listening; then
    printf '[disposable-app] Port %s is still occupied after cleanup.\n' "$app_port" >&2
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
trap 'exit 130' INT
trap 'exit 143' TERM

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
    if ! kill -0 "$app_pid" 2>/dev/null; then
      sed -n '1,240p' "$temp_dir/app.log" >&2 || true
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

for required_command in curl docker mktemp npm node openssl ss; do
  command -v "$required_command" >/dev/null 2>&1 || fail "Required command is unavailable: $required_command"
done

if port_is_listening; then
  fail "Refusing to start because ${app_host}:${app_port} is already occupied."
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

RUN_DB_MIGRATIONS=1 \
DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS \
DATABASE_URL="$database_url" \
npm run migration:run

mysql_is_running || fail "MySQL container exited after migrations: $container_name"

npm run build

mysql_is_running || fail "MySQL container exited during application build: $container_name"

HOSTNAME="$app_host" \
PORT="$app_port" \
NODE_ENV=production \
DATABASE_URL="$database_url" \
node server.cjs >"$temp_dir/app.log" 2>&1 &
app_pid=$!

wait_for_app

set +e
DATABASE_URL="$database_url" \
LIVE_BASE_URL="$app_base_url" \
CYPRESS_baseUrl="$app_base_url" \
"$@"
child_status=$?
set -e

if ! mysql_is_running; then
  printf '[disposable-app] MySQL container exited while the child command ran: %s\n' "$container_name" >&2
  child_status=1
fi
if ! kill -0 "$app_pid" 2>/dev/null; then
  printf '[disposable-app] Application process exited while the child command ran: %s\n' "$app_pid" >&2
  child_status=1
fi

exit "$child_status"
