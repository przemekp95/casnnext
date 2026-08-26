#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly script_directory
repository_root="$(cd "$script_directory/../.." && pwd -P)"
readonly repository_root
# shellcheck source=/dev/null
source "$script_directory/common.sh"

readonly mysql_image='mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b'
readonly directus_image='directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869'
readonly database_name=casn_local

usage() {
  printf '%s\n' \
    'Usage: import-local.sh --artifact FILE --manifest FILE --identity FILE' \
    '                       --env-file FILE --snapshot-id ID' >&2
  return 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

require_port() {
  [[ "${1-}" =~ ^[1-9][0-9]{0,4}$ ]] || die 'invalid local port'
  (( 10#$1 <= 65535 )) || die 'local port is outside TCP range'
}

require_local_image_ref() {
  local value="${1-}"
  if [[ "$value" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    return 0
  fi
  require_digest_ref "$value"
}

require_local_url() {
  local value="$1" expected_suffix="${2-}"
  [[ "$value" =~ ^http://(127\.0\.0\.1|localhost):([1-9][0-9]{0,4})(/.*)?$ ]] || die 'URL is not loopback HTTP'
  [[ "${BASH_REMATCH[2]}" == "$CASN_LOCAL_HTTP_PORT" ]] || die 'URL port differs from local HTTP port'
  if [[ -n "$expected_suffix" ]]; then
    [[ "$value" == */"$expected_suffix" ]] || die 'URL path is not the expected local path'
  fi
}

wait_for_mysql_health() {
  local compose_project="$1" container_id status
  container_id="$(docker compose \
    --project-name "$compose_project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    ps -q mysql)"
  [[ -n "$container_id" && "$container_id" != *$'\n'* ]] || die 'candidate MySQL container was not resolved'
  for _ in {1..30}; do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$container_id")"
    [[ "$status" == healthy ]] && return 0
    sleep 1
  done
  die 'candidate MySQL did not become healthy'
}

candidate_mysql_query() {
  local candidate_project="$1" sql="$2"
  docker compose \
    --project-name "$candidate_project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    exec -T mysql \
    sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root --database=casn_local --execute "$1"' \
    sh "$sql"
}

candidate_database_hash() {
  docker compose \
    --project-name "$1" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    exec -T mysql \
    sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --quick --hex-blob --routines --triggers --events --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --skip-dump-date --skip-comments casn_local' \
    | sed 's/CHARACTER SET utf8mb4 //g' \
    | sha256sum | awk '{print $1}'
}

require_new_volume() {
  local volume="$1"
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    die "candidate volume already exists: $volume"
  fi
}

create_candidate_volume() {
  local candidate_project="$1" logical="$2" volume="$3"
  docker volume create \
    --label "com.docker.compose.project=$candidate_project" \
    --label "com.docker.compose.volume=$logical" \
    "$volume" >/dev/null
}

validate_labeled_volume() {
  local candidate_project="$1" logical="$2" volume="$3" inspected
  inspected="$(docker volume inspect "$volume")"
  jq -e \
    --arg project "$candidate_project" \
    --arg logical "$logical" '
      length == 1
      and .[0].Labels["com.docker.compose.project"] == $project
      and .[0].Labels["com.docker.compose.volume"] == $logical
    ' <<< "$inspected" >/dev/null || die 'actual candidate media volume boundary is unsafe'
}

restore_media() {
  local archive="$1" volume="$2"
  docker run --rm -i \
    --mount "type=volume,src=$volume,dst=/to" \
    "$mysql_image" \
    tar -C /to -xf - < "$archive"
}

validate_mysql_candidate_boundary() {
  local candidate_project="$1" expected_container expected_network inspected
  expected_network="${candidate_project}_casn_snapshot_internal"
  expected_container="$(docker compose \
    --project-name "$candidate_project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    ps -q mysql)"
  [[ -n "$expected_container" && "$expected_container" != *$'\n'* ]] || die 'candidate MySQL container was not resolved'

  inspected="$(docker inspect "$expected_container")"
  jq -e \
    --arg project "$candidate_project" \
    --arg network "$expected_network" \
    --arg image "$mysql_image" \
    --arg volume "$mysql_volume" '
      length == 1
      and .[0].Config.Labels["com.docker.compose.project"] == $project
      and .[0].Config.Labels["com.docker.compose.service"] == "mysql"
      and .[0].Config.Image == $image
      and (.[0].NetworkSettings.Networks | keys == [$network])
      and ([.[0].NetworkSettings.Ports[]? | select(. != null)] | length == 0)
      and any(.[0].Mounts[]; .Type == "volume" and .Name == $volume and .Destination == "/var/lib/mysql")
    ' <<< "$inspected" >/dev/null || die 'actual candidate MySQL boundary is unsafe'

  inspected="$(docker network inspect "$expected_network")"
  jq -e \
    --arg project "$candidate_project" '
      length == 1
      and .[0].Internal == true
      and .[0].Labels["com.docker.compose.project"] == $project
      and .[0].Labels["com.docker.compose.network"] == "casn_snapshot_internal"
    ' <<< "$inspected" >/dev/null || die 'actual candidate network boundary is unsafe'

  inspected="$(docker volume inspect "$mysql_volume")"
  jq -e \
    --arg project "$candidate_project" '
      length == 1
      and .[0].Labels["com.docker.compose.project"] == $project
      and .[0].Labels["com.docker.compose.volume"] == "mysql_data"
    ' <<< "$inspected" >/dev/null || die 'actual candidate MySQL volume boundary is unsafe'
}

validate_application_candidate_boundary() {
  local candidate_project="$1" expected_network service expected_image container_id inspected
  expected_network="${candidate_project}_casn_snapshot_internal"

  inspected="$(docker image inspect "$APP_IMAGE" "$NGINX_IMAGE")"
  jq -e --arg revision "$APP_REVISION" '
    length == 2
    and all(.[]; .Config.Labels["org.opencontainers.image.revision"] == $revision)
  ' <<< "$inspected" >/dev/null || die 'candidate application image revision mismatch'

  for service in directus app nginx; do
    case "$service" in
      directus) expected_image="$directus_image" ;;
      app) expected_image="$APP_IMAGE" ;;
      nginx) expected_image="$NGINX_IMAGE" ;;
    esac
    container_id="$(docker compose \
      --project-name "$candidate_project" \
      --env-file "$local_env_file" \
      --file "$compose_file" \
      ps -aq "$service")"
    [[ -n "$container_id" && "$container_id" != *$'\n'* ]] || die 'candidate application container was not resolved'
    inspected="$(docker inspect "$container_id")"
    jq -e \
      --arg project "$candidate_project" \
      --arg service "$service" \
      --arg network "$expected_network" \
      --arg image "$expected_image" '
        length == 1
        and .[0].Config.Labels["com.docker.compose.project"] == $project
        and .[0].Config.Labels["com.docker.compose.service"] == $service
        and .[0].Config.Image == $image
      ' <<< "$inspected" >/dev/null || die 'actual candidate application boundary is unsafe'

    case "$service" in
      directus)
        jq -e --arg volume "$directus_volume" --arg network "$expected_network" '
          (.[0].NetworkSettings.Networks | keys == [$network])
          and ([.[0].NetworkSettings.Ports[]? | select(. != null)] | length) == 0
          and any(.[0].Mounts[]; .Type == "volume" and .Name == $volume and .Destination == "/directus/uploads")
        ' <<< "$inspected" >/dev/null || die 'actual Directus mounts or bindings are unsafe'
        ;;
      app)
        jq -e --arg network "$expected_network" '
          (.[0].NetworkSettings.Networks | keys == [$network])
          and ([.[0].NetworkSettings.Ports[]? | select(. != null)] | length) == 0
        ' \
          <<< "$inspected" >/dev/null || die 'actual application bindings are unsafe'
        ;;
      nginx)
        jq -e --arg volume "$legacy_volume" --arg internal "$expected_network" --arg loopback "${candidate_project}_casn_snapshot_loopback" '
          (.[0].NetworkSettings.Networks | keys == [$internal,$loopback])
          and (.[0].HostConfig.PortBindings["8080/tcp"] | length == 1 and .[0].HostIp == "127.0.0.1")
          and any(.[0].Mounts[]; .Type == "volume" and .Name == $volume and .Destination == "/legacy-strapi-uploads" and .RW == false)
        ' <<< "$inspected" >/dev/null || die 'actual nginx mounts or bindings are unsafe'
        ;;
    esac
  done

  inspected="$(docker network inspect "${candidate_project}_casn_snapshot_loopback")"
  jq -e --arg project "$candidate_project" '
    length == 1
    and .[0].Internal != true
    and .[0].Labels["com.docker.compose.project"] == $project
    and .[0].Labels["com.docker.compose.network"] == "casn_snapshot_loopback"
  ' <<< "$inspected" >/dev/null || die 'actual candidate loopback ingress network is unsafe'
}

main() {
  local artifact="" manifest="" identity="" env_file="" snapshot_id=""
  while (( $# > 0 )); do
    case "$1" in
      --artifact) [[ $# -ge 2 ]] || usage; artifact="$2"; shift 2 ;;
      --manifest) [[ $# -ge 2 ]] || usage; manifest="$2"; shift 2 ;;
      --identity) [[ $# -ge 2 ]] || usage; identity="$2"; shift 2 ;;
      --env-file) [[ $# -ge 2 ]] || usage; env_file="$2"; shift 2 ;;
      --snapshot-id) [[ $# -ge 2 ]] || usage; snapshot_id="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ -n "$artifact" && -n "$manifest" && -n "$identity" && -n "$env_file" && -n "$snapshot_id" ]] || usage

  require_snapshot_id "$snapshot_id"
  require_owner_only_file "$artifact"
  require_owner_only_file "$manifest"
  require_owner_only_file "$identity"
  require_owner_only_file "$env_file"
  [[ "$(basename "$manifest")" == "$snapshot_id.manifest.json" ]] || die 'manifest filename does not match snapshot id'
  [[ "$(jq -r '.snapshotId // empty' "$manifest")" == "$snapshot_id" ]] || die 'manifest content does not match snapshot id'

  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
  local_env_file="$env_file"
  readonly local_env_file
  compose_file="$repository_root/docker-compose.snapshot-local.yml"
  readonly compose_file

  local required_variable
  for required_variable in \
    MYSQL_ROOT_PASSWORD MYSQL_USER MYSQL_PASSWORD DIRECTUS_KEY DIRECTUS_SECRET \
    REVALIDATE_SECRET NEXTAUTH_SECRET APP_IMAGE NGINX_IMAGE APP_REVISION \
    CASN_LOCAL_HTTP_PORT APP_PUBLIC_URL DIRECTUS_PUBLIC_URL \
    SNAPSHOT_HANDOFF_DIRECTORY; do
    [[ -n "${!required_variable-}" ]] || die "missing required local configuration: $required_variable"
  done
  [[ -z "${MYSQL_DATABASE-}" || "$MYSQL_DATABASE" == "$database_name" ]] || die 'unsafe configured database name'
  require_local_image_ref "$APP_IMAGE"
  require_local_image_ref "$NGINX_IMAGE"
  require_digest_ref "$mysql_image"
  [[ "$APP_REVISION" =~ ^[0-9a-f]{40}$ ]] || die 'invalid local application revision'
  require_port "$CASN_LOCAL_HTTP_PORT"
  require_local_url "$APP_PUBLIC_URL"
  require_local_url "$DIRECTUS_PUBLIC_URL" cms
  require_empty_directory "$SNAPSHOT_HANDOFF_DIRECTORY"

  require_command age
  require_command docker
  require_command jq
  require_command sha256sum
  require_command tar

  project="casn_snapshot_${snapshot_id,,}"
  project="${project//[^a-z0-9_-]/}"
  readonly project
  mysql_volume="${project}_mysql_data"
  directus_volume="${project}_directus_uploads"
  legacy_volume="${project}_strapi_uploads"
  readonly mysql_volume directus_volume legacy_volume

  staging_directory="$(mktemp -d /tmp/casn-local-import.XXXXXXXX)"
  readonly staging_directory
  chmod 700 "$staging_directory"
  cleanup() {
    local exit_status=$?
    trap - EXIT INT TERM
    case "$staging_directory" in
      /tmp/casn-local-import.*) rm -rf -- "$staging_directory" ;;
      *) exit_status=1 ;;
    esac
    exit "$exit_status"
  }
  trap cleanup EXIT INT TERM

  age -d -i "$identity" -o "$staging_directory/payload.tar" "$artifact"
  chmod 600 "$staging_directory/payload.tar"
  mapfile -t archive_entries < <(tar -tf "$staging_directory/payload.tar" | LC_ALL=C sort)
  expected_entries=(database.sql directus-uploads.tar legacy-uploads.tar)
  [[ "${archive_entries[*]}" == "${expected_entries[*]}" ]] || die 'encrypted artifact contains an unsafe payload inventory'
  tar -C "$staging_directory" -xf "$staging_directory/payload.tar"
  chmod 600 \
    "$staging_directory/database.sql" \
    "$staging_directory/directus-uploads.tar" \
    "$staging_directory/legacy-uploads.tar"
  bash "$script_directory/manifest.sh" verify --manifest "$manifest" --payload-dir "$staging_directory"
  database_content_hash="$(sed 's/CHARACTER SET utf8mb4 //g' "$staging_directory/database.sql" | sha256sum | awk '{print $1}')"
  readonly database_content_hash

  require_new_volume "$mysql_volume"
  require_new_volume "$directus_volume"
  require_new_volume "$legacy_volume"

  rendered_config="$(docker compose \
    --project-name "$project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    config --format json)"
  jq -e '
    .services.mysql.environment.MYSQL_DATABASE == "casn_local"
    and .services.app.environment.DB_NAME == "casn_local"
    and (.services.app.environment | has("RUN_DB_MIGRATIONS") | not)
    and (.services.app.environment | has("DB_MIGRATION_CONFIRM") | not)
    and ((.services.mysql.ports // []) | length == 0)
    and (.services.nginx.ports | length == 1 and .[0].host_ip == "127.0.0.1")
    and .networks.casn_snapshot_internal.internal == true
    and (.networks | keys == ["casn_snapshot_internal","casn_snapshot_loopback"])
    and (.services.mysql.networks | keys == ["casn_snapshot_internal"])
    and (.services.nginx.networks | keys == ["casn_snapshot_internal","casn_snapshot_loopback"])
    and (.services.app.networks | keys == ["casn_snapshot_internal"])
    and (.services.directus.networks | keys == ["casn_snapshot_internal"])
  ' <<< "$rendered_config" >/dev/null || die 'rendered local Compose boundary is unsafe'
  [[ "$rendered_config" != *casn.pl* ]] || die 'rendered local Compose contains a production URL'

  docker compose \
    --project-name "$project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    up -d mysql >/dev/null
  validate_mysql_candidate_boundary "$project"
  wait_for_mysql_health "$project"
  [[ "$(candidate_mysql_query "$project" 'SELECT DATABASE();')" == "$database_name" ]] || die 'candidate selected an unsafe database'
  candidate_uuid="$(candidate_mysql_query "$project" 'SELECT @@server_uuid;')"
  production_uuid_hash="$(jq -r '.source.serverUuidHash' "$manifest")"
  [[ "$(sha256_value "$candidate_uuid")" != "$production_uuid_hash" ]] || die 'candidate database identity matches production'

  docker compose \
    --project-name "$project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    exec -T mysql \
    sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --database=casn_local' \
    < "$staging_directory/database.sql"
  restored_database_hash="$(candidate_database_hash "$project")"
  [[ "$restored_database_hash" == "$database_content_hash" ]] || die 'restored candidate database payload differs from snapshot'
  [[ "$restored_database_hash" == "$(jq -r '.database.canonicalSha256' "$manifest")" ]] || die 'restored candidate database differs from canonical manifest'

  create_candidate_volume "$project" directus_uploads "$directus_volume"
  create_candidate_volume "$project" strapi_uploads "$legacy_volume"
  validate_labeled_volume "$project" directus_uploads "$directus_volume"
  validate_labeled_volume "$project" strapi_uploads "$legacy_volume"
  restore_media "$staging_directory/directus-uploads.tar" "$directus_volume"
  restore_media "$staging_directory/legacy-uploads.tar" "$legacy_volume"

  docker compose \
    --project-name "$project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    create directus app nginx >/dev/null
  validate_application_candidate_boundary "$project"
  docker compose \
    --project-name "$project" \
    --env-file "$local_env_file" \
    --file "$compose_file" \
    start directus app nginx >/dev/null

  handoff_file="$SNAPSHOT_HANDOFF_DIRECTORY/$snapshot_id.candidate.json"
  umask 077
  set -C
  jq -n \
    --arg snapshot_id "$snapshot_id" \
    --arg project "$project" \
    --arg database "$database_name" \
    --arg http_port "$CASN_LOCAL_HTTP_PORT" \
    --arg manifest_sha256 "$(sha256sum "$manifest" | awk '{print $1}')" \
    --arg database_content_sha256 "$restored_database_hash" \
    --arg app_image "$APP_IMAGE" \
    --arg nginx_image "$NGINX_IMAGE" \
    --arg app_revision "$APP_REVISION" \
    --arg previous_project "${CURRENT_LOCAL_PROJECT-}" \
    '{snapshotId:$snapshot_id, project:$project, database:$database, httpPort:$http_port, manifestSha256:$manifest_sha256, databaseContentSha256:$database_content_sha256, appImage:$app_image, nginxImage:$nginx_image, appRevision:$app_revision, previousProject:$previous_project}' \
    > "$handoff_file"
  set +C
  chmod 600 "$handoff_file"
  printf 'candidate restored: %s\n' "$project"
}

main "$@"
