# CASN Production and Directus Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current public CASN behavior, incorporate the final `origin/dev` card fix, replace Strapi with pinned Directus, and close the unsafe API, migration, health, secret, and deployment gaps.

**Architecture:** Work from the exact production revision on `codex/reconcile-directus`. Apply the two-file final-tree delta from `origin/dev`, then port the dirty Directus work by responsibility instead of replaying its entire older patch. Next.js remains a public read application over MySQL; Directus becomes the only editorial write surface; nginx and Compose become canonical, version-controlled runtime definitions.

**Tech Stack:** Next.js 16, React 19, TypeScript, Jest, TypeORM, MySQL 8, Directus 12.3.1, Docker Compose, nginx, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-casn-production-directus-reconciliation-design.md`

## Global Constraints

- Never edit, stash, reset, clean, or commit the original dirty worktree at `/home/przemekp95/.codex/worktrees/7c7a/casn`.
- Implement only in `/home/przemekp95/.codex/worktrees/casn-reconcile-directus` on `codex/reconcile-directus`.
- Do not push, merge, publish images, modify remote secrets, touch production MySQL, restart production containers, or deploy.
- Preserve production SEO, canonical, JSON-LD, internal links, related analyses, menus, cards, cache behavior, content, and legacy media.
- Directus is the sole editorial write surface. Next.js remains read-only except for authenticated cache revalidation.
- Pin Directus to `directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869`.
- Add no usable default passwords, keys, tokens, or webhook secrets.
- Do not run `npm audit fix` in this plan.
- Use RED-GREEN-REFACTOR for behavior changes. Configuration-only and exact source-sync steps use executable validation instead of source-text tests.
- If Git author identity remains unset, do not invent it; skip commits and report a commit-ready tree.

---

### Task 1: Synchronize the exact `origin/dev` final-tree delta

**Files:**
- Modify: `app/analizy/page.tsx`
- Modify: `app/globals.css`
- Verify: `test/integration/pages/analyses-comprehensive.test.tsx`

**Interfaces:**
- Consumes: production tree `9a8ceea2...` and `origin/dev` tree `06d290cc...`.
- Produces: production behavior plus non-clipping analysis-card title layout.

- [ ] **Step 1: Prove the intended delta**

Run `git diff --name-only origin/main..origin/dev`. Expected: only `app/analizy/page.tsx` and `app/globals.css`.

- [ ] **Step 2: Apply the two files exactly**

Remove unused `getImageProps` and `CSSProperties` imports. Apply the `origin/dev` card CSS: `.projects-wrapper` row gap, grid-item horizontal padding, zero card top margin, body gap, `overflow-wrap:anywhere`, `word-break:break-word`, block title link, and auto-pushed author.

- [ ] **Step 3: Validate mechanical equivalence**

```bash
git diff --no-index <(git show origin/dev:app/analizy/page.tsx) app/analizy/page.tsx
git diff --no-index <(git show origin/dev:app/globals.css) app/globals.css
npm run lint -- --quiet
npm run test:ci -- --runTestsByPath test/integration/pages/analyses-comprehensive.test.tsx
```

Expected: empty diffs and passing checks.

- [ ] **Step 4: Commit if Git identity exists**

```bash
git add app/analizy/page.tsx app/globals.css
git commit -m "fix(ui): reconcile analyses cards with dev"
```

---

### Task 2: Make the public Next.js application read-only

**Files:**
- Modify: `app/api/articles/route.ts`
- Modify: `app/api/db-init/route.ts`
- Modify: `app/api/revalidate/route.ts`
- Modify: `test/integration/api/articles.test.ts`
- Modify: `test/integration/api/articles-comprehensive.test.ts`
- Modify: `test/unit/api/articles.route.providers.test.ts`
- Modify: `test/unit/api/db-init.route.test.ts`
- Modify: `test/unit/api/revalidate.route.test.ts`

**Interfaces:**
- Consumes: public article reads and Directus webhook headers.
- Produces: disabled article writes, inert DB-init HTTP route, and fail-closed webhook authentication.

- [ ] **Step 1: RED — anonymous article writes are rejected without DB writes**

Add a test which spies on `AnalysisSchema` repository `save`, calls `POST` with a valid article body, and expects status 405, `Allow: GET`, `{ error: 'Method not allowed' }`, and zero saves. Run the three article test files; expected failure is the current 201 response.

- [ ] **Step 2: GREEN — remove Next.js article-write logic**

Delete Strapi sync imports, request-body write schemas, author lookup, direct DB creation, publishing, and write-side revalidation. Retain GET. Implement:

```ts
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
```

Rerun the article suites; expected PASS.

- [ ] **Step 3: RED — DB initialization cannot be triggered over HTTP**

Mock `initDatabase` only to observe the prohibited side effect. Test both GET and POST for 404 `{ error: 'Not found' }` and zero calls. Run `test/unit/api/db-init.route.test.ts`; expected failure because both handlers currently initialize.

- [ ] **Step 4: GREEN — make `/api/db-init` inert**

Remove database imports and have both handlers return a shared 404 response. Rerun the focused test; expected PASS.

- [ ] **Step 5: RED — webhook credentials are header-only**

Extend the revalidation tests: absent server secret returns 503; wrong and different-length secrets return 401; a correct JSON-body `secret` still returns 401; a correct `x-directus-secret` succeeds. Observe the body-secret case fail.

- [ ] **Step 6: GREEN — compare webhook secrets safely**

Use `timingSafeEqual` from `node:crypto`; accept only `x-revalidate-secret`, `x-directus-secret`, or Bearer authorization. Reject unequal buffer lengths before comparison and never read `payload.secret`. Rerun the focused suite.

- [ ] **Step 7: Commit if Git identity exists**

```bash
git add app/api/articles/route.ts app/api/db-init/route.ts app/api/revalidate/route.ts test/integration/api/articles-comprehensive.test.ts test/integration/api/articles.test.ts test/unit/api/articles.route.providers.test.ts test/unit/api/db-init.route.test.ts test/unit/api/revalidate.route.test.ts
git commit -m "fix(api): make public application writes fail closed"
```

---

### Task 3: Separate liveness, readiness, and migration control

**Files:**
- Create: `lib/server/migration-policy.ts`
- Create: `test/unit/lib/server-migration-policy.test.ts`
- Create: `app/api/health/live/route.ts`
- Create: `test/unit/api/health.live.route.test.ts`
- Modify: `lib/db.shared.ts`
- Modify: `app/api/health/route.ts`
- Modify: `test/integration/api/health.test.ts`
- Modify: `server.js`

**Interfaces:**
- Produces: `shouldRunDatabaseMigrations(env): boolean`, DB-free liveness, and DB-backed readiness.

- [ ] **Step 1: RED — migration requires two exact confirmations**

Add a table test for `{}` false, either variable alone false, `RUN_DB_MIGRATIONS=true` false, and only `{ RUN_DB_MIGRATIONS:'1', DB_MIGRATION_CONFIRM:'RUN_CASN_MIGRATIONS' }` true. Observe missing-module failure.

- [ ] **Step 2: GREEN — implement and wire the policy**

```ts
type MigrationEnvironment = Record<string, string | undefined>;

export function shouldRunDatabaseMigrations(env: MigrationEnvironment): boolean {
  return env.RUN_DB_MIGRATIONS === '1'
    && env.DB_MIGRATION_CONFIRM === 'RUN_CASN_MIGRATIONS';
}
```

Set TypeORM `migrationsRun` to this result. Run the policy and DataSource unit tests.

- [ ] **Step 3: RED — readiness fails when MySQL is unavailable**

Test 503 `{ status:'not_ready', database:'unavailable' }` when initialization/probe fails; 200 `{ status:'ready', database:'connected' }` on success; no `environment` or secret-presence object; optional `revision` comes only from `APP_REVISION`. Test liveness returns exactly `{ status:'alive' }` without importing DB code. Observe current always-healthy behavior fail.

- [ ] **Step 4: GREEN — implement health contracts**

Readiness initializes the DataSource under the migration policy, runs `SELECT 1`, returns 200/503, and never serializes exceptions. Liveness is DB-free. `server.js` may continue serving liveness after startup DB failure, but logs that readiness remains 503 and does not invoke migrations directly.

- [ ] **Step 5: Verify and commit**

```bash
npm run test:ci -- --runTestsByPath test/integration/api/health.test.ts test/unit/api/health.live.route.test.ts test/unit/lib/server-migration-policy.test.ts test/unit/lib/db.datasource.test.ts test/unit/lib/server-init-db.test.ts
git add app/api/health lib/db.shared.ts lib/server/migration-policy.ts server.js test/integration/api/health.test.ts test/unit/api/health.live.route.test.ts test/unit/lib/server-migration-policy.test.ts
git commit -m "fix(runtime): separate readiness from migration control"
```

Skip the commit command if identity is absent.

---

### Task 4: Replace Strapi source surfaces with Directus

**Files:**
- Create: `directus/bootstrap.cjs`, `directus/start.sh`, `scripts/ci/directus-smoke.sh`, `test/integration/pages/analysis-legacy-cms-media.test.tsx`
- Modify: `package.json`, `package-lock.json`, `eslint.config.mjs`, CMS media/audit scripts, Dependabot and CI workflows
- Delete: `strapi/`, Strapi CMS adapters/sync route/scripts/tests, `docs/strapi-cms.md`

**Interfaces:**
- Consumes: `Author`, `Analysis`, `IssueCollection`, `/cms/uploads/`, and `/api/revalidate`.
- Produces: idempotent Directus metadata/bootstrap and `npm run directus:smoke`.

- [ ] **Step 1: Mechanically rename the legacy-media regression without changing behavior**

Create the Directus-neutral legacy media test from the dirty-worktree version and delete the Strapi-named equivalent only after the renamed test passes with existing `normalizeCmsMdxMediaPaths`. This is a naming-only test migration, so an artificial failing behavior test would add no evidence; verify the renamed test directly.

- [ ] **Step 2: Port a non-destructive bootstrap**

Port `directus/bootstrap.cjs` and `directus/start.sh`. Bootstrap may update-or-create only collection metadata, fields, role, policy, permissions, flow, and operation by stable names. It must not issue SQL, truncate tables, or mutate content items. Require admin credentials and webhook URL/secret; leave the readiness marker absent and exit non-zero on any failure. Use the image-bundled `directus` CLI, never `npx` download.

- [ ] **Step 3: Remove Strapi implementation**

Delete `lib/cms/{config,mappers,strapi-client,types}.ts`, `lib/server/cms-sync.ts`, `app/api/cms/sync/route.ts`, Strapi import/sync scripts, image source, and dedicated tests. Retain generic `lib/cms/mdx-media.ts`, placeholders, and only the read-only legacy volume name.

- [ ] **Step 4: Update package and CI surfaces**

Remove Strapi scripts/images/jobs and add `"directus:smoke": "bash scripts/ci/directus-smoke.sh"`. Update to Next/eslint-config-next 16.3.3 using `npm install --package-lock-only`; the separately approved dependency-remediation follow-up also pins next-auth 4.24.15 and the safe gray-matter/js-yaml branch. Route the Docker workflow to the pinned Directus smoke and remove the Strapi npm audit target.

- [ ] **Step 5: Verify and commit**

```bash
rg -n 'strapi-client|server/cms-sync|api/cms/sync|scripts/cms/.*strapi' app lib scripts test package.json
npm run check:cms-mdx-media
npm run test:ci -- --runTestsByPath test/integration/pages/analysis-legacy-cms-media.test.tsx test/unit/lib/cms-mdx-media.test.ts test/unit/api/revalidate.route.test.ts
npm run type-check
git add -A
git commit -m "feat(cms): replace Strapi integration with Directus"
```

Expected `rg`: empty. Skip commit if identity is absent.

---

### Task 5: Canonicalize Compose and nginx

**Files:**
- Create: `scripts/ci/compose-policy.sh`
- Create: `Dockerfile.nginx`
- Modify: `docker-compose.env.example`, `docker-compose.final.yml`, `docker-compose.portainer.yml`, `nginx.conf`, `package.json`, quality workflow

**Interfaces:**
- Produces: required secrets, digest-based app/nginx images, pinned Directus, `/cms/` proxy, read-only legacy uploads, and readiness-based dependencies.

- [ ] **Step 1: RED — executable Compose policy**

Create a script that first expects both production Compose files to fail rendering in an empty environment, then renders with controlled test values and uses `jq` to require the exact Directus digest and digest-form app/nginx images. Recursively reject `change-me|password123|your-secret|admin@example.com|:latest|:main|:dev`. Observe it fail against current files.

- [ ] **Step 2: GREEN — require immutable inputs and secrets**

Use `${VARIABLE:?VARIABLE is required}` for MySQL credentials, Directus key/secret/admin credentials, webhook/revalidation secret, `APP_IMAGE`, `NGINX_IMAGE`, and `APP_REVISION`. Set Directus to the exact global-constraint digest. Leave migration variables unset by default.

- [ ] **Step 3: Reconcile topology and routing**

Directus and app depend on healthy MySQL; nginx depends on app readiness and Directus health. App checks `/api/health`; Directus requires ping plus bootstrap marker; nginx checks `/nginx-health`. Mount `strapi_uploads` read-only only for `/cms/uploads/`; new Directus files use `directus_uploads`.

Replace Strapi root proxies with `location = /cms { return 308 /cms/; }`, read-only `/cms/uploads/` alias, and `/cms/` rewrite/proxy to `directus:8055`. Add `X-Robots-Tag: noindex, nofollow` to CMS paths. Do not expose old `/admin` or plugin root proxies.

- [ ] **Step 4: Validate and commit**

```bash
bash scripts/ci/compose-policy.sh
docker run --rm -v "$PWD/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.27-alpine nginx -t
git add docker-compose.env.example docker-compose.final.yml docker-compose.portainer.yml nginx.conf Dockerfile.nginx scripts/ci/compose-policy.sh package.json package-lock.json .github/workflows/quality-checks/action.yml
git commit -m "fix(deploy): require immutable images and explicit secrets"
```

Skip commit if identity is absent.

---

### Task 6: Make the Directus smoke exercise the deployed entrypoint

**Files:**
- Modify: `scripts/ci/directus-smoke.sh`, `directus/bootstrap.cjs`, `.github/workflows/docker.yml`

**Interfaces:**
- Produces: proof of bootstrap idempotency, permission boundaries, editor CRUD, and authenticated revalidation.

- [ ] **Step 1: Replace clean-image smoke with isolated real topology**

Create an explicit smoke network, MySQL container, pinned `node:22.23.2-alpine` webhook receiver, and pinned Directus container with repository `start.sh`/`bootstrap.cjs` mounted read-only. Generate test-only credentials with `openssl rand -hex 32`; provide no defaults. Cleanup removes only names created by the script.

- [ ] **Step 2: Prove bootstrap idempotency**

Wait for ping and marker, authenticate, assert the three managed collections, restart the same Directus container, and query stable role/policy/flow/operation names with `limit=2`; each must have exactly one record.

- [ ] **Step 3: Prove permissions and webhook flow**

Require anonymous POST to each collection to return 401/403. As a CASN Editor, create/read/update/delete a unique draft. Trigger an Analysis change and assert the receiver observed POST `/api/revalidate`, the generated `x-directus-secret`, and body model `Analysis`.

- [ ] **Step 4: Run and commit**

```bash
DIRECTUS_IMAGE='directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869' npm run directus:smoke
git add directus/bootstrap.cjs scripts/ci/directus-smoke.sh .github/workflows/docker.yml
git commit -m "test(cms): exercise Directus bootstrap and webhook flow"
```

Skip commit if identity is absent.

---

### Task 7: Reconcile documentation and operator runbook

**Files:**
- Create: `docs/directus-cms.md`, `docs/deployment-reconciliation.md`
- Modify: `README.md`, `SECURITY.md`, `SECURITY_EXCEPTIONS.md`, `docs/deployment.md`, `docs/docker-ghcr.md`
- Delete: `docs/strapi-cms.md`

**Interfaces:**
- Produces: one honest rehearsal, cutover, verification, and rollback path.

- [ ] **Step 1: Document Directus ownership**

State that Directus is the only editorial UI, MySQL remains the public source, `publishedAt IS NOT NULL` controls publication, old `/cms/uploads/` is read-only, and new files use `/cms/assets/`. Document disabled Next.js writes, readiness semantics, double migration confirmation, and required secrets.

- [ ] **Step 2: Write exact rehearsal and rollback gates**

Require capture of current SHA/digests/config hashes; backups of MySQL, nginx, Compose, and legacy uploads; restore to an isolated stack; explicit migration with both gates; parity 39 analyses/32 authors/4 PDFs/80 sitemap URLs; route/SEO/media/health/Directus/webhook smoke; separate deployment approval; rollback of config, images, and DB snapshot on any failure. Never claim these steps ran.

- [ ] **Step 3: Verify and commit**

```bash
rg -n 'strapi:|casn-strapi|STRAPI_API_TOKEN|STRAPI_WEBHOOK_SECRET|cms:sync-db|cms:verify' README.md SECURITY.md SECURITY_EXCEPTIONS.md docs package.json .github scripts
git add README.md SECURITY.md SECURITY_EXCEPTIONS.md docs
git commit -m "docs: add Directus rehearsal and rollback runbook"
```

Expected: no active Strapi instruction; explicitly historical/read-only wording may remain. Skip commit if identity is absent.

---

### Task 8: Run the full local evidence gate and hand off

**Files:**
- Verify: all changed files

**Interfaces:**
- Produces: fresh local evidence and an explicit list of unperformed production steps.

- [ ] **Step 1: Confirm original-worktree preservation and tree hygiene**

```bash
git diff --check
test "$(git -C /home/przemekp95/.codex/worktrees/7c7a/casn rev-parse HEAD)" = '4d269a9352e6b3d93511a2f6549c2fd015ceef79'
git -C /home/przemekp95/.codex/worktrees/7c7a/casn status --short
test -f lib/server/related-analyses.ts
```

Compare original status with the audit snapshot; this work must add nothing there.

- [ ] **Step 2: Run all local gates**

```bash
npm ci
npm run check:posts
npm run check:cms-mdx-media
npm run compose:policy
npm run type-check
npm run lint -- --quiet
npm run test:ci
npm run audit:policy
npm run build
docker run --rm -v "$PWD/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.27-alpine nginx -t
DIRECTUS_IMAGE='directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869' npm run directus:smoke
```

Expected: every functional gate exits zero. `npm run audit:policy` is expected to
remain a documented release blocker unless a separately scoped dependency change
has remediated it; do not run an automatic or forced audit fix here. Record the
advisory counts and keep the branch out of release promotion while the policy is
red.

- [ ] **Step 3: Review the final evidence boundary**

Run `git diff --stat origin/main`, `git diff --name-status origin/main`, and `git log --oneline origin/main..HEAD`. Confirm no `.env`, secret, DB dump, or upload entered the tree.

- [ ] **Step 4: Produce the handoff**

Report branch/worktree/base/current SHA, preserved and changed behavior, RED/GREEN and final verification results, remaining audit advisories, and intended image references. State explicitly that production snapshot rehearsal, image publication, deployment, public smoke, and human Directus acceptance remain unperformed. The next safe action is review, optional commit identity configuration, and separately approved staging rehearsal. Do not push or deploy.
