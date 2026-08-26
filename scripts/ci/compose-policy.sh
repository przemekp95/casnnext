#!/usr/bin/env bash
set -euo pipefail

readonly DIRECTUS_IMAGE='directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869'
readonly APP_IMAGE_VALUE='registry.example.invalid/casn-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly NGINX_IMAGE_VALUE='registry.example.invalid/casn-nginx@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
readonly APP_REVISION_VALUE='cccccccccccccccccccccccccccccccccccccccc'
readonly MYSQL_ROOT_PASSWORD_VALUE='compose-policy-root-secret'
readonly MYSQL_DATABASE_VALUE='casn_policy'
readonly MYSQL_USER_VALUE='casn_policy_user'
readonly MYSQL_PASSWORD_VALUE='compose-policy-db-secret'
readonly DIRECTUS_KEY_VALUE='compose-policy-directus-key'
readonly DIRECTUS_SECRET_VALUE='compose-policy-directus-secret'
readonly DIRECTUS_ADMIN_EMAIL_VALUE='compose-policy-operator@example.invalid'
readonly DIRECTUS_ADMIN_PASSWORD_VALUE='compose-policy-admin-secret'
readonly REVALIDATE_SECRET_VALUE='compose-policy-revalidation-secret'
readonly NEXTAUTH_SECRET_VALUE='compose-policy-nextauth-secret'

readonly -a COMPOSE_FILES=(
  'docker-compose.final.yml'
  'docker-compose.portainer.yml'
)

policy_tmp_dir="$(mktemp -d)"
nginx_test_image="casn-compose-policy-nginx:${BASHPID}"
nginx_probe_container="casn-compose-policy-nginx-probe-${BASHPID}"

cleanup() {
  docker rm -f "$nginx_probe_container" >/dev/null 2>&1 || true
  docker image rm "$nginx_test_image" >/dev/null 2>&1 || true
  rm -rf "$policy_tmp_dir"
}
trap cleanup EXIT

controlled_compose() {
  env -i \
    PATH="$PATH" \
    APP_IMAGE="$APP_IMAGE_VALUE" \
    NGINX_IMAGE="$NGINX_IMAGE_VALUE" \
    APP_REVISION="$APP_REVISION_VALUE" \
    MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD_VALUE" \
    MYSQL_DATABASE="$MYSQL_DATABASE_VALUE" \
    MYSQL_USER="$MYSQL_USER_VALUE" \
    MYSQL_PASSWORD="$MYSQL_PASSWORD_VALUE" \
    DIRECTUS_KEY="$DIRECTUS_KEY_VALUE" \
    DIRECTUS_SECRET="$DIRECTUS_SECRET_VALUE" \
    DIRECTUS_ADMIN_EMAIL="$DIRECTUS_ADMIN_EMAIL_VALUE" \
    DIRECTUS_ADMIN_PASSWORD="$DIRECTUS_ADMIN_PASSWORD_VALUE" \
    REVALIDATE_SECRET="$REVALIDATE_SECRET_VALUE" \
    NEXTAUTH_SECRET="$NEXTAUTH_SECRET_VALUE" \
    docker compose --env-file /dev/null -f "$1" config --format json
}

for compose_file in "${COMPOSE_FILES[@]}"; do
  if env -i PATH="$PATH" docker compose --env-file /dev/null -f "$compose_file" config >/dev/null 2>&1; then
    echo "$compose_file rendered without required production environment values" >&2
    exit 1
  fi

  rendered_file="$policy_tmp_dir/$(basename "$compose_file").json"
  controlled_compose "$compose_file" >"$rendered_file"

  jq -e \
    --arg directus_image "$DIRECTUS_IMAGE" \
    --arg app_image "$APP_IMAGE_VALUE" \
    --arg nginx_image "$NGINX_IMAGE_VALUE" \
    --arg app_revision "$APP_REVISION_VALUE" \
    --arg mysql_root_password "$MYSQL_ROOT_PASSWORD_VALUE" \
    --arg mysql_database "$MYSQL_DATABASE_VALUE" \
    --arg mysql_user "$MYSQL_USER_VALUE" \
    --arg mysql_password "$MYSQL_PASSWORD_VALUE" \
    --arg directus_key "$DIRECTUS_KEY_VALUE" \
    --arg directus_secret "$DIRECTUS_SECRET_VALUE" \
    --arg directus_admin_email "$DIRECTUS_ADMIN_EMAIL_VALUE" \
    --arg directus_admin_password "$DIRECTUS_ADMIN_PASSWORD_VALUE" \
    --arg revalidate_secret "$REVALIDATE_SECRET_VALUE" \
    --arg nextauth_secret "$NEXTAUTH_SECRET_VALUE" \
    '
      .services.directus.image == $directus_image
      and .services.app.image == $app_image
      and .services.nginx.image == $nginx_image
      and (.services.app.image | test("@sha256:[0-9a-f]{64}$"))
      and (.services.nginx.image | test("@sha256:[0-9a-f]{64}$"))
      and .services.mysql.environment.MYSQL_ROOT_PASSWORD == $mysql_root_password
      and .services.mysql.environment.MYSQL_DATABASE == $mysql_database
      and .services.mysql.environment.MYSQL_USER == $mysql_user
      and .services.mysql.environment.MYSQL_PASSWORD == $mysql_password
      and .services.directus.environment.KEY == $directus_key
      and .services.directus.environment.SECRET == $directus_secret
      and .services.directus.environment.ADMIN_EMAIL == $directus_admin_email
      and .services.directus.environment.ADMIN_PASSWORD == $directus_admin_password
      and .services.directus.environment.REVALIDATE_SECRET == $revalidate_secret
      and .services.app.environment.REVALIDATE_SECRET == $revalidate_secret
      and .services.app.environment.NEXTAUTH_SECRET == $nextauth_secret
      and .services.app.environment.APP_REVISION == $app_revision
      and (.services.app.environment | has("RUN_DB_MIGRATIONS") | not)
      and (.services.app.environment | has("DB_MIGRATION_CONFIRM") | not)
      and .services.directus.depends_on.mysql.condition == "service_healthy"
      and .services.app.depends_on.mysql.condition == "service_healthy"
      and .services.nginx.depends_on.app.condition == "service_healthy"
      and .services.nginx.depends_on.directus.condition == "service_healthy"
      and (.services.app.healthcheck.test | join(" ") | contains("/api/health"))
      and (.services.directus.healthcheck.test | join(" ") | contains("/server/ping"))
      and (.services.directus.healthcheck.test | join(" ") | contains(".casn_bootstrapped"))
      and (.services.nginx.healthcheck.test | join(" ") | contains("/nginx-health"))
      and any(.services.directus.volumes[]; .source == "directus_uploads" and .target == "/directus/uploads" and ((.read_only // false) | not))
      and all(.services.directus.volumes[]; .source != "strapi_uploads")
      and any(.services.nginx.volumes[]; .source == "strapi_uploads" and .target == "/legacy-strapi-uploads" and .read_only == true)
      and all(.services.nginx.volumes[]; .source != "directus_uploads")
      and ([.. | strings | select(test("change-me|password123|your-secret|admin@example\\.com|:latest|:main|:dev"; "i"))] | length == 0)
    ' "$rendered_file" >/dev/null

  echo "$compose_file: APP_IMAGE=$APP_IMAGE_VALUE NGINX_IMAGE=$NGINX_IMAGE_VALUE DIRECTUS_IMAGE=$DIRECTUS_IMAGE"
done

docker build --pull -f Dockerfile.nginx -t "$nginx_test_image" . >/dev/null
docker run --rm \
  --add-host app:127.0.0.1 \
  --add-host directus:127.0.0.1 \
  --entrypoint nginx \
  "$nginx_test_image" -t

docker run -d --name "$nginx_probe_container" \
  --add-host app:127.0.0.1 \
  --add-host directus:127.0.0.1 \
  -p 127.0.0.1::8080 \
  "$nginx_test_image" >/dev/null

nginx_probe_port="$(docker port "$nginx_probe_container" 8080/tcp | sed 's/.*://')"
nginx_probe_headers="$policy_tmp_dir/nginx-probe.headers"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${nginx_probe_port}/nginx-health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

curl -fsS -D "$nginx_probe_headers" -o /dev/null \
  -H 'Host: casn.pl' \
  -H 'X-Forwarded-Proto: https' \
  "http://127.0.0.1:${nginx_probe_port}/cms"
nginx_redirect_location="$(awk 'tolower($1) == "location:" { sub(/\r$/, "", $2); print $2 }' "$nginx_probe_headers")"
if [[ "$nginx_redirect_location" != '/cms/' ]]; then
  echo "nginx /cms redirect must be exactly /cms/, got: $nginx_redirect_location" >&2
  exit 1
fi
echo "nginx redirect probe: Host=casn.pl X-Forwarded-Proto=https Location=$nginx_redirect_location"

echo 'Compose policy and nginx image validation passed.'
