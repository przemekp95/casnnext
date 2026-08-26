#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MYSQL_IMAGE = "mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b";
const TIMEOUT_MS = 15_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SNAPSHOT_PATTERN = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/;
const PROJECT_PATTERN = /^casn_snapshot_[a-z0-9_-]+$/;

function fail(message = "parity verification failed") {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function requireOwnerFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fail();
}

function parseJsonFile(path) {
  requireOwnerFile(path);
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail();
  return value;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || options[flag]) fail();
    options[flag] = value;
  }
  const expected = ["--handoff", "--manifest", "--base-url", "--report"];
  if (!exactKeys(options, expected)) fail();
  return options;
}

function command(file, args, { binary = false } = {}) {
  try {
    return execFileSync(file, args, {
      encoding: binary ? null : "utf8",
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail();
  }
}

function resolveSingle(kind, project, label, value) {
  const args = kind === "container"
    ? ["ps", "--filter", `label=com.docker.compose.project=${project}`, "--filter", `label=${label}=${value}`, "--format", "{{.ID}}"]
    : [kind, "ls", "--filter", `label=com.docker.compose.project=${project}`, "--filter", `label=${label}=${value}`, "--format", kind === "volume" ? "{{.Name}}" : "{{.Name}}"];
  const output = command("docker", args).trim().split("\n").filter(Boolean);
  if (output.length !== 1 || !/^[A-Za-z0-9_.-]+$/.test(output[0])) fail();
  return output[0];
}

function mysqlQuery(container, sql) {
  return command("docker", [
    "exec", container,
    "sh", "-ec",
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root --database=casn_local --execute "$1"',
    "sh", sql,
  ]).trim();
}

function databaseDump(container) {
  return command("docker", [
    "exec", container,
    "sh", "-ec",
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --quick --hex-blob --routines --triggers --events --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --skip-dump-date --skip-comments casn_local',
  ], { binary: true });
}

function volumeFileCount(volume) {
  const output = command("docker", [
    "run", "--rm", "--mount", `type=volume,src=${volume},dst=/from,readonly`, MYSQL_IMAGE,
    "sh", "-ec", "find /from -type f -print | LC_ALL=C sort | wc -l",
  ]).trim();
  if (!/^[0-9]+$/.test(output)) fail();
  return Number(output);
}

function volumeArchive(volume) {
  return command("docker", [
    "run", "--rm", "--mount", `type=volume,src=${volume},dst=/from,readonly`, MYSQL_IMAGE,
    "tar", "-C", "/from", "-cf", "-", ".",
  ], { binary: true });
}

function fetch(baseUrl, path) {
  return command("curl", ["-fsS", "--connect-timeout", "5", "--max-time", "15", `${baseUrl}${path}`]);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}

function normalizePublicJson(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) fail();
  parsed.sort((left, right) => {
    const leftKey = left?.id ?? left?.slug ?? left?.url ?? "";
    const rightKey = right?.id ?? right?.slug ?? right?.url ?? "";
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return { count: parsed.length, sha256: sha256(`${JSON.stringify(sortKeys(parsed), null, 2)}\n`), value: parsed };
}

function normalizeSitemap(raw) {
  const paths = [];
  for (const match of raw.matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const url = new URL(match[1]);
    paths.push(`${url.pathname}${url.search}`);
  }
  paths.sort();
  return { count: paths.length, sha256: sha256(`${paths.join("\n")}\n`) };
}

function findPath(value, prefix) {
  if (typeof value === "string" && value.startsWith(prefix)) return value;
  if (Array.isArray(value)) {
    for (const nested of value) {
      const match = findPath(nested, prefix);
      if (match) return match;
    }
  } else if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) {
      const match = findPath(nested, prefix);
      if (match) return match;
    }
  }
  return null;
}

function validateManifest(manifest) {
  if (!exactKeys(manifest, ["version", "snapshotId", "capturedAt", "source", "database", "media", "public"])) fail();
  if (manifest.version !== 1 || !SNAPSHOT_PATTERN.test(manifest.snapshotId)) fail();
  if (!exactKeys(manifest.source, ["databaseNameHash", "serverUuidHash"])) fail();
  if (!HASH_PATTERN.test(manifest.source.databaseNameHash) || !HASH_PATTERN.test(manifest.source.serverUuidHash)) fail();
  const count = (value) => Number.isSafeInteger(value) && value >= 0;
  if (!exactKeys(manifest.database, ["tables", "views", "triggers", "routines", "events", "sha256"])) fail();
  if (!["tables", "views", "triggers", "routines", "events"].every((key) => count(manifest.database[key])) || !HASH_PATTERN.test(manifest.database.sha256)) fail();
  for (const key of ["directus", "legacy"]) {
    if (!exactKeys(manifest.media?.[key], ["files", "sha256"]) || !count(manifest.media[key].files) || !HASH_PATTERN.test(manifest.media[key].sha256)) fail();
  }
  for (const key of ["authors", "analyses", "sitemap"]) {
    if (!exactKeys(manifest.public?.[key], ["count", "sha256"]) || !count(manifest.public[key].count) || !HASH_PATTERN.test(manifest.public[key].sha256)) fail();
  }
}

function validateHandoff(handoff, manifest, manifestBytes) {
  if (!exactKeys(handoff, ["snapshotId", "project", "database", "dbPort", "httpPort", "manifestSha256", "previousProject"])) fail();
  if (handoff.snapshotId !== manifest.snapshotId || !PROJECT_PATTERN.test(handoff.project)) fail();
  if (handoff.database !== "casn_local" || !/^\d{1,5}$/.test(handoff.httpPort) || !/^\d{1,5}$/.test(handoff.dbPort)) fail();
  if (handoff.manifestSha256 !== sha256(manifestBytes)) fail();
}

function safeRuntimeBoundary(containerInspect, networkInspect) {
  if (!Array.isArray(containerInspect) || containerInspect.length !== 4) return { loopback: false, environment: false };
  const bindings = containerInspect.flatMap((container) => Object.values(container?.NetworkSettings?.Ports ?? {}))
    .filter(Array.isArray).flat();
  const loopback = bindings.length > 0 && bindings.every((binding) => binding?.HostIp === "127.0.0.1");
  const environments = containerInspect.flatMap((container) => container?.Config?.Env ?? []);
  const forbiddenKey = /^(RUN_DB_MIGRATIONS|DB_MIGRATION_CONFIRM|DIRECTUS_TOKEN|SMTP_PASSWORD|S3_SECRET|AWS_SECRET_ACCESS_KEY)=/;
  const environment = environments.every((entry) => typeof entry === "string"
    && !forbiddenKey.test(entry) && !entry.toLowerCase().includes("casn.pl"));
  const internal = Array.isArray(networkInspect) && networkInspect.length === 1 && networkInspect[0]?.Internal === true;
  return { loopback, environment, internal };
}

function writeReport(path, report) {
  if (existsSync(path) || !existsSync(dirname(path))) fail();
  process.umask(0o077);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifestBytes = readFileSync(options["--manifest"]);
  const manifest = parseJsonFile(options["--manifest"]);
  const handoff = parseJsonFile(options["--handoff"]);
  validateManifest(manifest);
  validateHandoff(handoff, manifest, manifestBytes);

  const base = new URL(options["--base-url"]);
  if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname)
      || base.port !== handoff.httpPort || base.pathname !== "/" || base.search || base.hash) fail();
  const baseUrl = base.origin;

  const services = ["mysql", "directus", "app", "nginx"];
  const containers = Object.fromEntries(services.map((service) => [
    service,
    resolveSingle("container", handoff.project, "com.docker.compose.service", service),
  ]));
  const directusVolume = resolveSingle("volume", handoff.project, "com.docker.compose.volume", "directus_uploads");
  const legacyVolume = resolveSingle("volume", handoff.project, "com.docker.compose.volume", "strapi_uploads");
  const network = resolveSingle("network", handoff.project, "com.docker.compose.network", "casn_snapshot_internal");

  const database = {
    selected: mysqlQuery(containers.mysql, "SELECT DATABASE();"),
    uuidHash: sha256(mysqlQuery(containers.mysql, "SELECT @@server_uuid;")),
    tables: Number(mysqlQuery(containers.mysql, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE';")),
    views: Number(mysqlQuery(containers.mysql, "SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE();")),
    triggers: Number(mysqlQuery(containers.mysql, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();")),
    routines: Number(mysqlQuery(containers.mysql, "SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE();")),
    events: Number(mysqlQuery(containers.mysql, "SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE();")),
    sha256: sha256(databaseDump(containers.mysql)),
  };
  const media = {
    directus: { files: volumeFileCount(directusVolume), sha256: sha256(volumeArchive(directusVolume)) },
    legacy: { files: volumeFileCount(legacyVolume), sha256: sha256(volumeArchive(legacyVolume)) },
  };

  const authors = normalizePublicJson(fetch(baseUrl, "/api/authors"));
  const analyses = normalizePublicJson(fetch(baseUrl, "/api/analyses"));
  const sitemap = normalizeSitemap(fetch(baseUrl, "/sitemap.xml"));
  const authorSlug = authors.value.find((entry) => typeof entry?.slug === "string")?.slug;
  const analysisSlug = analyses.value.find((entry) => typeof entry?.slug === "string")?.slug;
  const directusAsset = findPath([authors.value, analyses.value], "/cms/assets/");
  const legacyAsset = findPath([authors.value, analyses.value], "/cms/uploads/");
  if (!authorSlug || !analysisSlug || !directusAsset || !legacyAsset) fail();
  for (const path of [
    "/", "/autorzy", "/analizy", "/zbiory", `/autor/${encodeURIComponent(authorSlug)}`,
    `/analizy/${encodeURIComponent(analysisSlug)}`, "/api/health", "/cms/server/ping", directusAsset, legacyAsset,
  ]) fetch(baseUrl, path);

  const inspectedContainers = JSON.parse(command("docker", ["inspect", ...Object.values(containers)]));
  const inspectedNetwork = JSON.parse(command("docker", ["network", "inspect", network]));
  const runtime = safeRuntimeBoundary(inspectedContainers, inspectedNetwork);
  const gates = {
    databaseIdentity: database.selected === "casn_local" && database.uuidHash !== manifest.source.serverUuidHash,
    databaseObjects: ["tables", "views", "triggers", "routines", "events"].every((key) => database[key] === manifest.database[key]),
    databasePayload: database.sha256 === manifest.database.sha256,
    media: ["directus", "legacy"].every((key) => media[key].files === manifest.media[key].files && media[key].sha256 === manifest.media[key].sha256),
    public: [authors, analyses, sitemap].every((item, index) => {
      const expected = manifest.public[["authors", "analyses", "sitemap"][index]];
      return item.count === expected.count && item.sha256 === expected.sha256;
    }),
    representativeHttp: true,
    loopbackBindings: runtime.loopback,
    internalNetwork: runtime.internal,
    safeEnvironment: runtime.environment,
  };
  const passed = Object.values(gates).every(Boolean);
  writeReport(options["--report"], {
    snapshotId: manifest.snapshotId,
    project: handoff.project,
    passed,
    gates,
    counts: {
      database: { tables: database.tables, views: database.views, triggers: database.triggers, routines: database.routines, events: database.events },
      media: { directus: media.directus.files, legacy: media.legacy.files },
      public: { authors: authors.count, analyses: analyses.count, sitemap: sitemap.count },
    },
    hashes: {
      database: database.sha256,
      directusMedia: media.directus.sha256,
      legacyMedia: media.legacy.sha256,
      authors: authors.sha256,
      analyses: analyses.sha256,
      sitemap: sitemap.sha256,
    },
  });
  if (!passed) fail();
  process.stdout.write(`parity verified: ${manifest.snapshotId}\n`);
}

try {
  main();
} catch {
  process.stderr.write("parity verification failed\n");
  process.exitCode = 1;
}
