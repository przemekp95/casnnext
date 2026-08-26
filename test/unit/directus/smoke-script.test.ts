/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIRECTUS_IMAGE =
  "directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869";
const RECEIVER_IMAGE = "node:22.23.2-alpine";

describe("Directus topology smoke contract", () => {
  const smoke = readFileSync(join(process.cwd(), "scripts/ci/directus-smoke.sh"), "utf8");
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/docker.yml"), "utf8");

  it("pins the Directus and receiver images", () => {
    expect(smoke).toContain(`readonly DIRECTUS_PINNED_IMAGE="${DIRECTUS_IMAGE}"`);
    expect(smoke).toContain(`readonly RECEIVER_IMAGE="${RECEIVER_IMAGE}"`);
    expect(smoke).toContain('if [[ "$DIRECTUS_IMAGE" != "$DIRECTUS_PINNED_IMAGE" ]]');
  });

  it("creates and cleans only invocation-scoped containers, network, and volumes", () => {
    expect(smoke).toMatch(/invocation_id=.*openssl rand -hex 8/);
    expect(smoke).toContain('DIRECTUS_CONTAINER_NAME="casn-directus-${invocation_id}"');
    expect(smoke).toContain('MYSQL_CONTAINER_NAME="casn-mysql-${invocation_id}"');
    expect(smoke).toContain('RECEIVER_CONTAINER_NAME="casn-receiver-${invocation_id}"');
    expect(smoke).toContain('SMOKE_NETWORK_NAME="casn-network-${invocation_id}"');
    expect(smoke).toContain('MYSQL_VOLUME_NAME="casn-mysql-data-${invocation_id}"');
    expect(smoke).toContain('DIRECTUS_UPLOADS_VOLUME_NAME="casn-directus-uploads-${invocation_id}"');
    expect(smoke).toContain('DIRECTUS_EXTENSIONS_VOLUME_NAME="casn-directus-extensions-${invocation_id}"');
    expect(smoke).toContain('docker network create "$SMOKE_NETWORK_NAME"');
    expect(smoke).toContain('docker volume create "$MYSQL_VOLUME_NAME"');
    expect(smoke).toContain('docker rm -fv "$DIRECTUS_CONTAINER_NAME"');
    expect(smoke).not.toContain("--network host");
  });

  it("runs migrations and the repository entrypoint in the isolated topology", () => {
    expect(smoke).toContain("npm run migration:run");
    expect(smoke).toContain('NODE_ENV=production \\');
    expect(smoke).toContain('RUN_DB_MIGRATIONS=1 \\');
    expect(smoke).toContain('DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS \\');
    expect(smoke).toContain('migration_log="$runtime_directory/migration.log"');
    expect(smoke).toContain('tail -n 200 "$migration_log"');
    expect(smoke).not.toContain("--default-authentication-plugin");
    expect(smoke).not.toContain("@example.invalid");
    expect(smoke).toContain("if (( attempt_status == 2 ))");
    expect(smoke).toContain('readonly CURL_MAX_TIME_SECONDS=5');
    expect(smoke).toContain('--max-time "$CURL_MAX_TIME_SECONDS"');
    expect(smoke).toContain('$repository_root/directus/start.sh:/directus/start.sh:ro');
    expect(smoke).toContain('$repository_root/directus/bootstrap.cjs:/directus/bootstrap.cjs:ro');
    expect(smoke).toContain(
      '$repository_root/directus/extensions/directus-extension-casn-field-guard:/directus/extensions/directus-extension-casn-field-guard:ro',
    );
    expect(smoke).toContain('docker restart "$DIRECTUS_CONTAINER_NAME"');
    expect(smoke.match(/resolve_directus_base_url/g)).toHaveLength(3);
    expect(smoke).toContain("/directus/.casn_bootstrapped");
  });

  it("checks metadata, anonymous denial, editor CRUD, and webhook evidence", () => {
    expect(smoke).toContain('for collection in Author Analysis IssueCollection; do');
    expect(smoke).toContain("CASN Editor Policy");
    expect(smoke).toContain("CASN Revalidate Website Cache");
    expect(smoke).toContain('x-directus-secret');
    expect(smoke).toContain('"Analysis"');
    expect(smoke).toContain("/api/revalidate");
    expect(smoke).toContain("Technical-field immutability");
    expect(smoke).toContain("strapiId:9001");
    expect(smoke).toContain('sourceHash:"forbidden"');
    expect(smoke).toContain("strapiId IS NULL");
    expect(smoke).toContain("sourceHash IS NULL");
    expect(smoke).toContain("admin technical-field guard");
  });

  it("requires exactly one item-bound Analysis create and update webhook", () => {
    expect(smoke).toContain('body.event == "Analysis.items.create"');
    expect(smoke).toContain('body.event == "Analysis.items.update"');
    expect(smoke).toContain("length == 2");
    expect(smoke).toContain('--argjson expected_item_id "$expected_item_id"');
    expect(smoke).toContain("(.body.key | tostring) == ($expected_item_id | tostring)");
    expect(smoke).toContain("(.body.keys | map(tostring)) == [($expected_item_id | tostring)]");
  });

  it("keeps credentials out of argv and persists only redacted receiver evidence", () => {
    expect(smoke).toContain("secretMatches");
    expect(smoke).not.toContain('secret: request.headers["x-directus-secret"]');
    expect(smoke).toContain('chmod 600 "$mysql_env_file"');
    expect(smoke).toContain('chmod 600 "$receiver_env_file"');
    expect(smoke).toContain('chmod 600 "$directus_env_file"');
    expect(smoke.match(/--env-file/g)).toHaveLength(3);
    expect(smoke).toContain('--header "@$request_headers_file"');
    expect(smoke).toContain('--data-binary "@$request_body_file"');
    expect(smoke).not.toMatch(/--env (?:KEY|SECRET|ADMIN_PASSWORD|DB_PASSWORD|REVALIDATE_SECRET)=/);
    expect(smoke).not.toContain('--password="$MYSQL_ROOT_PASSWORD"');
    expect(smoke).not.toContain('--env MYSQL_PWD="$MYSQL_PASSWORD"');
    expect(smoke).not.toContain('--data "$body"');
    expect(smoke).not.toContain('--arg password "$password"');
    expect(smoke).not.toContain('--arg password "$EDITOR_PASSWORD"');
  });

  it("uses transport-aware response isolation for every direct response writer", () => {
    expect(smoke).toContain('source "$repository_root/scripts/ci/directus-smoke-http.sh"');
    expect(smoke.match(/perform_http_request/g)).toHaveLength(3);
    expect(smoke).not.toContain('--output "$response_file"');
    expect(smoke).not.toContain('--write-out "%{http_code}"');
  });

  it("registers the exact image in the Docker workflow without a shared MySQL service", () => {
    const smokeJob = workflow.slice(
      workflow.indexOf("  directus-smoke:"),
      workflow.indexOf("  build-and-push:"),
    );
    expect(smokeJob).toContain(`DIRECTUS_IMAGE: ${DIRECTUS_IMAGE}`);
    expect(smokeJob).not.toContain("services:");
    expect(smokeJob).not.toContain("DIRECTUS_DB_PASSWORD:");
  });
});
