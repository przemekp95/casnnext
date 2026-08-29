# CASN Remaining Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining unsafe public write and make revalidation, database operation, and immutable deployment failure paths fail closed.

**Architecture:** Keep the existing Next.js/TypeORM/Directus boundaries and extract only bounded body reading, startup database readiness, and remote deployment orchestration. Database migration becomes an explicit operator command; deployment rollback restores only the previous exact source and image configuration.

**Tech Stack:** Next.js 16, TypeScript, Node.js 22, Jest 30, TypeORM 0.3, MySQL 8, Bash, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-26-casn-remaining-hardening-design.md`

## Global Constraints

- Base all work on `3205a2acb9a9244070730c0005be33002f780c95` in `codex/casn-hardening-20260826`.
- Never modify or normalize another worktree and never use stash.
- Do not introduce Strapi, `CMS_SYNC_SECRET`, or `ARTICLES_ADMIN_TOKEN` behavior.
- Do not push, open a PR, merge, publish, deploy, or access production.
- Write and observe a correctly failing behavior test before each production change.
- Keep commits small and independently reviewable.

---

### Task 1: Disable client-log persistence

**Files:**
- Modify: `test/unit/api/client-log.route.test.ts`
- Modify: `test/integration/api/client-log.test.ts`
- Modify: `app/api/client-log/route.ts`

**Interfaces:**
- Consumes: `POST(request: Request): Promise<Response>` route contract.
- Produces: `204` no-store response without request parsing or filesystem calls.

- [ ] **Step 1: Replace disk-write expectations with failing no-persistence tests**

Use an attacker-controlled multiline message and a large stack, spy on the
request JSON method, and retain the mocked `fs.mkdir` and `fs.appendFile` calls.
Assert literal status `204`, literal header `no-store`, no body parsing, and no
filesystem calls in both route test layers.

- [ ] **Step 2: Run the two client-log test files and verify RED**

Run:

```bash
npx jest --runInBand --runTestsByPath test/unit/api/client-log.route.test.ts test/integration/api/client-log.test.ts
```

Expected: failures show status `200` instead of `204` and filesystem calls.

- [ ] **Step 3: Implement the compatibility sink**

Replace the route body with:

```ts
export async function POST() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 4: Run focused and full tests and verify GREEN**

```bash
npx jest --runInBand --runTestsByPath test/unit/api/client-log.route.test.ts test/integration/api/client-log.test.ts
npm run test:ci
```

- [ ] **Step 5: Commit the route and tests**

```bash
git add app/api/client-log/route.ts test/unit/api/client-log.route.test.ts test/integration/api/client-log.test.ts
git commit -m "fix(security): disable client log persistence"
```

### Task 2: Bound and validate revalidation requests

**Files:**
- Create: `lib/server/request-body.ts`
- Create: `test/unit/lib/request-body.test.ts`
- Modify: `app/api/revalidate/route.ts`
- Modify: `test/unit/api/revalidate.route.test.ts`

**Interfaces:**
- Produces: `PayloadTooLargeError` and `readJsonBodyWithinLimit(request, maximumBytes): Promise<unknown>`.
- Produces: authenticated route responses `400`, `401`, `413`, or the existing success payload.

- [ ] **Step 1: Add failing bounded-reader and route tests**

Cover a declared `Content-Length` above `65_536`, a streamed body above
`65_536`, invalid JSON, an invalid payload with too many tags, authentication
before body consumption, and the actual Directus body containing `model`,
`event`, `key`, and `keys`. Assert no cache revalidation for every rejection.

- [ ] **Step 2: Run the new request-body and route tests and verify RED**

```bash
npx jest --runInBand --runTestsByPath test/unit/lib/request-body.test.ts test/unit/api/revalidate.route.test.ts
```

Expected: missing module/export and existing oversized/malformed requests do not
return the required literal statuses.

- [ ] **Step 3: Implement the bounded stream reader**

Count `Uint8Array.byteLength` before decoding, cancel the reader after overflow,
flush `TextDecoder`, and parse the accumulated string with `JSON.parse`. Reject
an integer declared length greater than the limit before reading the stream.

- [ ] **Step 4: Authenticate before reading and validate with Zod**

Use a 64 KiB constant and a `z.object(...).passthrough()` schema with at most 20
tags, tag strings at most 64 characters, and model/event strings at most 128
characters. Return `413` for `PayloadTooLargeError` and `400` for JSON/schema
errors. Preserve current secret precedence and successful inference.

- [ ] **Step 5: Run focused, Directus, and full tests and verify GREEN**

```bash
npx jest --runInBand --runTestsByPath test/unit/lib/request-body.test.ts test/unit/api/revalidate.route.test.ts test/unit/directus/bootstrap.test.ts
npm run test:ci
```

- [ ] **Step 6: Commit the webhook hardening**

```bash
git add app/api/revalidate/route.ts lib/server/request-body.ts test/unit/api/revalidate.route.test.ts test/unit/lib/request-body.test.ts
git commit -m "fix(security): bound revalidation webhook bodies"
```

### Task 3: Make database startup and migrations fail closed

**Files:**
- Create: `lib/server/startup-database.js`
- Create: `test/unit/lib/startup-database.test.ts`
- Modify: `server.js`
- Modify: `lib/server/migration-policy.ts`
- Modify: `lib/server/migration-policy.js`
- Modify: `scripts/run-migrations.ts`
- Modify: `package.json`
- Modify: `lib/db.shared.ts`
- Modify: `lib/db.shared.js`
- Modify: `lib/db.node.js`
- Modify: `lib/db.rsc.ts`
- Modify: datasource and migration policy tests under `test/unit/lib/`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/docker.yml`
- Modify: `scripts/ci/directus-smoke.sh`
- Delete: `docker-entrypoint.sh`
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `docs/deployment-reconciliation.md`

**Interfaces:**
- Produces: `requireDatabaseReady({ dataSource, isConfigured }): Promise<void>`.
- Produces: `assessMigrationSafety({ runFlag, confirmation, hasContentTables, initialMigrationRecorded })`.
- Produces: explicit `npm run migration:run` requiring the two exact approval variables.

- [ ] **Step 1: Add failing startup dependency tests**

Test literal rejection for missing configuration/null datasource, initialization
failure, and `SELECT 1` failure. Test success for an already initialized source
and for a source initialized once before probing.

- [ ] **Step 2: Run startup tests and verify RED**

```bash
npx jest --runInBand --runTestsByPath test/unit/lib/startup-database.test.ts
```

Expected: missing module/export.

- [ ] **Step 3: Implement startup readiness and wire `server.js`**

The helper throws instead of logging-and-returning. `server.js` awaits it before
`app.prepare()`; the existing outer catch logs and exits non-zero.

- [ ] **Step 4: Add failing migration safety tests**

Cover disabled/malformed gates, empty schema allowed with both gates, existing
content plus missing initial history rejected, and existing content plus the
exact initial record allowed. Update datasource tests to require
`migrationsRun: false` for every environment combination.

- [ ] **Step 5: Run migration tests and verify RED**

```bash
npx jest --runInBand --runTestsByPath test/unit/lib/server-migration-policy.test.ts test/unit/lib/db.node.test.ts test/unit/lib/db.rsc.test.ts test/unit/lib/db.server.test.ts
```

Expected: the schema-history assessment is missing and current datasources still
enable implicit migrations when both variables are present.

- [ ] **Step 6: Implement the explicit migration runner and remove implicit paths**

Set every application datasource to `migrationsRun: false`. Make
`scripts/run-migrations.ts` validate MySQL configuration, initialize without
migrations, query `INFORMATION_SCHEMA`, call `assessMigrationSafety`, then call
`runMigrations({ transaction: "all" })`; always destroy an initialized source
and set a non-zero result on refusal or failure. Point `migration:run` at this
script and remove the unused continue-on-error Docker entrypoint.

- [ ] **Step 7: Update every caller and operational document**

Provide both exact migration variables in disposable CI/Directus smoke callers.
Document that application startup never migrates and that the explicit runner
is fail closed but cannot make MySQL DDL rollback atomically.

- [ ] **Step 8: Run focused, full, build, and Directus checks**

```bash
npx jest --runInBand --runTestsByPath test/unit/lib/startup-database.test.ts test/unit/lib/server-migration-policy.test.ts test/unit/lib/db.node.test.ts test/unit/lib/db.rsc.test.ts test/unit/lib/db.server.test.ts test/unit/directus/smoke-script.test.ts
npm run type-check
npm run lint
npm run test:ci
npm run build
npm run directus:smoke
```

- [ ] **Step 9: Commit startup and migration hardening**

```bash
git add -A
git commit -m "fix(database): fail closed on startup and migrations"
```

### Task 4: Roll back failed immutable deployments

**Files:**
- Create: `scripts/deploy/remote-deploy.sh`
- Create: `scripts/ci/remote-deploy-rollback-test.sh`
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/ci/deployment-artifact-policy.sh`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: existing exact digest inputs and `scripts/deploy/write-artifact-env.sh`.
- Produces: remote candidate deployment with automatic exact-artifact rollback and health verification.

- [ ] **Step 1: Add an executable failing rollback fixture**

Run the future remote script in a `mktemp` deployment directory with a fake Git
state and fake Docker/curl executables. Make candidate public health fail and
previous health succeed. Assert a non-zero candidate result, byte-identical
restored `.env`, restored previous revision, and candidate-then-previous Compose
operations. Add a missing-public-health case that proves no checkout or Compose
mutation occurs.

- [ ] **Step 2: Run the rollback fixture and verify RED**

```bash
bash scripts/ci/remote-deploy-rollback-test.sh
```

Expected: missing `scripts/deploy/remote-deploy.sh` or missing rollback behavior.

- [ ] **Step 3: Implement remote deployment orchestration**

Use `set -euo pipefail`, mode-600 temporary environment backup, a clean tracked
checkout requirement, exact previous revision/environment validation, and an
EXIT/HUP/INT/TERM trap activated only after candidate mutation begins. Restore
the old environment atomically before checking out the old revision. Verify
Compose, internal app readiness, and public health for candidate and rollback.

- [ ] **Step 4: Wire the workflow without losing first-deployment compatibility**

The SSH step fetches the candidate revision, extracts the candidate
`remote-deploy.sh` with `git show` into a secure temporary file, and executes it.
Pass `DEPLOY_PATH` and `HEALTH_CHECK_URL` through the action environment without
printing their values. Keep immutable image-label validation unchanged.

- [ ] **Step 5: Run rollback, deployment-policy, action, and full tests**

```bash
bash scripts/ci/remote-deploy-rollback-test.sh
npm run deploy:policy
npm run test:ci
```

- [ ] **Step 6: Commit deployment rollback**

```bash
git add .github/workflows/deploy.yml scripts/deploy/remote-deploy.sh scripts/ci/remote-deploy-rollback-test.sh scripts/ci/deployment-artifact-policy.sh test/unit/deployment/security-config.test.ts docs/deployment.md
git commit -m "feat(deploy): roll back unhealthy immutable releases"
```

### Task 5: Complete repository verification

**Files:**
- Modify only if a verified failure requires a test-first correction.

**Interfaces:**
- Produces: fresh local evidence and an exact statement of unverified external boundaries.

- [ ] **Step 1: Run all source and policy gates**

```bash
npm ci
npm run type-check
npm run lint
npm run test:ci
npm run check:posts
npm run check:cms-mdx-media
npm run audit:policy
npm run build
npm run directus:smoke
npm run compose:policy
npm run deploy:policy
```

- [ ] **Step 2: Run isolated integration and E2E gates**

Use the repository's MySQL test-service contract, run the explicit migration
runner with both confirmation variables, start `node server.js`, then execute
`npm run test:integration:live` and `npm run test:e2e`. Stop the local process
and disposable database afterward.

- [ ] **Step 3: Verify repository and authorization boundaries**

```bash
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Confirm no push, PR, merge, publication, deployment, or production access was
performed and report anything unavailable separately from passing evidence.
