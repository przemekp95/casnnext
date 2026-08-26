#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly script_directory
# shellcheck source=/dev/null
source "$script_directory/common.sh"

readonly mysql_image='mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b'

usage() {
  printf 'Usage: export-production.sh --env-file FILE\n' >&2
  return 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

require_name() {
  [[ "${1-}" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || die 'invalid Docker resource name'
}

require_hash() {
  [[ "${1-}" =~ ^[0-9a-f]{64}$ ]] || die 'invalid expected identity hash'
}

require_source_url() {
  local value="${1-}" port
  if [[ "$value" =~ ^https://[^/@:]+(:[0-9]+)?$ ]]; then
    return 0
  fi
  [[ "$value" =~ ^http://127\.0\.0\.1:([1-9][0-9]{0,4})$ ]] || die 'invalid production source URL'
  port="${BASH_REMATCH[1]}"
  (( 10#$port <= 65535 )) || die 'production source URL port is outside TCP range'
}

resolve_single() {
  local kind="$1" project="$2" logical_key="$3" logical_value="$4" output
  case "$kind" in
    container)
      output="$(docker ps \
        --filter "label=com.docker.compose.project=$project" \
        --filter "label=$logical_key=$logical_value" \
        --format '{{.ID}}')"
      ;;
    volume)
      output="$(docker volume ls \
        --filter "label=com.docker.compose.project=$project" \
        --filter "label=$logical_key=$logical_value" \
        --format '{{.Name}}')"
      ;;
    network)
      output="$(docker network ls \
        --filter "label=com.docker.compose.project=$project" \
        --filter "label=$logical_key=$logical_value" \
        --format '{{.Name}}')"
      ;;
    *) die 'unsupported Docker resource kind' ;;
  esac
  [[ -n "$output" && "$output" != *$'\n'* ]] || die "unable to resolve exactly one $kind"
  printf '%s\n' "$output"
}

wait_for_directus_health() {
  local container_id="$1" status
  for _ in {1..30}; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
    [[ "$status" == healthy || "$status" == running ]] && return 0
    sleep 1
  done
  die 'Directus did not recover after snapshot'
}

write_mysql_env() {
  local destination="$1"
  umask 077
  {
    printf 'MYSQL_PWD=%s\n' "$SNAPSHOT_EXPORT_PASSWORD"
    printf 'SNAPSHOT_EXPORT_USER=%s\n' "$SNAPSHOT_EXPORT_USER"
    printf 'SOURCE_MYSQL_SERVICE=%s\n' "$SOURCE_MYSQL_SERVICE"
    printf 'SOURCE_DATABASE=%s\n' "$source_database"
  } > "$destination"
  chmod 600 "$destination"
}

mysql_query() {
  local sql="$1"
  docker run --rm \
    --network "$source_network" \
    --env-file "$mysql_env_file" \
    "$mysql_image" \
    sh -ec 'MYSQL_PWD="$MYSQL_PWD" exec mysql --batch --skip-column-names --host="$SOURCE_MYSQL_SERVICE" --user="$SNAPSHOT_EXPORT_USER" --database="$SOURCE_DATABASE" --execute "$1"' \
    sh "$sql"
}

dump_database() {
  docker run --rm \
    --network "$source_network" \
    --env-file "$mysql_env_file" \
    "$mysql_image" \
    sh -ec 'MYSQL_PWD="$MYSQL_PWD" exec mysqldump --host="$SOURCE_MYSQL_SERVICE" --user="$SNAPSHOT_EXPORT_USER" --single-transaction --quick --hex-blob --routines --triggers --events --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --skip-dump-date --skip-comments "$SOURCE_DATABASE"'
}

archive_volume() {
  local volume="$1"
  docker run --rm \
    --mount "type=volume,src=$volume,dst=/from,readonly" \
    "$mysql_image" \
    tar -C /from -cf - .
}

count_volume_files() {
  local volume="$1"
  docker run --rm \
    --mount "type=volume,src=$volume,dst=/from,readonly" \
    "$mysql_image" \
    sh -ec 'find /from -type f -print | LC_ALL=C sort | wc -l'
}

normalize_json() {
  jq -S 'if type == "array" then sort_by(.id // .slug // .url // "") else . end'
}

main() {
  local env_file="" preflight_only=0
  while (( $# > 0 )); do
    case "$1" in
      --env-file) [[ $# -ge 2 ]] || usage; env_file="$2"; shift 2 ;;
      --preflight-only) preflight_only=1; shift ;;
      *) usage ;;
    esac
  done
  [[ -n "$env_file" ]] || usage

  require_owner_only_file "$env_file"
  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
  SOURCE_DATABASE="${SOURCE_DATABASE-}"

  local required_variable
  for required_variable in \
    SOURCE_COMPOSE_PROJECT SOURCE_MYSQL_SERVICE SOURCE_DATABASE SOURCE_DIRECTUS_SERVICE \
    SOURCE_DIRECTUS_UPLOADS_VOLUME SOURCE_LEGACY_UPLOADS_VOLUME SOURCE_DOCKER_NETWORK \
    EXPECTED_DATABASE_NAME_HASH EXPECTED_SERVER_UUID_HASH SNAPSHOT_EXPORT_USER \
    SNAPSHOT_EXPORT_PASSWORD SNAPSHOT_AGE_RECIPIENT SNAPSHOT_OUTPUT_DIRECTORY SOURCE_PUBLIC_URL; do
    [[ -n "${!required_variable-}" ]] || die "missing required configuration: $required_variable"
  done

  require_command docker
  require_command curl
  require_command jq
  require_command age
  require_command sha256sum
  require_command tar
  require_command openssl
  require_digest_ref "$mysql_image"
  require_name "$SOURCE_COMPOSE_PROJECT"
  require_name "$SOURCE_MYSQL_SERVICE"
  require_name "$SOURCE_DATABASE"
  require_name "$SOURCE_DIRECTUS_SERVICE"
  require_name "$SOURCE_DIRECTUS_UPLOADS_VOLUME"
  require_name "$SOURCE_LEGACY_UPLOADS_VOLUME"
  require_name "$SOURCE_DOCKER_NETWORK"
  require_name "$SNAPSHOT_EXPORT_USER"
  require_hash "$EXPECTED_DATABASE_NAME_HASH"
  require_hash "$EXPECTED_SERVER_UUID_HASH"
  [[ "$SNAPSHOT_AGE_RECIPIENT" =~ ^age1[0-9a-z]{20,}$ ]] || die 'invalid age recipient'
  require_source_url "$SOURCE_PUBLIC_URL"
  require_empty_directory "$SNAPSHOT_OUTPUT_DIRECTORY"

  resolve_single container "$SOURCE_COMPOSE_PROJECT" com.docker.compose.service "$SOURCE_MYSQL_SERVICE" >/dev/null
  source_directus_id="$(resolve_single container "$SOURCE_COMPOSE_PROJECT" com.docker.compose.service "$SOURCE_DIRECTUS_SERVICE")"
  readonly source_directus_id
  source_directus_volume="$(resolve_single volume "$SOURCE_COMPOSE_PROJECT" com.docker.compose.volume "$SOURCE_DIRECTUS_UPLOADS_VOLUME")"
  readonly source_directus_volume
  source_legacy_volume="$(resolve_single volume "$SOURCE_COMPOSE_PROJECT" com.docker.compose.volume "$SOURCE_LEGACY_UPLOADS_VOLUME")"
  readonly source_legacy_volume
  source_network="$(resolve_single network "$SOURCE_COMPOSE_PROJECT" com.docker.compose.network "$SOURCE_DOCKER_NETWORK")"
  readonly source_network

  staging_directory="$(mktemp -d /tmp/casn-production-snapshot.XXXXXXXX)"
  readonly staging_directory
  chmod 700 "$staging_directory"
  mysql_env_file="$staging_directory/mysql.env"
  readonly mysql_env_file
  writer_was_stopped=0

  cleanup() {
    local exit_status=$?
    trap - EXIT INT TERM
    set +e
    if (( writer_was_stopped )); then
      docker start "$source_directus_id" >/dev/null
      wait_for_directus_health "$source_directus_id" || exit_status=1
    fi
    case "$staging_directory" in
      /tmp/casn-production-snapshot.*) rm -rf -- "$staging_directory" ;;
      *) exit_status=1 ;;
    esac
    exit "$exit_status"
  }
  trap cleanup EXIT INT TERM

  source_database="$SOURCE_DATABASE"
  write_mysql_env "$mysql_env_file"
  actual_source_database="$(mysql_query 'SELECT DATABASE();')"
  readonly actual_source_database
  write_mysql_env "$mysql_env_file"
  [[ "$actual_source_database" == "$source_database" ]] || die 'database connection selected an unexpected database'
  [[ "$(sha256_value "$source_database")" == "$EXPECTED_DATABASE_NAME_HASH" ]] || die 'database name identity mismatch'
  source_server_uuid="$(mysql_query 'SELECT @@server_uuid;')"
  readonly source_server_uuid
  [[ "$(sha256_value "$source_server_uuid")" == "$EXPECTED_SERVER_UUID_HASH" ]] || die 'database server identity mismatch'
  [[ "$(mysql_query "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE NOT IN ('InnoDB');")" == 0 ]] ||
    die 'non-transactional application tables block snapshot'
  wait_for_directus_health "$source_directus_id"

  database_tables="$(mysql_query "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE';")"
  database_views="$(mysql_query 'SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE();')"
  database_triggers="$(mysql_query 'SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();')"
  database_routines="$(mysql_query 'SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE();')"
  database_events="$(mysql_query 'SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE();')"

  if (( preflight_only )); then
    printf 'preflight verified: database_objects=%s\n' "$((database_tables + database_views + database_triggers + database_routines + database_events))"
    return 0
  fi

  snapshot_id="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
  readonly snapshot_id
  require_snapshot_id "$snapshot_id"
  captured_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  readonly captured_at

  writer_was_stopped=1
  docker stop --time 30 "$source_directus_id" >/dev/null

  dump_database > "$staging_directory/database.sql"
  archive_volume "$source_directus_volume" > "$staging_directory/directus-uploads.tar"
  archive_volume "$source_legacy_volume" > "$staging_directory/legacy-uploads.tar"
  chmod 600 "$staging_directory/database.sql" "$staging_directory/directus-uploads.tar" "$staging_directory/legacy-uploads.tar"

  curl -fsS --max-time 30 "$SOURCE_PUBLIC_URL/api/authors" | normalize_json > "$staging_directory/authors.json"
  curl -fsS --max-time 30 "$SOURCE_PUBLIC_URL/api/analyses" | normalize_json > "$staging_directory/analyses.json"
  curl -fsS --max-time 30 "$SOURCE_PUBLIC_URL/sitemap.xml" \
    | sed -n 's:.*<loc>\([^<]*\)</loc>.*:\1:p' \
    | sed -E 's#^https?://[^/]+##' \
    | LC_ALL=C sort > "$staging_directory/sitemap.paths"
  chmod 600 "$staging_directory/authors.json" "$staging_directory/analyses.json" "$staging_directory/sitemap.paths"

  directus_files="$(count_volume_files "$source_directus_volume")"
  legacy_files="$(count_volume_files "$source_legacy_volume")"
  authors_count="$(jq 'length' "$staging_directory/authors.json")"
  analyses_count="$(jq 'length' "$staging_directory/analyses.json")"
  sitemap_count="$(wc -l < "$staging_directory/sitemap.paths" | tr -d ' ')"

  jq -n \
    --arg snapshot_id "$snapshot_id" \
    --arg captured_at "$captured_at" \
    --arg database_name_hash "$(sha256_value "$source_database")" \
    --arg server_uuid_hash "$(sha256_value "$source_server_uuid")" \
    --arg authors_hash "$(sha256sum "$staging_directory/authors.json" | awk '{print $1}')" \
    --arg analyses_hash "$(sha256sum "$staging_directory/analyses.json" | awk '{print $1}')" \
    --arg sitemap_hash "$(sha256sum "$staging_directory/sitemap.paths" | awk '{print $1}')" \
    --argjson tables "$database_tables" \
    --argjson views "$database_views" \
    --argjson triggers "$database_triggers" \
    --argjson routines "$database_routines" \
    --argjson events "$database_events" \
    --argjson directus_files "$directus_files" \
    --argjson legacy_files "$legacy_files" \
    --argjson authors_count "$authors_count" \
    --argjson analyses_count "$analyses_count" \
    --argjson sitemap_count "$sitemap_count" \
    '{
      snapshotId: $snapshot_id,
      capturedAt: $captured_at,
      source: {databaseNameHash: $database_name_hash, serverUuidHash: $server_uuid_hash},
      database: {tables: $tables, views: $views, triggers: $triggers, routines: $routines, events: $events},
      media: {directus: {files: $directus_files}, legacy: {files: $legacy_files}},
      public: {
        authors: {count: $authors_count, sha256: $authors_hash},
        analyses: {count: $analyses_count, sha256: $analyses_hash},
        sitemap: {count: $sitemap_count, sha256: $sitemap_hash}
      }
    }' > "$staging_directory/snapshot.json"
  chmod 600 "$staging_directory/snapshot.json"

  bash "$script_directory/manifest.sh" build \
    --input "$staging_directory" \
    --output "$staging_directory/$snapshot_id.manifest.json"
  bash "$script_directory/manifest.sh" verify \
    --manifest "$staging_directory/$snapshot_id.manifest.json" \
    --payload-dir "$staging_directory"

  tar -C "$staging_directory" -cf "$staging_directory/$snapshot_id.payload.tar" \
    database.sql directus-uploads.tar legacy-uploads.tar
  chmod 600 "$staging_directory/$snapshot_id.payload.tar"
  age -r "$SNAPSHOT_AGE_RECIPIENT" \
    -o "$SNAPSHOT_OUTPUT_DIRECTORY/$snapshot_id.casn-snapshot.age" \
    "$staging_directory/$snapshot_id.payload.tar"
  install -m 600 "$staging_directory/$snapshot_id.manifest.json" \
    "$SNAPSHOT_OUTPUT_DIRECTORY/$snapshot_id.manifest.json"

  printf 'snapshot created: %s\n' "$snapshot_id"
}

main "$@"
