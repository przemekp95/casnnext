/** @jest-environment node */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const commonPath = join(process.cwd(), "scripts/snapshot/common.sh");

function callCommon(functionName: string, ...args: string[]) {
  return spawnSync(
    "bash",
    ["-c", 'source "$1"; shift; function_name="$1"; shift; "$function_name" "$@"', "bash", commonPath, functionName, ...args],
    { encoding: "utf8" },
  );
}

describe("snapshot safety boundary", () => {
  it.each(["127.0.0.1", "localhost", "::1"])("accepts loopback host %s", (host) => {
    expect(callCommon("require_loopback_host", host).status).toBe(0);
  });

  it.each(["casn.pl", "mysql", "195.78.67.52", "0.0.0.0", ""])(
    "rejects non-loopback host %s",
    (host) => expect(callCommon("require_loopback_host", host).status).not.toBe(0),
  );

  it.each(["casn_local", "casn_local_20260826", "casn_local_a1b2"])(
    "accepts local database name %s",
    (name) => expect(callCommon("require_local_database_name", name).status).toBe(0),
  );

  it.each(["casn", "production", "casn_prod", "casn-local", "casn_local_"])(
    "rejects unsafe database name %s",
    (name) => expect(callCommon("require_local_database_name", name).status).not.toBe(0),
  );

  it("accepts only snapshot ids with a UTC timestamp and lowercase hex nonce", () => {
    expect(callCommon("require_snapshot_id", "20260826T121500Z-a1b2c3d4").status).toBe(0);

    for (const unsafe of ["../../prod", "20260826T121500Z-A1B2C3D4", "20260826-a1b2c3d4", ""]) {
      expect(callCommon("require_snapshot_id", unsafe).status).not.toBe(0);
    }
  });

  it("accepts only image references pinned by sha256 digest", () => {
    const digest = "a".repeat(64);
    expect(callCommon("require_digest_ref", `mysql@sha256:${digest}`).status).toBe(0);
    expect(callCommon("require_digest_ref", `docker.io/library/mysql@sha256:${digest}`).status).toBe(0);

    for (const unsafe of ["mysql:8.0", "mysql@sha256:abc", `MYSQL@sha256:${digest}`, ""]) {
      expect(callCommon("require_digest_ref", unsafe).status).not.toBe(0);
    }
  });

  it("accepts only regular owner-only files", () => {
    const directory = mkdtempSync(join(tmpdir(), "casn-snapshot-mode-"));
    const mode600 = join(directory, "mode600");
    const mode400 = join(directory, "mode400");
    const mode644 = join(directory, "mode644");
    writeFileSync(mode600, "secret", { mode: 0o600 });
    writeFileSync(mode400, "secret", { mode: 0o400 });
    writeFileSync(mode644, "secret", { mode: 0o644 });
    chmodSync(mode600, 0o600);
    chmodSync(mode400, 0o400);
    chmodSync(mode644, 0o644);

    try {
      expect(callCommon("require_owner_only_file", mode600).status).toBe(0);
      expect(callCommon("require_owner_only_file", mode400).status).toBe(0);
      expect(callCommon("require_owner_only_file", mode644).status).not.toBe(0);
      expect(callCommon("require_owner_only_file", directory).status).not.toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts an empty external directory and rejects unsafe targets", () => {
    const parent = mkdtempSync(join(tmpdir(), "casn-snapshot-dir-"));
    const empty = join(parent, "empty");
    const nonempty = join(parent, "nonempty");
    mkdirSync(empty);
    mkdirSync(nonempty);
    writeFileSync(join(nonempty, "data"), "x");

    try {
      expect(callCommon("require_empty_directory", empty).status).toBe(0);
      expect(callCommon("require_empty_directory", nonempty).status).not.toBe(0);
      expect(callCommon("require_empty_directory", process.cwd()).status).not.toBe(0);
      expect(callCommon("require_empty_directory", "/").status).not.toBe(0);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("hashes an exact value without adding a newline", () => {
    const result = callCommon("sha256_value", "abc");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
