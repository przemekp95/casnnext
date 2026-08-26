# CASN Production-to-Local Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and execute a fail-closed, one-way workflow that exports the complete CASN production MySQL database and both media volumes into an encrypted snapshot, restores it into new local-only volumes, and switches local development only after parity verification.

**Architecture:** A production-side exporter is the only component allowed to read production; it produces a signed inventory and an age-encrypted artifact using a dedicated read-only MySQL account and read-only media mounts. A separate local importer has no production database credentials, rejects every non-loopback or production-like target, restores into a snapshot-specific Compose project, and retains the previous local stack for rollback. Production installation, Directus pause, snapshot creation, local cutover, and cleanup remain separate approval gates.

**Tech Stack:** Bash 5, Docker Engine and Compose v2, MySQL 8.0 pinned by digest, Directus 12.3.1 pinned by digest, age, jq, SHA-256, Node.js 22, Jest 30, TypeScript 5.

**Spec:** `docs/superpowers/specs/2026-08-26-casn-production-to-local-snapshot-design.md`

## Global Constraints

- The workflow is one-way: production creates an encrypted artifact; local code never receives a production database connection string or a general-purpose production SSH command channel.
- Snapshot scope is the complete MySQL database, Directus uploads volume, historical Strapi uploads volume, and a non-secret manifest; environment files and runtime secrets are excluded.
- Production MySQL export uses a dedicated account with no `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `GRANT`, or administrative privileges.
- Directus writes may pause only during an explicitly approved snapshot window; public Next.js and MySQL reads remain available.
- Restore always targets a new Compose project, database named `casn_local`, and new volumes; current local data is never overwritten or automatically removed.
- Local MySQL, Directus, application, and Nginx ports bind only to `127.0.0.1`; the local Docker network is internal and has no external egress.
- Full Directus rows, including users and stored tokens, remain production-sensitive; artifacts are encrypted and owner-readable only.
- No repository migration, seed, automatic startup migration, HTTP write endpoint, queue, webhook delivery, continuous replication, local-to-production command, or automatic cleanup is introduced.
- Preserve the dirty worktree. Stage and commit only the paths named by each task; do not stash or include the existing header changes.
- The current local tools are `/usr/bin/age`, `/usr/bin/age-keygen`, `/usr/bin/shellcheck`, `/usr/bin/jq`, `/usr/bin/openssl`, `/usr/bin/docker`, `/usr/bin/ssh`, and `/usr/bin/scp`. MySQL client commands run inside the pinned MySQL image because host `mysql` and `mysqldump` are absent.
- Pin MySQL helper/client containers to `mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b` and Directus to `directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869`.

## File Map

- `scripts/snapshot/common.sh`: pure fail-closed validation and hashing helpers shared by export and import.
- `scripts/snapshot/manifest.sh`: strict jq-based manifest builder and verifier shared by export and import.
- `scripts/snapshot/export-production.sh`: production-only preflight, Directus pause/resume trap, transactional dump, read-only media archive, manifest creation, and age encryption.
- `scripts/snapshot/import-local.sh`: local-only target validation, decryption, new-stack creation, restore, verification orchestration, and candidate handoff.
- `scripts/snapshot/verify-parity.mjs`: compare manifest evidence with the candidate database, media inventory, APIs, sitemap, bindings, and container state without exposing row content.
- `docker-compose.snapshot-local.yml`: snapshot-specific local stack with no fixed container names, loopback-only ports, internal networking, new volumes, and no bootstrap/migrations.
- `scripts/ci/snapshot-roundtrip.sh`: disposable end-to-end export-format/restore smoke using only local containers and synthetic fixtures.
- `test/unit/snapshot/*.test.ts`: executable unit tests for boundary checks, failure traps, command isolation, manifest verification, and secret redaction.
- `docs/production-local-snapshot.md`: operator runbook and approval gates.
- `.gitignore`: exclude encrypted snapshots, manifests carrying production inventory, decrypted staging, and local recipient keys.
- `package.json`: local verification commands only; no npm command capable of contacting production.

---

### Task 1: Fail-Closed Safety Library

**Files:**
- Create: `scripts/snapshot/common.sh`
- Create: `test/unit/snapshot/common.test.ts`

**Interfaces:**
- Produces: `require_snapshot_id(value)`, `require_loopback_host(value)`, `require_local_database_name(value)`, `require_digest_ref(value)`, `require_owner_only_file(path)`, `require_empty_directory(path)`, `sha256_value(value)`, and `die(message)`.
- Consumes: Bash 5, `stat`, `sha256sum`, and no Docker or network access.

- [ ] **Step 1: Write the failing boundary tests**

Create a Jest helper that executes one function from the real Bash library:

```ts
function callCommon(functionName: string, value: string) {
  return spawnSync(
    "bash",
    ["-c", 'source "$1"; "$2" "$3"', "bash", commonPath, functionName, value],
    { encoding: "utf8" },
  );
}

it.each(["127.0.0.1", "localhost", "::1"])("accepts loopback host %s", (host) => {
  expect(callCommon("require_loopback_host", host).status).toBe(0);
});

it.each(["casn.pl", "mysql", "195.78.67.52", "0.0.0.0", ""]) (
  "rejects non-loopback host %s",
  (host) => expect(callCommon("require_loopback_host", host).status).not.toBe(0),
);

it.each(["casn", "production", "casn_prod", "casn-local"])(
  "rejects unsafe database name %s",
  (name) => expect(callCommon("require_local_database_name", name).status).not.toBe(0),
);

it("accepts only snapshot ids with a UTC timestamp and lowercase hex nonce", () => {
  expect(callCommon("require_snapshot_id", "20260826T121500Z-a1b2c3d4").status).toBe(0);
  expect(callCommon("require_snapshot_id", "../../prod").status).not.toBe(0);
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run: `npm test -- --runInBand test/unit/snapshot/common.test.ts`

Expected: FAIL because `scripts/snapshot/common.sh` does not exist.

- [ ] **Step 3: Implement the minimal pure validation library**

Use exact anchored checks and never normalize an unsafe value into a safe one:

```bash
#!/usr/bin/env bash
set -euo pipefail

die() { printf 'snapshot: %s\n' "$*" >&2; return 1; }
require_snapshot_id() { [[ "$1" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || die 'invalid snapshot id'; }
require_loopback_host() { [[ "$1" == 127.0.0.1 || "$1" == localhost || "$1" == ::1 ]] || die 'target host is not loopback'; }
require_local_database_name() { [[ "$1" == casn_local || "$1" =~ ^casn_local_[a-z0-9_]+$ ]] || die 'unsafe local database name'; }
require_digest_ref() { [[ "$1" =~ ^[a-z0-9./_-]+@sha256:[0-9a-f]{64}$ ]] || die 'image is not digest pinned'; }
sha256_value() { printf %s "$1" | sha256sum | awk '{print $1}'; }
```

Implement `require_owner_only_file` using GNU `stat -c '%a'` and accept only
mode `600` or `400`. Implement `require_empty_directory` with `realpath -e`,
reject `/`, the repository root, and any directory containing an entry.

- [ ] **Step 4: Run focused tests and ShellCheck**

Run:

```bash
npm test -- --runInBand test/unit/snapshot/common.test.ts
shellcheck scripts/snapshot/common.sh
```

Expected: PASS; ShellCheck exits 0.

- [ ] **Step 5: Commit only Task 1**

```bash
git add scripts/snapshot/common.sh test/unit/snapshot/common.test.ts
git commit -m "feat(snapshot): add fail-closed target validation"
```

---

### Task 2: Manifest Contract and Verification

**Files:**
- Create: `scripts/snapshot/manifest.sh`
- Create: `test/unit/snapshot/manifest.test.ts`

**Interfaces:**
- Consumes: `snapshot.json` inventory fragments produced by the exporter and SHA-256 values for `database.sql`, `directus-uploads.tar`, and `legacy-uploads.tar`.
- Produces: CLI `bash scripts/snapshot/manifest.sh build --input DIR --output FILE` and `verify --manifest FILE --payload-dir DIR`; exit 0 only for a complete, checksum-valid manifest.

- [ ] **Step 1: Write failing tests against a hand-derived fixture**

The fixture must contain literal expected values rather than values generated by the implementation:

```ts
const manifest = {
  version: 1,
  snapshotId: "20260826T121500Z-a1b2c3d4",
  capturedAt: "2026-08-26T12:15:00Z",
  source: { databaseNameHash: "a".repeat(64), serverUuidHash: "b".repeat(64) },
  database: { sha256: sqlHash, tables: 18, views: 0, triggers: 0, routines: 0, events: 0 },
  media: {
    directus: { sha256: directusHash, files: 2 },
    legacy: { sha256: legacyHash, files: 3 },
  },
  public: {
    authors: { count: 32, sha256: "c".repeat(64) },
    analyses: { count: 39, sha256: "d".repeat(64) },
    sitemap: { count: 80, sha256: "e".repeat(64) },
  },
};
```

Test success, a changed payload byte, missing field, extra top-level field,
malformed timestamp, unsafe snapshot id, and a manifest file with mode `0644`.
Assert that stdout/stderr never contains fixture row content or a sentinel token.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand test/unit/snapshot/manifest.test.ts`

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement strict build and verify subcommands**

Use Bash, jq, and sha256sum only. Reject unknown keys at every object level,
require 64-character lowercase hex hashes for every payload and normalized
public-data inventory, integer counts greater than or equal to zero, an ISO UTC
capture timestamp, and exactly these payload filenames:

```bash
readonly database_payload=database.sql
readonly directus_payload=directus-uploads.tar
readonly legacy_payload=legacy-uploads.tar
jq -e '
  (keys | sort) == ["capturedAt","database","media","public","snapshotId","source","version"]
  and .version == 1
  and (.snapshotId | test("^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$"))
  and (.capturedAt | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
' "$manifest_file" >/dev/null
```

Reject symlinks, require regular files, compare literal sha256sum results, and
write a new manifest with mode `0600` using noclobber (`set -C`). The `verify`
command prints only snapshot id, counts, and `manifest verified`; it never
prints source values or payload content.

- [ ] **Step 4: Run tests, lint, and type checking**

Run:

```bash
npm test -- --runInBand test/unit/snapshot/manifest.test.ts
shellcheck scripts/snapshot/manifest.sh
npx eslint test/unit/snapshot/manifest.test.ts
npm run type-check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit only Task 2**

```bash
git add scripts/snapshot/manifest.sh test/unit/snapshot/manifest.test.ts
git commit -m "feat(snapshot): define strict snapshot manifest"
```

---

### Task 3: Production Exporter with Guaranteed Writer Resume

**Files:**
- Create: `scripts/snapshot/export-production.sh`
- Create: `test/unit/snapshot/export-production.test.ts`

**Interfaces:**
- Consumes: root-only `SNAPSHOT_EXPORT_ENV`, an age recipient, exact Compose project/service/volume names, expected database-name hash, expected server-UUID hash, the pinned MySQL image, and an output directory outside the repository.
- Produces: `<snapshot-id>.casn-snapshot.age` and `<snapshot-id>.manifest.json`; never produces a local-import command or accepts a database destination.

- [ ] **Step 1: Write failing executable tests with fake Docker and age commands**

Build a temporary `PATH` containing fake `docker`, `age`, `curl`, and `date`
executables that append redacted invocations to a mode-0600 command log. Cover:

```ts
it.each(["dump", "directus-media", "legacy-media", "manifest", "encrypt"])(
  "restarts the Directus writer after %s failure",
  (failurePoint) => {
    const result = runExporter({ FAKE_FAILURE_POINT: failurePoint });
    expect(result.status).not.toBe(0);
    expect(readCommandLog()).toContain("docker start verified-directus-id");
    expect(readCommandLog()).not.toContain("INSERT");
    expect(readCommandLog()).not.toContain("DROP");
  },
);
```

Also prove that wrong Compose labels, a database-name hash mismatch, a
server-UUID hash mismatch, non-transactional tables, an unpinned helper image,
an output directory inside the repository, and a group-readable env file fail
before `docker stop`. Assert sentinel passwords never appear in process output
or the fake command log.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand test/unit/snapshot/export-production.test.ts`

Expected: FAIL because the exporter does not exist.

- [ ] **Step 3: Implement production preflight**

Source `common.sh`; require Bash, Docker, jq, age, sha256sum, tar, and curl.
Require an absolute owner-only env file and explicit values for:

```text
SOURCE_COMPOSE_PROJECT
SOURCE_MYSQL_SERVICE
SOURCE_DIRECTUS_SERVICE
SOURCE_DIRECTUS_UPLOADS_VOLUME
SOURCE_LEGACY_UPLOADS_VOLUME
EXPECTED_DATABASE_NAME_HASH
EXPECTED_SERVER_UUID_HASH
SNAPSHOT_EXPORT_USER
SNAPSHOT_EXPORT_PASSWORD
SNAPSHOT_AGE_RECIPIENT
SNAPSHOT_OUTPUT_DIRECTORY
```

Resolve containers by both Compose project and service labels, not by ambient
names. Resolve volumes by project and logical-volume labels. Read database name,
server UUID, engine inventory, object counts, and public counts with the
dedicated account through the pinned MySQL client container. Abort when any
table engine is neither `InnoDB` nor a MySQL system engine explicitly excluded
from the application snapshot.

- [ ] **Step 4: Implement pause, snapshot, manifest, encryption, and trap**

Install the trap before stopping Directus:

```bash
writer_was_stopped=0
resume_writer() {
  if (( writer_was_stopped )); then
    docker start "$source_directus_id" >/dev/null
    wait_for_directus_health "$source_directus_id"
  fi
}
trap resume_writer EXIT INT TERM
docker stop --time 30 "$source_directus_id" >/dev/null
writer_was_stopped=1
```

Run `mysqldump` from the pinned client container with
`--single-transaction --quick --hex-blob --routines --triggers --events
--skip-lock-tables --set-gtid-purged=OFF --no-tablespaces`, sending credentials
through a mode-0600 env file rather than argv. Archive each media volume with a
separate helper container and a read-only mount. Sort file inventories using
`LC_ALL=C`. Build and verify the manifest, then encrypt the payload tar with
`age -r "$SNAPSHOT_AGE_RECIPIENT"`. Remove plaintext staging through a trap
that validates its exact `mktemp -d` path; retain the encrypted artifact and
manifest with mode `0600`.

- [ ] **Step 5: Run focused tests and static checks**

Run:

```bash
npm test -- --runInBand test/unit/snapshot/export-production.test.ts
shellcheck scripts/snapshot/common.sh scripts/snapshot/export-production.sh
git diff --check
```

Expected: tests pass; ShellCheck and diff check exit 0.

- [ ] **Step 6: Commit only Task 3**

```bash
git add scripts/snapshot/export-production.sh test/unit/snapshot/export-production.test.ts
git commit -m "feat(snapshot): add read-only production exporter"
```

---

### Task 4: Snapshot-Specific Local Stack

**Files:**
- Create: `docker-compose.snapshot-local.yml`
- Create: `test/unit/snapshot/local-compose.test.ts`
- Create: `test/fixtures/snapshot/local.env`

**Interfaces:**
- Consumes: a unique Compose project `casn_snapshot_<snapshot-id-without-punctuation>`, local-only env values, `APP_IMAGE`, `NGINX_IMAGE`, and `APP_REVISION`.
- Produces: services `mysql`, `directus`, `app`, and `nginx`; logical volumes `mysql_data`, `directus_uploads`, and `strapi_uploads`; loopback ports `CASN_LOCAL_DB_PORT` and `CASN_LOCAL_HTTP_PORT`.

- [ ] **Step 1: Write a failing rendered-Compose policy test**

Render with literal non-secret test values and assert:

```ts
expect(config.services.mysql.ports[0].host_ip).toBe("127.0.0.1");
expect(config.services.nginx.ports[0].host_ip).toBe("127.0.0.1");
expect(config.services.app.environment.RUN_DB_MIGRATIONS).toBeUndefined();
expect(config.services.directus.command).toEqual(["npx", "directus", "start"]);
expect(config.networks.casn_snapshot_internal.internal).toBe(true);
expect(JSON.stringify(config)).not.toContain("casn.pl");
for (const service of Object.values(config.services)) expect(service.container_name).toBeUndefined();
```

Also assert that the Directus bootstrap bind and `directus/start.sh` command are
absent, because restoring an exact database must not mutate Directus metadata.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --runInBand test/unit/snapshot/local-compose.test.ts`

Expected: FAIL because the Compose file does not exist.

- [ ] **Step 3: Implement the local-only Compose topology**

Copy only the necessary service contracts from `docker-compose.final.yml`.
Remove every `container_name`. Pin MySQL and Directus to the global-constraint
digests. Bind MySQL and Nginx with long-syntax ports to `127.0.0.1`; do not
publish the app or Directus directly. Use database name `casn_local`. Attach all
services only to `casn_snapshot_internal` with `internal: true`. Mount
`strapi_uploads` read-only in Nginx and `directus_uploads` writable only in
Directus. Start Directus with `npx directus start`, not the repository bootstrap.

- [ ] **Step 4: Verify rendered policy and existing Compose policy**

Run:

```bash
npm test -- --runInBand test/unit/snapshot/local-compose.test.ts
npm run compose:policy
docker compose --env-file test/fixtures/snapshot/local.env -f docker-compose.snapshot-local.yml config --quiet
```

Expected: all commands exit 0; no secret values are printed.

- [ ] **Step 5: Commit only Task 4**

```bash
git add docker-compose.snapshot-local.yml test/unit/snapshot/local-compose.test.ts test/fixtures/snapshot/local.env
git commit -m "feat(snapshot): add isolated local restore stack"
```

---

### Task 5: Local Importer and Candidate Handoff

**Files:**
- Create: `scripts/snapshot/import-local.sh`
- Create: `test/unit/snapshot/import-local.test.ts`

**Interfaces:**
- Consumes: encrypted artifact, matching manifest, age identity file, owner-only local env file, snapshot id, and `docker-compose.snapshot-local.yml`.
- Produces: a running candidate project and a mode-0600 handoff file containing only snapshot id, local project name, loopback ports, manifest hash, and previous project name.

- [ ] **Step 1: Write failing importer safety tests**

Use fake `docker`, `age`, and manifest verifier commands. Test rejection before
`docker compose up` for non-loopback ports/hosts, database `casn`, project name
`casn`, matching production server UUID hash, a symlinked artifact, wrong file
permissions, checksum failure, existing target volumes, and missing age identity.
Prove import failure never invokes `docker volume rm`, `docker compose down -v`,
`DROP DATABASE`, or commands containing SSH/production hostnames.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --runInBand test/unit/snapshot/import-local.test.ts`

Expected: FAIL because the importer does not exist.

- [ ] **Step 3: Implement validate and prepare stages**

Require `--artifact`, `--manifest`, `--identity`, `--env-file`, and `--snapshot-id`.
Derive the project name internally; do not accept a caller-provided project:

```bash
project="casn_snapshot_${snapshot_id//[^a-zA-Z0-9]/}"
database_name=casn_local
```

Validate permissions, regular-file identity, manifest, digest-pinned images,
loopback port bindings, empty target volumes, project labels, and production
server UUID mismatch. Decrypt into an owner-only `mktemp -d` outside the repo,
verify payload hashes again, and remove plaintext staging on every exit.

- [ ] **Step 4: Implement restore without migrations or seeds**

Create the candidate stack, wait for MySQL health, and restore `database.sql`
explicitly into `casn_local` using the pinned client image/network and a
mode-0600 local credential env file. Restore media with helper containers
mounting only the new snapshot volumes. Start Directus/app/Nginx after database
and media restore. Do not call `migration:run`, `db:seed`, or Directus bootstrap.

Write the candidate handoff using exclusive creation and mode `0600`; do not
edit `.env.local` or stop the current local stack in this task.

- [ ] **Step 5: Run tests and static checks**

Run:

```bash
npm test -- --runInBand test/unit/snapshot/import-local.test.ts
shellcheck scripts/snapshot/import-local.sh
npm run type-check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit only Task 5**

```bash
git add scripts/snapshot/import-local.sh test/unit/snapshot/import-local.test.ts
git commit -m "feat(snapshot): restore snapshots into new local volumes"
```

---

### Task 6: Candidate Parity Verifier

**Files:**
- Create: `scripts/snapshot/verify-parity.mjs`
- Create: `test/unit/snapshot/verify-parity.test.ts`

**Interfaces:**
- Consumes: candidate handoff file, verified manifest, local HTTP base URL, and database queries executed through the candidate MySQL container.
- Produces: mode-600 JSON report with counts/hashes/status only and exit 0 only when every required gate matches.

- [ ] **Step 1: Write failing parity tests with literal production evidence**

Provide fake command responses for 32 authors, 39 analyses, 80 sitemap URLs,
database object inventory, server UUID, volume file lists, health, and loopback
bindings. Add one failing test per mismatch. Include a sentinel Directus token
in a fake row and assert it never appears in the report, stdout, or stderr.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand test/unit/snapshot/verify-parity.test.ts`

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement structural and public parity checks**

Parse only strict JSON inputs. Check:

- candidate database is `casn_local` and candidate server UUID hash differs from production;
- table/view/trigger/routine/event counts equal the manifest;
- complete dump and media archive/file inventory hashes equal the manifest;
- candidate API author/analysis counts and normalized payload hashes equal captured production evidence;
- sitemap URL count and normalized path hash match;
- representative homepage, authors, analyses, collections, detail, health, `/cms/server/ping`, `/cms/assets/...`, and `/cms/uploads/...` requests succeed;
- every published port reports `HostIp=127.0.0.1` and the Docker network reports `Internal=true`;
- no candidate container receives `RUN_DB_MIGRATIONS`, production URLs, or production integration secrets.

Use timeouts for every HTTP request and Docker command. Emit only boolean gates,
counts, SHA-256 hashes, snapshot id, and candidate project name.

- [ ] **Step 4: Run focused tests and lint**

Run:

```bash
npm test -- --runInBand test/unit/snapshot/verify-parity.test.ts
npx eslint scripts/snapshot/verify-parity.mjs test/unit/snapshot/verify-parity.test.ts
npm run type-check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit only Task 6**

```bash
git add scripts/snapshot/verify-parity.mjs test/unit/snapshot/verify-parity.test.ts
git commit -m "feat(snapshot): verify restored production parity"
```

---

### Task 7: Disposable Round-Trip Smoke and Repository Gates

**Files:**
- Create: `scripts/ci/snapshot-roundtrip.sh`
- Create: `test/integration/snapshot/roundtrip.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: synthetic SQL and media fixtures created inside an invocation-scoped temporary directory.
- Produces: `npm run snapshot:smoke`; no production network access or credentials.

- [ ] **Step 1: Write the failing integration contract**

The Jest wrapper runs `scripts/ci/snapshot-roundtrip.sh` with a unique nonce and
asserts exit 0, `snapshot roundtrip verified`, and absence of sentinel secrets.
It also sets `SSH_AUTH_SOCK` empty and a fake `ssh`/`scp` first in `PATH` that
fails if invoked.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npm test -- --runInBand test/integration/snapshot/roundtrip.test.ts`

Expected: FAIL because the smoke script does not exist.

- [ ] **Step 3: Implement an invocation-scoped local round trip**

Create a unique Docker network, source MySQL container, destination MySQL
container, three source fixture rows, Directus/legacy media fixture volumes,
and an ephemeral age key. Exercise the real dump options, manifest builder,
encryption, decryption, restore, and parity verifier. Trap cleanup by exact
invocation-scoped names. Assert destination database is `casn_local`, row and
object hashes match, media hashes match, and no SSH command was called.

- [ ] **Step 4: Add safe package scripts and ignore rules**

Add only local commands:

```json
"snapshot:test": "jest --runInBand test/unit/snapshot test/integration/snapshot",
"snapshot:smoke": "bash scripts/ci/snapshot-roundtrip.sh"
```

Do not add an npm script for production export. Add these ignore rules:

```gitignore
/.casn-snapshots/
*.casn-snapshot.age
*.snapshot.manifest.json
*.agekey
```

- [ ] **Step 5: Run the complete local verification set**

Run:

```bash
npm run snapshot:test
npm run snapshot:smoke
shellcheck scripts/snapshot/*.sh scripts/ci/snapshot-roundtrip.sh
npm run type-check
npm run lint
npm run test:ci
npm run compose:policy
npm run deploy:policy
git diff --check
```

Expected: zero test failures and zero lint errors. Existing unrelated warnings
must be reported exactly and may not be described as a clean lint run.

- [ ] **Step 6: Commit only Task 7**

```bash
git add scripts/ci/snapshot-roundtrip.sh test/integration/snapshot/roundtrip.test.ts package.json .gitignore
git commit -m "test(snapshot): prove encrypted local round trip"
```

---

### Task 8: Operator Runbook and Production Installation Package

**Files:**
- Create: `docs/production-local-snapshot.md`
- Create: `scripts/snapshot/install-production-exporter.sh`
- Create: `test/unit/snapshot/install-production-exporter.test.ts`

**Interfaces:**
- Consumes: reviewed exporter commit SHA, working production SSH access, exact inventory discovered read-only, a local age public recipient, and separately approved root access.
- Produces: a root-owned exporter and root-only env file on production; installation does not create a snapshot or pause Directus.

- [ ] **Step 1: Write failing installer tests**

Use a fake remote root containing `/usr/local/libexec` and `/etc/casn-snapshot`.
Assert install uses exclusive creation, root ownership, modes `0750` for the
entrypoint and `0600` for config, verifies local and installed SHA-256 values,
and refuses replacement without `--replace-reviewed-sha <current-sha>`.
Assert the installer never runs the exporter, stops Directus, or invokes MySQL.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand test/unit/snapshot/install-production-exporter.test.ts`

Expected: FAIL because the installer does not exist.

- [ ] **Step 3: Implement the installation package**

Package `common.sh`, `manifest.sh`, and `export-production.sh` with a SHA-256
manifest. Require an absolute, explicitly named SSH target and a remote
installation root; refuse raw IPs and wildcard SSH options. Copy to a new
staging directory, verify hashes remotely, then install root-owned files.
Do not copy a populated env file from the repository. Print the exact list of
required root-only keys and stop.

- [ ] **Step 4: Write the runbook with five explicit approval gates**

Document exact commands for:

1. read-only inventory and recording expected label/name/server hashes;
2. DBA creation and verification of the dedicated export account privileges;
3. installation of the exporter without running it;
4. approved Directus pause and encrypted snapshot creation;
5. local candidate import, parity report review, local `.env.local` cutover,
   development-server restart, and later separately approved cleanup.

The privilege verification query must fail if any forbidden privilege is
present. The runbook must state that `SHOW GRANTS` output is sensitive evidence
and must not be pasted into Git or chat. Include recovery commands that start
and health-check Directus without deleting any artifact or volume.

- [ ] **Step 5: Run documentation and installer checks**

Run:

```bash
npm test -- --runInBand test/unit/snapshot/install-production-exporter.test.ts
shellcheck scripts/snapshot/install-production-exporter.sh
rg -n 'T[B]D|T[O]DO|F[I]XME|example\.com|changeme|password123' docs/production-local-snapshot.md scripts/snapshot || true
git diff --check
```

Expected: tests and checks pass; the placeholder scan has no output.

- [ ] **Step 6: Commit only Task 8**

```bash
git add docs/production-local-snapshot.md scripts/snapshot/install-production-exporter.sh test/unit/snapshot/install-production-exporter.test.ts
git commit -m "docs(snapshot): add gated production export runbook"
```

---

### Task 9: Production Snapshot Execution Gate

**Files:**
- Evidence only outside the repository in an approved owner-only directory.
- No repository modification is expected.

**Interfaces:**
- Consumes: working named SSH access, explicit user approval for the one-time read-only account/install, then a second approval for the Directus pause and snapshot.
- Produces: one encrypted artifact and manifest; production Directus healthy again; no local restore yet.

- [ ] **Step 1: Re-establish read-only production inventory**

Run only the runbook inventory command through the named SSH alias. Record
container IDs, Compose project/service labels, volume labels, database-name
hash, server-UUID hash, image digests, and Directus health in the external
evidence directory. Do not print secrets or raw database values.

- [ ] **Step 2: Stop for explicit approval of production installation**

Present the discovered exact targets, requested read-only grants, installed
file hashes, recovery command, and rollback boundary. Do not create the account
or install files until the user confirms this exact evidence.

- [ ] **Step 3: Install and independently verify without snapshotting**

Create the read-only account, verify its grants contain no forbidden privilege,
install the exporter, and run exporter `--preflight-only`. Confirm Directus was
not stopped and database/media hashes were not emitted as row content.

- [ ] **Step 4: Stop for explicit approval of the snapshot window**

Show preflight success, public health, current Directus health, expected pause,
output destination, and recovery command. Wait for confirmation.

- [ ] **Step 5: Execute snapshot and verify production recovery**

Run the root-owned exporter once. Verify the artifact and manifest modes and
hashes, Directus container running/healthy, public homepage/API/health status,
and the manifest counts captured in the same snapshot window. Do not delete the
server-side encrypted artifact yet.

---

### Task 10: Local Restore, Browser Acceptance, and Cutover Gate

**Files:**
- Modify only after approval: `.env.local` with local loopback database values.
- Evidence only outside the repository: candidate handoff and parity report.

**Interfaces:**
- Consumes: verified encrypted artifact/manifest and local age identity.
- Produces: verified candidate local stack, then the local application using it; previous local stack retained.

- [ ] **Step 1: Download and verify the encrypted artifact**

Download through the restricted exporter channel, compare the local artifact
and manifest SHA-256 with production evidence, require mode `0600`, and retain
the server-side copy. Do not decrypt before hashes match.

- [ ] **Step 2: Import into a new candidate and run parity verification**

Run `import-local.sh`, then `verify-parity.mjs`. Require the report to match the
snapshot manifest for database objects, full payload hashes, media inventories,
public API payload hashes, sitemap paths, routes, health, loopback bindings, and
internal network. A mismatch blocks cutover.

- [ ] **Step 3: Show the candidate in the Codex browser**

Open the candidate loopback Nginx URL and inspect desktop/mobile homepage,
authors, analyses, collections, representative detail pages, Directus login,
new assets, and historical uploads. Browser acceptance is additional evidence,
not a substitute for manifest parity.

- [ ] **Step 4: Stop for explicit local cutover approval**

Present snapshot id, capture time, production and candidate counts/hashes,
route/media results, candidate ports, current local project, and rollback
command. Wait for confirmation before editing `.env.local` or restarting the
development server.

- [ ] **Step 5: Cut over local development and re-verify**

Update only loopback `DATABASE_URL`/DB fields in `.env.local`, restart the
development server on its existing approved port, and repeat API/sitemap/media
checks through that server. Confirm no configuration contains production DB or
SSH endpoints. Keep the previous local project stopped but intact.

- [ ] **Step 6: Report the evidence boundary and leave cleanup gated**

Report that local data matches the captured production snapshot, not an
ever-changing live database. List retained server artifact, local encrypted
artifact, candidate project, and previous project. Do not remove any of them
until the user separately approves exact cleanup targets.
