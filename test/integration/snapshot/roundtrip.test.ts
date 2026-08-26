/** @jest-environment node */

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roundtrip = join(process.cwd(), "scripts/ci/snapshot-roundtrip.sh");
const sentinel = "SNAPSHOT_ROUNDTRIP_SENTINEL_SECRET";

describe("snapshot encrypted round trip", () => {
  jest.setTimeout(360_000);

  it("restores synthetic data and media without production access", () => {
    const root = mkdtempSync(join(tmpdir(), "casn-roundtrip-test-"));
    const fakeBin = join(root, "bin");
    mkdirSync(fakeBin);
    const blocker = "#!/usr/bin/env bash\nprintf 'remote command forbidden\\n' >&2\nexit 97\n";
    for (const name of ["ssh", "scp"]) {
      writeFileSync(join(fakeBin, name), blocker, { mode: 0o700 });
      chmodSync(join(fakeBin, name), 0o700);
    }
    try {
      const result = spawnSync("bash", [roundtrip], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 350_000,
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          SSH_AUTH_SOCK: "",
          SNAPSHOT_SMOKE_NONCE: `jest${process.pid}`,
          SNAPSHOT_SMOKE_SENTINEL: sentinel,
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("snapshot roundtrip verified");
      expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
      expect(`${result.stdout}${result.stderr}`).not.toContain("remote command forbidden");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
