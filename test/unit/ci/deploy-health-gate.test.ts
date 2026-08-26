/** @jest-environment node */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const verifier = join(repositoryRoot, "scripts/deploy/verify-health.sh");
const expectedRevision = "52a75ace9db03b8c47a2a634ac35f410e855d7df";

function runVerifier(body: unknown) {
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

  it("runs the public health gate remotely after deployment without Bearer auth", () => {
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/deploy.yml"), "utf8");
    const healthStep = workflow.slice(
      workflow.indexOf("      - name: Health check"),
      workflow.indexOf("      - name: Notify deployment status"),
    );

    expect(healthStep).toContain("uses: appleboy/ssh-action@v1.0.3");
    expect(healthStep).toContain("envs: HEALTH_CHECK_URL,APP_REVISION");
    expect(healthStep).toContain(
      'scripts/deploy/verify-health.sh "$HEALTH_CHECK_URL" "$APP_REVISION"',
    );
    expect(healthStep).not.toMatch(/authorization|bearer/i);
    expect(healthStep).not.toContain('curl --fail --silent --show-error "$HEALTH_CHECK_URL"');
  });
});
