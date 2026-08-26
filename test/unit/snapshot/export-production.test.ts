/** @jest-environment node */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryScripts = join(process.cwd(), "scripts/snapshot");
const databaseNameHash = "b7e72b0ceabb10b225fee5074867cb6fda0a51f30743d4058eea8e3645cb76c6";
const serverUuidHash = "4835dae58c92570471bebc1f79021220d4f993b750206b646270f03b060eda08";

function fakeDockerScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$FAKE_COMMAND_LOG"
printf ' %q' "$@" >> "$FAKE_COMMAND_LOG"
printf '\n' >> "$FAKE_COMMAND_LOG"
all=" $* "
case "$all" in
  *" ps "*"com.docker.compose.service=mysql"*) printf 'verified-mysql-id\n' ;;
  *" ps "*"com.docker.compose.service=directus"*) printf 'verified-directus-id\n' ;;
  *" volume ls "*"com.docker.compose.volume=directus_uploads"*) printf 'verified-directus-volume\n' ;;
  *" volume ls "*"com.docker.compose.volume=strapi_uploads"*) printf 'verified-legacy-volume\n' ;;
  *" network ls "*"com.docker.compose.network=casn-network"*) printf 'verified-network\n' ;;
  *" inspect "*"State.Health.Status"*) printf 'healthy\n' ;;
  *" inspect "*"State.Status"*) printf 'running\n' ;;
  *" run "*"SELECT DATABASE()"*) printf 'casn\n' ;;
  *" run "*"@@server_uuid"*) printf 'prod-uuid\n' ;;
  *" run "*"ENGINE NOT IN"*)
    [[ "\${FAKE_FAILURE_POINT-}" != nontransactional ]] && printf '0\n' || printf '1\n'
    ;;
  *" run "*"TABLE_TYPE = "*"BASE TABLE"*) printf '18\n' ;;
  *" run "*"information_schema.VIEWS"*) printf '0\n' ;;
  *" run "*"information_schema.TRIGGERS"*) printf '2\n' ;;
  *" run "*"information_schema.ROUTINES"*) printf '1\n' ;;
  *" run "*"information_schema.EVENTS"*) printf '0\n' ;;
  *" run "*"FROM Author"*) printf '32\n' ;;
  *" run "*"FROM Analysis"*) printf '39\n' ;;
  *" run "*"mysqldump"*)
    [[ "\${FAKE_FAILURE_POINT-}" != dump ]] || exit 42
    printf 'database'
    ;;
  *" run "*"verified-directus-volume"*"find /from"*) printf '2\n' ;;
  *" run "*"verified-legacy-volume"*"find /from"*) printf '3\n' ;;
  *" run "*"verified-directus-volume"*)
    [[ "\${FAKE_FAILURE_POINT-}" != directus-media ]] || exit 42
    printf 'directus'
    ;;
  *" run "*"verified-legacy-volume"*)
    [[ "\${FAKE_FAILURE_POINT-}" != legacy-media ]] || exit 42
    printf 'legacy'
    ;;
  *" stop "*"verified-directus-id"*) printf 'verified-directus-id\n' ;;
  *" start "*"verified-directus-id"*) printf 'verified-directus-id\n' ;;
  *) printf 'unexpected docker call: %s\n' "$all" >&2; exit 64 ;;
esac
`;
}

function fakeCurlScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
printf 'curl' >> "$FAKE_COMMAND_LOG"
printf ' %q' "$@" >> "$FAKE_COMMAND_LOG"
printf '\n' >> "$FAKE_COMMAND_LOG"
url="\${*: -1}"
case "$url" in
  */api/authors) printf '[{"id":1,"slug":"author"}]' ;;
  */api/analyses) printf '[{"id":1,"slug":"analysis"}]' ;;
  */sitemap.xml) printf '<urlset><url><loc>https://casn.pl/</loc></url></urlset>' ;;
  *) exit 64 ;;
esac
`;
}

function fakeAgeScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
printf 'age' >> "$FAKE_COMMAND_LOG"
printf ' %q' "$@" >> "$FAKE_COMMAND_LOG"
printf '\n' >> "$FAKE_COMMAND_LOG"
[[ "\${FAKE_FAILURE_POINT-}" != encrypt ]] || exit 42
output=''
input=''
while (( $# > 0 )); do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    -r) shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
cp "$input" "$output"
chmod 600 "$output"
`;
}

function runExporter(options: {
  failurePoint?: string;
  envMode?: number;
  mutateEnv?: (lines: string[]) => void;
  preflightOnly?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "casn-exporter-test-"));
  const scripts = join(root, "scripts");
  const fakeBin = join(root, "bin");
  const output = join(root, "output");
  const commandLog = join(root, "commands.log");
  mkdirSync(scripts);
  mkdirSync(fakeBin);
  mkdirSync(output);
  writeFileSync(commandLog, "", { mode: 0o600 });

  for (const name of ["common.sh", "manifest.sh", "export-production.sh"]) {
    if (existsSync(join(repositoryScripts, name))) copyFileSync(join(repositoryScripts, name), join(scripts, name));
  }
  if (options.failurePoint === "manifest") {
    writeFileSync(join(scripts, "manifest.sh"), "#!/usr/bin/env bash\nexit 42\n", { mode: 0o700 });
  }

  writeFileSync(join(fakeBin, "docker"), fakeDockerScript(), { mode: 0o700 });
  writeFileSync(join(fakeBin, "curl"), fakeCurlScript(), { mode: 0o700 });
  writeFileSync(join(fakeBin, "age"), fakeAgeScript(), { mode: 0o700 });
  for (const name of ["docker", "curl", "age"]) chmodSync(join(fakeBin, name), 0o700);

  const envLines = [
    "SOURCE_COMPOSE_PROJECT=casn-production",
    "SOURCE_MYSQL_SERVICE=mysql",
    "SOURCE_DATABASE=casn",
    "SOURCE_DIRECTUS_SERVICE=directus",
    "SOURCE_DIRECTUS_UPLOADS_VOLUME=directus_uploads",
    "SOURCE_LEGACY_UPLOADS_VOLUME=strapi_uploads",
    "SOURCE_DOCKER_NETWORK=casn-network",
    `EXPECTED_DATABASE_NAME_HASH=${databaseNameHash}`,
    `EXPECTED_SERVER_UUID_HASH=${serverUuidHash}`,
    "SNAPSHOT_EXPORT_USER=casn_snapshot_export",
    "SNAPSHOT_EXPORT_PASSWORD=SENTINEL_EXPORT_PASSWORD",
    "SNAPSHOT_AGE_RECIPIENT=age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    `SNAPSHOT_OUTPUT_DIRECTORY=${output}`,
    "SOURCE_PUBLIC_URL=https://casn.pl",
  ];
  options.mutateEnv?.(envLines);
  const envFile = join(root, "export.env");
  writeFileSync(envFile, `${envLines.join("\n")}\n`, { mode: options.envMode ?? 0o600 });
  chmodSync(envFile, options.envMode ?? 0o600);

  const executable = join(scripts, "export-production.sh");
  const args = [executable, "--env-file", envFile];
  if (options.preflightOnly) args.push("--preflight-only");
  const result = spawnSync("bash", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_COMMAND_LOG: commandLog,
      FAKE_FAILURE_POINT: options.failurePoint ?? "",
    },
  });

  return {
    root,
    output,
    commandLog: readFileSync(commandLog, "utf8"),
    outputFiles: readdirSync(output),
    result,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("production snapshot exporter", () => {
  it("creates only an encrypted artifact and manifest and resumes Directus", () => {
    const run = runExporter();
    try {
      expect(run.result.stderr).toBe("");
      expect(run.result.status).toBe(0);
      expect(run.outputFiles.some((name) => name.endsWith(".casn-snapshot.age"))).toBe(true);
      expect(run.outputFiles.some((name) => name.endsWith(".manifest.json"))).toBe(true);
      expect(run.commandLog).toContain("docker stop");
      expect(run.commandLog).toContain("docker start verified-directus-id");
      expect(run.commandLog).toContain("--skip-dump-date");
      expect(run.commandLog).toContain("--compact");
      expect(run.commandLog).not.toContain("SENTINEL_EXPORT_PASSWORD");
      expect(run.result.stdout).not.toContain("SENTINEL_EXPORT_PASSWORD");
      expect(run.result.stderr).not.toContain("SENTINEL_EXPORT_PASSWORD");
    } finally {
      run.cleanup();
    }
  });

  it.each(["dump", "directus-media", "legacy-media", "manifest", "encrypt"])(
    "resumes Directus after %s failure",
    (failurePoint) => {
      const run = runExporter({ failurePoint });
      try {
        expect(run.result.status).not.toBe(0);
        expect(run.commandLog).toContain("docker start verified-directus-id");
        expect(run.commandLog).not.toContain("INSERT");
        expect(run.commandLog).not.toContain("UPDATE");
        expect(run.commandLog).not.toContain("DELETE");
        expect(run.commandLog).not.toContain("DROP");
      } finally {
        run.cleanup();
      }
    },
  );

  it("rejects a group-readable environment file before stopping Directus", () => {
    const run = runExporter({ envMode: 0o640 });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).not.toContain("docker stop");
    } finally {
      run.cleanup();
    }
  });

  it("rejects a source identity mismatch before stopping Directus", () => {
    const run = runExporter({
      mutateEnv: (lines) => {
        const index = lines.findIndex((line) => line.startsWith("EXPECTED_SERVER_UUID_HASH="));
        lines[index] = `EXPECTED_SERVER_UUID_HASH=${"f".repeat(64)}`;
      },
    });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).not.toContain("docker stop");
    } finally {
      run.cleanup();
    }
  });

  it("rejects non-transactional application tables before stopping Directus", () => {
    const run = runExporter({ failurePoint: "nontransactional" });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).not.toContain("docker stop");
    } finally {
      run.cleanup();
    }
  });

  it("runs a complete preflight without stopping Directus or creating an artifact", () => {
    const run = runExporter({ preflightOnly: true });
    try {
      expect(run.result.status).toBe(0);
      expect(run.result.stdout).toContain("preflight verified");
      expect(run.commandLog).not.toContain("docker stop");
      expect(run.outputFiles).toHaveLength(0);
    } finally {
      run.cleanup();
    }
  });

  it("accepts an explicit loopback HTTP origin", () => {
    const run = runExporter({
      preflightOnly: true,
      mutateEnv: (lines) => {
        const index = lines.findIndex((line) => line.startsWith("SOURCE_PUBLIC_URL="));
        lines[index] = "SOURCE_PUBLIC_URL=http://127.0.0.1:18080";
      },
    });
    try {
      expect(run.result.status).toBe(0);
      expect(run.commandLog).not.toContain("docker stop");
    } finally {
      run.cleanup();
    }
  });

  it("rejects non-loopback plain HTTP before resolving Docker resources", () => {
    const run = runExporter({
      preflightOnly: true,
      mutateEnv: (lines) => {
        const index = lines.findIndex((line) => line.startsWith("SOURCE_PUBLIC_URL="));
        lines[index] = "SOURCE_PUBLIC_URL=http://casn.pl";
      },
    });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.commandLog).toBe("");
    } finally {
      run.cleanup();
    }
  });
});
