/** @jest-environment node */

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("dependency audit policy", () => {
  it("audits the complete tree and rejects even a low vulnerability by default", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "casn-audit-policy-"));
    const npmPath = join(fixtureDir, "npm");
    const argsPath = join(fixtureDir, "npm-args.txt");

    writeFileSync(
      npmPath,
      `#!/usr/bin/env bash
printf '%s' "$*" > "$AUDIT_ARGS_FILE"
printf '%s' '{"auditReportVersion":2,"vulnerabilities":{"fixture":{"name":"fixture","severity":"low","isDirect":false}},"metadata":{"vulnerabilities":{"info":0,"low":1,"moderate":0,"high":0,"critical":0,"total":1}}}'
exit 1
`,
      { mode: 0o755 },
    );
    chmodSync(npmPath, 0o755);

    try {
      const result = spawnSync("bash", ["scripts/ci/security-audit-policy.sh"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fixtureDir}:${process.env.PATH}`,
          AUDIT_ARGS_FILE: argsPath,
          AUDIT_FAIL_ON: "",
          AUDIT_FAIL_ON_APP: "",
        },
      });

      expect(result.status).toBe(1);
      expect(readFileSync(argsPath, "utf8")).toBe("audit --package-lock-only --json");
      expect(result.stderr).toContain("found 1 vulnerabilities at or above info");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
