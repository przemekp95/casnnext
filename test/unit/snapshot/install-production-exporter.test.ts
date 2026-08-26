/** @jest-environment node */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const installer = join(process.cwd(), "scripts/snapshot/install-production-exporter.sh");

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "casn-installer-test-"));
  const fakeBin = join(root, "bin");
  const remoteRoot = join(root, "remote");
  const log = join(root, "commands.log");
  mkdirSync(fakeBin);
  mkdirSync(remoteRoot);
  writeFileSync(log, "");
  writeFileSync(join(fakeBin, "ssh"), `#!/usr/bin/env bash
set -euo pipefail
printf 'ssh' >> "$FAKE_INSTALL_LOG"
printf ' %q' "$@" >> "$FAKE_INSTALL_LOG"
printf '\n' >> "$FAKE_INSTALL_LOG"
target="$1"
shift
[[ "$target" == fixture-host ]]
exec "$@"
`, { mode: 0o700 });
  writeFileSync(join(fakeBin, "scp"), `#!/usr/bin/env bash
set -euo pipefail
printf 'scp' >> "$FAKE_INSTALL_LOG"
printf ' %q' "$@" >> "$FAKE_INSTALL_LOG"
printf '\n' >> "$FAKE_INSTALL_LOG"
source_file="$1"
destination="\${2#fixture-host:}"
cp "$source_file" "$destination"
`, { mode: 0o700 });
  writeFileSync(join(fakeBin, "chown"), `#!/usr/bin/env bash
printf 'chown' >> "$FAKE_INSTALL_LOG"
printf ' %q' "$@" >> "$FAKE_INSTALL_LOG"
printf '\n' >> "$FAKE_INSTALL_LOG"
`, { mode: 0o700 });
  writeFileSync(join(fakeBin, "id"), "#!/usr/bin/env bash\n[[ \"$1\" == -u ]] && printf '0\\n'\n", { mode: 0o700 });
  for (const name of ["ssh", "scp", "chown", "id"]) chmodSync(join(fakeBin, name), 0o700);
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();

  const run = (extra: string[] = []) => spawnSync("bash", [
    installer,
    "--ssh-target", "fixture-host",
    "--remote-root", remoteRoot,
    "--reviewed-commit", revision,
    ...extra,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, FAKE_INSTALL_LOG: log },
  });
  return { root, remoteRoot, log, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("production exporter installer", () => {
  it("installs only reviewed files and an empty owner-only config", () => {
    const test = fixture();
    try {
      const result = test.run();
      expect(result).toMatchObject({ status: 0, stderr: "" });
      const entrypoint = join(test.remoteRoot, "usr/local/libexec/casn-snapshot/export-production.sh");
      const config = join(test.remoteRoot, "etc/casn-snapshot/export.env");
      expect(statSync(entrypoint).mode & 0o777).toBe(0o750);
      expect(statSync(config).mode & 0o777).toBe(0o600);
      expect(readFileSync(config, "utf8")).toBe("");
      expect(result.stdout).toContain("SOURCE_COMPOSE_PROJECT");
      expect(result.stdout).toContain("SOURCE_NGINX_SERVICE");
      expect(result.stdout).toContain("SNAPSHOT_AGE_RECIPIENT");
      const log = readFileSync(test.log, "utf8");
      expect(log).toContain("chown root:root");
      expect(log).toMatch(/bash -s -- .* -(?:\n|$)/);
      expect(log).not.toMatch(/export-production\.sh --env-file|docker stop|mysql /);
    } finally {
      test.cleanup();
    }
  });

  it("requires the exact installed exporter hash before replacement", () => {
    const test = fixture();
    try {
      expect(test.run().status).toBe(0);
      const entrypoint = join(test.remoteRoot, "usr/local/libexec/casn-snapshot/export-production.sh");
      const currentHash = sha256(entrypoint);
      expect(test.run().status).not.toBe(0);
      expect(test.run(["--replace-reviewed-sha", "f".repeat(64)]).status).not.toBe(0);
      expect(test.run(["--replace-reviewed-sha", currentHash]).status).toBe(0);
    } finally {
      test.cleanup();
    }
  });

  it.each(["192.0.2.4", "-oProxyCommand=bad", "user@host", "*"])("rejects unsafe SSH target %s", (target) => {
    const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
    const result = spawnSync("bash", [installer, "--ssh-target", target, "--remote-root", "/", "--reviewed-commit", revision]);
    expect(result.status).not.toBe(0);
  });
});
