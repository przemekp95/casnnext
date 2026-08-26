/** @jest-environment node */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const verifier = join(repositoryRoot, "scripts/deploy/verify-health.sh");
const expectedRevision = "52a75ace9db03b8c47a2a634ac35f410e855d7df";

function runVerifier(body: unknown, probeExitStatus = 0) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "casn-health-gate-"));
  const fakeBin = join(temporaryDirectory, "bin");
  const responseFile = join(temporaryDirectory, "response.json");
  mkdirSync(fakeBin);
  writeFileSync(responseFile, JSON.stringify(body));
  writeFileSync(
    join(fakeBin, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail
cat "$FAKE_HEALTH_RESPONSE"
exit "$FAKE_HEALTH_EXIT_STATUS"
`,
    { mode: 0o755 },
  );

  try {
    return spawnSync("bash", [verifier, expectedRevision], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        FAKE_HEALTH_RESPONSE: responseFile,
        FAKE_HEALTH_EXIT_STATUS: String(probeExitStatus),
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

  it("rejects a failed internal probe even if it emits matching readiness JSON", () => {
    const result = runVerifier(
      { status: "ready", database: "connected", revision: expectedRevision },
      8,
    );

    expect(result.status).not.toBe(0);
  });

  it("runs an internal revision health gate remotely after deployment without Bearer auth", () => {
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/deploy.yml"), "utf8");
    const verifierSource = readFileSync(verifier, "utf8");
    const healthStep = workflow.slice(
      workflow.indexOf("      - name: Health check"),
      workflow.indexOf("      - name: Notify deployment status"),
    );

    expect(workflow).not.toContain("      - name: Validate health gate configuration");
    expect(healthStep).toContain("env.DEPLOY_HOST != ''");
    expect(healthStep).toContain("uses: appleboy/ssh-action@v1.0.3");
    expect(healthStep).toContain("envs: APP_REVISION");
    expect(healthStep).toContain('scripts/deploy/verify-health.sh "$APP_REVISION"');
    expect(healthStep).not.toContain("HEALTH_CHECK_URL");
    expect(healthStep).not.toMatch(/authorization|bearer/i);
    expect(verifierSource).toMatch(
      /docker compose[\s\\]+--env-file \.env[\s\\]+-f docker-compose\.portainer\.yml[\s\\]+exec -T app/,
    );
    expect(verifierSource).toContain("wget -T 10 -qO- http://127.0.0.1:3000/api/health");
    expect(verifierSource).not.toContain("https://casn.pl");
  });
});
