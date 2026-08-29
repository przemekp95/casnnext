# CASN Quality-Debt Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the avoidable quality exceptions reported after CASN hardening and replace them with deterministic, zero-warning, non-mutating gates.

**Architecture:** Keep the current Next.js, TypeORM, Directus, and immutable deployment boundaries. Add a small executable quality-policy gate, lint tracked source while narrowly excluding compiler output, execute the four skipped Cypress behaviors against disposable data, and assert that artifact rollback never attempts database or Directus rollback.

**Tech Stack:** Next.js 16.3.3, TypeScript, ESLint 9.39.5 under a CI deadline through 2026-09-30, Jest 30, Cypress 15, Bash, Docker, MySQL 8.4, Directus 12.3.1

**Spec:** `docs/superpowers/specs/2026-08-26-casn-quality-debt-remediation-design.md`

## Global Constraints

- Do not add inline ESLint/ShellCheck suppressions, unconditional test skips, or broad source-directory ignores.
- Ignore only JavaScript proven to be compiler output; lint all tracked runtime JavaScript and TypeScript source.
- CI quality checks verify the checkout and never run `--fix`, `--write`, or another mutating formatter.
- Artifact rollback remains automatic; database and Directus recovery remain separately approved operator actions.
- Use only disposable local MySQL/Directus resources for live tests and prove cleanup.
- Do not push, create a pull request, merge, deploy, access production, or alter another worktree.

---

### Task 1: Make the quality contract executable

**Files:**
- Create: `scripts/ci/quality-debt-policy.sh`
- Modify: `package.json`
- Modify: `.github/workflows/docker.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/quality-checks/action.yml`

**Interfaces:**
- Consumes: root `package.json`, `eslint.config.mjs`, workflow YAML, and `cypress/e2e/hydration.cy.ts`.
- Produces: `npm run quality:policy`, a non-mutating repository policy check used by active workflows.

- [ ] **Step 1: Write the failing policy script**

Create an executable Bash script that parses `package.json` with Node and fails unless:

```bash
node <<'NODE'
const pkg = require('./package.json');
if (pkg.devDependencies.eslint !== '9.39.5') throw new Error('Unexpected ESLint compatibility version');
if (!pkg.scripts.lint.includes('--max-warnings 0')) throw new Error('lint must reject warnings');
if (/ignore-pattern ['"]?(lib|migrations)\//.test(pkg.scripts.lint)) {
  throw new Error('lint must not exclude lib or migrations');
}
NODE
```

Also fail when:

```bash
rg -n -- '--fix|--write' .github/workflows/quality-checks/action.yml
rg -n 'it\.skip\(' cypress/e2e/hydration.cy.ts
rg -n '^/\* eslint-disable' server.js
```

Require `npm run quality:policy` in both active workflow test jobs and require the composite action to call `npm run lint` rather than raw mutating commands.

- [ ] **Step 2: Run the policy to verify RED**

Run:

```bash
bash scripts/ci/quality-debt-policy.sh
```

Expected: non-zero because ESLint is 9.39.5, lint accepts warnings and excludes `lib/`/`migrations/`, Cypress contains four `it.skip` calls, and the composite action mutates files.

- [ ] **Step 3: Wire the policy without weakening its assertions**

Add:

```json
"quality:policy": "bash scripts/ci/quality-debt-policy.sh"
```

Call `npm run quality:policy` immediately after lint in `.github/workflows/docker.yml` and `.github/workflows/deploy.yml`. Replace the composite action's formatter/linter block with:

```yaml
- name: Lint and quality policy
  run: |
    npm run lint
    npm run quality:policy
  shell: bash
```

Keep the policy RED until Tasks 2–4 satisfy it.

- [ ] **Step 4: Commit the RED quality contract**

```bash
git add scripts/ci/quality-debt-policy.sh package.json .github/workflows/docker.yml .github/workflows/deploy.yml .github/workflows/quality-checks/action.yml
git commit -m "test(quality): define zero-debt quality policy"
```

### Task 2: Lint every tracked runtime source with zero warnings

**Files:**
- Modify: `eslint.config.mjs`
- Delete: `.eslintrc.json`
- Delete: `scripts/bulk-eslint-fix.js`
- Rename: `server.js` to `server.cjs`
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `docker-compose.final.yml`
- Modify: `docker-compose.portainer.yml`
- Modify: `.github/workflows/deploy.yml`
- Delete: `test-typeorm-config.sh`
- Modify: `lib/init-db.js`
- Modify: `lib/db.datasource.ts`
- Modify: `directus/extensions/directus-extension-casn-field-guard/dist/index.js`
- Modify: repository documentation containing `server.js`

**Interfaces:**
- Consumes: CommonJS runtime helpers emitted/maintained under `lib/` and the existing custom server bootstrap contract.
- Produces: `npm run lint` covering tracked source and returning non-zero on any warning.

- [ ] **Step 1: Capture the focused RED result**

Run:

```bash
npx eslint lib migrations server.js directus/extensions/directus-extension-casn-field-guard/dist/index.js --no-ignore --max-warnings 0
```

Expected: non-zero with CommonJS import errors plus anonymous default-export warnings.

- [ ] **Step 2: Narrow generated-output ignores**

Remove `lib/**` and `migrations/**` from `eslint.config.mjs`. Ignore only compiler outputs currently declared by `.gitignore`:

```js
"lib/db.server.js",
"lib/entities/*.js",
"migrations/*.js",
```

Add a CommonJS override for tracked `lib/**/*.js` and `**/*.cjs` that disables only `@typescript-eslint/no-require-imports`. Do not disable unused-variable, explicit-any, import, React, or Next rules for this source class.

- [ ] **Step 3: Express the server module boundary**

Rename `server.js` to `server.cjs`, remove its inline disable, and update all exact runtime references, including:

```json
"start": "node server.cjs"
```

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/server.cjs ./server.cjs
CMD ["node", "server.cjs"]
```

Update `.github/workflows/deploy.yml`, both production-oriented Compose files,
and the bridge comment in `lib/init-db.js` to reference `server.cjs`. Extend the
quality policy to require `server.cjs` and reject `server.js` in each active
runtime surface. Delete the unreferenced `test-typeorm-config.sh`; it asserts
the obsolete `3001:3000` app mapping, automatic database initialization, and a
release `casn.sql` flow superseded by `compose:policy` and the explicit migration
runner. Historical committed plans may retain the filename that was correct
when those plans were written.

- [ ] **Step 4: Remove real warning sources**

In `lib/db.datasource.ts`, assign the datasource to a named constant before default export:

```ts
const migrationDataSource = new DataSource(createDataSourceOptions());
export default migrationDataSource;
```

In the Directus hook, assign the registration callback before default export:

```js
function registerFieldGuard({ filter }) {
  filter("items.create", guardTechnicalFields);
  filter("items.update", guardTechnicalFields);
}

export default registerFieldGuard;
```

- [ ] **Step 5: Remove obsolete lint machinery**

Delete `.eslintrc.json` because ESLint 9/10 uses `eslint.config.mjs` in this repository. Delete the unused `scripts/bulk-eslint-fix.js`, whose only purpose is adding broad inline suppressions.

Set scripts to:

```json
"lint": "eslint . --ext .ts,.tsx,.js,.jsx,.cjs --max-warnings 0",
"lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx,.cjs --fix --max-warnings 0"
```

- [ ] **Step 6: Run focused and full lint GREEN**

Run:

```bash
npm run build:lib
npm run lint
npm run type-check
npx jest --runInBand --runTestsByPath test/unit/lib/startup-database.test.ts
npm run compose:policy
git diff --check
```

Expected: lint reports zero errors and zero warnings; typecheck and startup tests pass.

- [ ] **Step 7: Commit the lint boundary**

```bash
git add -A
git commit -m "fix(quality): lint all tracked runtime sources"
```

### Task 3: Time-box the upstream ESLint compatibility exception

**Files:**
- Modify: `scripts/ci/quality-debt-policy.sh`
- Modify: `docs/superpowers/specs/2026-08-26-casn-quality-debt-remediation-design.md`
- Modify: `docs/superpowers/plans/2026-08-26-casn-quality-debt-remediation.md`

**Interfaces:**
- Consumes: the failed clean-install experiment with ESLint 10.9.0 and the zero-warning flat configuration from Task 2.
- Produces: visible ESLint 9.39.5 exception that CI automatically rejects after 2026-09-30.

- [ ] **Step 1: Prove that the direct upgrade is not acceptable**

Run:

```bash
npm install --save-dev --save-exact eslint@10.9.0
```

Observed: npm emits `ERESOLVE overriding peer dependency` for plugins bundled
by `eslint-config-next@16.3.3`. Do not commit the dependency or lockfile change;
restore both to the last committed 9.39.5 state.

- [ ] **Step 2: Encode the approved deadline**

Allow exactly ESLint 9.39.5 through 2026-09-30, print a visible notice on every
policy run, and fail when the current UTC date is later than the deadline. Also
allow a future pinned 10.x release so the exception can be removed without
weakening the rest of the policy.

- [ ] **Step 3: Test both sides of the date boundary**

Expose the current date to the inline Node policy through a test-only
`QUALITY_POLICY_DATE` override. Run:

```bash
QUALITY_POLICY_DATE=2026-09-30 npm run quality:policy
QUALITY_POLICY_DATE=2026-10-01 npm run quality:policy
```

Expected: the first command reaches only the still-pending Cypress policy check;
the second also reports the expired ESLint exception. The production default
continues to use the actual UTC date.

- [ ] **Step 4: Commit the time-bounded decision**

```bash
git add scripts/ci/quality-debt-policy.sh docs/superpowers/specs/2026-08-26-casn-quality-debt-remediation-design.md docs/superpowers/plans/2026-08-26-casn-quality-debt-remediation.md
git commit -m "chore(quality): time-box ESLint 9 compatibility"
```

### Task 4: Execute the four skipped Cypress contracts

**Files:**
- Modify: `cypress/e2e/hydration.cy.ts`

**Interfaces:**
- Consumes: deterministic Author and Analysis rows from `InitialSetup1736424470000` and configurable Cypress `baseUrl`.
- Produces: four executed E2E scenarios with no `it.skip` in `hydration.cy.ts`.

- [ ] **Step 1: Unskip and execute the author-card test**

The Task 1 policy is the RED test because it rejects the checked-in skip. Change
only the author-card scenario from `it.skip` to `it`, require at least one
`.our-team-box`, and start the built app against disposable migrated MySQL. Run:

```bash
npm run test:e2e -- --spec cypress/e2e/hydration.cy.ts --config baseUrl=http://127.0.0.1:${APP_TEST_PORT}
```

Retain assertions for at least one card, image alt/src, non-empty name, and an
`/autor/` link. Expected: the focused scenario executes and passes; a zero-card
page fails rather than silently succeeding.

- [ ] **Step 2: Unskip and repair the analysis-card contract**

Require `.blog-list-item` to have length greater than zero, then assert current card structure, non-empty title, and PDF link security attributes. Run the same focused Cypress spec and require green before continuing.

- [ ] **Step 3: Unskip and repair the API contract**

Require HTTP 200 arrays from `/api/authors` and `/api/articles`, require both arrays to be non-empty under the migrated fixture, and validate stable public fields without requiring removed Strapi administration fields. Run focused Cypress and require green.

- [ ] **Step 4: Unskip and repair navigation**

Start at `/`, use visible navigation links, and assert exact pathname transitions to `/autorzy`, `/zbiory`, and back to `/`. Avoid conditional assertions that silently skip absent controls. Run focused Cypress and require green.

- [ ] **Step 5: Prove the target pending count is zero**

Run:

```bash
if rg -n 'it\.skip\(' cypress/e2e/hydration.cy.ts; then exit 1; fi
npm run test:e2e -- --config baseUrl=http://127.0.0.1:${APP_TEST_PORT}
```

Expected: all five specs pass, all four target scenarios execute, and the target file has zero pending tests.

- [ ] **Step 6: Commit deterministic E2E coverage**

```bash
git add cypress/e2e/hydration.cy.ts
git commit -m "test(e2e): execute deterministic hydration contracts"
```

Stage only `cypress/e2e/hydration.cy.ts`; the current application markup already
provides the selectors required by this task.

### Task 5: Enforce the database rollback boundary

**Files:**
- Create: `scripts/ci/assert-no-deployment-db-mutation.sh`
- Modify: `scripts/ci/deployment-artifact-policy.sh`
- Modify: `scripts/ci/remote-deploy-rollback-test.sh`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: `scripts/deploy/remote-deploy.sh` artifact rollback and the manual migration double gate.
- Produces: a policy failure if remote deployment attempts migrations or Directus metadata mutation.

- [ ] **Step 1: Add a failing forbidden-operation fixture**

Extend deployment policy to fail if `scripts/deploy/remote-deploy.sh` contains any of:

```text
migration:run
migration:revert
RUN_DB_MIGRATIONS
DB_MIGRATION_CONFIRM
directus bootstrap
directus schema
```

Extract the SSH deployment script block from `.github/workflows/deploy.yml` and apply the same forbidden-token check there, while leaving the workflow's disposable test-job migration allowed.

- [ ] **Step 2: Verify policy behavior**

Before retaining the assertion, inject a forbidden token only into a temporary copy of the deployment script and prove the predicate returns non-zero. Then run against the repository files:

```bash
bash scripts/ci/remote-deploy-rollback-test.sh
npm run deploy:policy
```

Expected: fixture rejects the forbidden operation; repository rollback behavior and deployment policy pass.

- [ ] **Step 3: Document the enforced distinction**

Update `docs/deployment.md` to state that remote deployment is mechanically prohibited from invoking application migrations or Directus schema mutation, while recovery uses the separately approved reconciliation backup/restore gates.

- [ ] **Step 4: Commit the rollback boundary**

```bash
git add scripts/ci/deployment-artifact-policy.sh scripts/ci/remote-deploy-rollback-test.sh docs/deployment.md
git commit -m "test(deploy): prohibit database mutation during rollback"
```

### Task 6: Remove the temporary artifact and record deferred debt

**Files:**
- Create: `docs/quality-debt.md`
- Delete outside repository: `/mnt/data/codex-desktop-tmp/tmp.30vRbQSVTa`

**Interfaces:**
- Consumes: repository-wide `eslint-disable`, `describe.skip`, and `it.skip` inventory.
- Produces: an explicit finite follow-up inventory; no retained disposable log.

- [ ] **Step 1: Generate the exact deferred inventory read-only**

Run:

```bash
rg -n 'eslint-disable|describe\.skip|it\.skip' test scripts app components lib migrations server.cjs
```

Classify every remaining occurrence as legacy test typing, conditional missing-component coverage, runtime source, or obsolete tooling. Record exact paths and remediation acceptance criteria in `docs/quality-debt.md`; do not label tests as TDD merely because they exist.

- [ ] **Step 2: Remove only the exact temporary log**

Verify path, owner, mode, and size with `stat`, then delete exactly:

```bash
unlink /mnt/data/codex-desktop-tmp/tmp.30vRbQSVTa
test ! -e /mnt/data/codex-desktop-tmp/tmp.30vRbQSVTa
```

- [ ] **Step 3: Commit the debt register**

```bash
git add docs/quality-debt.md
git commit -m "docs: record remaining legacy quality debt"
```

### Task 7: Run the complete final gate

**Files:**
- Modify only when a failing gate identifies a root-cause defect within this specification.

**Interfaces:**
- Consumes: final branch tree.
- Produces: fresh acceptance evidence and a clean local branch ready for review.

- [ ] **Step 1: Run clean install and static gates**

```bash
npm ci
npm run quality:policy
npm run type-check
npm run lint
npm run check:posts
npm run check:cms-mdx-media
npm run audit:policy
```

- [ ] **Step 2: Run full tests and coverage**

```bash
npm run test:ci -- --coverage --watchAll=false
node -e "const s=require('./coverage/coverage-summary.json'); if(s.total.lines.pct<70) process.exit(1)"
```

- [ ] **Step 3: Run production and infrastructure gates**

```bash
npm run build
npm run compose:policy
npm run deploy:policy
npm run directus:smoke
```

- [ ] **Step 4: Run disposable live integration and E2E**

Provision MySQL 8.4 on an ephemeral loopback port, wait for final TCP readiness,
run the double-gated migration command, start `server.cjs` on an available
loopback port, then run:

```bash
DATABASE_URL="$LIVE_DATABASE_URL" RUN_LIVE_TESTS=1 LIVE_BASE_URL="$LIVE_BASE_URL" npm run test:integration:live
DATABASE_URL="$LIVE_DATABASE_URL" npm run test:e2e -- --config "baseUrl=$LIVE_BASE_URL"
```

Stop the exact server and disposable MySQL container and verify their absence.

- [ ] **Step 5: Verify repository and authorization boundaries**

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
git worktree list --porcelain
```

Expected: clean worktree, no changes to other worktrees, no remote publication,
and no production action.
