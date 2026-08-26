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

const verifier = join(process.cwd(), "scripts/snapshot/verify-parity.mjs");
const snapshotId = "20260826T121500Z-a1b2c3d4";
const sentinel = "DIRECTUS_TOKEN_SENTINEL_DO_NOT_LEAK";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedJson(value: unknown) {
  const sortKeys = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sortKeys);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, sortKeys(nested)]),
      );
    }
    return item;
  };
  const sorted = Array.isArray(value)
    ? [...value].sort((left, right) => {
        const key = (item: Record<string, unknown>) => item.id ?? item.slug ?? item.url ?? "";
        const leftKey = key(left as Record<string, unknown>);
        const rightKey = key(right as Record<string, unknown>);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })
    : value;
  return `${JSON.stringify(sortKeys(sorted), null, 2)}\n`;
}

function fakeDocker() {
  return `#!/usr/bin/env bash
set -euo pipefail
args=" $* "
case "$args" in
  *" ps "*"com.docker.compose.service=mysql"*) printf 'mysql-id\\n' ;;
  *" ps "*"com.docker.compose.service=directus"*) printf 'directus-id\\n' ;;
  *" ps "*"com.docker.compose.service=app"*) printf 'app-id\\n' ;;
  *" ps "*"com.docker.compose.service=nginx"*) printf 'nginx-id\\n' ;;
  *" volume ls "*"com.docker.compose.volume=directus_uploads"*) printf 'candidate-directus\\n' ;;
  *" volume ls "*"com.docker.compose.volume=strapi_uploads"*) printf 'candidate-legacy\\n' ;;
  *" network ls "*"casn_snapshot_internal"*) printf 'candidate-network\\n' ;;
  *" network ls "*"casn_snapshot_loopback"*) printf 'candidate-loopback\\n' ;;
  *" exec "*"SELECT DATABASE()"*) printf 'casn_local\\n' ;;
  *" exec "*"SELECT @@server_uuid"*) printf '%s\\n' "\${FAKE_UUID:-local-uuid}" ;;
  *" exec "*"TABLE_TYPE = 'BASE TABLE'"*) printf '%s\\n' "\${FAKE_TABLES:-18}" ;;
  *" exec "*"information_schema.VIEWS"*) printf '0\\n' ;;
  *" exec "*"information_schema.TRIGGERS"*) printf '2\\n' ;;
  *" exec "*"information_schema.ROUTINES"*) printf '1\\n' ;;
  *" exec "*"information_schema.EVENTS"*) printf '0\\n' ;;
  *" exec "*"mysqldump "*) printf 'database-dump' ;;
  *" run "*"candidate-directus"*"find /from"*) printf '%s\\n' "\${FAKE_DIRECTUS_FILES:-2}" ;;
  *" run "*"candidate-legacy"*"find /from"*) printf '%s\\n' "\${FAKE_LEGACY_FILES:-3}" ;;
  *" run "*"candidate-directus"*"tar -C /from"*) printf 'directus-archive' ;;
  *" run "*"candidate-legacy"*"tar -C /from"*) printf 'legacy-archive' ;;
  *" inspect mysql-id directus-id app-id nginx-id "*)
    forbidden=''
    [[ "\${FAKE_FORBIDDEN_ENV:-0}" == 1 ]] && forbidden=',"RUN_DB_MIGRATIONS=1","DIRECTUS_TOKEN=${sentinel}","UPSTREAM=https://casn.pl"'
    printf '[{"Config":{"Image":"mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b","Env":["DB_NAME=casn_local"%s]},"NetworkSettings":{"Networks":{"candidate-network":{}},"Ports":{}}},{"Config":{"Image":"directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869","Env":["DB_DATABASE=casn_local"]},"NetworkSettings":{"Networks":{"candidate-network":{}},"Ports":{}}},{"Config":{"Image":"ghcr.io/przemekp95/casn-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","Labels":{"org.opencontainers.image.revision":"cccccccccccccccccccccccccccccccccccccccc"},"Env":["DB_NAME=casn_local"]},"NetworkSettings":{"Networks":{"candidate-network":{}},"Ports":{}}},{"Config":{"Image":"ghcr.io/przemekp95/casn-nginx@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","Labels":{"org.opencontainers.image.revision":"cccccccccccccccccccccccccccccccccccccccc"},"Env":[]},"NetworkSettings":{"Networks":{"candidate-network":{},"candidate-loopback":{}},"Ports":{"8080/tcp":[{"HostIp":"127.0.0.1"}]}}}]' "$forbidden"
    ;;
  *" network inspect candidate-network "*)
    if [[ "\${FAKE_EXTERNAL_NETWORK:-0}" == 1 ]]; then printf '[{"Internal":false}]'; else printf '[{"Internal":true}]'; fi
    ;;
  *" network inspect candidate-loopback "*) printf '[{"Internal":false}]' ;;
  *) printf 'unexpected docker invocation' >&2; exit 64 ;;
esac
`;
}

function fakeCurl() {
  return `#!/usr/bin/env bash
set -euo pipefail
url="\${*: -1}"
case "$url" in
  */api/authors) cat "$FAKE_AUTHORS" ;;
  */api/analyses) if [[ "\${FAKE_PUBLIC_MISMATCH:-0}" == 1 ]]; then printf '[]'; else cat "$FAKE_ANALYSES"; fi ;;
  */sitemap.xml) cat "$FAKE_SITEMAP" ;;
  *) printf 'ok' ;;
esac
`;
}

type Mismatch = "tables" | "public" | "media" | "network" | "environment" | "uuid" | "emptyMedia";

function runVerifier(mismatch?: Mismatch) {
  const root = mkdtempSync(join(tmpdir(), "casn-parity-test-"));
  const fakeBin = join(root, "bin");
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, "docker"), fakeDocker(), { mode: 0o700 });
  writeFileSync(join(fakeBin, "curl"), fakeCurl(), { mode: 0o700 });
  chmodSync(join(fakeBin, "docker"), 0o700);
  chmodSync(join(fakeBin, "curl"), 0o700);

  const authors = Array.from({ length: 32 }, (_, index) => ({
    id: index + 1,
    slug: `author-${index + 1}`,
    avatar: index === 0 && mismatch !== "emptyMedia" ? "/cms/assets/author-1.jpg" : null,
    privateToken: index === 0 ? sentinel : undefined,
  }));
  const analyses = Array.from({ length: 39 }, (_, index) => ({
    id: index + 1,
    slug: `analysis-${index + 1}`,
    legacyFile: index === 0 && mismatch !== "emptyMedia" ? "/cms/uploads/analysis-1.jpg" : null,
  }));
  const paths = ["/", "/autorzy", "/analizy", "/zbiory"];
  while (paths.length < 80) paths.push(`/analizy/analysis-${paths.length}`);
  paths[paths.length - 1] = "/analizy/żółć";
  const sitemapPaths = `${[...paths].sort().join("\n")}\n`;
  const sitemapXml = `<urlset>${paths.map((path) => `<url><loc>https://casn.pl${path}</loc></url>`).join("")}</urlset>`;

  const authorsFile = join(root, "authors.json");
  const analysesFile = join(root, "analyses.json");
  const sitemapFile = join(root, "sitemap.xml");
  writeFileSync(authorsFile, JSON.stringify(authors));
  writeFileSync(analysesFile, JSON.stringify(analyses));
  writeFileSync(sitemapFile, sitemapXml);

  const manifest = {
    version: 1,
    snapshotId,
    capturedAt: "2026-08-26T12:15:00Z",
    source: { databaseNameHash: sha256("casn"), serverUuidHash: sha256("prod-uuid") },
    database: {
      tables: 18, views: 0, triggers: 2, routines: 1, events: 0,
      sha256: sha256("database-dump"),
      canonicalSha256: sha256("database-dump"),
    },
    media: {
      directus: {
        files: mismatch === "emptyMedia" ? 0 : 2,
        representativePath: mismatch === "emptyMedia" ? null : "/cms/assets/author-1.jpg",
        sha256: sha256("directus-archive"),
      },
      legacy: {
        files: mismatch === "emptyMedia" ? 0 : 3,
        representativePath: mismatch === "emptyMedia" ? null : "/cms/uploads/analysis-1.jpg",
        sha256: sha256("legacy-archive"),
      },
    },
    public: {
      authors: { count: 32, sha256: sha256(normalizedJson(authors)) },
      analyses: { count: 39, sha256: sha256(normalizedJson(analyses)) },
      sitemap: { count: 80, sha256: sha256(sitemapPaths) },
    },
  };
  const manifestFile = join(root, `${snapshotId}.manifest.json`);
  writeFileSync(manifestFile, JSON.stringify(manifest), { mode: 0o600 });
  chmodSync(manifestFile, 0o600);
  const handoffFile = join(root, `${snapshotId}.candidate.json`);
  writeFileSync(handoffFile, JSON.stringify({
    snapshotId,
    project: "casn_snapshot_20260826t121500z-a1b2c3d4",
    database: "casn_local",
    httpPort: "13010",
    manifestSha256: sha256(readFileSync(manifestFile)),
    databaseContentSha256: sha256("database-dump"),
    appImage: `ghcr.io/przemekp95/casn-app@sha256:${"a".repeat(64)}`,
    nginxImage: `ghcr.io/przemekp95/casn-nginx@sha256:${"b".repeat(64)}`,
    appRevision: "c".repeat(40),
    previousProject: "casn_previous",
  }), { mode: 0o600 });
  chmodSync(handoffFile, 0o600);
  const report = join(root, "parity-report.json");

  const result = spawnSync(process.execPath, [
    verifier,
    "--handoff", handoffFile,
    "--manifest", manifestFile,
    "--base-url", "http://127.0.0.1:13010",
    "--report", report,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_AUTHORS: authorsFile,
      FAKE_ANALYSES: analysesFile,
      FAKE_SITEMAP: sitemapFile,
      FAKE_TABLES: mismatch === "tables" ? "17" : "18",
      FAKE_PUBLIC_MISMATCH: mismatch === "public" ? "1" : "0",
      FAKE_DIRECTUS_FILES: mismatch === "media" ? "1" : "2",
      FAKE_LEGACY_FILES: mismatch === "emptyMedia" ? "0" : "3",
      ...(mismatch === "emptyMedia" ? { FAKE_DIRECTUS_FILES: "0" } : {}),
      FAKE_EXTERNAL_NETWORK: mismatch === "network" ? "1" : "0",
      FAKE_FORBIDDEN_ENV: mismatch === "environment" ? "1" : "0",
      FAKE_UUID: mismatch === "uuid" ? "prod-uuid" : "local-uuid",
    },
  });
  return {
    result,
    report,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("candidate parity verifier", () => {
  it("writes an owner-only redacted report when all parity gates pass", () => {
    const run = runVerifier();
    try {
      expect(run.result).toMatchObject({ status: 0, stderr: "" });
      const report = readFileSync(run.report, "utf8");
      expect(report).toContain('"passed": true');
      expect(report).not.toContain(sentinel);
      expect(statSync(run.report).mode & 0o777).toBe(0o600);
      expect(`${run.result.stdout}${run.result.stderr}`).not.toContain(sentinel);
    } finally {
      run.cleanup();
    }
  });

  it.each(["tables", "public", "media", "network", "environment", "uuid"] as Mismatch[])(
    "fails closed on a %s mismatch without leaking source data",
    (mismatch) => {
      const run = runVerifier(mismatch);
      try {
        expect(run.result.status).not.toBe(0);
        const output = `${run.result.stdout}${run.result.stderr}`;
        expect(output).not.toContain(sentinel);
        if (statSync(run.report, { throwIfNoEntry: false })) {
          expect(readFileSync(run.report, "utf8")).not.toContain(sentinel);
        }
      } finally {
        run.cleanup();
      }
    },
  );

  it("accepts empty media inventories without inventing an asset request", () => {
    const run = runVerifier("emptyMedia");
    try {
      expect(run.result).toMatchObject({ status: 0, stderr: "" });
      expect(readFileSync(run.report, "utf8")).toContain('"media": true');
    } finally {
      run.cleanup();
    }
  });
});
