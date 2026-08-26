#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
readonly exporter="$repository_root/scripts/snapshot/export-production.sh"
readonly importer="$repository_root/scripts/snapshot/import-local.sh"
readonly verifier="$repository_root/scripts/snapshot/verify-parity.mjs"
readonly compose_file="$repository_root/docker-compose.snapshot-local.yml"
readonly mysql_image='mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b'
readonly directus_image='directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869'
readonly fixture_revision='cccccccccccccccccccccccccccccccccccccccc'

die() { printf 'snapshot roundtrip failed\n' >&2; exit 1; }
for command_name in age-keygen curl docker jq node sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || die
done

nonce="${SNAPSHOT_SMOKE_NONCE:-manual$$}"
[[ "$nonce" =~ ^[a-zA-Z0-9]{1,32}$ ]] || die
nonce="${nonce,,}"
source_project="casn_snapshot_source_$nonce"
source_mysql="${source_project}_mysql"
source_directus="${source_project}_directus"
source_nginx="${source_project}_nginx"
source_network="${source_project}_default"
source_directus_volume="${source_project}_directus_uploads"
source_legacy_volume="${source_project}_strapi_uploads"
readonly nonce source_project source_mysql source_directus source_nginx source_network
readonly source_directus_volume source_legacy_volume

temporary_directory="$(mktemp -d /tmp/casn-snapshot-roundtrip.XXXXXXXX)"
readonly temporary_directory
chmod 700 "$temporary_directory"
output_directory="$temporary_directory/output"
handoff_directory="$temporary_directory/handoff"
fixture_directory="$temporary_directory/fixture"
mkdir "$output_directory" "$handoff_directory" "$fixture_directory"
chmod 700 "$output_directory" "$handoff_directory" "$fixture_directory"

candidate_project=''
http_pid=''
app_image=''
nginx_image=''
cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  set +e
  if [[ -n "$http_pid" ]]; then
    kill "$http_pid" >/dev/null 2>&1
    wait "$http_pid" >/dev/null 2>&1
  fi
  if [[ -n "$candidate_project" && "$candidate_project" =~ ^casn_snapshot_[a-z0-9_-]+$ ]]; then
    docker compose --project-name "$candidate_project" \
      --env-file "$temporary_directory/local.env" --file "$compose_file" \
      down --volumes --remove-orphans >/dev/null 2>&1
  fi
  docker rm -f "$source_nginx" "$source_directus" "$source_mysql" >/dev/null 2>&1
  docker volume rm "$source_directus_volume" "$source_legacy_volume" >/dev/null 2>&1
  docker network rm "$source_network" >/dev/null 2>&1
  [[ -z "$app_image" ]] || docker image rm "$app_image" >/dev/null 2>&1
  [[ -z "$nginx_image" ]] || docker image rm "$nginx_image" >/dev/null 2>&1
  case "$temporary_directory" in
    /tmp/casn-snapshot-roundtrip.*) rm -rf -- "$temporary_directory" ;;
    *) exit_status=1 ;;
  esac
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

for resource in "$source_mysql" "$source_directus" "$source_nginx"; do
  ! docker container inspect "$resource" >/dev/null 2>&1 || die
done
for resource in "$source_directus_volume" "$source_legacy_volume"; do
  ! docker volume inspect "$resource" >/dev/null 2>&1 || die
done
! docker network inspect "$source_network" >/dev/null 2>&1 || die

cat > "$fixture_directory/server.js" <<'JS'
const http = require('node:http');
const authors = [{ id: 1, slug: 'author-one', avatar: '/cms/assets/11111111-1111-4111-8111-111111111111' }, { id: 2, slug: 'author-two', avatar: null }];
const analyses = [{ id: 1, slug: 'analysis-one', legacyFile: '/cms/uploads/legacy.jpg' }, { id: 2, slug: 'analysis-two', legacyFile: null }];
const sitemap = `<urlset>
<url><loc>http://127.0.0.1/</loc></url>
<url><loc>http://127.0.0.1/analizy</loc></url>
<url><loc>http://127.0.0.1/autorzy</loc></url>
<url><loc>http://127.0.0.1/zbiory</loc></url>
</urlset>`;
http.createServer((request, response) => {
  response.statusCode = 200;
  response.setHeader('content-type', request.url === '/sitemap.xml' ? 'application/xml' : 'application/json');
  if (request.url === '/api/authors') response.end(JSON.stringify(authors));
  else if (request.url === '/api/analyses') response.end(JSON.stringify(analyses));
  else if (request.url === '/sitemap.xml') response.end(sitemap);
  else if (request.url === '/api/health') response.end('{"status":"ok"}');
  else response.end('{"ok":true}');
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
JS
cat > "$fixture_directory/Dockerfile.app" <<EOF
FROM node:22-alpine
LABEL org.opencontainers.image.revision=$fixture_revision
RUN apk add --no-cache curl
WORKDIR /app
COPY server.js /app/server.js
CMD ["node", "server.js"]
EOF
cat > "$fixture_directory/Dockerfile.nginx" <<EOF
FROM nginx:1.27-alpine
LABEL org.opencontainers.image.revision=$fixture_revision
EOF
docker build --quiet --file "$fixture_directory/Dockerfile.app" "$fixture_directory" > "$temporary_directory/app.image"
docker build --quiet --file "$fixture_directory/Dockerfile.nginx" "$fixture_directory" > "$temporary_directory/nginx.image"
app_image="$(<"$temporary_directory/app.image")"
nginx_image="$(<"$temporary_directory/nginx.image")"
[[ "$app_image" =~ ^sha256:[0-9a-f]{64}$ && "$nginx_image" =~ ^sha256:[0-9a-f]{64}$ ]] || die

docker network create --label "com.docker.compose.project=$source_project" \
  --label com.docker.compose.network=default "$source_network" >/dev/null
docker volume create --label "com.docker.compose.project=$source_project" \
  --label com.docker.compose.volume=directus_uploads "$source_directus_volume" >/dev/null
docker volume create --label "com.docker.compose.project=$source_project" \
  --label com.docker.compose.volume=strapi_uploads "$source_legacy_volume" >/dev/null
docker run -d --name "$source_nginx" --network "$source_network" \
  --label "com.docker.compose.project=$source_project" --label com.docker.compose.service=nginx \
  --mount "type=volume,src=$source_legacy_volume,dst=/legacy-strapi-uploads,readonly" \
  --entrypoint sh "$mysql_image" -c 'sleep infinity' >/dev/null

readonly source_password='snapshot-smoke-local-only'
docker run -d --name "$source_mysql" --network "$source_network" --network-alias mysql \
  --label "com.docker.compose.project=$source_project" --label com.docker.compose.service=mysql \
  -e "MYSQL_ROOT_PASSWORD=$source_password" -e MYSQL_DATABASE=casn "$mysql_image" >/dev/null
for _ in {1..90}; do
  docker exec "$source_mysql" sh -ec \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 -uroot --silent' >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$source_mysql" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 -uroot --silent' >/dev/null || die

docker run -d --name "$source_directus" --network "$source_network" \
  --label "com.docker.compose.project=$source_project" --label com.docker.compose.service=directus \
  --health-cmd="node -e \"fetch('http://127.0.0.1:8055/server/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" \
  --health-interval=2s --health-timeout=2s --health-retries=60 \
  -e KEY=roundtrip-key -e SECRET=roundtrip-secret \
  -e ADMIN_EMAIL=roundtrip@example.com -e ADMIN_PASSWORD=roundtrip-admin-password \
  -e DB_CLIENT=mysql -e DB_HOST=mysql -e DB_PORT=3306 -e DB_DATABASE=casn \
  -e DB_USER=root -e "DB_PASSWORD=$source_password" \
  -e STORAGE_LOCATIONS=local -e STORAGE_LOCAL_DRIVER=local -e STORAGE_LOCAL_ROOT=/directus/uploads \
  --mount "type=bind,src=$repository_root/directus/extensions/directus-extension-casn-field-guard,dst=/directus/extensions/directus-extension-casn-field-guard,readonly" \
  --mount "type=volume,src=$source_directus_volume,dst=/directus/uploads" "$directus_image" >/dev/null
for _ in {1..120}; do
  [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$source_directus")" == healthy ]] && break
  sleep 1
done
[[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$source_directus")" == healthy ]] || die

docker exec -i "$source_mysql" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --database=casn' <<'SQL'
CREATE TABLE SnapshotFixture (id INT NOT NULL PRIMARY KEY, label VARCHAR(64) NOT NULL) ENGINE=InnoDB;
CREATE TABLE SnapshotFixtureAudit (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, fixture_id INT NOT NULL) ENGINE=InnoDB;
CREATE VIEW SnapshotFixtureView AS SELECT id, label FROM SnapshotFixture;
CREATE TRIGGER SnapshotFixtureInsert AFTER INSERT ON SnapshotFixture FOR EACH ROW INSERT INTO SnapshotFixtureAudit (fixture_id) VALUES (NEW.id);
CREATE PROCEDURE SnapshotFixtureCount() SELECT COUNT(*) FROM SnapshotFixture;
CREATE EVENT SnapshotFixtureEvent ON SCHEDULE AT CURRENT_TIMESTAMP + INTERVAL 1 DAY DO INSERT INTO SnapshotFixtureAudit (fixture_id) VALUES (0);
INSERT INTO SnapshotFixture (id, label) VALUES (1, 'first'), (2, 'second'), (3, 'third');
INSERT INTO directus_files (id, storage, filename_disk, filename_download, title, type, filesize, uploaded_on)
VALUES ('11111111-1111-4111-8111-111111111111', 'local', '11111111-1111-4111-8111-111111111111', 'author.jpg', 'Author', 'image/jpeg', 12, CURRENT_TIMESTAMP);
INSERT INTO directus_permissions (collection, action, permissions, fields, policy)
SELECT 'directus_files', 'read', '{}', '*', id FROM directus_policies WHERE name = '$t:public_label';
SQL
docker run --rm --mount "type=volume,src=$source_directus_volume,dst=/to" "$mysql_image" \
  sh -ec 'mkdir -p /to/nested; printf directus-one > /to/11111111-1111-4111-8111-111111111111; printf directus-two > /to/nested/two.png'
docker run --rm --mount "type=volume,src=$source_legacy_volume,dst=/to" "$mysql_image" \
  sh -ec 'mkdir -p /to/history; printf legacy-one > /to/legacy.jpg; printf legacy-two > /to/history/two.pdf; printf legacy-three > /to/history/three.png'

source_port="$(node -e "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
PORT="$source_port" node "$fixture_directory/server.js" > "$temporary_directory/http.log" 2>&1 &
http_pid=$!
for _ in {1..50}; do
  curl -fsS "http://127.0.0.1:$source_port/api/health" >/dev/null 2>&1 && break
  sleep 0.1
done
curl -fsS "http://127.0.0.1:$source_port/api/health" >/dev/null || die

server_uuid="$(docker exec "$source_mysql" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root --database=casn --execute "SELECT @@server_uuid;"')"
identity="$temporary_directory/snapshot.agekey"
age-keygen -o "$identity" >/dev/null 2>&1
chmod 600 "$identity"
recipient="$(age-keygen -y "$identity")"
export_env="$temporary_directory/export.env"
umask 077
cat > "$export_env" <<EOF
SOURCE_COMPOSE_PROJECT=$source_project
SOURCE_MYSQL_SERVICE=mysql
SOURCE_DATABASE=casn
SOURCE_DIRECTUS_SERVICE=directus
SOURCE_NGINX_SERVICE=nginx
SOURCE_DIRECTUS_UPLOADS_VOLUME=directus_uploads
SOURCE_LEGACY_UPLOADS_VOLUME=strapi_uploads
SOURCE_DOCKER_NETWORK=default
EXPECTED_DATABASE_NAME_HASH=$(printf casn | sha256sum | awk '{print $1}')
EXPECTED_SERVER_UUID_HASH=$(printf %s "$server_uuid" | sha256sum | awk '{print $1}')
SNAPSHOT_EXPORT_USER=root
SNAPSHOT_EXPORT_PASSWORD=$source_password
SNAPSHOT_AGE_RECIPIENT=$recipient
SNAPSHOT_OUTPUT_DIRECTORY=$output_directory
SOURCE_PUBLIC_URL=http://127.0.0.1:$source_port
EOF
chmod 600 "$export_env"
bash "$exporter" --env-file "$export_env" >/dev/null

mapfile -t artifacts < <(find "$output_directory" -maxdepth 1 -type f -name '*.casn-snapshot.age' -printf '%f\n')
mapfile -t manifests < <(find "$output_directory" -maxdepth 1 -type f -name '*.manifest.json' -printf '%f\n')
[[ ${#artifacts[@]} -eq 1 && ${#manifests[@]} -eq 1 ]] || die
snapshot_id="${artifacts[0]%.casn-snapshot.age}"
[[ "${manifests[0]}" == "$snapshot_id.manifest.json" ]] || die

http_port="$(node -e "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
local_env="$temporary_directory/local.env"
cat > "$local_env" <<EOF
MYSQL_ROOT_PASSWORD=local-root-password
MYSQL_USER=casn_local_user
MYSQL_PASSWORD=local-user-password
DIRECTUS_KEY=local-directus-key
DIRECTUS_SECRET=local-directus-secret
REVALIDATE_SECRET=local-revalidate-secret
NEXTAUTH_SECRET=local-nextauth-secret
APP_IMAGE=$app_image
NGINX_IMAGE=$nginx_image
APP_REVISION=$fixture_revision
CASN_LOCAL_HTTP_PORT=$http_port
APP_PUBLIC_URL=http://127.0.0.1:$http_port
DIRECTUS_PUBLIC_URL=http://127.0.0.1:$http_port/cms
SNAPSHOT_HANDOFF_DIRECTORY=$handoff_directory
EOF
chmod 600 "$local_env"
candidate_project="casn_snapshot_${snapshot_id,,}"
bash "$importer" --artifact "$output_directory/${artifacts[0]}" \
  --manifest "$output_directory/${manifests[0]}" --identity "$identity" \
  --env-file "$local_env" --snapshot-id "$snapshot_id" >/dev/null

handoff="$handoff_directory/$snapshot_id.candidate.json"
[[ "$(jq -r '.project' "$handoff")" == "$candidate_project" ]] || die
[[ "$candidate_project" =~ ^casn_snapshot_[a-z0-9_-]+$ ]] || die
for _ in {1..120}; do
  curl -fsS "http://127.0.0.1:$http_port/api/health" >/dev/null 2>&1 \
    && curl -fsS "http://127.0.0.1:$http_port/cms/server/ping" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$http_port/api/health" >/dev/null || die
curl -fsS "http://127.0.0.1:$http_port/cms/server/ping" >/dev/null || die

report="$temporary_directory/parity-report.json"
if ! node "$verifier" --handoff "$handoff" --manifest "$output_directory/${manifests[0]}" \
  --base-url "http://127.0.0.1:$http_port" --report "$report" >/dev/null; then
  [[ ! -f "$report" ]] || jq '.gates' "$report" >&2
  [[ ! -f "$report" ]] || jq -n \
    --arg live "$(jq -r '.hashes.database' "$report")" \
    --arg imported "$(jq -r '.databaseContentSha256' "$handoff")" \
    --arg source "$(jq -r '.database.sha256' "$output_directory/${manifests[0]}")" \
    '{databaseHashes:{live:$live,imported:$imported,source:$source}}' >&2
  die
fi
jq -e '.passed == true and .counts.database.views >= 1 and .counts.database.triggers >= 1
  and .counts.database.routines >= 1 and .counts.database.events >= 1
  and .counts.media.directus >= 2 and .counts.media.legacy == 3' "$report" >/dev/null || die
printf 'snapshot roundtrip verified\n'
