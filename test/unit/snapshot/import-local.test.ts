/** @jest-environment node */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const importer = join(process.cwd(), "scripts/snapshot/import-local.sh");
const manifestScript = join(process.cwd(), "scripts/snapshot/manifest.sh");
const snapshotId = "20260826T121500Z-a1b2c3d4";

function fakeDockerScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$FAKE_COMMAND_LOG"
printf ' %q' "$@" >> "$FAKE_COMMAND_LOG"
printf '\n' >> "$FAKE_COMMAND_LOG"
all=" $* "
case "$all" in
  *" volume inspect "*) [[ "$FAKE_EXISTING_VOLUME" == 1 ]] ;;
  *" volume create "*) printf '%s\n' "\${*: -1}" ;;
  *" compose "*" config "*"--format json"*)
    printf '%s' '{"services":{"mysql":{"environment":{"MYSQL_DATABASE":"casn_local"},"ports":[{"host_ip":"127.0.0.1","published":"13307","target":3306}],"networks":{"casn_snapshot_internal":null,"casn_snapshot_loopback":null}},"directus":{"networks":{"casn_snapshot_internal":null}},"app":{"environment":{"DB_NAME":"casn_local"},"networks":{"casn_snapshot_internal":null}},"nginx":{"ports":[{"host_ip":"127.0.0.1","published":"13010","target":8080}],"networks":{"casn_snapshot_internal":null,"casn_snapshot_loopback":null}}},"networks":{"casn_snapshot_internal":{"internal":true},"casn_snapshot_loopback":{"internal":false}}}'
    ;;
  *" compose "*" up "*) ;;
  *" compose "*" ps -q mysql"*) printf 'candidate-mysql-id\n' ;;
  *" inspect "*"State.Health.Status"*) printf 'healthy\n' ;;
  *" compose "*"SELECT @@server_uuid"*) printf '%s\n' "$FAKE_LOCAL_UUID" ;;
  *" compose "*"SELECT DATABASE()"*) printf 'casn_local\n' ;;
  *" compose "*"--database=casn_local"*) cat >/dev/null ;;
  *" run "*"tar -C /to -xf -"*) cat >/dev/null ;;
  *) printf 'unexpected docker call: %s\n' "$all" >&2; exit 64 ;;
esac
`;
}

function fakeAgeScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
output=''
input=''
while (( $# > 0 )); do
  case "$1" in
    -d) shift ;;
    -i) shift 2 ;;
    -o) output="$2"; shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
cp "$input" "$output"
chmod 600 "$output"
`;
}

type RunOptions = {
  existingVolume?: boolean;
  localUuid?: string;
  mutateEnv?: (lines: string[]) => void;
  symlinkArtifact?: boolean;
  tamperArtifact?: boolean;
  identityMode?: number;
};

function prepareRun(options: RunOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "casn-importer-test-"));
  const payload = join(root, "payload");
  const fakeBin = join(root, "bin");
  const handoff = join(root, "handoff");
  mkdirSync(payload);
  mkdirSync(fakeBin);
  mkdirSync(handoff);

  writeFileSync(join(payload, "database.sql"), "database", { mode: 0o600 });
  writeFileSync(join(payload, "directus-uploads.tar"), "directus", { mode: 0o600 });
  writeFileSync(join(payload, "legacy-uploads.tar"), "legacy", { mode: 0o600 });
  const inventory = {
    snapshotId,
    capturedAt: "2026-08-26T12:15:00Z",
    source: { databaseNameHash: "a".repeat(64), serverUuidHash: "4835dae58c92570471bebc1f79021220d4f993b750206b646270f03b060eda08" },
    database: { tables: 18, views: 0, triggers: 2, routines: 1, events: 0 },
    media: { directus: { files: 2 }, legacy: { files: 3 } },
    public: {
      authors: { count: 32, sha256: "c".repeat(64) },
      analyses: { count: 39, sha256: "d".repeat(64) },
      sitemap: { count: 80, sha256: "e".repeat(64) },
    },
  };
  writeFileSync(join(payload, "snapshot.json"), JSON.stringify(inventory), { mode: 0o600 });
  const manifest = join(root, `${snapshotId}.manifest.json`);
  const manifestBuild = spawnSync(
    "bash",
    [manifestScript, "build", "--input", payload, "--output", manifest],
    { encoding: "utf8" },
  );
  if (manifestBuild.status !== 0) throw new Error(manifestBuild.stderr);

  const artifactTarget = join(root, `${snapshotId}.casn-snapshot.age.real`);
  const tarResult = spawnSync(
    "tar",
    ["-C", payload, "-cf", artifactTarget, "database.sql", "directus-uploads.tar", "legacy-uploads.tar"],
    { encoding: "utf8" },
  );
  if (tarResult.status !== 0) throw new Error(tarResult.stderr);
  chmodSync(artifactTarget, 0o600);
  if (options.tamperArtifact) writeFileSync(artifactTarget, "not-a-tar", { mode: 0o600 });

  const artifact = options.symlinkArtifact ? join(root, `${snapshotId}.casn-snapshot.age`) : artifactTarget;
  if (options.symlinkArtifact) symlinkSync(artifactTarget, artifact);

  const identity = join(root, "snapshot.agekey");
  writeFileSync(identity, "AGE-SECRET-KEY-TEST", { mode: options.identityMode ?? 0o600 });
  chmodSync(identity, options.identityMode ?? 0o600);

  const envLines = [
    "MYSQL_ROOT_PASSWORD=local-root-secret",
    "MYSQL_USER=casn_local_user",
    "MYSQL_PASSWORD=local-user-secret",
    "DIRECTUS_KEY=local-directus-key",
    "DIRECTUS_SECRET=local-directus-secret",
    "REVALIDATE_SECRET=local-revalidate-secret",
    "NEXTAUTH_SECRET=local-nextauth-secret",
    "APP_IMAGE=ghcr.io/przemekp95/casn-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "NGINX_IMAGE=ghcr.io/przemekp95/casn-nginx@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "APP_REVISION=cccccccccccccccccccccccccccccccccccccccc",
    "CASN_LOCAL_DB_PORT=13307",
    "CASN_LOCAL_HTTP_PORT=13010",
    "APP_PUBLIC_URL=http://127.0.0.1:13010",
    "DIRECTUS_PUBLIC_URL=http://127.0.0.1:13010/cms",
    `SNAPSHOT_HANDOFF_DIRECTORY=${handoff}`,
    "CURRENT_LOCAL_PROJECT=casn_rehearsal_previous",
  ];
  options.mutateEnv?.(envLines);
  const envFile = join(root, "local.env");
  writeFileSync(envFile, `${envLines.join("\n")}\n`, { mode: 0o600 });

  const commandLog = join(root, "commands.log");
  writeFileSync(commandLog, "", { mode: 0o600 });
  writeFileSync(join(fakeBin, "docker"), fakeDockerScript(), { mode: 0o700 });
  writeFileSync(join(fakeBin, "age"), fakeAgeScript(), { mode: 0o700 });
  chmodSync(join(fakeBin, "docker"), 0o700);
  chmodSync(join(fakeBin, "age"), 0o700);

  const result = spawnSync(
    "bash",
    [
      importer,
      "--artifact",
      artifact,
      "--manifest",
      manifest,
      "--identity",
      identity,
      "--env-file",
      envFile,
      "--snapshot-id",
      snapshotId,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        FAKE_COMMAND_LOG: commandLog,
        FAKE_EXISTING_VOLUME: options.existingVolume ? "1" : "0",
        FAKE_LOCAL_UUID: options.localUuid ?? "local-uuid",
      },
    },
  );

  return {
    root,
    handoff,
    result,
    commandLog: readFileSync(commandLog, "utf8"),
    cleanup: () => {
      if (options.symlinkArtifact) unlinkSync(artifact);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe("local snapshot importer", () => {
  it("restores into a new candidate and writes only a redacted handoff", () => {
    const run = prepareRun();
    try {
      expect(run.result.stderr).toBe("");
      expect(run.result.status).toBe(0);
      const handoffFiles = readdirSync(run.handoff);
      expect(handoffFiles).toEqual([`${snapshotId}.candidate.json`]);
      const handoff = readFileSync(join(run.handoff, handoffFiles[0]), "utf8");
      expect(handoff).toContain("casn_snapshot_20260826t121500z-a1b2c3d4");
      expect(handoff).not.toContain("local-root-secret");
      expect(run.commandLog).toContain("run --rm -i --mount");
      expect(run.commandLog).not.toMatch(/ssh|scp|DROP|volume rm|down -v/);
    } finally {
      run.cleanup();
    }
  });

  it("rejects an existing target volume before starting Compose", () => {
    const run = prepareRun({ existingVolume: true });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).not.toContain(" compose ");
    } finally {
      run.cleanup();
    }
  });

  it("rejects a candidate with the production server identity before restore", () => {
    const run = prepareRun({ localUuid: "prod-uuid" });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).not.toContain("mysql --database=casn_local");
    } finally {
      run.cleanup();
    }
  });

  it("rejects a production URL before invoking Docker", () => {
    const run = prepareRun({
      mutateEnv: (lines) => {
        const index = lines.findIndex((line) => line.startsWith("APP_PUBLIC_URL="));
        lines[index] = "APP_PUBLIC_URL=https://casn.pl";
      },
    });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).toBe("");
    } finally {
      run.cleanup();
    }
  });

  it("rejects symlinked or corrupt encrypted artifacts before invoking Docker", () => {
    for (const options of [{ symlinkArtifact: true }, { tamperArtifact: true }]) {
      const run = prepareRun(options);
      try {
        expect(run.result.status).not.toBe(0);
        expect(run.commandLog).toBe("");
      } finally {
        run.cleanup();
      }
    }
  });

  it("rejects a group-readable age identity before invoking Docker", () => {
    const run = prepareRun({ identityMode: 0o640 });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).toBe("");
    } finally {
      run.cleanup();
    }
  });
});
