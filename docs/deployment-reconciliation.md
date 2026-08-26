# Directus deployment reconciliation runbook

## Status and authority

**Status: not run.** This document proves neither a backup, restore, migration,
artifact publication, deployment, public smoke, webhook observation, nor editor
acceptance. It is a fail-closed procedure for an approved isolated rehearsal,
followed only by separately approved cutover or rollback work.

Never place real credentials, tokens, email addresses, host names, database
values, or populated environment files in Git or ordinary evidence storage.
The source, rehearsal, and rollback hosts must be named Docker contexts; an
ambient Docker context is prohibited.

## Shared Bash contract

Run every block with Bash and retain this shell state. It makes a distinct
Docker daemon—not merely a distinct Compose project—the rehearsal boundary.

```bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"; readonly repo_root
evidence_parent="$(realpath -e "${EVIDENCE_ROOT_PARENT:?set approved non-repository evidence storage}")"; readonly evidence_parent
[[ "$evidence_parent" = /* && "$evidence_parent/" != "$repo_root/"* ]]
evidence_root="$evidence_parent/directus-reconciliation-$(date -u +%Y%m%dT%H%M%SZ)"; readonly evidence_root
[[ ! -e "$evidence_root" ]]
mkdir -m 700 "$evidence_root"
readonly source_context="${SOURCE_DOCKER_CONTEXT:?}"
readonly rehearsal_context="${REHEARSAL_DOCKER_CONTEXT:?}"
readonly rollback_context="${ROLLBACK_DOCKER_CONTEXT:?}"
source_endpoint="$(docker context inspect "$source_context" --format '{{ .Endpoints.docker.Host }}')"; readonly source_endpoint
rehearsal_endpoint="$(docker context inspect "$rehearsal_context" --format '{{ .Endpoints.docker.Host }}')"; readonly rehearsal_endpoint
rollback_endpoint="$(docker context inspect "$rollback_context" --format '{{ .Endpoints.docker.Host }}')"; readonly rollback_endpoint
[[ -n "$source_endpoint" && -n "$rehearsal_endpoint" && -n "$rollback_endpoint" ]]
[[ "$rehearsal_context" != "$source_context" && "$rehearsal_context" != "$rollback_context" ]]
[[ "$rehearsal_endpoint" != "$source_endpoint" && "$rehearsal_endpoint" != "$rollback_endpoint" ]]

readonly rehearsal_project="${REHEARSAL_COMPOSE_PROJECT:?}"
rehearsal_env="$(realpath -e "${REHEARSAL_ENV_FILE:?}")"; readonly rehearsal_env
rehearsal_compose="$(realpath -e "$repo_root/docker-compose.final.yml")"; readonly rehearsal_compose
readonly rehearsal_context_repo="${REHEARSAL_CONTEXT_REPOSITORY_ROOT:?absolute repository path on rehearsal daemon}"
secret_backup_root="$(realpath -e "${SECRET_BACKUP_ROOT:?}")"; readonly secret_backup_root
readonly volume_helper_image="${VOLUME_HELPER_IMAGE:?}"
readonly expected_rehearsal_database="${EXPECTED_REHEARSAL_DATABASE:?}"
readonly REHEARSAL_DAEMON_HOST="${REHEARSAL_DAEMON_HOST:?approved daemon host name or address}"
readonly REHEARSAL_NGINX_HOST_PORT="${REHEARSAL_NGINX_HOST_PORT:?published Nginx host port}"
readonly REHEARSAL_NGINX_CONTAINER_PORT="${REHEARSAL_NGINX_CONTAINER_PORT:?published Nginx container port}"
[[ "$rehearsal_project" != "casn" && "$rehearsal_env" = /* && "$rehearsal_compose" = /* && "$secret_backup_root" = /* && "$rehearsal_context_repo" = /* && "$REHEARSAL_DAEMON_HOST" != 127.0.0.1 && "$REHEARSAL_NGINX_HOST_PORT" =~ ^[1-9][0-9]{0,4}$ && "$REHEARSAL_NGINX_CONTAINER_PORT" =~ ^[1-9][0-9]{0,4}$ ]]
(( 10#$REHEARSAL_NGINX_HOST_PORT <= 65535 && 10#$REHEARSAL_NGINX_CONTAINER_PORT <= 65535 ))
[[ "$rehearsal_context_repo" == "$repo_root" ]]
[[ "$volume_helper_image" =~ @sha256:[0-9a-f]{64}$ ]]

declare -a rehearsal_docker=(docker --context "$rehearsal_context")
declare -a rehearsal_compose_cmd=("${rehearsal_docker[@]}" compose --project-name "$rehearsal_project" --env-file "$rehearsal_env" --file "$rehearsal_compose")

read_env_value() {
  local name="$1" env_file="$2" value
  value="$(sed -nE "s/^[[:space:]]*(export[[:space:]]+)?${name}=(.*)$/\\2/p" "$env_file" | tail -n 1)"
  [[ -n "$value" ]]; printf '%s\n' "$value"
}
db_hash() { printf '%s' "$1" | sha256sum | awk '{print $1}'; }
require_artifacts() {
  local -a docker_cmd=(docker --context "$1"); local env_file="$2" app nginx revision
  app="$(read_env_value APP_IMAGE "$env_file")"; nginx="$(read_env_value NGINX_IMAGE "$env_file")"; revision="$(read_env_value APP_REVISION "$env_file")"
  [[ "$app" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ && "$nginx" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ && "$revision" =~ ^[0-9a-f]{40}$ ]]
  "${docker_cmd[@]}" pull "$app" >/dev/null
  "${docker_cmd[@]}" pull "$nginx" >/dev/null
  [[ "$("${docker_cmd[@]}" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$app")" == "$revision" ]]
  [[ "$("${docker_cmd[@]}" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$nginx")" == "$revision" ]]
}
require_service() {
  local service="$1" cid project service_label
  cid="$("${rehearsal_compose_cmd[@]}" ps -q "$service")"; [[ -n "$cid" ]]
  project="$("${rehearsal_docker[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$cid")"
  service_label="$("${rehearsal_docker[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$cid")"
  [[ "$project" == "$rehearsal_project" && "$service_label" == "$service" ]]; printf '%s\n' "$cid"
}
require_volume() {
  local logical="$1" volume project volume_label
  volume="$("${rehearsal_compose_cmd[@]}" config --format json | jq -er --arg logical "$logical" '.volumes | to_entries[] | select(.key == $logical) | (.value.name // .key)')"
  project="$("${rehearsal_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$volume")"
  volume_label="$("${rehearsal_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$volume")"
  [[ "$project" == "$rehearsal_project" && "$volume_label" == "$logical" ]]; printf '%s\n' "$volume"
}
assert_rehearsal_db() {
  local actual
  actual="$("${rehearsal_compose_cmd[@]}" exec -T mysql sh -ec 'printf %s "$MYSQL_DATABASE"')"
  [[ "$actual" == "$expected_rehearsal_database" ]]
  "${rehearsal_compose_cmd[@]}" exec -T mysql sh -ec 'exec mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT DATABASE();"' | grep -Fx "$expected_rehearsal_database" >/dev/null
}
context_endpoint_host() {
  local context="$1" endpoint authority host
  endpoint="$(docker context inspect "$context" --format '{{ .Endpoints.docker.Host }}')"
  case "$endpoint" in
    ssh://*|tcp://*|http://*|https://*) authority="${endpoint#*://}" ;;
    *) return 1 ;;
  esac
  authority="${authority%%/*}"
  authority="${authority##*@}"
  [[ "$authority" != \[* && "$authority" != *\] && "$authority" != *:*:* ]] || return 1
  host="${authority%%:*}"
  [[ "$host" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || return 1
  printf '%s\n' "$host"
}
assert_stack_url() {
  local context="$1" project="$2" env_file="$3" compose_file="$4" nginx_service="$5" daemon_host="$6" host_port="$7" container_port="$8" app_url="$9" endpoint_host cid published
  local -a docker_cmd=(docker --context "$context")
  local -a cmd=("${docker_cmd[@]}" compose --project-name "$project" --env-file "$env_file" --file "$compose_file")
  endpoint_host="$(context_endpoint_host "$context")"
  [[ -n "$daemon_host" && "$daemon_host" != 127.0.0.1 && "$endpoint_host" == "$daemon_host" && "$host_port" =~ ^[1-9][0-9]{0,4}$ && "$container_port" =~ ^[1-9][0-9]{0,4}$ ]]
  (( 10#$host_port <= 65535 && 10#$container_port <= 65535 ))
  [[ "$app_url" == "http://$daemon_host:$host_port" || "$app_url" == "https://$daemon_host:$host_port" ]]
  cid="$("${cmd[@]}" ps -q "$nginx_service")"; [[ -n "$cid" ]]
  [[ "$("${docker_cmd[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$cid")" == "$project" ]]
  [[ "$("${docker_cmd[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$cid")" == "$nginx_service" ]]
  published="$("${docker_cmd[@]}" inspect --format "{{with index .NetworkSettings.Ports \"${container_port}/tcp\"}}{{(index . 0).HostPort}}{{end}}" "$cid")"
  [[ "$published" == "$host_port" ]]
}

"${rehearsal_compose_cmd[@]}" config --quiet
require_artifacts "$rehearsal_context" "$rehearsal_env"
```

Fixed `container_name` declarations cannot collide because this procedure
requires a different daemon endpoint for rehearsal. Labels are still asserted
before selecting any rehearsal container or volume. The helper image must be a
pre-approved digest providing `sh`, `tar`, and `find`.

## Gate 0: source and artifact evidence

Create non-secret evidence only in the approved external evidence directory;
both it and secret backup material stay outside the repository. Never persist
the full rendered rehearsal Compose output because it contains expanded
secrets.

```bash
git -C "$repo_root" rev-parse HEAD | tee "$evidence_root/git-sha.txt"
sha256sum "$rehearsal_compose" "$repo_root/docker-compose.portainer.yml" "$repo_root/nginx.conf" \
  "$repo_root/directus/bootstrap.cjs" "$repo_root/directus/start.sh" \
  "$repo_root/directus/extensions/directus-extension-casn-field-guard/package.json" \
  "$repo_root/directus/extensions/directus-extension-casn-field-guard/dist/index.js" \
  | tee "$evidence_root/source-sha256.txt"
bind_paths=(directus/bootstrap.cjs directus/start.sh directus/extensions/directus-extension-casn-field-guard/package.json directus/extensions/directus-extension-casn-field-guard/dist/index.js)
(cd "$repo_root" && sha256sum "${bind_paths[@]}") > "$evidence_root/desired-directus-binds.sha256"
"${rehearsal_docker[@]}" run --rm --mount "type=bind,src=$rehearsal_context_repo,dst=/repo,readonly" "$volume_helper_image" sh -ec 'cd /repo && sha256sum directus/bootstrap.cjs directus/start.sh directus/extensions/directus-extension-casn-field-guard/package.json directus/extensions/directus-extension-casn-field-guard/dist/index.js' > "$evidence_root/rehearsal-directus-binds.sha256"
diff -u "$evidence_root/desired-directus-binds.sha256" "$evidence_root/rehearsal-directus-binds.sha256"
"${rehearsal_compose_cmd[@]}" config --format json \
  | jq -r '.services.directus.volumes[]? | select(.type == "bind") | "\(.source)\t\(.target)"' \
  > "$evidence_root/rehearsal-directus-binds.tsv"
grep -Fx "$rehearsal_context_repo/directus/bootstrap.cjs	/directus/bootstrap.cjs" "$evidence_root/rehearsal-directus-binds.tsv"
grep -Fx "$rehearsal_context_repo/directus/start.sh	/directus/start.sh" "$evidence_root/rehearsal-directus-binds.tsv"
grep -Fx "$rehearsal_context_repo/directus/extensions/directus-extension-casn-field-guard	/directus/extensions/directus-extension-casn-field-guard" "$evidence_root/rehearsal-directus-binds.tsv"
```

## Gate 1: source-context backup and checksummed manifest

These commands require an authorized source context. They never use the
rehearsal daemon. They quiesce the explicitly configured source application and
CMS writers before the snapshot and leave them stopped until an authorized
abort/cutover decision; they do not assume Directus is already deployed.

```bash
readonly source_project="${SOURCE_COMPOSE_PROJECT:?}"
source_env="$(realpath -e "${SOURCE_ENV_FILE:?}")"; readonly source_env
source_compose="$(realpath -e "${SOURCE_COMPOSE_FILE:?absolute captured source Compose file}")"; readonly source_compose
readonly source_nginx_context_path="${SOURCE_NGINX_CONTEXT_PATH:?absolute Nginx configuration path on the source daemon host}"
readonly source_nginx_container_path="${SOURCE_NGINX_CONTAINER_PATH:?absolute Nginx configuration path in the source container}"
readonly source_mysql_service="${SOURCE_MYSQL_SERVICE:?}"
readonly source_app_writer_service="${SOURCE_APP_WRITER_SERVICE:?}"
readonly source_cms_writer_service="${SOURCE_CMS_WRITER_SERVICE:?}"
readonly source_nginx_service="${SOURCE_NGINX_SERVICE:?}"
readonly source_legacy_volume="${SOURCE_LEGACY_VOLUME:?}"
readonly source_legacy_volume_logical_name="${SOURCE_LEGACY_VOLUME_LOGICAL_NAME:?Compose logical legacy-volume name}"
readonly source_legacy_mount_service="${SOURCE_LEGACY_MOUNT_SERVICE:?service mounting the legacy volume}"
readonly source_legacy_container_path="${SOURCE_LEGACY_CONTAINER_PATH:?absolute legacy-volume mount path in that service}"
readonly expected_source_database="${EXPECTED_SOURCE_DATABASE:?}"
readonly SOURCE_APP_URL="${SOURCE_APP_URL:?approved source-private endpoint URL}"
readonly SOURCE_DAEMON_HOST="${SOURCE_DAEMON_HOST:?approved source daemon host name or address}"
readonly SOURCE_NGINX_HOST_PORT="${SOURCE_NGINX_HOST_PORT:?published source Nginx host port}"
readonly SOURCE_NGINX_CONTAINER_PORT="${SOURCE_NGINX_CONTAINER_PORT:?published source Nginx container port}"
[[ "$source_project" != "$rehearsal_project" && "$source_env" = /* && "$source_compose" = /* && "$source_nginx_context_path" = /* && "$source_nginx_container_path" = /* && "$source_legacy_container_path" = /* && "$SOURCE_DAEMON_HOST" != 127.0.0.1 && "$SOURCE_NGINX_HOST_PORT" =~ ^[1-9][0-9]{0,4}$ && "$SOURCE_NGINX_CONTAINER_PORT" =~ ^[1-9][0-9]{0,4}$ ]]
(( 10#$SOURCE_NGINX_HOST_PORT <= 65535 && 10#$SOURCE_NGINX_CONTAINER_PORT <= 65535 ))
declare -a source_docker=(docker --context "$source_context")
declare -a source_compose_cmd=("${source_docker[@]}" compose --project-name "$source_project" --env-file "$source_env" --file "$source_compose")
"${source_compose_cmd[@]}" config --quiet
mapfile -t source_services < <("${source_compose_cmd[@]}" config --format json | jq -er '.services | keys[]' | LC_ALL=C sort)
(( ${#source_services[@]} >= 4 ))
for source_service in "${source_services[@]}"; do
  [[ "$source_service" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]
done
for source_service in "$source_mysql_service" "$source_app_writer_service" "$source_cms_writer_service" "$source_nginx_service" "$source_legacy_mount_service"; do
  [[ "$source_service" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]
  printf '%s\n' "${source_services[@]}" | grep -Fx "$source_service" >/dev/null
done
[[ "$source_legacy_volume" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ && "$source_legacy_volume_logical_name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]
[[ "$source_mysql_service" != "$source_app_writer_service" && "$source_mysql_service" != "$source_cms_writer_service" && "$source_mysql_service" != "$source_nginx_service" ]]
[[ "$source_app_writer_service" != "$source_cms_writer_service" && "$source_app_writer_service" != "$source_nginx_service" && "$source_cms_writer_service" != "$source_nginx_service" ]]

for source_service in "${source_services[@]}"; do
  source_cid="$("${source_compose_cmd[@]}" ps -q "$source_service")"; [[ -n "$source_cid" ]]
  [[ "$("${source_docker[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$source_cid")" == "$source_project" ]]
  [[ "$("${source_docker[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$source_cid")" == "$source_service" ]]
done
source_mysql="$("${source_compose_cmd[@]}" ps -q "$source_mysql_service")"; source_nginx="$("${source_compose_cmd[@]}" ps -q "$source_nginx_service")"
source_database="$("${source_compose_cmd[@]}" exec -T "$source_mysql_service" sh -ec 'printf %s "$MYSQL_DATABASE"')"
[[ "$source_database" == "$expected_source_database" ]]
[[ "$("${source_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$source_legacy_volume")" == "$source_project" ]]
[[ "$("${source_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$source_legacy_volume")" == "$source_legacy_volume_logical_name" ]]
"${source_compose_cmd[@]}" config --format json | jq -e --arg logical "$source_legacy_volume_logical_name" --arg actual "$source_legacy_volume" '.volumes[$logical] and ((.volumes[$logical].name // $logical) == $actual)' >/dev/null
source_legacy_mount_cid="$("${source_compose_cmd[@]}" ps -q "$source_legacy_mount_service")"; [[ -n "$source_legacy_mount_cid" ]]
"${source_docker[@]}" inspect "$source_legacy_mount_cid" | jq -e --arg actual "$source_legacy_volume" --arg destination "$source_legacy_container_path" '.[0].Mounts[] | select(.Type == "volume" and (.Name == $actual or .Source == $actual) and .Destination == $destination)' >/dev/null
if "${source_docker[@]}" inspect "$source_mysql" | jq -e --arg actual "$source_legacy_volume" '.[0].Mounts[]? | select(.Type == "volume" and (.Name == $actual or .Source == $actual))' >/dev/null; then exit 1; fi

backup_id="$(date -u +%Y%m%dT%H%M%SZ)"; readonly backup_id
readonly source_backup="$secret_backup_root/casn-$source_project-$backup_id"
umask 077
[[ ! -e "$source_backup" ]]
mkdir "$source_backup"
install -m 600 "$source_env" "$source_backup/source.env"
install -m 600 "$source_compose" "$source_backup/source-compose.yml"
"${source_compose_cmd[@]}" config > "$source_backup/source-compose.rendered.yml"
chmod 600 "$source_backup/source-compose.rendered.yml"
source_nginx_mounts="$("${source_docker[@]}" inspect --format '{{range .Mounts}}{{printf "%s\t%s\n" .Source .Destination}}{{end}}' "$source_nginx")"
grep -Fx "$source_nginx_context_path	$source_nginx_container_path" <<< "$source_nginx_mounts" >/dev/null
"${source_docker[@]}" run --rm --mount "type=bind,src=$source_nginx_context_path,dst=/from,readonly" "$volume_helper_image" sh -ec 'cat /from' > "$source_backup/source-nginx.conf"
[[ -s "$source_backup/source-nginx.conf" ]]
: > "$source_backup/artifact-evidence.tsv"
printf '%s\n' "${source_services[@]}" > "$source_backup/source-services.txt"
for source_service in "${source_services[@]}"; do
  source_cid="$("${source_compose_cmd[@]}" ps -q "$source_service")"; [[ -n "$source_cid" ]]
  source_image_id="$("${source_docker[@]}" inspect --format '{{.Image}}' "$source_cid")"
  [[ "$source_image_id" =~ ^sha256:[0-9a-f]{64}$ ]]
  source_repo_digests="$("${source_docker[@]}" image inspect --format '{{join .RepoDigests ","}}' "$source_image_id")"
  source_revision="$("${source_docker[@]}" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$source_image_id")"
  printf '%s\t%s\t%s\t%s\n' "$source_service" "$source_image_id" "$source_repo_digests" "$source_revision" >> "$source_backup/artifact-evidence.tsv"
done
diff -u "$source_backup/source-services.txt" <(cut -f1 "$source_backup/artifact-evidence.tsv" | LC_ALL=C sort)
awk -F '\t' 'BEGIN { print "services:" } { printf "  %s:\n    image: %s\n", $1, $2 }' "$source_backup/artifact-evidence.tsv" > "$source_backup/source-images.override.yml"
"${source_compose_cmd[@]}" ps > "$source_backup/compose-evidence.txt"

run_source_acceptance() {
  local context="$1" project="$2" env_file="$3" rendered_compose="$4" mysql_service="$5" app_service="$6" cms_service="$7" nginx_service="$8" app_url="$9" expected_db="${10}"
  local cid actual_db sitemap body route expected_text canonical asset_body
  local -a docker_cmd=(docker --context "$context")
  local -a cmd=("${docker_cmd[@]}" compose --project-name "$project" --env-file "$env_file" --file "$rendered_compose")
  : "${SOURCE_EXPECTED_HOME_TEXT:?}" "${SOURCE_EXPECTED_ANALYSES_TEXT:?}" "${SOURCE_EXPECTED_AUTHORS_TEXT:?}" "${SOURCE_EXPECTED_ISSUES_TEXT:?}" "${SOURCE_PUBLIC_ASSET_PATH:?}" "${SOURCE_PUBLIC_ASSET_ROUTE:?}" "${SOURCE_LEGACY_MEDIA_PATH:?}" "${SOURCE_APP_HEALTH_PATH:?}" "${SOURCE_CMS_HEALTH_PATH:?}" "${SOURCE_CMS_READ_PATH:?}"
  [[ "$app_url" =~ ^https?://[^/]+$ && "$app_url" != *casn.pl* && "$app_url" != http://127.0.0.1* ]]
  assert_stack_url "$context" "$project" "$env_file" "$rendered_compose" "$nginx_service" "$SOURCE_DAEMON_HOST" "$SOURCE_NGINX_HOST_PORT" "$SOURCE_NGINX_CONTAINER_PORT" "$app_url"
  "${cmd[@]}" config --quiet
  for source_service in "$mysql_service" "$app_service" "$cms_service" "$nginx_service"; do
    cid="$("${cmd[@]}" ps -q "$source_service")"; [[ -n "$cid" ]]
    [[ "$("${docker_cmd[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$cid")" == "$project" ]]
    [[ "$("${docker_cmd[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$cid")" == "$source_service" ]]
  done
  actual_db="$("${cmd[@]}" exec -T "$mysql_service" sh -ec 'printf %s "$MYSQL_DATABASE"')"; [[ "$actual_db" == "$expected_db" ]]
  scalar() { "${cmd[@]}" exec -T "$mysql_service" sh -ec "exec mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \"\$MYSQL_DATABASE\" -e \"$1\"" | tr -d $'\r\n'; }
  expect_eq() { [[ "$2" == "$3" ]] || { echo "$1: expected $2, got $3" >&2; return 1; }; }
  expect_eq source_published_analyses 39 "$(scalar 'SELECT COUNT(*) FROM Analysis WHERE publishedAt IS NOT NULL;')"
  expect_eq source_published_authors 32 "$(scalar 'SELECT COUNT(*) FROM Author WHERE publishedAt IS NOT NULL;')"
  expect_eq source_published_pdf_issues 4 "$(scalar 'SELECT COUNT(*) FROM IssueCollection WHERE publishedAt IS NOT NULL AND LOWER(RIGHT(fileUrl, 4)) = CHAR(46,112,100,102);')"
  sitemap="$(mktemp)"; trap 'rm -f "$sitemap"' RETURN
  curl --fail --silent --show-error "$app_url/sitemap.xml" > "$sitemap"; expect_eq source_sitemap_urls 80 "$(rg -o '<loc>' "$sitemap" | wc -l | tr -d '[:space:]')"
  for pair in "/|$SOURCE_EXPECTED_HOME_TEXT|https://casn.pl/" "/analizy|$SOURCE_EXPECTED_ANALYSES_TEXT|https://casn.pl/analizy" "/autorzy|$SOURCE_EXPECTED_AUTHORS_TEXT|https://casn.pl/autorzy" "/zbiory|$SOURCE_EXPECTED_ISSUES_TEXT|https://casn.pl/zbiory"; do
    IFS='|' read -r route expected_text canonical <<< "$pair"; body="$(mktemp)"; curl --fail --silent --show-error "$app_url$route" > "$body"
    rg -Fq "$expected_text" "$body"; rg -Fq "<link rel=\"canonical\" href=\"$canonical\"" "$body"; rg -Fqi '<meta name="robots" content="index, follow"' "$body"; rm -f "$body"
  done
  [[ "$SOURCE_PUBLIC_ASSET_PATH" =~ ^/ && "$SOURCE_LEGACY_MEDIA_PATH" =~ ^/cms/uploads/.+ ]]
  asset_body="$(mktemp)"; curl --fail --silent --show-error "$app_url$SOURCE_PUBLIC_ASSET_ROUTE" > "$asset_body"; rg -Fq "$SOURCE_PUBLIC_ASSET_PATH" "$asset_body"; rm -f "$asset_body"
  for asset in "$SOURCE_PUBLIC_ASSET_PATH" "$SOURCE_LEGACY_MEDIA_PATH"; do curl --fail --silent --show-error --head "$app_url$asset" >/dev/null; curl --fail --silent --show-error "$app_url$asset" -o /dev/null; done
  if curl --fail --silent --show-error -X POST "$app_url$SOURCE_LEGACY_MEDIA_PATH" >/dev/null; then return 1; fi
  curl --fail --silent --show-error "$app_url$SOURCE_APP_HEALTH_PATH" >/dev/null
  curl --fail --silent --show-error "$app_url$SOURCE_CMS_HEALTH_PATH" >/dev/null
  curl --fail --silent --show-error "$app_url$SOURCE_CMS_READ_PATH" >/dev/null
}

run_source_acceptance "$source_context" "$source_project" "$source_env" "$source_backup/source-compose.rendered.yml" "$source_mysql_service" "$source_app_writer_service" "$source_cms_writer_service" "$source_nginx_service" "$SOURCE_APP_URL" "$expected_source_database" | tee "$source_backup/source-acceptance-before.txt"
"${source_compose_cmd[@]}" stop "$source_app_writer_service" "$source_cms_writer_service"
for source_writer in "$source_app_writer_service" "$source_cms_writer_service"; do
  source_writer_cid="$("${source_compose_cmd[@]}" ps -aq "$source_writer")"
  [[ -n "$source_writer_cid" ]]
  [[ "$("${source_docker[@]}" inspect --format '{{ .State.Running }}' "$source_writer_cid")" == false ]]
done
"${source_compose_cmd[@]}" exec -T "$source_mysql_service" sh -ec 'exec mysqldump --single-transaction -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > "$source_backup/mysql-before.sql"
"${source_docker[@]}" run --rm --mount "type=volume,src=$source_legacy_volume,dst=/from,readonly" "$volume_helper_image" sh -ec 'exec tar -C /from -cf - .' > "$source_backup/legacy-uploads-before.tar"
printf 'backup_id=%s\nsource_context=%s\nsource_endpoint_sha256=%s\nsource_database_sha256=%s\nsource_mysql_service=%s\nsource_app_writer_service=%s\nsource_cms_writer_service=%s\nsource_nginx_service=%s\nsource_legacy_volume=%s\nsource_legacy_volume_logical_name=%s\nsource_legacy_mount_service=%s\nsource_legacy_container_path=%s\nsource_services_sha256=%s\nsource_nginx_context_path=%s\nsource_nginx_container_path=%s\n' \
  "$backup_id" "$source_context" "$(db_hash "$source_endpoint")" "$(db_hash "$source_database")" \
  "$source_mysql_service" "$source_app_writer_service" "$source_cms_writer_service" "$source_nginx_service" "$source_legacy_volume" "$source_legacy_volume_logical_name" "$source_legacy_mount_service" "$source_legacy_container_path" "$(sha256sum "$source_backup/source-services.txt" | awk '{print $1}')" "$source_nginx_context_path" "$source_nginx_container_path" > "$source_backup/manifest"
(cd "$source_backup" && sha256sum source.env source-compose.yml source-compose.rendered.yml source-nginx.conf source-acceptance-before.txt mysql-before.sql legacy-uploads-before.tar source-services.txt artifact-evidence.tsv source-images.override.yml compose-evidence.txt manifest > checksums.sha256)
```

Transfer the protected backup between hosts with an approved encrypted channel
outside Git. On the rehearsal host, preserve the directory name and re-run
`sha256sum -c`; a copied archive is not trusted until its manifest and hashes
validate there.

## Gate 2: validate backup before any destructive rehearsal action

Set `EXPECTED_BACKUP_ID` to the reviewed manifest identity. This entire block
must pass before `DROP DATABASE` or clearing a volume is even considered.

```bash
readonly expected_backup_id="${EXPECTED_BACKUP_ID:?}"
protected_backup="$(realpath -e "$secret_backup_root/casn-$source_project-$expected_backup_id")"; readonly protected_backup
[[ "$(basename "$protected_backup")" == "casn-$source_project-$expected_backup_id" ]]
grep -Fx "backup_id=$expected_backup_id" "$protected_backup/manifest"
grep -Fx "source_context=$source_context" "$protected_backup/manifest"
grep -Fx "source_endpoint_sha256=$(db_hash "$source_endpoint")" "$protected_backup/manifest"
grep -Fx "source_database_sha256=$(db_hash "$expected_source_database")" "$protected_backup/manifest"
grep -Fx "source_mysql_service=$source_mysql_service" "$protected_backup/manifest"
grep -Fx "source_app_writer_service=$source_app_writer_service" "$protected_backup/manifest"
grep -Fx "source_cms_writer_service=$source_cms_writer_service" "$protected_backup/manifest"
grep -Fx "source_nginx_service=$source_nginx_service" "$protected_backup/manifest"
grep -Fx "source_legacy_volume=$source_legacy_volume" "$protected_backup/manifest"
grep -Fx "source_legacy_volume_logical_name=$source_legacy_volume_logical_name" "$protected_backup/manifest"
grep -Fx "source_legacy_mount_service=$source_legacy_mount_service" "$protected_backup/manifest"
grep -Fx "source_legacy_container_path=$source_legacy_container_path" "$protected_backup/manifest"
grep -Fx "source_services_sha256=$(sha256sum "$protected_backup/source-services.txt" | awk '{print $1}')" "$protected_backup/manifest"
grep -Fx "source_nginx_context_path=$source_nginx_context_path" "$protected_backup/manifest"
grep -Fx "source_nginx_container_path=$source_nginx_container_path" "$protected_backup/manifest"
(cd "$protected_backup" && sha256sum -c checksums.sha256)
diff -u "$protected_backup/source-services.txt" <(cut -f1 "$protected_backup/artifact-evidence.tsv" | LC_ALL=C sort)
rg -Fq -- 'MySQL dump' "$protected_backup/mysql-before.sql"
rg -Fq -- 'CREATE TABLE `Author`' "$protected_backup/mysql-before.sql"
rg -Fq -- 'CREATE TABLE `Analysis`' "$protected_backup/mysql-before.sql"
rg -Fq -- 'CREATE TABLE `IssueCollection`' "$protected_backup/mysql-before.sql"
tar -tf "$protected_backup/legacy-uploads-before.tar" >/dev/null

"${rehearsal_compose_cmd[@]}" create nginx
rehearsal_legacy_volume="$(require_volume strapi_uploads)"
"${rehearsal_compose_cmd[@]}" stop app directus nginx
"${rehearsal_compose_cmd[@]}" up -d mysql
rehearsal_mysql="$(require_service mysql)"
[[ "$("${rehearsal_docker[@]}" inspect --format '{{ .State.Running }}' "$rehearsal_mysql")" == true ]]
assert_rehearsal_db
rehearsal_database="$("${rehearsal_compose_cmd[@]}" exec -T mysql sh -ec 'printf %s "$MYSQL_DATABASE"')"
[[ "$rehearsal_database" == "$expected_rehearsal_database" ]]
```

Only now may the explicitly identified rehearsal database and validated
rehearsal volume be replaced. `mysql --force` is intentionally never used.

```bash
"${rehearsal_compose_cmd[@]}" exec -T mysql sh -ec 'case "$MYSQL_DATABASE" in (*[!A-Za-z0-9_]*) exit 2;; esac; exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
"${rehearsal_compose_cmd[@]}" exec -T mysql sh -ec 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < "$protected_backup/mysql-before.sql"
"${rehearsal_docker[@]}" run -i --rm --mount "type=volume,src=$rehearsal_legacy_volume,dst=/to" "$volume_helper_image" sh -ec 'set -eu; find /to -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; exec tar -C /to -xf -' < "$protected_backup/legacy-uploads-before.tar"
```

## Gate 3: production-JS automatic migration path

The app image does not need `tsx`: exercise the production CommonJS DataSource
that consumes `migrationsRun` under the two exact gate variables. Assert the
validated MySQL identity both before and after it.

```bash
assert_rehearsal_db
"${rehearsal_compose_cmd[@]}" run --rm --no-deps -e NODE_ENV=production -e RUN_DB_MIGRATIONS=1 -e DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS app node -e '
const { shouldRunDatabaseMigrations } = require("./lib/server/migration-policy.js");
const { AppDataSource, isDatabaseConfigured } = require("./lib/db.shared");
if (!shouldRunDatabaseMigrations(process.env) || shouldRunDatabaseMigrations({ RUN_DB_MIGRATIONS: "true", DB_MIGRATION_CONFIRM: "RUN_CASN_MIGRATIONS" }) || !isDatabaseConfigured() || !AppDataSource) process.exit(1);
AppDataSource.initialize().then(() => AppDataSource.destroy()).catch((error) => { console.error(error.message); process.exit(1); });
'
assert_rehearsal_db
"${rehearsal_compose_cmd[@]}" exec -T mysql sh -ec 'exec mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT timestamp, name FROM migrations ORDER BY id;"' | tee "$evidence_root/rehearsal-migrations-after.txt"
```

Record two human approvals before this gate. Stop on unexpected migration or
data loss; the initial migration can recreate `Author` and `Analysis`.

## Gate 4: executable public, Directus, and webhook acceptance

Start the validated rehearsal project, then use literal expected values supplied
only for this isolated desired stack. The Directus acceptance below is not part
of rollback to the captured pre-cutover source topology.

```bash
"${rehearsal_compose_cmd[@]}" up -d --remove-orphans
require_service app >/dev/null; require_service directus >/dev/null; require_service nginx >/dev/null

run_public_acceptance() {
  local context="$1" project="$2" env_file="$3" compose_file="$4" app_url="$5" expected_db="$6"
  local expected_revision app_cid health_file; expected_revision="$(read_env_value APP_REVISION "$env_file")"
  local -a docker_cmd=(docker --context "$context")
  local -a cmd=("${docker_cmd[@]}" compose --project-name "$project" --env-file "$env_file" --file "$compose_file")
  [[ "$app_url" =~ ^https?://[^/]+$ && "$app_url" != *casn.pl* ]]
  app_cid="$("${cmd[@]}" ps -q app)"; [[ -n "$app_cid" ]]
  "${docker_cmd[@]}" inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$app_cid" | grep -Fx "APP_REVISION=$expected_revision"
  expect_eq() { [[ "$2" == "$3" ]] || { echo "$1: expected $2, got $3" >&2; exit 1; }; }
  scalar() { "${cmd[@]}" exec -T mysql sh -ec "exec mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \"\$MYSQL_DATABASE\" -e \"$1\"" | tr -d $'\r\n'; }
  [[ "$("${cmd[@]}" exec -T mysql sh -ec 'printf %s "$MYSQL_DATABASE"')" == "$expected_db" ]]
  expect_eq published_analyses 39 "$(scalar 'SELECT COUNT(*) FROM Analysis WHERE publishedAt IS NOT NULL;')"
  expect_eq published_authors 32 "$(scalar 'SELECT COUNT(*) FROM Author WHERE publishedAt IS NOT NULL;')"
  expect_eq published_pdf_issues 4 "$(scalar 'SELECT COUNT(*) FROM IssueCollection WHERE publishedAt IS NOT NULL AND LOWER(RIGHT(fileUrl, 4)) = CHAR(46,112,100,102);')"
  sitemap="$(mktemp)"; trap 'rm -f "$sitemap"' RETURN
  curl --fail --silent --show-error "$app_url/sitemap.xml" > "$sitemap"
  expect_eq sitemap_urls 80 "$(rg -o '<loc>' "$sitemap" | wc -l | tr -d '[:space:]')"
  for pair in "/|$EXPECTED_HOME_TEXT|https://casn.pl/" "/analizy|$EXPECTED_ANALYSES_TEXT|https://casn.pl/analizy" "/autorzy|$EXPECTED_AUTHORS_TEXT|https://casn.pl/autorzy" "/zbiory|$EXPECTED_ISSUES_TEXT|https://casn.pl/zbiory"; do
    IFS='|' read -r route expected_text canonical <<< "$pair"; body="$(mktemp)"; curl --fail --silent --show-error "$app_url$route" > "$body"
    rg -Fq "$expected_text" "$body"; rg -Fq "<link rel=\"canonical\" href=\"$canonical\"" "$body"; rg -Fqi '<meta name="robots" content="index, follow"' "$body"; rm -f "$body"
  done
  : "${EXPECTED_PUBLIC_ASSET_PATH:?}" "${EXPECTED_PUBLIC_ASSET_ROUTE:?}" "${LEGACY_MEDIA_PATH:?}" "${DIRECTUS_ASSET_ID:?}"
  [[ "$EXPECTED_PUBLIC_ASSET_PATH" =~ ^/ && "$LEGACY_MEDIA_PATH" =~ ^/cms/uploads/.+ ]]
  asset_body="$(mktemp)"; curl --fail --silent --show-error "$app_url$EXPECTED_PUBLIC_ASSET_ROUTE" > "$asset_body"; rg -Fq "$EXPECTED_PUBLIC_ASSET_PATH" "$asset_body"; rm -f "$asset_body"
  curl --fail --silent --show-error --head "$app_url$EXPECTED_PUBLIC_ASSET_PATH" >/dev/null
  curl --fail --silent --show-error --head "$app_url$LEGACY_MEDIA_PATH" >/dev/null
  curl --fail --silent --show-error --head "$app_url/cms/assets/$DIRECTUS_ASSET_ID" >/dev/null
  if curl --fail --silent --show-error -X POST "$app_url$LEGACY_MEDIA_PATH" >/dev/null; then exit 1; fi
  curl --fail --silent --show-error "$app_url/api/health/live" | jq -e '.status == "alive"' >/dev/null
  health_file="$(mktemp)"; curl --fail --silent --show-error "$app_url/api/health" > "$health_file"; jq -e --arg revision "$expected_revision" '.status == "ready" and .database == "connected" and .revision == $revision' "$health_file" >/dev/null; rm -f "$health_file"
  curl --fail --silent --show-error "$app_url/nginx-health" | grep -Fx ok
  expect_eq directus_ping 200 "$(curl --silent --show-error -o /dev/null -w '%{http_code}' "$app_url/cms/server/ping")"
}

readonly REHEARSAL_APP_URL="${REHEARSAL_APP_URL:?approved private endpoint URL}"
[[ "$REHEARSAL_APP_URL" != *casn.pl* ]]
assert_stack_url "$rehearsal_context" "$rehearsal_project" "$rehearsal_env" "$rehearsal_compose" nginx "$REHEARSAL_DAEMON_HOST" "$REHEARSAL_NGINX_HOST_PORT" "$REHEARSAL_NGINX_CONTAINER_PORT" "$REHEARSAL_APP_URL"
run_public_acceptance "$rehearsal_context" "$rehearsal_project" "$rehearsal_env" "$rehearsal_compose" "$REHEARSAL_APP_URL" "$expected_rehearsal_database"
```

Run the following in the isolated Directus container. It uses its own admin
environment without printing it, creates a disposable editor/user/item, asserts
the field guard, first checks the primary flow's configured URL/header/body,
then creates a separate disposable flow/operation to a local in-container
receiver. It never changes the primary webhook operation.

```bash
"${rehearsal_compose_cmd[@]}" exec -T directus node -e '
const http=require("http"), assert=require("assert");
const base="http://127.0.0.1:8055", secret=process.env.REVALIDATE_SECRET, receiver=[];
const req=(path,init={},token="")=>fetch(base+path,{...init,headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})}}).then(async r=>{const text=await r.text(); return {r,j:text?JSON.parse(text):{}}});
(async()=>{let srv,admin,op,flow,user,author,analysis,editor; try { srv=http.createServer((q,s)=>{let b="";q.on("data",x=>b+=x);q.on("end",()=>{receiver.push({h:q.headers,b});s.end("{}")})}).listen(3900,"127.0.0.1");
let x=await req("/auth/login",{method:"POST",body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})}); assert.equal(x.r.status,200); admin=x.j.data.access_token;
x=await req("/roles?filter[name][_eq]=CASN%20Editor&limit=2",{},admin); assert.equal(x.j.data.length,1); const role=x.j.data[0].id, id=Date.now();
x=await req("/users",{method:"POST",body:JSON.stringify({email:`rehearsal-${id}@example.invalid`,password:`R-${id}-password`,role,status:"active"})},admin); user=x.j.data.id;
x=await req("/auth/login",{method:"POST",body:JSON.stringify({email:`rehearsal-${id}@example.invalid`,password:`R-${id}-password`})}); editor=x.j.data.access_token;
x=await req("/items/Author",{method:"POST",body:JSON.stringify({slug:`rehearsal-${id}`,name:"Rehearsal",displayName:"Rehearsal",strapiId:1})},editor); assert.equal(x.r.status,403);
x=await req("/items/Author",{method:"POST",body:JSON.stringify({slug:`rehearsal-source-hash-${id}`,name:"Rehearsal",displayName:"Rehearsal",sourceHash:"forbidden"})},editor); assert.equal(x.r.status,403);
x=await req("/items/Author",{method:"POST",body:JSON.stringify({slug:`rehearsal-${id}`,name:"Rehearsal",displayName:"Rehearsal",publishedAt:null})},editor); assert.equal(x.r.status,200); author=x.j.data.id;
x=await req("/flows?filter[name][_eq]=CASN%20Revalidate%20Website%20Cache&limit=2",{},admin); assert.equal(x.j.data.length,1); const primary=x.j.data[0].id;
x=await req(`/operations?filter[flow][_eq]=${primary}&filter[key][_eq]=revalidate&limit=2`,{},admin); assert.equal(x.j.data.length,1); assert.equal(x.j.data[0].options.url,"http://app:3000/api/revalidate"); assert.equal(x.j.data[0].options.headers.find(h=>h.header==="x-directus-secret").value,secret); assert.equal(x.j.data[0].options.body.model,"{{$trigger.collection}}");
x=await req("/flows",{method:"POST",body:JSON.stringify({name:`Rehearsal receiver ${id}`,status:"active",trigger:"event",accountability:"all",options:{type:"action",scope:["items.create"],collections:["Analysis"]}})},admin); assert.equal(x.r.status,200); flow=x.j.data.id;
x=await req("/operations",{method:"POST",body:JSON.stringify({name:"Receiver",key:"receiver",type:"request",position_x:1,position_y:1,flow,options:{url:"http://127.0.0.1:3900/api/revalidate",method:"POST",headers:[{header:"Content-Type",value:"application/json"},{header:"x-directus-secret",value:secret}],body:{model:"{{$trigger.collection}}",event:"{{$trigger.event}}",key:"{{$trigger.key}}",keys:"{{$trigger.keys}}"}}})},admin); assert.equal(x.r.status,200); op=x.j.data;
assert.equal((await req(`/flows/${flow}`,{method:"PATCH",body:JSON.stringify({operation:op.id})},admin)).r.status,200);
x=await req("/items/Analysis",{method:"POST",body:JSON.stringify({title:"Rehearsal",slug:`rehearsal-${id}`,authorId:author,contentMdx:"x",publishedAt:null})},editor); assert.equal(x.r.status,200); analysis=x.j.data.id;
for(let i=0;i<50&&!receiver.length;i++) await new Promise(r=>setTimeout(r,100)); assert.equal(receiver.length,1); assert.equal(receiver[0].h["x-directus-secret"],secret); const payload=JSON.parse(receiver[0].b); assert.equal(payload.model,"Analysis"); assert.equal(payload.event,"Analysis.items.create"); assert.equal(String(payload.key),String(analysis)); assert(String(payload.keys).includes(String(analysis))); console.log("isolated Directus editor/guard/webhook check passed");
} finally { try { if(analysis&&editor) assert.equal((await req(`/items/Analysis/${analysis}`,{method:"DELETE"},editor)).r.status,204); if(author&&editor) assert.equal((await req(`/items/Author/${author}`,{method:"DELETE"},editor)).r.status,204); if(op&&admin) assert.equal((await req(`/operations/${op.id}`,{method:"DELETE"},admin)).r.status,204); if(flow&&admin) assert.equal((await req(`/flows/${flow}`,{method:"DELETE"},admin)).r.status,204); if(user&&admin) assert.equal((await req(`/users/${user}`,{method:"DELETE"},admin)).r.status,204); } finally { if(srv) await new Promise(resolve=>srv.close(resolve)); } }})().catch(e=>{console.error(e.message);process.exit(1)});'
```

The existing `npm run directus:smoke` remains a separate disposable CI/local
test; it is not a substitute for this stack-bound acceptance check.

## Gate 5: exact rollback without pre-existing services

For a rollback, first transfer the protected directory by an approved encrypted
channel to the rollback context host, preserving its name. Re-run the Gate 2
manifest, checksum, SQL-marker, and `tar -tf` checks there **before** database
or volume destruction. The rollback project need not have running MySQL or
Nginx: create resources, validate labels, then start only MySQL.

```bash
readonly rollback_project="${ROLLBACK_COMPOSE_PROJECT:?}"
readonly expected_rollback_database="${EXPECTED_ROLLBACK_DATABASE:?}"
readonly ROLLBACK_APP_URL="${ROLLBACK_APP_URL:?}"
rollback_backup_root="$(realpath -e "${ROLLBACK_SECRET_BACKUP_ROOT:?}")"; readonly rollback_backup_root
rollback_backup="$(realpath -e "$rollback_backup_root/casn-$source_project-$expected_backup_id")"; readonly rollback_backup
[[ "$rollback_context" == "$source_context" && "$rollback_endpoint" == "$source_endpoint" && "$rollback_project" == "$source_project" && "$rollback_backup" = /* ]]
[[ "$(basename "$rollback_backup")" == "casn-$source_project-$expected_backup_id" ]]
grep -Fx "backup_id=$expected_backup_id" "$rollback_backup/manifest"
grep -Fx "source_context=$source_context" "$rollback_backup/manifest"
grep -Fx "source_endpoint_sha256=$(db_hash "$source_endpoint")" "$rollback_backup/manifest"
grep -Fx "source_database_sha256=$(db_hash "$expected_source_database")" "$rollback_backup/manifest"
grep -Fx "source_mysql_service=$source_mysql_service" "$rollback_backup/manifest"
grep -Fx "source_app_writer_service=$source_app_writer_service" "$rollback_backup/manifest"
grep -Fx "source_cms_writer_service=$source_cms_writer_service" "$rollback_backup/manifest"
grep -Fx "source_nginx_service=$source_nginx_service" "$rollback_backup/manifest"
grep -Fx "source_legacy_volume=$source_legacy_volume" "$rollback_backup/manifest"
grep -Fx "source_legacy_volume_logical_name=$source_legacy_volume_logical_name" "$rollback_backup/manifest"
grep -Fx "source_legacy_mount_service=$source_legacy_mount_service" "$rollback_backup/manifest"
grep -Fx "source_legacy_container_path=$source_legacy_container_path" "$rollback_backup/manifest"
grep -Fx "source_services_sha256=$(sha256sum "$rollback_backup/source-services.txt" | awk '{print $1}')" "$rollback_backup/manifest"
grep -Fx "source_nginx_context_path=$source_nginx_context_path" "$rollback_backup/manifest"
grep -Fx "source_nginx_container_path=$source_nginx_container_path" "$rollback_backup/manifest"
(cd "$rollback_backup" && sha256sum -c checksums.sha256)
diff -u "$rollback_backup/source-services.txt" <(cut -f1 "$rollback_backup/artifact-evidence.tsv" | LC_ALL=C sort)
rg -Fq -- 'MySQL dump' "$rollback_backup/mysql-before.sql"
rg -Fq -- 'CREATE TABLE `Author`' "$rollback_backup/mysql-before.sql"
rg -Fq -- 'CREATE TABLE `Analysis`' "$rollback_backup/mysql-before.sql"
rg -Fq -- 'CREATE TABLE `IssueCollection`' "$rollback_backup/mysql-before.sql"
rollback_env="$(realpath -e "$rollback_backup/source.env")"; readonly rollback_env
rollback_compose="$(realpath -e "$rollback_backup/source-compose.rendered.yml")"; readonly rollback_compose
declare -a rollback_docker=(docker --context "$source_context")
declare -a rollback_compose_cmd=("${rollback_docker[@]}" compose --project-name "$source_project" --env-file "$rollback_env" --file "$rollback_compose" --file "$rollback_backup/source-images.override.yml")
"${rollback_compose_cmd[@]}" config --quiet
tar -tf "$rollback_backup/legacy-uploads-before.tar" >/dev/null
mapfile -t rollback_services < <("${rollback_compose_cmd[@]}" config --format json | jq -er '.services | keys[]' | LC_ALL=C sort)
diff -u "$rollback_backup/source-services.txt" <(printf '%s\n' "${rollback_services[@]}")
mapfile -t source_services < "$rollback_backup/source-services.txt"
(( ${#source_services[@]} >= 4 ))
for source_service in "${source_services[@]}"; do [[ "$source_service" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; done
"${rollback_compose_cmd[@]}" create --pull never "${source_services[@]}"
for source_service in "${source_services[@]}"; do
  rollback_cid="$("${rollback_compose_cmd[@]}" ps -aq "$source_service")"; [[ -n "$rollback_cid" ]]
  [[ "$("${rollback_docker[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$rollback_cid")" == "$rollback_project" ]]
  [[ "$("${rollback_docker[@]}" inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$rollback_cid")" == "$source_service" ]]
  rollback_image="$("${rollback_docker[@]}" inspect --format '{{.Image}}' "$rollback_cid")"
  awk -F '\t' -v service="$source_service" -v image="$rollback_image" '$1 == service && $2 == image { found=1 } END { exit(found ? 0 : 1) }' "$rollback_backup/artifact-evidence.tsv"
done
rollback_mysql="$("${rollback_compose_cmd[@]}" ps -aq "$source_mysql_service")"; [[ -n "$rollback_mysql" ]]
rollback_legacy_volume="$source_legacy_volume"
[[ "$("${rollback_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$rollback_legacy_volume")" == "$rollback_project" ]]
[[ "$("${rollback_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$rollback_legacy_volume")" == "$source_legacy_volume_logical_name" ]]
"${rollback_compose_cmd[@]}" config --format json | jq -e --arg logical "$source_legacy_volume_logical_name" --arg actual "$source_legacy_volume" '.volumes[$logical] and ((.volumes[$logical].name // $logical) == $actual)' >/dev/null
rollback_legacy_mount_cid="$("${rollback_compose_cmd[@]}" ps -aq "$source_legacy_mount_service")"; [[ -n "$rollback_legacy_mount_cid" ]]
"${rollback_docker[@]}" inspect "$rollback_legacy_mount_cid" | jq -e --arg actual "$rollback_legacy_volume" --arg destination "$source_legacy_container_path" '.[0].Mounts[] | select(.Type == "volume" and (.Name == $actual or .Source == $actual) and .Destination == $destination)' >/dev/null
if "${rollback_docker[@]}" inspect "$rollback_mysql" | jq -e --arg actual "$rollback_legacy_volume" '.[0].Mounts[]? | select(.Type == "volume" and (.Name == $actual or .Source == $actual))' >/dev/null; then exit 1; fi
"${rollback_compose_cmd[@]}" up -d --pull never "$source_mysql_service"
[[ "$("${rollback_docker[@]}" inspect --format '{{ .State.Running }}' "$rollback_mysql")" == true ]]
rollback_mysql_image="$("${rollback_docker[@]}" inspect --format '{{.Image}}' "$rollback_mysql")"
awk -F '\t' -v service="$source_mysql_service" -v image="$rollback_mysql_image" '$1 == service && $2 == image { found=1 } END { exit(found ? 0 : 1) }' "$rollback_backup/artifact-evidence.tsv"
rollback_database="$("${rollback_compose_cmd[@]}" exec -T "$source_mysql_service" sh -ec 'printf %s "$MYSQL_DATABASE"')"; [[ "$rollback_database" == "$expected_rollback_database" && "$rollback_database" == "$expected_source_database" ]]
"${rollback_compose_cmd[@]}" exec -T "$source_mysql_service" sh -ec 'exec mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT DATABASE();"' | grep -Fx "$expected_source_database" >/dev/null
"${rollback_compose_cmd[@]}" stop "$source_app_writer_service" "$source_cms_writer_service"
"${rollback_compose_cmd[@]}" exec -T "$source_mysql_service" sh -ec 'case "$MYSQL_DATABASE" in (*[!A-Za-z0-9_]*) exit 2;; esac; exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
"${rollback_compose_cmd[@]}" exec -T "$source_mysql_service" sh -ec 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < "$rollback_backup/mysql-before.sql"
[[ "$("${rollback_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$rollback_legacy_volume")" == "$rollback_project" && "$("${rollback_docker[@]}" volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$rollback_legacy_volume")" == "$source_legacy_volume_logical_name" ]]
"${rollback_docker[@]}" inspect "$rollback_legacy_mount_cid" | jq -e --arg actual "$rollback_legacy_volume" --arg destination "$source_legacy_container_path" '.[0].Mounts[] | select(.Type == "volume" and (.Name == $actual or .Source == $actual) and .Destination == $destination)' >/dev/null
if "${rollback_docker[@]}" inspect "$rollback_mysql" | jq -e --arg actual "$rollback_legacy_volume" '.[0].Mounts[]? | select(.Type == "volume" and (.Name == $actual or .Source == $actual))' >/dev/null; then exit 1; fi
"${rollback_docker[@]}" run -i --rm --mount "type=volume,src=$rollback_legacy_volume,dst=/to" "$volume_helper_image" sh -ec 'set -eu; find /to -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; exec tar -C /to -xf -' < "$rollback_backup/legacy-uploads-before.tar"
source_nginx_dir="$(dirname "$source_nginx_context_path")"; source_nginx_base="$(basename "$source_nginx_context_path")"
[[ "$source_nginx_dir" = /* && "$source_nginx_base" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]
rollback_nginx="$("${rollback_compose_cmd[@]}" ps -aq "$source_nginx_service")"; [[ -n "$rollback_nginx" ]]
rollback_nginx_mounts="$("${rollback_docker[@]}" inspect --format '{{range .Mounts}}{{printf "%s\t%s\n" .Source .Destination}}{{end}}' "$rollback_nginx")"
grep -Fx "$source_nginx_context_path	$source_nginx_container_path" <<< "$rollback_nginx_mounts" >/dev/null
"${rollback_docker[@]}" run -i --rm --mount "type=bind,src=$source_nginx_dir,dst=/to" "$volume_helper_image" sh -ec 'set -eu; test -d /to; cat > "/to/$1"' sh "$source_nginx_base" < "$rollback_backup/source-nginx.conf"
"${rollback_compose_cmd[@]}" up -d --pull never --remove-orphans
for source_service in "${source_services[@]}"; do
  rollback_cid="$("${rollback_compose_cmd[@]}" ps -q "$source_service")"
  rollback_image="$("${rollback_docker[@]}" inspect --format '{{.Image}}' "$rollback_cid")"
  awk -F '\t' -v service="$source_service" -v image="$rollback_image" '$1 == service && $2 == image { found=1 } END { exit(found ? 0 : 1) }' "$rollback_backup/artifact-evidence.tsv"
done
[[ "$ROLLBACK_APP_URL" =~ ^https?://[^/]+$ && "$ROLLBACK_APP_URL" != *casn.pl* && "$ROLLBACK_APP_URL" != http://127.0.0.1* ]]
run_source_acceptance "$rollback_context" "$rollback_project" "$rollback_env" "$rollback_compose" "$source_mysql_service" "$source_app_writer_service" "$source_cms_writer_service" "$source_nginx_service" "$ROLLBACK_APP_URL" "$expected_source_database" | tee "$evidence_root/rollback-source-acceptance.txt"
```

Never substitute a mutable image tag, a default Docker context, or an
unrecorded database change. A failed gate stops the operation and requires a
new approval.
