#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
manifest_script="$repository_root/scripts/snapshot/manifest.sh"
verifier="$repository_root/scripts/snapshot/verify-parity.mjs"
readonly manifest_script verifier
readonly mysql_image='mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b'

die() {
  printf 'snapshot roundtrip failed\n' >&2
  exit 1
}

for command_name in age age-keygen docker jq node sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || die
done

nonce="${SNAPSHOT_SMOKE_NONCE:-manual$$}"
[[ "$nonce" =~ ^[a-zA-Z0-9]{1,32}$ ]] || die
nonce="${nonce,,}"
readonly nonce
project="casn_snapshot_smoke_$nonce"
source_container="${project}_source_mysql"
mysql_container="${project}_mysql"
directus_container="${project}_directus"
app_container="${project}_app"
nginx_container="${project}_nginx"
source_network="${project}_source_network"
candidate_network="${project}_internal"
loopback_network="${project}_loopback"
source_directus_volume="${project}_source_directus"
source_legacy_volume="${project}_source_legacy"
candidate_directus_volume="${project}_directus_uploads"
candidate_legacy_volume="${project}_strapi_uploads"
readonly project source_container mysql_container directus_container app_container nginx_container
readonly source_network candidate_network loopback_network source_directus_volume source_legacy_volume
readonly candidate_directus_volume candidate_legacy_volume

temporary_directory="$(mktemp -d /tmp/casn-snapshot-roundtrip.XXXXXXXX)"
readonly temporary_directory
chmod 700 "$temporary_directory"
http_pid=''

cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  set +e
  if [[ -n "$http_pid" ]]; then
    kill "$http_pid" >/dev/null 2>&1
    wait "$http_pid" >/dev/null 2>&1
  fi
  docker rm -f \
    "$nginx_container" "$app_container" "$directus_container" \
    "$mysql_container" "$source_container" >/dev/null 2>&1
  docker volume rm \
    "$candidate_legacy_volume" "$candidate_directus_volume" \
    "$source_legacy_volume" "$source_directus_volume" >/dev/null 2>&1
  docker network rm "$candidate_network" "$loopback_network" "$source_network" >/dev/null 2>&1
  case "$temporary_directory" in
    /tmp/casn-snapshot-roundtrip.*) rm -rf -- "$temporary_directory" ;;
    *) exit_status=1 ;;
  esac
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

for resource in "$source_container" "$mysql_container" "$directus_container" "$app_container" "$nginx_container"; do
  ! docker container inspect "$resource" >/dev/null 2>&1 || die
done
for resource in "$source_directus_volume" "$source_legacy_volume" "$candidate_directus_volume" "$candidate_legacy_volume"; do
  ! docker volume inspect "$resource" >/dev/null 2>&1 || die
done
for resource in "$source_network" "$candidate_network" "$loopback_network"; do
  ! docker network inspect "$resource" >/dev/null 2>&1 || die
done

docker network create "$source_network" >/dev/null
docker network create --internal \
  --label "com.docker.compose.project=$project" \
  --label com.docker.compose.network=casn_snapshot_internal \
  "$candidate_network" >/dev/null
docker network create "$loopback_network" >/dev/null
docker volume create "$source_directus_volume" >/dev/null
docker volume create "$source_legacy_volume" >/dev/null
docker volume create \
  --label "com.docker.compose.project=$project" \
  --label com.docker.compose.volume=directus_uploads \
  "$candidate_directus_volume" >/dev/null
docker volume create \
  --label "com.docker.compose.project=$project" \
  --label com.docker.compose.volume=strapi_uploads \
  "$candidate_legacy_volume" >/dev/null

readonly smoke_password='snapshot-smoke-local-only'
docker run -d --name "$source_container" --network "$source_network" \
  -e "MYSQL_ROOT_PASSWORD=$smoke_password" -e MYSQL_DATABASE=casn \
  "$mysql_image" >/dev/null
docker run -d --name "$mysql_container" --network "$loopback_network" \
  --label "com.docker.compose.project=$project" --label com.docker.compose.service=mysql \
  -e "MYSQL_ROOT_PASSWORD=$smoke_password" -e MYSQL_DATABASE=casn_local \
  -p 127.0.0.1::3306 "$mysql_image" >/dev/null
docker network connect "$candidate_network" "$mysql_container"

wait_for_mysql() {
  local container="$1"
  for _ in {1..60}; do
    if docker exec "$container" sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 -uroot --silent' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die
}
wait_for_mysql "$source_container"
wait_for_mysql "$mysql_container"

docker exec -i "$source_container" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --database=casn' <<'SQL'
CREATE TABLE SnapshotFixture (
  id INT NOT NULL PRIMARY KEY,
  label VARCHAR(64) NOT NULL
) ENGINE=InnoDB;
INSERT INTO SnapshotFixture (id, label) VALUES (1, 'first'), (2, 'second'), (3, 'third');
SQL

docker run --rm --mount "type=volume,src=$source_directus_volume,dst=/to" "$mysql_image" \
  sh -ec 'mkdir -p /to/nested; printf directus-one > /to/one.jpg; printf directus-two > /to/nested/two.png'
docker run --rm --mount "type=volume,src=$source_legacy_volume,dst=/to" "$mysql_image" \
  sh -ec 'mkdir -p /to/history; printf legacy-one > /to/legacy.jpg; printf legacy-two > /to/history/two.pdf; printf legacy-three > /to/history/three.png'

payload="$temporary_directory/payload"
restored="$temporary_directory/restored"
mkdir "$payload" "$restored"
chmod 700 "$payload" "$restored"

docker exec "$source_container" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --quick --hex-blob --routines --triggers --events --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --skip-dump-date --skip-comments casn' \
  > "$payload/database.sql"
docker run --rm --mount "type=volume,src=$source_directus_volume,dst=/from,readonly" "$mysql_image" \
  tar -C /from -cf - . > "$payload/directus-uploads.tar"
docker run --rm --mount "type=volume,src=$source_legacy_volume,dst=/from,readonly" "$mysql_image" \
  tar -C /from -cf - . > "$payload/legacy-uploads.tar"
chmod 600 "$payload/database.sql" "$payload/directus-uploads.tar" "$payload/legacy-uploads.tar"

cat > "$temporary_directory/authors.json" <<'JSON'
[{"avatar":"/cms/assets/author.jpg","id":1,"slug":"author-one"},{"avatar":null,"id":2,"slug":"author-two"}]
JSON
cat > "$temporary_directory/analyses.json" <<'JSON'
[{"id":1,"legacyFile":"/cms/uploads/legacy.jpg","slug":"analysis-one"},{"id":2,"legacyFile":null,"slug":"analysis-two"}]
JSON
cat > "$temporary_directory/sitemap.xml" <<'XML'
<urlset>
<url><loc>http://127.0.0.1/</loc></url>
<url><loc>http://127.0.0.1/analizy</loc></url>
<url><loc>http://127.0.0.1/autorzy</loc></url>
<url><loc>http://127.0.0.1/zbiory</loc></url>
</urlset>
XML
jq -S 'sort_by(.id // .slug // .url // "")' "$temporary_directory/authors.json" > "$temporary_directory/authors.normalized.json"
jq -S 'sort_by(.id // .slug // .url // "")' "$temporary_directory/analyses.json" > "$temporary_directory/analyses.normalized.json"
printf '/\n/analizy\n/autorzy\n/zbiory\n' | LC_ALL=C sort > "$temporary_directory/sitemap.paths"

mysql_query() {
  local sql="$1"
  docker exec "$source_container" sh -ec \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root --database=casn --execute "$1"' sh "$sql"
}
source_uuid="$(mysql_query 'SELECT @@server_uuid;')"
snapshot_id='20260826T121500Z-a1b2c3d4'
readonly snapshot_id
jq -n \
  --arg snapshot_id "$snapshot_id" \
  --arg database_name_hash "$(printf casn | sha256sum | awk '{print $1}')" \
  --arg server_uuid_hash "$(printf %s "$source_uuid" | sha256sum | awk '{print $1}')" \
  --arg authors_hash "$(sha256sum "$temporary_directory/authors.normalized.json" | awk '{print $1}')" \
  --arg analyses_hash "$(sha256sum "$temporary_directory/analyses.normalized.json" | awk '{print $1}')" \
  --arg sitemap_hash "$(sha256sum "$temporary_directory/sitemap.paths" | awk '{print $1}')" \
  '{
    snapshotId:$snapshot_id, capturedAt:"2026-08-26T12:15:00Z",
    source:{databaseNameHash:$database_name_hash,serverUuidHash:$server_uuid_hash},
    database:{tables:1,views:0,triggers:0,routines:0,events:0},
    media:{directus:{files:2},legacy:{files:3}},
    public:{authors:{count:2,sha256:$authors_hash},analyses:{count:2,sha256:$analyses_hash},sitemap:{count:4,sha256:$sitemap_hash}}
  }' > "$payload/snapshot.json"
chmod 600 "$payload/snapshot.json"
manifest="$temporary_directory/$snapshot_id.manifest.json"
bash "$manifest_script" build --input "$payload" --output "$manifest" >/dev/null

identity="$temporary_directory/snapshot.agekey"
age-keygen -o "$identity" >/dev/null 2>&1
chmod 600 "$identity"
recipient="$(age-keygen -y "$identity")"
tar -C "$payload" -cf "$temporary_directory/payload.tar" database.sql directus-uploads.tar legacy-uploads.tar
chmod 600 "$temporary_directory/payload.tar"
artifact="$temporary_directory/$snapshot_id.casn-snapshot.age"
age -r "$recipient" -o "$artifact" "$temporary_directory/payload.tar"
chmod 600 "$artifact"
age -d -i "$identity" -o "$restored/payload.tar" "$artifact"
tar -C "$restored" -xf "$restored/payload.tar"
chmod 600 "$restored/database.sql" "$restored/directus-uploads.tar" "$restored/legacy-uploads.tar"
bash "$manifest_script" verify --manifest "$manifest" --payload-dir "$restored" >/dev/null

docker exec -i "$mysql_container" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --database=casn_local' < "$restored/database.sql"
docker run --rm -i --mount "type=volume,src=$candidate_directus_volume,dst=/to" "$mysql_image" \
  tar -C /to -xf - < "$restored/directus-uploads.tar"
docker run --rm -i --mount "type=volume,src=$candidate_legacy_volume,dst=/to" "$mysql_image" \
  tar -C /to -xf - < "$restored/legacy-uploads.tar"

for service_container in directus app nginx; do
  case "$service_container" in
    directus) container_name="$directus_container" ;;
    app) container_name="$app_container" ;;
    nginx) container_name="$nginx_container" ;;
  esac
  extra_args=()
  [[ "$service_container" == nginx ]] && extra_args=(-p 127.0.0.1::3306)
  initial_network="$candidate_network"
  [[ "$service_container" == nginx ]] && initial_network="$loopback_network"
  docker run -d --name "$container_name" --network "$initial_network" \
    --label "com.docker.compose.project=$project" --label "com.docker.compose.service=$service_container" \
    "${extra_args[@]}" -e DB_NAME=casn_local "$mysql_image" sleep infinity >/dev/null
  [[ "$service_container" == nginx ]] && docker network connect "$candidate_network" "$container_name"
done

port_file="$temporary_directory/http.port"
cat > "$temporary_directory/http-server.mjs" <<'JS'
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
const [root, portFile] = process.argv.slice(2);
const authors = readFileSync(`${root}/authors.json`);
const analyses = readFileSync(`${root}/analyses.json`);
const sitemap = readFileSync(`${root}/sitemap.xml`);
const server = createServer((request, response) => {
  response.statusCode = 200;
  if (request.url === "/api/authors") response.end(authors);
  else if (request.url === "/api/analyses") response.end(analyses);
  else if (request.url === "/sitemap.xml") response.end(sitemap);
  else response.end("ok");
});
server.listen(0, "127.0.0.1", () => writeFileSync(portFile, String(server.address().port), { mode: 0o600 }));
JS
node "$temporary_directory/http-server.mjs" "$temporary_directory" "$port_file" &
http_pid=$!
for _ in {1..50}; do
  [[ -s "$port_file" ]] && break
  sleep 0.1
done
[[ -s "$port_file" ]] || die
http_port="$(<"$port_file")"
[[ "$http_port" =~ ^[0-9]+$ ]] || die

handoff="$temporary_directory/$snapshot_id.candidate.json"
database_content_hash="$(sed 's/CHARACTER SET utf8mb4 //g' "$restored/database.sql" | sha256sum | awk '{print $1}')"
jq -n \
  --arg snapshot_id "$snapshot_id" --arg project "$project" --arg http_port "$http_port" \
  --arg manifest_hash "$(sha256sum "$manifest" | awk '{print $1}')" \
  --arg database_content_hash "$database_content_hash" \
  '{snapshotId:$snapshot_id,project:$project,database:"casn_local",dbPort:"0",httpPort:$http_port,manifestSha256:$manifest_hash,databaseContentSha256:$database_content_hash,previousProject:""}' \
  > "$handoff"
chmod 600 "$handoff"
report="$temporary_directory/parity-report.json"
if [[ "${SNAPSHOT_SMOKE_DEBUG:-0}" == 1 ]]; then
  docker inspect "$mysql_container" "$directus_container" "$app_container" "$nginx_container" \
    | jq 'map(.NetworkSettings.Ports)' >&2
fi
if ! node "$verifier" --handoff "$handoff" --manifest "$manifest" \
  --base-url "http://127.0.0.1:$http_port" --report "$report" >/dev/null; then
  if [[ "${SNAPSHOT_SMOKE_DEBUG:-0}" == 1 && -f "$report" ]]; then
    jq '{passed,gates,counts,hashes}' "$report" >&2
  fi
  die
fi
jq -e '.passed == true and .counts.public.authors == 2 and .counts.public.analyses == 2 and .counts.media.directus == 2 and .counts.media.legacy == 3' "$report" >/dev/null
candidate_rows="$(docker exec "$mysql_container" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root --database=casn_local --execute "SELECT COUNT(*) FROM SnapshotFixture;"')"
[[ "$candidate_rows" == 3 ]] || die

printf 'snapshot roundtrip verified\n'
