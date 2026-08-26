# CASN TypeScript Runtime Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript the only checked-in source of truth for the custom CASN Node runtime and emit CommonJS artifacts only into ignored `dist/runtime/`.

**Architecture:** A typed `server.ts` imports the canonical datasource and typed startup policy. `tsconfig.runtime.json` compiles that graph into `dist/runtime/`; a minimal `server.cjs` dynamically loads the compiled entry without `require()`. Policy fixtures, launcher tests, disposable MySQL, and the final Docker image prove that source directories never double as artifact directories.

**Tech Stack:** Node.js 22, TypeScript 5.6, Next.js 16.3.3, TypeORM 0.3.31, Jest 30, Bash, Docker, MySQL 8

**Spec:** `docs/superpowers/specs/2026-08-26-casn-typescript-runtime-boundary-design.md`

## Global Constraints

- Authorization boundary: local source changes and disposable verification only.
- Keep work local to `codex/casn-hardening-20260826`; do not push, merge, create a pull request, deploy, or access production.
- Runtime sources of truth are TypeScript: `server.ts`, `lib/db.shared.ts`, `lib/server/startup-database.ts`, `lib/server/migration-policy.ts`, entities, and migrations.
- Emit JavaScript only beneath ignored `dist/runtime/`; never emit into `lib/`, `migrations/`, or the repository root.
- Preserve fail-closed database startup and migration-free application startup.
- Preserve the exact migration gate `RUN_DB_MIGRATIONS=1` plus `DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS`.
- Deployment and rollback must not mutate the application database or Directus metadata.
- Add no inline ESLint suppression, broad CommonJS source exception, skipped test, or weaker assertion.
- Live checks use disposable local resources and prove cleanup.

---

### Task 0: Refresh the feature branch from current `origin/main`

**Files:**
- No planned source edits; Git may surface conflicts only in files changed by both histories.

**Interfaces:**
- Consumes: freshly fetched `origin/main` and clean local branch `codex/casn-hardening-20260826`.
- Produces: a history-preserving local merge of the current production source baseline into this isolated branch.

- [ ] **Step 1: Obtain the separate merge authorization**

The original authorization explicitly prohibits merge without separate consent.
Do not execute the remaining plan until the user approves merging refreshed
`origin/main` into this local feature branch. Do not merge the historical
`codex/header-contrast` or `codex/production-local-snapshot-v2` branch refs
directly; their accepted PR results are now part of `origin/main`.

- [ ] **Step 2: Reconfirm exact targets and clean state**

```bash
git fetch origin main
git status --porcelain -uall
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
```

Expected before merge: clean worktree. At plan-writing time `origin/main` is
`67cf62b86f2236aa5474224297ebe6c2028a597a`, and the shared base is
`3205a2acb9a9244070730c0005be33002f780c95`; refresh rather than assuming those
values remain current.

- [ ] **Step 3: Merge only refreshed `origin/main`**

```bash
git merge --no-edit origin/main
```

If Git reports a conflict, stop and inspect exact hunks. Preserve the additive
snapshot scripts/package entries, the accepted header contrast, and the local
hardening policies; do not resolve by taking an entire side wholesale.

- [ ] **Step 4: Verify the refreshed baseline**

```bash
npm ci
npm run quality:policy
npm run type-check
npm run lint
npm run test:ci
git diff --check
git status --short --branch
```

Expected: all gates pass and the branch is no longer behind `origin/main`.

### Task 1: Define an executable runtime-source policy

**Files:**
- Create: `scripts/ci/runtime-source-policy.sh`
- Create: `scripts/ci/runtime-source-policy-test.sh`
- Modify: `scripts/ci/quality-debt-policy.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: `runtime-source-policy.sh [root] [sources|build|launcher|image|all]`.
- Produces: non-zero exit plus `[runtime-policy]` diagnostics for boundary violations.

- [ ] **Step 1: Write the failing fixture test**

Create `runtime-source-policy-test.sh`. It creates a `mktemp -d` Git fixture containing minimal valid `package.json`, `tsconfig.runtime.json`, `.gitignore`, `server.ts`, `server.cjs`, and `Dockerfile`, plus dummy `dist/runtime/server.js`, `dist/runtime/lib/db.shared.js`, and `dist/runtime/lib/server/startup-database.js` artifacts. It then mutates one condition at a time and calls the real policy through an absolute path. Use:

```bash
expect_rejected() {
  local expected_message="$1"
  local check="$2"
  if "$policy" "$fixture" "$check" >"$test_root/out" 2>"$test_root/err"; then
    echo "Policy unexpectedly accepted: $expected_message" >&2
    exit 1
  fi
  grep -F "$expected_message" "$test_root/err" >/dev/null
}
```

Cover these independent mutations:

```text
build:runtime uses --outDir .
tracked lib/db.shared.js
tracked lib/server/migration-policy.js
tracked lib/server/startup-database.js
tracked lib/db.node.js
tracked lib/init-db.js
server.cjs contains require(
server.cjs omits ./dist/runtime/server.js
Dockerfile copies /app/lib or /app/migrations
Dockerfile omits /app/dist/runtime
```

- [ ] **Step 2: Verify RED**

Run `bash scripts/ci/runtime-source-policy-test.sh`.

Expected: non-zero because `scripts/ci/runtime-source-policy.sh` is missing.

- [ ] **Step 3: Implement the policy**

Create executable `runtime-source-policy.sh` beginning with:

```bash
#!/usr/bin/env bash
set -euo pipefail
readonly ROOT="${1:-.}"
readonly CHECK="${2:-all}"
fail() { echo "[runtime-policy] $1" >&2; exit 1; }
tracked() { git -C "$ROOT" ls-files --error-unmatch "$1" >/dev/null 2>&1; }
```

For `sources`, require tracked `server.ts`, `lib/db.shared.ts`,
`lib/server/startup-database.ts`, and `lib/server/migration-policy.ts`; reject
the five JS paths above. For `build`, parse JSON with Node and require:

```json
"build": "npm run build:runtime && next build",
"build:runtime": "tsc -p tsconfig.runtime.json",
"start": "node server.cjs"
```

Also require `rootDir: "."`, `outDir: "dist/runtime"`, `allowJs: false`,
`/dist/runtime/` in `.gitignore`, all three expected compiled fixture files, and
the absence of generated JS beside source. For `launcher`, reject `require(` and require
`./dist/runtime/server.js`. For `image`, reject `/app/lib` and
`/app/migrations` copies and require `/app/server.cjs` plus
`/app/dist/runtime`. `all` runs all four checks.

- [ ] **Step 4: Verify fixture GREEN**

Run:

```bash
chmod 700 scripts/ci/runtime-source-policy.sh scripts/ci/runtime-source-policy-test.sh
bash scripts/ci/runtime-source-policy-test.sh
```

Expected: `Runtime source policy behavior passed.`

- [ ] **Step 5: Wire only the fixture contract**

Add scripts:

```json
"runtime:policy": "bash scripts/ci/runtime-source-policy.sh . all",
"runtime:policy:test": "bash scripts/ci/runtime-source-policy-test.sh"
```

Call `npm run runtime:policy:test` from `quality-debt-policy.sh`. Do not call the
repository-level `runtime:policy` until Task 6 makes every mode green.

- [ ] **Step 6: Commit**

```bash
git add scripts/ci/runtime-source-policy.sh scripts/ci/runtime-source-policy-test.sh scripts/ci/quality-debt-policy.sh package.json
git commit -m "test(runtime): define isolated artifact policy"
```

### Task 2: Create the typed runtime graph and isolated output

**Files:**
- Create: `server.ts`
- Create: `lib/server/startup-database.ts`
- Create: `tsconfig.runtime.json`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `test/unit/lib/startup-database.test.ts`
- Delete: `lib/db.shared.js`
- Delete: `lib/server/migration-policy.js`
- Delete: `lib/server/startup-database.js`

**Interfaces:**
- Consumes: `AppDataSource: DataSource | null` and `isDatabaseConfigured(): boolean` from `lib/db.shared.ts`.
- Produces: `requireDatabaseReady(input: StartupDatabaseInput): Promise<void>` and `dist/runtime/server.js` with its dependency graph.

- [ ] **Step 1: Capture behavior and architectural RED**

```bash
npx jest --runInBand --runTestsByPath test/unit/lib/startup-database.test.ts test/unit/lib/db.server.test.ts test/unit/lib/server-migration-policy.test.ts
bash scripts/ci/runtime-source-policy.sh . sources
bash scripts/ci/runtime-source-policy.sh . build
```

Expected: Jest green; both policy checks red because typed startup/build files
are absent and tracked JS copies remain.

- [ ] **Step 2: Port startup readiness to TypeScript**

Create:

```ts
export type StartupDataSource = {
  isInitialized: boolean;
  initialize(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
};

export type StartupDatabaseInput = {
  dataSource: StartupDataSource | null;
  isConfigured(): boolean;
};

export async function requireDatabaseReady({
  dataSource,
  isConfigured,
}: StartupDatabaseInput): Promise<void> {
  if (!isConfigured() || !dataSource) {
    throw new Error("Database configuration is required at application startup");
  }
  if (!dataSource.isInitialized) await dataSource.initialize();
  await dataSource.query("SELECT 1");
}
```

Use a static import of the function and type in
`startup-database.test.ts`. Preserve all five behavior cases.

- [ ] **Step 3: Add `server.ts`**

Use ESM imports from `node:http`, `next`, `@next/env`, `./lib/db.shared`, and
`./lib/server/startup-database`. Preserve environment loading and bootstrap log
messages. `startServer()` awaits readiness, `app.prepare()`, and listening in
that order. Listen through:

```ts
async function listen(): Promise<void> {
  const server = createServer((request, response) => handle(request, response));
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, hostname, () => {
      server.off("error", onError);
      console.log(`> Ready on http://${hostname}:${port}`);
      resolve();
    });
  });
}
```

The terminal catch logs `Failed to start server:` and sets
`process.exitCode = 1`.

- [ ] **Step 4: Add `tsconfig.runtime.json` and scripts**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "rootDir": ".",
    "outDir": "dist/runtime",
    "allowJs": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "files": ["server.ts"]
}
```

Set `build` to `npm run build:runtime && next build` and `build:runtime` to
`tsc -p tsconfig.runtime.json`; remove `build:lib`. Add `/dist/runtime/` to
`.gitignore` before the first build so the isolated artifact cannot become an
untracked candidate for a later commit.

- [ ] **Step 5: Delete replaced outputs safely**

Delete the three tracked JS files with `apply_patch`. Remove earlier untracked
outputs only by these exact paths:

```bash
unlink lib/db.server.js 2>/dev/null || true
unlink lib/entities/Analysis.js 2>/dev/null || true
unlink lib/entities/Author.js 2>/dev/null || true
unlink lib/entities/IssueCollection.js 2>/dev/null || true
unlink migrations/1736424470000-InitialSetup.js 2>/dev/null || true
unlink migrations/1736424470002-AddCmsReadModel.js 2>/dev/null || true
```

- [ ] **Step 6: Verify GREEN**

```bash
npm run build:runtime
test -f dist/runtime/server.js
test -f dist/runtime/lib/db.shared.js
test -f dist/runtime/lib/server/startup-database.js
test -f dist/runtime/migrations/1736424470000-InitialSetup.js
test ! -e lib/db.server.js
test ! -e lib/entities/Author.js
test ! -e migrations/1736424470000-InitialSetup.js
npx jest --runInBand --runTestsByPath test/unit/lib/startup-database.test.ts test/unit/lib/db.server.test.ts test/unit/lib/server-migration-policy.test.ts
npm run type-check
```

- [ ] **Step 7: Commit**

```bash
git add server.ts lib/server/startup-database.ts tsconfig.runtime.json .gitignore package.json test/unit/lib/startup-database.test.ts lib/db.shared.js lib/server/migration-policy.js lib/server/startup-database.js
git commit -m "refactor(runtime): compile bootstrap from TypeScript"
```

### Task 3: Replace the server with a tested thin launcher

**Files:**
- Create: `scripts/ci/server-launcher-test.sh`
- Modify: `server.cjs`
- Modify: `scripts/ci/quality-debt-policy.sh`

**Interfaces:**
- Consumes: `./dist/runtime/server.js` relative to the launcher.
- Produces: stable `node server.cjs`, non-zero when the compiled entry is absent or throws.

- [ ] **Step 1: Write the failing launcher test**

Copy `server.cjs` to `mktemp -d`, then execute:

```bash
set +e
node "$test_root/server.cjs" >"$test_root/missing.out" 2>"$test_root/missing.err"
missing_status=$?
set -e
test "$missing_status" -ne 0
grep -F 'Failed to load compiled runtime:' "$test_root/missing.err" >/dev/null

mkdir -p "$test_root/dist/runtime"
printf '%s\n' \
  "const fs = require('node:fs');" \
  "fs.writeFileSync(process.env.LAUNCH_MARKER, 'loaded');" \
  >"$test_root/dist/runtime/server.js"
LAUNCH_MARKER="$test_root/marker" node "$test_root/server.cjs"
test "$(cat "$test_root/marker")" = loaded
```

The trap removes only `test_root`.

- [ ] **Step 2: Verify RED**

Run `bash scripts/ci/server-launcher-test.sh`.

Expected: current launcher lacks the compiled-runtime failure contract.

- [ ] **Step 3: Implement the minimal launcher**

```js
import("./dist/runtime/server.js").catch((error) => {
  console.error("Failed to load compiled runtime:", error);
  process.exitCode = 1;
});
```

It contains no `require()`, database logic, Next configuration, or suppression.

- [ ] **Step 4: Verify GREEN and fail-closed startup**

```bash
chmod 700 scripts/ci/server-launcher-test.sh
bash scripts/ci/server-launcher-test.sh
bash scripts/ci/runtime-source-policy.sh . launcher
npm run build:runtime
DATABASE_URL='mysql://invalid:invalid@127.0.0.1:1/casn' timeout 20 node server.cjs
```

The first three pass; the last exits non-zero before listening. Add the launcher
test to `quality-debt-policy.sh`.

- [ ] **Step 5: Commit**

```bash
git add server.cjs scripts/ci/server-launcher-test.sh scripts/ci/quality-debt-policy.sh
git commit -m "refactor(runtime): load compiled server through thin launcher"
```

### Task 4: Remove obsolete database bridges without losing coverage

**Files:**
- Delete: `lib/db.node.js`
- Delete: `lib/init-db.js`
- Delete: `test/unit/lib/db.node.test.ts`
- Modify: `jest.setup.ts`
- Modify: `test/unit/lib/db.server.test.ts`
- Modify: `docs/deployment-reconciliation.md`

**Interfaces:**
- Consumes: canonical TypeScript datasource, init, and migration policy modules.
- Produces: no active consumer of `db.node.js` or JavaScript `init-db.js`.

- [ ] **Step 1: Prove duplicate coverage**

```bash
npx jest --runInBand --runTestsByPath test/unit/lib/db.node.test.ts test/unit/lib/db.server.test.ts test/unit/lib/server-migration-policy.test.ts
```

Confirm the legacy suite's five `migrationsRun === false` combinations are
covered by `db.server` startup cases and `server-migration-policy` gate cases.

- [ ] **Step 2: Strengthen canonical coverage and watch it fail**

Table-drive the five environment combinations in `db.server.test.ts`; assert:

```ts
expect(config.migrationsRun).toBe(false);
expect(config.synchronize).toBe(false);
```

Temporarily mutate the datasource mock result to `migrationsRun: true`, run the
focused suite, observe the assertion fail, then immediately revert that
test-only mutation.

- [ ] **Step 3: Remove bridges and consumers**

Delete the two legacy JS files and their duplicate test. Remove
`./lib/db.node` from `jest.setup.ts` teardown while retaining
`./lib/db.shared`. Change the operator snippet in
`docs/deployment-reconciliation.md` to
`./dist/runtime/lib/db.shared` without changing its safety warning.

- [ ] **Step 4: Verify GREEN**

```bash
if rg -n 'db\.node|lib/init-db\.js' --glob '!docs/superpowers/**' --glob '!docs/quality-debt.md' .; then exit 1; fi
bash scripts/ci/runtime-source-policy.sh . sources
npx jest --runInBand --runTestsByPath test/unit/lib/db.server.test.ts test/unit/lib/server-migration-policy.test.ts test/unit/lib/server-init-db.test.ts
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add -A lib/db.node.js lib/init-db.js test/unit/lib/db.node.test.ts jest.setup.ts test/unit/lib/db.server.test.ts docs/deployment-reconciliation.md
git commit -m "refactor(database): remove legacy CommonJS bridges"
```

### Task 5: Remove runtime CommonJS and source-output lint exceptions

**Files:**
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`
- Modify: `scripts/ci/runtime-source-policy.sh`
- Modify: `scripts/ci/runtime-source-policy-test.sh`
- Modify: `scripts/ci/quality-debt-policy.sh`
- Modify: `docs/quality-debt.md`

**Interfaces:**
- Consumes: typed runtime and dynamic-import launcher.
- Produces: zero-warning lint without a runtime-specific CommonJS exception.

- [ ] **Step 1: Capture strict lint and policy RED**

```bash
npx eslint server.cjs server.ts lib/db.shared.ts lib/server/startup-database.ts lib/server/migration-policy.ts --no-inline-config --rule '@typescript-eslint/no-require-imports:error' --max-warnings 0
bash scripts/ci/runtime-source-policy.sh . build
```

Expected: source syntax is clean; policy remains red while old generated-output
declarations and broad runtime overrides remain.

- [ ] **Step 2: Make generated ownership exact**

Keep the `/dist/runtime/` ignore added with the compiler boundary. Remove the
obsolete source-directory output ignores:

```text
lib/db.server.js
lib/entities/*.js
lib/migrations/*.js
migrations/*.js
```

Keep ESLint's `dist/**` ignore. Remove ESLint ignores for the old generated
source paths.

- [ ] **Step 3: Remove runtime CommonJS exceptions**

Delete the final `files: ["lib/**/*.js", "**/*.cjs"]` override and remove
`"**/*.cjs"` from the scripts/config override. Extend the policy fixture to
reject both patterns. Do not change unrelated script/test exceptions in this
runtime-focused commit.

Call completed policy modes (`sources`, `build`, `launcher`) from
`quality-debt-policy.sh`; the image mode joins in Task 6.

- [ ] **Step 4: Verify GREEN**

```bash
npm run build:runtime
npm run lint
npm run runtime:policy:test
bash scripts/ci/runtime-source-policy.sh . sources
bash scripts/ci/runtime-source-policy.sh . build
bash scripts/ci/runtime-source-policy.sh . launcher
npm run quality:policy
git diff --check
```

- [ ] **Step 5: Record and commit resolved runtime debt**

Record the removed JS files and `dist/runtime` boundary in
`docs/quality-debt.md`. Keep QD-002, QD-003, and QD-004 open for the following
first-party suppression/skip plan.

```bash
git add .gitignore eslint.config.mjs scripts/ci/runtime-source-policy.sh scripts/ci/runtime-source-policy-test.sh scripts/ci/quality-debt-policy.sh docs/quality-debt.md
git commit -m "fix(quality): remove runtime CommonJS exceptions"
```

### Task 6: Package only isolated runtime artifacts

**Files:**
- Modify: `Dockerfile`
- Modify: `scripts/ci/runtime-source-policy.sh`
- Modify: `scripts/ci/runtime-source-policy-test.sh`
- Modify: `scripts/ci/quality-debt-policy.sh`
- Modify: `.github/workflows/docker.yml`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `.next/`, `public/`, production dependencies, `server.cjs`, `dist/runtime/`, and posts.
- Produces: production image with compiled runtime and no copied runtime TypeScript sources.

- [ ] **Step 1: Verify image RED**

Run `bash scripts/ci/runtime-source-policy.sh . image`.

Expected: Dockerfile still copies `/app/lib` and `/app/migrations` and omits
`/app/dist/runtime`.

- [ ] **Step 2: Change the image boundary**

Replace the `lib` and `migrations` copy blocks with:

```dockerfile
# Copy reproducible custom Node runtime; TypeScript source stays in builder.
COPY --from=builder --chown=nextjs:nodejs /app/dist/runtime ./dist/runtime
```

Keep `server.cjs`, `.next`, `public`, `node_modules`, posts, non-root user,
healthcheck, and `CMD ["node", "server.cjs"]`.

- [ ] **Step 3: Wire the full policy in active workflows**

After `npm run build` in both workflows add:

```yaml
- name: Verify isolated runtime artifact
  run: npm run runtime:policy
```

Make `quality-debt-policy.sh` run full `npm run runtime:policy`. Preserve all
deployment/database mutation prohibitions.

- [ ] **Step 4: Verify image GREEN**

```bash
npm run runtime:policy
npm run build
runtime_image="casn-runtime-boundary:${BASHPID}"
if docker image inspect "$runtime_image" >/dev/null 2>&1; then exit 1; fi
docker build --pull -t "$runtime_image" .
docker run --rm --entrypoint sh "$runtime_image" -c 'test -f /app/server.cjs && test -f /app/dist/runtime/server.js && test -f /app/dist/runtime/lib/db.shared.js && test ! -e /app/lib/db.shared.ts && test ! -e /app/migrations/1736424470000-InitialSetup.ts'
docker image rm "$runtime_image"
npm run compose:policy
npm run deploy:policy
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile scripts/ci/runtime-source-policy.sh scripts/ci/runtime-source-policy-test.sh scripts/ci/quality-debt-policy.sh .github/workflows/docker.yml .github/workflows/deploy.yml
git commit -m "build(container): package isolated runtime artifacts"
```

### Task 7: Run the complete local acceptance gate

**Files:**
- Modify only when a failing verification starts a new RED-GREEN cycle in its owning task.

**Interfaces:**
- Consumes: exact committed candidate and disposable services.
- Produces: fresh static, runtime, browser, container, and cleanup evidence.

- [ ] **Step 1: Run static and unit gates**

```bash
npm ci
npm run runtime:policy:test
npm run runtime:policy
npm run quality:policy
npm run type-check
npm run lint
npm run check:posts
npm run check:cms-mdx-media
npm run audit:policy
npm run test:ci -- --coverage --watchAll=false
npm run build
git diff --check
```

Expected: all green, zero lint warnings, no runtime module skips, coverage above
configured thresholds. Only the approved ESLint 9 deadline notice may remain.

- [ ] **Step 2: Run infrastructure gates**

```bash
npm run compose:policy
npm run deploy:policy
npm run directus:smoke
```

Expected: immutable artifact, rollback, no-DB-mutation, Compose, Directus, and
cleanup checks pass.

- [ ] **Step 3: Run live and browser gates**

Create one uniquely named MySQL 8 container on a random loopback port. Wait for
`mysqladmin ping`, run migrations with both exact confirmations, start
`node server.cjs` on `127.0.0.1:31337`, and wait for `/api/health`. Keep verbose
logs in one `mktemp -d`; the trap stops/removes only that container, terminates
only the captured server PID, unlinks each exact log, and removes the empty
directory.

```bash
LIVE_BASE_URL=http://127.0.0.1:31337 npm run test:integration:live
CYPRESS_baseUrl=http://127.0.0.1:31337 npm run test:e2e
```

Expected: all live Jest suites and Cypress specs pass with zero pending/skipped.

- [ ] **Step 4: Prove cleanup and integrity**

```bash
docker ps -a --format '{{.Names}}' | rg 'casn-runtime-boundary' && exit 1 || true
ss -ltn '( sport = :31337 )' | tail -n +2 | rg . && exit 1 || true
git status --short --branch
git diff --check origin/main...HEAD
```

Expected: no disposable resource remains and the worktree is clean.

- [ ] **Step 5: Commit documentation only if verification changed it**

Do not create an empty commit. If verified commands or evidence changed docs:

```bash
git add docs/quality-debt.md docs/deployment-reconciliation.md
git commit -m "docs: close runtime artifact debt"
```
