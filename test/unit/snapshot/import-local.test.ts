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
  *" volume inspect "*)
    if [[ -e "$FAKE_COMMAND_LOG.created" ]]; then
      logical=mysql_data
      [[ "\${*: -1}" == *directus_uploads ]] && logical=directus_uploads
      [[ "\${*: -1}" == *strapi_uploads ]] && logical=strapi_uploads
      printf '[{"Labels":{"com.docker.compose.project":"casn_snapshot_20260826t121500z-a1b2c3d4","com.docker.compose.volume":"%s"}}]' "$logical"
    else
      [[ "$FAKE_EXISTING_VOLUME" == 1 ]]
    fi
    ;;
  *" volume create "*) touch "$FAKE_COMMAND_LOG.created"; printf '%s\n' "\${*: -1}" ;;
  *" compose "*" config "*"--format json"*)
    printf '%s' '{"services":{"mysql":{"environment":{"MYSQL_DATABASE":"casn_local"},"networks":{"casn_snapshot_internal":null}},"directus":{"networks":{"casn_snapshot_internal":null}},"app":{"environment":{"DB_NAME":"casn_local"},"networks":{"casn_snapshot_internal":null}},"nginx":{"ports":[{"host_ip":"127.0.0.1","published":"13010","target":8080}],"networks":{"casn_snapshot_internal":null,"casn_snapshot_loopback":null}}},"networks":{"casn_snapshot_internal":{"internal":true},"casn_snapshot_loopback":{"internal":false}}}'
    ;;
  *" compose "*" up -d mysql"*) touch "$FAKE_COMMAND_LOG.created" ;;
  *" compose "*" up "*) ;;
  *" compose "*" create directus app nginx"*) ;;
  *" compose "*" start directus app nginx"*) ;;
  *" compose "*" ps -q mysql"*) printf 'candidate-mysql-id\n' ;;
  *" compose "*" ps -aq directus"*) printf 'candidate-directus-id\n' ;;
  *" compose "*" ps -aq app"*) printf 'candidate-app-id\n' ;;
  *" compose "*" ps -aq nginx"*) printf 'candidate-nginx-id\n' ;;
  *" inspect "*"State.Health.Status"*) printf 'healthy\n' ;;
  *" image inspect "*)
    printf '[{"Config":{"Labels":{"org.opencontainers.image.revision":"%s"}}},{"Config":{"Labels":{"org.opencontainers.image.revision":"%s"}}}]' "$APP_REVISION" "$APP_REVISION"
    ;;
  *" inspect candidate-mysql-id"*)
    host_ip=127.0.0.1
    [[ "$FAKE_BOUNDARY_MISMATCH" != 1 ]] || host_ip=0.0.0.0
    printf '[{"Config":{"Image":"mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b","Labels":{"com.docker.compose.project":"casn_snapshot_20260826t121500z-a1b2c3d4","com.docker.compose.service":"mysql"}},"NetworkSettings":{"Networks":{"casn_snapshot_20260826t121500z-a1b2c3d4_casn_snapshot_internal":{}},"Ports":%s},"Mounts":[{"Type":"volume","Name":"casn_snapshot_20260826t121500z-a1b2c3d4_mysql_data","Destination":"/var/lib/mysql"}]}]' "$( [[ "$FAKE_BOUNDARY_MISMATCH" == 1 ]] && printf '{"3306/tcp":[{"HostIp":"0.0.0.0"}]}' || printf '{}' )"
    ;;
  *" network inspect casn_snapshot_20260826t121500z-a1b2c3d4_casn_snapshot_internal"*)
    printf '[{"Internal":true,"Labels":{"com.docker.compose.project":"casn_snapshot_20260826t121500z-a1b2c3d4","com.docker.compose.network":"casn_snapshot_internal"}}]'
    ;;
  *" network inspect casn_snapshot_20260826t121500z-a1b2c3d4_casn_snapshot_loopback"*)
    printf '[{"Internal":false,"Labels":{"com.docker.compose.project":"casn_snapshot_20260826t121500z-a1b2c3d4","com.docker.compose.network":"casn_snapshot_loopback"}}]'
    ;;
  *" inspect candidate-directus-id"*)
    printf '[{"Config":{"Image":"directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869","Labels":{"com.docker.compose.project":"casn_snapshot_20260826t121500z-a1b2c3d4","com.docker.compose.service":"directus"}},"NetworkSettings":{"Networks":{"casn_snapshot_20260826t121500z-a1b2c3d4_casn_snapshot_internal":{}},"Ports":{"8055/tcp":null}},"Mounts":[{"Type":"volume","Name":"casn_snapshot_20260826t121500z-a1b2c3d4_directus_uploads","Destination":"/directus/uploads","RW":true}]}]'
    ;;
  *" inspect candidate-app-id"*)
    printf '[{"Config":{"Image":"%s","Labels":{"com.docker.compose.project":"casn_snapshot_20260826t121500z-a1b2c3d4","com.docker.compose.service":"app"}},"NetworkSettings":{"Networks":{"casn_snapshot_20260826t121500z-a1b2c3d4_casn_snapshot_internal":{}},"Ports":{"3000/tcp":null}},"Mounts":[]}]' "$APP_IMAGE"
    ;;
  *" inspect candidate-nginx-id"*)
    printf '[{"Config":{"Image":"%s","Labels":{"com.docker.compose.project":"casn_snapshot_20260826t121500z-a1b2c3d4","com.docker.compose.service":"nginx"}},"HostConfig":{"PortBindings":{"8080/tcp":[{"HostIp":"127.0.0.1"}]}},"NetworkSettings":{"Networks":{"casn_snapshot_20260826t121500z-a1b2c3d4_casn_snapshot_internal":{},"casn_snapshot_20260826t121500z-a1b2c3d4_casn_snapshot_loopback":{}},"Ports":{"8080/tcp":[{"HostIp":"127.0.0.1"}]}},"Mounts":[{"Type":"volume","Name":"casn_snapshot_20260826t121500z-a1b2c3d4_strapi_uploads","Destination":"/legacy-strapi-uploads","RW":false}]}]' "$NGINX_IMAGE"
    ;;
  *" compose "*"SELECT @@server_uuid"*) printf '%s\n' "$FAKE_LOCAL_UUID" ;;
  *" compose "*"SELECT DATABASE()"*) printf 'casn_local\n' ;;
  *" compose "*"mysqldump "*) printf 'database' ;;
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
  boundaryMismatch?: boolean;
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
    media: {
      directus: { files: 2, representativePath: "/cms/assets/author-1.jpg", representativeEvidence: "directus-db" },
      legacy: { files: 3, representativePath: "/cms/uploads/analysis-1.jpg", representativeEvidence: "volume-inventory" },
    },
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
      FAKE_BOUNDARY_MISMATCH: options.boundaryMismatch ? "1" : "0",
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
      expect(handoff).toContain('"databaseContentSha256"');
      expect(JSON.parse(handoff).appRevision).toBe("cccccccccccccccccccccccccccccccccccccccc");
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

  it("rejects actual Docker resources that do not match the isolated candidate boundary", () => {
    const run = prepareRun({ boundaryMismatch: true });
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

  it("accepts an immutable local Docker content ID", () => {
    const run = prepareRun({
      mutateEnv: (lines) => {
        const index = lines.findIndex((line) => line.startsWith("NGINX_IMAGE="));
        lines[index] = `NGINX_IMAGE=sha256:${"b".repeat(64)}`;
      },
    });
    try {
      expect(run.result.status).toBe(0);
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
