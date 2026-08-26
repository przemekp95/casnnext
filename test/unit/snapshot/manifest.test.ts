/** @jest-environment node */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const manifestScript = join(process.cwd(), "scripts/snapshot/manifest.sh");
const databaseHash = "3549b0028b75d981cdda2e573e9cb49dedc200185876df299f912b79f69dabd8";
const directusHash = "943e891bf6042f2db8926493c0f94e45b72cb58a21145fdfa3c23b5c057e4b2d";
const legacyHash = "c49fea7425fa7f8699897a97c159c6690267d9003bb78c53fafa8fc15c325d84";

type Inventory = {
  snapshotId: string;
  capturedAt: string;
  source: { databaseNameHash: string; serverUuidHash: string };
  database: { tables: number; views: number; triggers: number; routines: number; events: number };
  media: { directus: { files: number }; legacy: { files: number } };
  public: {
    authors: { count: number; sha256: string };
    analyses: { count: number; sha256: string };
    sitemap: { count: number; sha256: string };
  };
  [key: string]: unknown;
};

function validInventory(): Inventory {
  return {
    snapshotId: "20260826T121500Z-a1b2c3d4",
    capturedAt: "2026-08-26T12:15:00Z",
    source: { databaseNameHash: "a".repeat(64), serverUuidHash: "b".repeat(64) },
    database: { tables: 18, views: 0, triggers: 2, routines: 1, events: 0 },
    media: { directus: { files: 2 }, legacy: { files: 3 } },
    public: {
      authors: { count: 32, sha256: "c".repeat(64) },
      analyses: { count: 39, sha256: "d".repeat(64) },
      sitemap: { count: 80, sha256: "e".repeat(64) },
    },
  };
}

function prepareFixture(inventory: Inventory = validInventory()) {
  const directory = mkdtempSync(join(tmpdir(), "casn-snapshot-manifest-"));
  writeFileSync(join(directory, "database.sql"), "database", { mode: 0o600 });
  writeFileSync(join(directory, "directus-uploads.tar"), "directus", { mode: 0o600 });
  writeFileSync(join(directory, "legacy-uploads.tar"), "legacy", { mode: 0o600 });
  writeFileSync(join(directory, "snapshot.json"), JSON.stringify(inventory), { mode: 0o600 });
  return { directory, manifest: join(directory, "snapshot.manifest.json") };
}

function runManifest(...args: string[]) {
  return spawnSync("bash", [manifestScript, ...args], { encoding: "utf8" });
}

describe("snapshot manifest", () => {
  it("builds and verifies a strict manifest with literal payload hashes", () => {
    const fixture = prepareFixture();
    try {
      const build = runManifest("build", "--input", fixture.directory, "--output", fixture.manifest);
      expect(build.status).toBe(0);

      const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
      expect(manifest).toEqual({
        ...validInventory(),
        version: 1,
        database: { ...validInventory().database, sha256: databaseHash },
        media: {
          directus: { files: 2, sha256: directusHash },
          legacy: { files: 3, sha256: legacyHash },
        },
      });

      const verify = runManifest("verify", "--manifest", fixture.manifest, "--payload-dir", fixture.directory);
      expect(verify.status).toBe(0);
      expect(verify.stdout).toContain("manifest verified");
      expect(verify.stdout).toContain("20260826T121500Z-a1b2c3d4");
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects a payload changed after manifest creation", () => {
    const fixture = prepareFixture();
    try {
      expect(runManifest("build", "--input", fixture.directory, "--output", fixture.manifest).status).toBe(0);
      writeFileSync(join(fixture.directory, "database.sql"), "changed", { mode: 0o600 });

      const verify = runManifest("verify", "--manifest", fixture.manifest, "--payload-dir", fixture.directory);
      expect(verify.status).not.toBe(0);
      expect(verify.stderr).not.toContain("changed");
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["missing source field", (inventory: Inventory) => { delete inventory.source; }],
    ["extra top-level field", (inventory: Inventory) => { inventory.untrusted = "SENTINEL_TOKEN"; }],
    ["malformed timestamp", (inventory: Inventory) => { inventory.capturedAt = "2026-08-26 12:15"; }],
    ["unsafe snapshot id", (inventory: Inventory) => { inventory.snapshotId = "../../production"; }],
    ["negative count", (inventory: Inventory) => { inventory.public.authors.count = -1; }],
    ["uppercase hash", (inventory: Inventory) => { inventory.public.authors.sha256 = "C".repeat(64); }],
  ])("rejects inventory with %s", (_name, mutate) => {
    const inventory = validInventory();
    mutate(inventory);
    const fixture = prepareFixture(inventory);
    try {
      const result = runManifest("build", "--input", fixture.directory, "--output", fixture.manifest);
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain("SENTINEL_TOKEN");
      expect(result.stderr).not.toContain("SENTINEL_TOKEN");
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects a group-readable manifest", () => {
    const fixture = prepareFixture();
    try {
      expect(runManifest("build", "--input", fixture.directory, "--output", fixture.manifest).status).toBe(0);
      chmodSync(fixture.manifest, 0o644);

      const verify = runManifest("verify", "--manifest", fixture.manifest, "--payload-dir", fixture.directory);
      expect(verify.status).not.toBe(0);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});
