/** @jest-environment node */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const verifier = join(repositoryRoot, "scripts/deploy/verify-health.sh");
const expectedRevision = "52a75ace9db03b8c47a2a634ac35f410e855d7df";

function runVerifier(body: unknown, httpStatus = 200) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "casn-health-gate-"));
  const fakeBin = join(temporaryDirectory, "bin");
  const responseFile = join(temporaryDirectory, "response.json");
  mkdirSync(fakeBin);
  writeFileSync(responseFile, JSON.stringify(body));
  writeFileSync(
    join(fakeBin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    *) shift ;;
  esac
done
test -n "$output"
cp "$FAKE_HEALTH_RESPONSE" "$output"
printf '%s' "$FAKE_HEALTH_STATUS"
`,
    { mode: 0o755 },
  );

  try {
    return spawnSync("bash", [verifier, "https://casn.pl/api/health", expectedRevision], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        FAKE_HEALTH_RESPONSE: responseFile,
        FAKE_HEALTH_STATUS: String(httpStatus),
        HEALTH_CHECK_ATTEMPTS: "1",
        HEALTH_CHECK_INTERVAL_SECONDS: "0",
      },
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

describe("production deployment health gate", () => {
  it("accepts readiness only when the database and exact revision match", () => {
    const result = runVerifier({
      status: "ready",
      database: "connected",
      revision: expectedRevision,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Health check passed for the expected revision");
  });

  it("rejects an HTTP-success JSON response from a different revision", () => {
    const result = runVerifier({
      status: "ready",
      database: "connected",
      revision: "0000000000000000000000000000000000000000",
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain("0000000000000000000000000000000000000000");
  });

  it.each([
    { status: "starting", database: "connected", revision: expectedRevision },
    { status: "ready", database: "unavailable", revision: expectedRevision },
    { status: "ready", database: "connected" },
    ["ready", "connected", expectedRevision],
  ])("rejects JSON that does not satisfy the readiness contract", (body) => {
    expect(runVerifier(body).status).not.toBe(0);
  });

  it("rejects a redirect even if its body contains matching readiness JSON", () => {
    const result = runVerifier(
      { status: "ready", database: "connected", revision: expectedRevision },
      302,
    );

    expect(result.status).not.toBe(0);
  });

  it("runs the public health gate remotely after deployment without Bearer auth", () => {
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/deploy.yml"), "utf8");
    const healthStep = workflow.slice(
      workflow.indexOf("      - name: Health check"),
      workflow.indexOf("      - name: Notify deployment status"),
    );
    const configurationStep = workflow.slice(
      workflow.indexOf("      - name: Validate health gate configuration"),
      workflow.indexOf("      - name: Health check"),
    );

    expect(configurationStep).toContain('test -n "$HEALTH_CHECK_URL"');
    expect(configurationStep).toContain(
      `[[ "$DEPLOY_ENVIRONMENT" != 'production' || "$HEALTH_CHECK_URL" == 'https://casn.pl/api/health' ]]`,
    );
    expect(healthStep).toContain("env.DEPLOY_HOST != ''");
    expect(healthStep).not.toContain("env.HEALTH_CHECK_URL != ''");
    expect(healthStep).toContain("uses: appleboy/ssh-action@v1.0.3");
    expect(healthStep).toContain("envs: HEALTH_CHECK_URL,APP_REVISION");
    expect(healthStep).toContain(
      'scripts/deploy/verify-health.sh "$HEALTH_CHECK_URL" "$APP_REVISION"',
    );
    expect(healthStep).not.toMatch(/authorization|bearer/i);
    expect(healthStep).not.toContain('curl --fail --silent --show-error "$HEALTH_CHECK_URL"');
  });
});
