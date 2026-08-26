#!/usr/bin/env bash
set -euo pipefail

readonly DIRECTUS_PINNED_IMAGE="directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869"
readonly RECEIVER_IMAGE="node:22.23.2-alpine"
readonly MYSQL_IMAGE="mysql:8.4"
readonly WAIT_TIMEOUT_SECONDS=180
readonly CURL_MAX_TIME_SECONDS=5

DIRECTUS_IMAGE="${DIRECTUS_IMAGE:-$DIRECTUS_PINNED_IMAGE}"
if [[ "$DIRECTUS_IMAGE" != "$DIRECTUS_PINNED_IMAGE" ]]; then
  echo "DIRECTUS_IMAGE must equal the repository-pinned digest: $DIRECTUS_PINNED_IMAGE" >&2
  exit 1
fi

for command in curl docker jq mktemp node npm openssl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command" >&2
    exit 1
  fi
done

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/ci/directus-smoke-http.sh
source "$repository_root/scripts/ci/directus-smoke-http.sh"
invocation_id="$(date +%s)-$$-$(openssl rand -hex 8)"
readonly invocation_id

DIRECTUS_CONTAINER_NAME="casn-directus-${invocation_id}"
MYSQL_CONTAINER_NAME="casn-mysql-${invocation_id}"
RECEIVER_CONTAINER_NAME="casn-receiver-${invocation_id}"
SMOKE_NETWORK_NAME="casn-network-${invocation_id}"
MYSQL_VOLUME_NAME="casn-mysql-data-${invocation_id}"
DIRECTUS_UPLOADS_VOLUME_NAME="casn-directus-uploads-${invocation_id}"
DIRECTUS_EXTENSIONS_VOLUME_NAME="casn-directus-extensions-${invocation_id}"
readonly DIRECTUS_CONTAINER_NAME MYSQL_CONTAINER_NAME RECEIVER_CONTAINER_NAME
readonly SMOKE_NETWORK_NAME MYSQL_VOLUME_NAME
readonly DIRECTUS_UPLOADS_VOLUME_NAME DIRECTUS_EXTENSIONS_VOLUME_NAME

MYSQL_DATABASE="casn_smoke"
MYSQL_USER="casn_smoke"
MYSQL_ROOT_PASSWORD="$(openssl rand -hex 32)"
MYSQL_PASSWORD="$(openssl rand -hex 32)"
DIRECTUS_ADMIN_EMAIL="casn-directus-${invocation_id}@example.com"
DIRECTUS_ADMIN_PASSWORD="$(openssl rand -hex 32)"
DIRECTUS_KEY="$(openssl rand -hex 32)"
DIRECTUS_SECRET="$(openssl rand -hex 32)"
REVALIDATE_SECRET="$(openssl rand -hex 32)"
EDITOR_EMAIL="casn-editor-${invocation_id}@example.com"
EDITOR_PASSWORD="$(openssl rand -hex 32)"
readonly MYSQL_DATABASE MYSQL_USER MYSQL_ROOT_PASSWORD MYSQL_PASSWORD
readonly DIRECTUS_ADMIN_EMAIL DIRECTUS_ADMIN_PASSWORD DIRECTUS_KEY DIRECTUS_SECRET
readonly REVALIDATE_SECRET EDITOR_EMAIL EDITOR_PASSWORD

runtime_directory="$(mktemp -d "${TMPDIR:-/tmp}/casn-directus-smoke.XXXXXXXX")"
readonly runtime_directory
receiver_events="$runtime_directory/events.jsonl"
receiver_script="$runtime_directory/receiver.mjs"
response_file="$runtime_directory/response.json"
migration_log="$runtime_directory/migration.log"
mysql_env_file="$runtime_directory/mysql.env"
receiver_env_file="$runtime_directory/receiver.env"
directus_env_file="$runtime_directory/directus.env"
request_headers_file="$runtime_directory/request.headers"
request_body_file="$runtime_directory/request.json"
readonly receiver_events receiver_script response_file migration_log
readonly mysql_env_file receiver_env_file directus_env_file
readonly request_headers_file request_body_file
: >"$receiver_events"
: >"$response_file"
: >"$request_headers_file"
: >"$request_body_file"
chmod 600 "$receiver_events" "$response_file" "$request_headers_file" "$request_body_file"

{
  printf 'MYSQL_ROOT_PASSWORD=%s\n' "$MYSQL_ROOT_PASSWORD"
  printf 'MYSQL_DATABASE=%s\n' "$MYSQL_DATABASE"
  printf 'MYSQL_USER=%s\n' "$MYSQL_USER"
  printf 'MYSQL_PASSWORD=%s\n' "$MYSQL_PASSWORD"
} >"$mysql_env_file"
chmod 600 "$mysql_env_file"

{
  printf 'EVIDENCE_PATH=/evidence/events.jsonl\n'
  printf 'REVALIDATE_SECRET=%s\n' "$REVALIDATE_SECRET"
} >"$receiver_env_file"
chmod 600 "$receiver_env_file"

{
  printf 'KEY=%s\n' "$DIRECTUS_KEY"
  printf 'SECRET=%s\n' "$DIRECTUS_SECRET"
  printf 'ADMIN_EMAIL=%s\n' "$DIRECTUS_ADMIN_EMAIL"
  printf 'ADMIN_PASSWORD=%s\n' "$DIRECTUS_ADMIN_PASSWORD"
  printf 'DB_CLIENT=mysql\n'
  printf 'DB_HOST=mysql\n'
  printf 'DB_PORT=3306\n'
  printf 'DB_DATABASE=%s\n' "$MYSQL_DATABASE"
  printf 'DB_USER=%s\n' "$MYSQL_USER"
  printf 'DB_PASSWORD=%s\n' "$MYSQL_PASSWORD"
  printf 'DIRECTUS_INTERNAL_URL=http://127.0.0.1:8055\n'
  printf 'PUBLIC_URL=http://directus:8055\n'
  printf 'DIRECTUS_REVALIDATE_URL=http://receiver:3000/api/revalidate\n'
  printf 'REVALIDATE_SECRET=%s\n' "$REVALIDATE_SECRET"
  printf 'TELEMETRY=false\n'
} >"$directus_env_file"
chmod 600 "$directus_env_file"

resources_started=0

diagnostics() {
  echo "Directus smoke failed; collecting bounded disposable-resource diagnostics." >&2
  for container in "$MYSQL_CONTAINER_NAME" "$RECEIVER_CONTAINER_NAME" "$DIRECTUS_CONTAINER_NAME"; do
    if docker container inspect "$container" >/dev/null 2>&1; then
      echo "--- $container (inspect) ---" >&2
      docker container inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$container" >&2 || true
      echo "--- $container (last 200 log lines) ---" >&2
      docker logs --tail 200 "$container" >&2 || true
    fi
  done
  if [[ -s "$receiver_events" ]]; then
    echo "--- receiver evidence ---" >&2
    tail -n 20 "$receiver_events" >&2 || true
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  if (( status != 0 )) && (( resources_started == 1 )); then
    diagnostics
  fi

  docker rm -fv "$DIRECTUS_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm -fv "$RECEIVER_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm -fv "$MYSQL_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker network rm "$SMOKE_NETWORK_NAME" >/dev/null 2>&1 || true
  docker volume rm "$DIRECTUS_UPLOADS_VOLUME_NAME" >/dev/null 2>&1 || true
  docker volume rm "$DIRECTUS_EXTENSIONS_VOLUME_NAME" >/dev/null 2>&1 || true
  docker volume rm "$MYSQL_VOLUME_NAME" >/dev/null 2>&1 || true

  local cleanup_failed=0
  for container in "$DIRECTUS_CONTAINER_NAME" "$RECEIVER_CONTAINER_NAME" "$MYSQL_CONTAINER_NAME"; do
    if docker container inspect "$container" >/dev/null 2>&1; then
      echo "Cleanup left disposable container behind: $container" >&2
      cleanup_failed=1
    fi
  done
  if docker network inspect "$SMOKE_NETWORK_NAME" >/dev/null 2>&1; then
    echo "Cleanup left disposable network behind: $SMOKE_NETWORK_NAME" >&2
    cleanup_failed=1
  fi
  for volume in "$DIRECTUS_UPLOADS_VOLUME_NAME" "$DIRECTUS_EXTENSIONS_VOLUME_NAME" "$MYSQL_VOLUME_NAME"; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
      echo "Cleanup left disposable volume behind: $volume" >&2
      cleanup_failed=1
    fi
  done

  case "$runtime_directory" in
    "${TMPDIR:-/tmp}"/casn-directus-smoke.*) rm -rf -- "$runtime_directory" ;;
    *)
      echo "Refusing to remove unexpected runtime directory: $runtime_directory" >&2
      cleanup_failed=1
      ;;
  esac

  if (( cleanup_failed == 0 )); then
    echo "Cleanup verified for invocation ${invocation_id}: 3 containers, 1 network, 3 volumes absent."
  elif (( status == 0 )); then
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_until() {
  local description="$1"
  shift
  local started_at now attempt_status
  started_at="$(date +%s)"

  while true; do
    if "$@"; then
      return 0
    else
      attempt_status=$?
    fi
    if (( attempt_status == 2 )); then
      echo "A disposable container exited while waiting for ${description}." >&2
      return 1
    fi
    now="$(date +%s)"
    if (( now - started_at >= WAIT_TIMEOUT_SECONDS )); then
      echo "Timed out after ${WAIT_TIMEOUT_SECONDS}s waiting for ${description}." >&2
      return 1
    fi
    sleep 2
  done
}

mysql_is_ready() {
  if [[ "$(docker container inspect --format '{{.State.Running}}' "$MYSQL_CONTAINER_NAME" 2>/dev/null)" != "true" ]]; then
    return 2
  fi
  docker exec "$MYSQL_CONTAINER_NAME" sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqladmin ping --protocol=TCP --host=127.0.0.1 --port=3306 --user=root --silent' \
    >/dev/null 2>&1
}

receiver_is_ready() {
  if [[ "$(docker container inspect --format '{{.State.Running}}' "$RECEIVER_CONTAINER_NAME" 2>/dev/null)" != "true" ]]; then
    return 2
  fi
  docker exec "$RECEIVER_CONTAINER_NAME" node -e \
    "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
    >/dev/null 2>&1
}

directus_ping_is_ready() {
  if [[ "$(docker container inspect --format '{{.State.Running}}' "$DIRECTUS_CONTAINER_NAME" 2>/dev/null)" != "true" ]]; then
    return 2
  fi
  curl --globoff --fail --silent --show-error \
    --connect-timeout 2 \
    --max-time "$CURL_MAX_TIME_SECONDS" \
    "${DIRECTUS_BASE_URL}/server/ping" >/dev/null 2>&1
}

directus_bootstrap_is_ready() {
  directus_ping_is_ready &&
    docker exec "$DIRECTUS_CONTAINER_NAME" test -f /directus/.casn_bootstrapped
}

resolve_directus_base_url() {
  local port_mapping host_port
  port_mapping="$(docker port "$DIRECTUS_CONTAINER_NAME" 8055/tcp)"
  host_port="${port_mapping##*:}"
  if [[ ! "$host_port" =~ ^[0-9]+$ ]]; then
    echo "Unable to resolve disposable Directus host port from: $port_mapping" >&2
    return 1
  fi
  DIRECTUS_BASE_URL="http://127.0.0.1:${host_port}"
  echo "Directus host endpoint: ${DIRECTUS_BASE_URL}"
}

prepare_request_files() {
  local token="$1"
  local body="$2"
  : >"$request_headers_file"
  : >"$request_body_file"
  printf 'Accept: application/json\n' >>"$request_headers_file"
  if [[ -n "$token" ]]; then
    printf 'Authorization: Bearer %s\n' "$token" >>"$request_headers_file"
  fi
  if [[ -n "$body" ]]; then
    printf 'Content-Type: application/json\n' >>"$request_headers_file"
    printf '%s' "$body" >"$request_body_file"
  fi
}

api_json() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local code
  local curl_arguments=(
    --globoff
    --silent
    --show-error
    --connect-timeout 2
    --max-time "$CURL_MAX_TIME_SECONDS"
    --request "$method"
    --header "@$request_headers_file"
  )

  prepare_request_files "$token" "$body"
  if [[ -n "$body" ]]; then
    curl_arguments+=(--data-binary "@$request_body_file")
  fi

  if ! code="$(
    perform_http_request \
      "$response_file" \
      "${curl_arguments[@]}" \
      "${DIRECTUS_BASE_URL}${path}"
  )"; then
    echo "Directus API transport failed: ${method} ${path}." >&2
    return 1
  fi
  if [[ ! "$code" =~ ^2[0-9][0-9]$ ]]; then
    echo "Directus API request failed: ${method} ${path} returned ${code}" >&2
    if [[ -s "$response_file" ]]; then
      jq -c . "$response_file" >&2 2>/dev/null || cat "$response_file" >&2
    fi
    return 1
  fi
  cat "$response_file"
}

login() {
  local email="$1"
  local password="$2"
  local payload
  payload="$(
    LOGIN_EMAIL="$email" LOGIN_PASSWORD="$password" \
      jq -cn '{email:env.LOGIN_EMAIL,password:env.LOGIN_PASSWORD}'
  )"
  api_json POST /auth/login "" "$payload" | jq -er '.data.access_token'
}

urlencode() {
  jq -nr --arg value "$1" '$value | @uri'
}

expect_single() {
  local description="$1"
  local path="$2"
  local payload count
  payload="$(api_json GET "$path" "$admin_token")"
  count="$(jq -er '.data | length' <<<"$payload")"
  if [[ "$count" != "1" ]]; then
    echo "Expected exactly one ${description}, found ${count}." >&2
    jq -c . <<<"$payload" >&2
    return 1
  fi
  jq -er '.data[0].id' <<<"$payload"
}

verify_collection_metadata() {
  local collection="$1"
  local icon="$2"
  local display_template="$3"
  local payload
  payload="$(api_json GET "/collections/${collection}" "$admin_token")"
  jq -e \
    --arg collection "$collection" \
    --arg icon "$icon" \
    --arg display_template "$display_template" \
    '.data.collection == $collection
      and .data.meta.hidden == false
      and .data.meta.singleton == false
      and .data.meta.icon == $icon
      and .data.meta.display_template == $display_template
      and (.data.meta.note | type == "string" and length > 0)' \
    <<<"$payload" >/dev/null
}

expect_anonymous_denial() {
  local collection="$1"
  local body="$2"
  local code
  prepare_request_files "" "$body"
  if ! code="$(
    perform_http_request \
      "$response_file" \
      --globoff --silent --show-error \
      --connect-timeout 2 \
      --max-time "$CURL_MAX_TIME_SECONDS" \
      --request POST \
      --header "@$request_headers_file" \
      --data-binary "@$request_body_file" \
      "${DIRECTUS_BASE_URL}/items/${collection}"
  )"; then
    echo "Anonymous denial check hit a transport failure for ${collection}." >&2
    return 1
  fi
  if [[ "$code" != "401" && "$code" != "403" ]]; then
    echo "Expected anonymous POST /items/${collection} to return 401/403, got ${code}." >&2
    cat "$response_file" >&2 || true
    return 1
  fi
}

verify_item_field() {
  local collection="$1"
  local item_id="$2"
  local field="$3"
  local expected="$4"
  api_json GET "/items/${collection}/${item_id}" "$editor_token" \
    | jq -e --arg field "$field" --arg expected "$expected" '.data[$field] == $expected' >/dev/null
}

expect_technical_field_forbidden() {
  local method="$1"
  local path="$2"
  local token="$3"
  local body="$4"
  local expected_field="$5"
  local code
  prepare_request_files "$token" "$body"
  if ! code="$(
    perform_http_request \
      "$response_file" \
      --globoff --silent --show-error \
      --connect-timeout 2 \
      --max-time "$CURL_MAX_TIME_SECONDS" \
      --request "$method" \
      --header "@$request_headers_file" \
      --data-binary "@$request_body_file" \
      "${DIRECTUS_BASE_URL}${path}"
  )"; then
    echo "Technical-field check hit a transport failure for ${method} ${path}." >&2
    return 1
  fi
  if [[ "$code" != "403" ]]; then
    echo "Expected technical-field guard to return 403 for ${method} ${path}, got ${code}." >&2
    cat "$response_file" >&2 || true
    return 1
  fi
  jq -e \
    --arg field "$expected_field" \
    '.errors[0].extensions.code == "FORBIDDEN" and (.errors[0].message | contains($field))' \
    "$response_file" >/dev/null
}

verify_technical_fields_null() {
  local collection="$1"
  local item_id="$2"
  local database_state

  case "$collection" in
    Author | Analysis | IssueCollection) ;;
    *)
      echo "Refusing technical-field SQL check for unmanaged collection: $collection" >&2
      return 1
      ;;
  esac
  if [[ ! "$item_id" =~ ^[0-9]+$ ]]; then
    echo "Refusing technical-field SQL check for non-numeric item id: $item_id" >&2
    return 1
  fi

  api_json GET "/items/${collection}/${item_id}?fields=id,strapiId,sourceHash" "$editor_token" \
    | jq -e '.data.strapiId == null and .data.sourceHash == null' >/dev/null

  database_state="$(
    docker exec "$MYSQL_CONTAINER_NAME" sh -c \
      'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --host=127.0.0.1 --user="$MYSQL_USER" --database="$MYSQL_DATABASE" --batch --skip-column-names --execute "$1"' \
      sh \
      "SELECT IF(strapiId IS NULL, 'NULL', 'SET'), IF(sourceHash IS NULL, 'NULL', 'SET') FROM \`${collection}\` WHERE id = ${item_id} LIMIT 1;"
  )"
  if [[ "$database_state" != $'NULL\tNULL' ]]; then
    echo "Database technical-field check failed for ${collection}/${item_id}: ${database_state:-no row}" >&2
    return 1
  fi
}

receiver_has_analysis_events() {
  local expected_item_id="$1"
  jq -e -s \
    --argjson expected_item_id "$expected_item_id" \
    '[.[] | select(
      .method == "POST"
      and .path == "/api/revalidate"
      and .secretMatches == true
      and .body.model == "Analysis"
    )] as $events
    | ($events | length == 2)
      and (($events | map(.body.event) | sort) == ["Analysis.items.create", "Analysis.items.update"])
      and any(
        $events[];
        .body.event == "Analysis.items.create"
          and ((.body.key | tostring) == ($expected_item_id | tostring))
      )
      and any(
        $events[];
        .body.event == "Analysis.items.update"
          and ((.body.keys | map(tostring)) == [($expected_item_id | tostring)])
      )' \
    "$receiver_events" >/dev/null 2>&1
}

cat >"$receiver_script" <<'EOF_RECEIVER'
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const evidencePath = process.env.EVIDENCE_PATH;
if (!evidencePath) throw new Error("EVIDENCE_PATH is required");
const expectedSecret = process.env.REVALIDATE_SECRET;
if (!expectedSecret) throw new Error("REVALIDATE_SECRET is required");

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ready"}');
    return;
  }

  let rawBody = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    rawBody += chunk;
  });
  request.on("end", () => {
    let body = null;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      body = { invalidJson: rawBody };
    }
    appendFileSync(
      evidencePath,
        `${JSON.stringify({
          method: request.method,
          path: request.url,
          secretMatches: request.headers["x-directus-secret"] === expectedSecret,
          body,
      })}\n`,
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
  });
});

server.listen(3000, "0.0.0.0", () => console.log("receiver-ready"));
EOF_RECEIVER

echo "Directus smoke topology (${invocation_id}):"
echo "  network=${SMOKE_NETWORK_NAME}"
echo "  containers=${MYSQL_CONTAINER_NAME},${RECEIVER_CONTAINER_NAME},${DIRECTUS_CONTAINER_NAME}"
echo "  volumes=${MYSQL_VOLUME_NAME},${DIRECTUS_UPLOADS_VOLUME_NAME},${DIRECTUS_EXTENSIONS_VOLUME_NAME}"

docker network create "$SMOKE_NETWORK_NAME" >/dev/null
docker volume create "$MYSQL_VOLUME_NAME" >/dev/null
docker volume create "$DIRECTUS_UPLOADS_VOLUME_NAME" >/dev/null
docker volume create "$DIRECTUS_EXTENSIONS_VOLUME_NAME" >/dev/null
resources_started=1

echo "Starting disposable MySQL..."
docker run --detach \
  --name "$MYSQL_CONTAINER_NAME" \
  --network "$SMOKE_NETWORK_NAME" \
  --network-alias mysql \
  --publish 127.0.0.1::3306 \
  --volume "$MYSQL_VOLUME_NAME:/var/lib/mysql" \
  --env-file "$mysql_env_file" \
  "$MYSQL_IMAGE" >/dev/null
wait_until "MySQL readiness" mysql_is_ready

mysql_port_mapping="$(docker port "$MYSQL_CONTAINER_NAME" 3306/tcp)"
mysql_host_port="${mysql_port_mapping##*:}"
if [[ ! "$mysql_host_port" =~ ^[0-9]+$ ]]; then
  echo "Unable to resolve disposable MySQL host port from: $mysql_port_mapping" >&2
  exit 1
fi

echo "Applying repository migrations to the disposable database..."
if ! NODE_ENV=production \
  RUN_DB_MIGRATIONS=1 \
  DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS \
  DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${mysql_host_port}/${MYSQL_DATABASE}" \
  npm run migration:run >"$migration_log" 2>&1; then
  echo "Repository migration failed; last 200 migration log lines:" >&2
  tail -n 200 "$migration_log" >&2 || true
  exit 1
fi
echo "Repository migrations completed."

echo "Starting pinned webhook receiver..."
docker run --detach \
  --name "$RECEIVER_CONTAINER_NAME" \
  --network "$SMOKE_NETWORK_NAME" \
  --network-alias receiver \
  --env-file "$receiver_env_file" \
  --volume "$receiver_script:/receiver.mjs:ro" \
  --volume "$receiver_events:/evidence/events.jsonl" \
  "$RECEIVER_IMAGE" node /receiver.mjs >/dev/null
wait_until "webhook receiver readiness" receiver_is_ready

echo "Starting pinned Directus through the repository entrypoint..."
docker run --detach \
  --name "$DIRECTUS_CONTAINER_NAME" \
  --network "$SMOKE_NETWORK_NAME" \
  --publish 127.0.0.1::8055 \
  --env-file "$directus_env_file" \
  --volume "$repository_root/directus/start.sh:/directus/start.sh:ro" \
  --volume "$repository_root/directus/bootstrap.cjs:/directus/bootstrap.cjs:ro" \
  --volume "$DIRECTUS_UPLOADS_VOLUME_NAME:/directus/uploads" \
  --volume "$DIRECTUS_EXTENSIONS_VOLUME_NAME:/directus/extensions" \
  --volume "$repository_root/directus/extensions/directus-extension-casn-field-guard:/directus/extensions/directus-extension-casn-field-guard:ro" \
  --entrypoint /directus/start.sh \
  "$DIRECTUS_IMAGE" >/dev/null

resolve_directus_base_url

wait_until "Directus ping and repository bootstrap marker" directus_bootstrap_is_ready
admin_token="$(login "$DIRECTUS_ADMIN_EMAIL" "$DIRECTUS_ADMIN_PASSWORD")"

echo "Verifying managed collection metadata..."
verify_collection_metadata Author person '{{displayName}}'
verify_collection_metadata Analysis article '{{title}}'
verify_collection_metadata IssueCollection folder '{{title}}'

echo "Restarting Directus against the same disposable database..."
docker restart "$DIRECTUS_CONTAINER_NAME" >/dev/null
resolve_directus_base_url
wait_until "Directus ping and bootstrap marker after restart" directus_bootstrap_is_ready
admin_token="$(login "$DIRECTUS_ADMIN_EMAIL" "$DIRECTUS_ADMIN_PASSWORD")"

echo "Verifying admin technical-field guard..."
expect_technical_field_forbidden \
  POST \
  /items/Author \
  "$admin_token" \
  "$(jq -cn --arg slug "admin-guard-${invocation_id}" '{slug:$slug,name:"Admin Guard",displayName:"Admin Guard",strapiId:9001}')" \
  strapiId

echo "Verifying bootstrap idempotency..."
role_name="CASN Editor"
policy_name="CASN Editor Policy"
flow_name="CASN Revalidate Website Cache"
operation_key="revalidate"
role_id="$(expect_single "role named ${role_name}" "/roles?filter[name][_eq]=$(urlencode "$role_name")&limit=2")"
policy_id="$(expect_single "policy named ${policy_name}" "/policies?filter[name][_eq]=$(urlencode "$policy_name")&limit=2")"
expect_single \
  "role-policy access tuple" \
  "/access?filter[role][_eq]=$(urlencode "$role_id")&filter[policy][_eq]=$(urlencode "$policy_id")&limit=2" >/dev/null
for collection in Author Analysis IssueCollection; do
  for action in read create update delete; do
    expect_single \
      "${collection}/${action} permission tuple" \
      "/permissions?filter[policy][_eq]=$(urlencode "$policy_id")&filter[collection][_eq]=$(urlencode "$collection")&filter[action][_eq]=$(urlencode "$action")&limit=2" >/dev/null
  done
done
flow_id="$(expect_single "flow named ${flow_name}" "/flows?filter[name][_eq]=$(urlencode "$flow_name")&limit=2")"
expect_single \
  "flow operation tuple" \
  "/operations?filter[flow][_eq]=$(urlencode "$flow_id")&filter[key][_eq]=$(urlencode "$operation_key")&limit=2" >/dev/null

echo "Verifying anonymous create denial on every managed collection..."
expect_anonymous_denial Author "$(jq -cn --arg slug "anonymous-${invocation_id}" '{slug:$slug,name:"Anonymous",displayName:"Anonymous"}')"
expect_anonymous_denial Analysis "$(jq -cn --arg slug "anonymous-analysis-${invocation_id}" '{title:"Anonymous",slug:$slug,authorId:2}')"
expect_anonymous_denial IssueCollection "$(jq -cn '{year:20991231,title:"Anonymous",fileUrl:"/cms/uploads/anonymous.pdf"}')"

echo "Creating a disposable CASN Editor user..."
editor_user_body="$(
  EDITOR_EMAIL_INPUT="$EDITOR_EMAIL" \
    EDITOR_PASSWORD_INPUT="$EDITOR_PASSWORD" \
    EDITOR_ROLE_INPUT="$role_id" \
    jq -cn \
      '{first_name:"CASN",last_name:"Smoke Editor",email:env.EDITOR_EMAIL_INPUT,password:env.EDITOR_PASSWORD_INPUT,role:env.EDITOR_ROLE_INPUT,status:"active"}'
)"
api_json POST /users "$admin_token" "$editor_user_body" >/dev/null
editor_token="$(login "$EDITOR_EMAIL" "$EDITOR_PASSWORD")"

draft_suffix="${invocation_id//[^a-zA-Z0-9]/-}"
issue_year=$((20000000 + 16#${invocation_id:0:6}))

echo "Exercising editor CRUD with allowed Author fields..."
expect_technical_field_forbidden \
  POST \
  /items/Author \
  "$editor_token" \
  "$(jq -cn --arg slug "guard-author-${draft_suffix}" '{slug:$slug,name:"Guard",displayName:"Guard",strapiId:9001}')" \
  strapiId
author_body="$(
  jq -cn \
    --arg slug "smoke-author-${draft_suffix}" \
    '{slug:$slug,name:"Smoke Author",displayName:"Smoke Author",bio:"Disposable draft",publishedAt:null}'
)"
author_id="$(api_json POST /items/Author "$editor_token" "$author_body" | jq -er '.data.id')"
verify_item_field Author "$author_id" displayName "Smoke Author"
expect_technical_field_forbidden PATCH "/items/Author/${author_id}" "$editor_token" '{"sourceHash":"forbidden"}' sourceHash
verify_technical_fields_null Author "$author_id"
api_json PATCH "/items/Author/${author_id}" "$editor_token" '{"displayName":"Smoke Author Updated"}' >/dev/null
verify_item_field Author "$author_id" displayName "Smoke Author Updated"

echo "Exercising editor CRUD with allowed Analysis fields and triggering create/update flow..."
expect_technical_field_forbidden \
  POST \
  /items/Analysis \
  "$editor_token" \
  "$(jq -cn --arg slug "guard-analysis-${draft_suffix}" --argjson author_id "$author_id" '{title:"Guard",slug:$slug,authorId:$author_id,sourceHash:"forbidden"}')" \
  sourceHash
analysis_body="$(
  jq -cn \
    --arg slug "smoke-analysis-${draft_suffix}" \
    --argjson author_id "$author_id" \
    '{title:"Smoke Analysis",slug:$slug,authorId:$author_id,lead:"Disposable draft",category:"smoke",contentMdx:"Smoke",publishedAt:null}'
)"
analysis_id="$(api_json POST /items/Analysis "$editor_token" "$analysis_body" | jq -er '.data.id')"
verify_item_field Analysis "$analysis_id" title "Smoke Analysis"
expect_technical_field_forbidden PATCH "/items/Analysis/${analysis_id}" "$editor_token" '{"strapiId":9001}' strapiId
verify_technical_fields_null Analysis "$analysis_id"
api_json PATCH "/items/Analysis/${analysis_id}" "$editor_token" '{"title":"Smoke Analysis Updated"}' >/dev/null
verify_item_field Analysis "$analysis_id" title "Smoke Analysis Updated"

wait_until "exact item-bound Analysis create/update webhook pair" receiver_has_analysis_events "$analysis_id"
webhook_events="$(
  jq -r -s \
    '[.[] | select(.method == "POST" and .path == "/api/revalidate" and .secretMatches == true and .body.model == "Analysis") | .body.event] | sort | join(",")' \
    "$receiver_events"
)"
echo "Observed Directus webhook model casing: Analysis (events=${webhook_events})."

echo "Exercising editor CRUD with allowed IssueCollection fields..."
expect_technical_field_forbidden \
  POST \
  /items/IssueCollection \
  "$editor_token" \
  "$(jq -cn --argjson year "$((issue_year + 1))" '{year:$year,title:"Guard",fileUrl:"/cms/uploads/guard.pdf",strapiId:9001}')" \
  strapiId
issue_body="$(
  jq -cn \
    --argjson year "$issue_year" \
    '{year:$year,title:"Smoke Issue",fileUrl:"/cms/uploads/smoke.pdf",coverUrl:"/cms/uploads/smoke.webp",publishedAt:null}'
)"
issue_id="$(api_json POST /items/IssueCollection "$editor_token" "$issue_body" | jq -er '.data.id')"
verify_item_field IssueCollection "$issue_id" title "Smoke Issue"
expect_technical_field_forbidden PATCH "/items/IssueCollection/${issue_id}" "$editor_token" '{"sourceHash":"forbidden"}' sourceHash
verify_technical_fields_null IssueCollection "$issue_id"
api_json PATCH "/items/IssueCollection/${issue_id}" "$editor_token" '{"title":"Smoke Issue Updated"}' >/dev/null
verify_item_field IssueCollection "$issue_id" title "Smoke Issue Updated"

echo "Technical-field immutability is enforced by the loaded repository hook."
api_json DELETE "/items/IssueCollection/${issue_id}" "$editor_token" >/dev/null
api_json DELETE "/items/Analysis/${analysis_id}" "$editor_token" >/dev/null
api_json DELETE "/items/Author/${author_id}" "$editor_token" >/dev/null

echo "Directus disposable topology smoke passed."
