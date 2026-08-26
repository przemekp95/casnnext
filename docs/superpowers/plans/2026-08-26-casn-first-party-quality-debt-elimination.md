# CASN First-Party Quality-Debt Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all first-party suppressions, broad ESLint exceptions, silent skips, and no-op assertions without changing CASN runtime, security, migration, deployment, or live-test contracts.

**Architecture:** A fixture-tested source-policy checker is built first but wired into the repository only after cleanup makes it truthful. Static UI imports and required assertions replace guards; typed boundary contracts replace casts; the existing CSS wrapper owns legacy styles; React/Next rules are enabled separately before broad config removal.

**Tech Stack:** Node 22, TypeScript 5.6, Next 16.3.3, React 19.2, ESLint 9.39.5, Jest 30.4, Cypress 15.21, Bash, Docker, MySQL 8, Directus 12.

**Spec:** docs/superpowers/specs/2026-08-26-casn-first-party-quality-debt-elimination-design.md

## Global Constraints

- Prerequisite: runtime-boundary Tasks 1–7 are fully green, reviewed, and committed. Do not duplicate runtime work.
- Before Task 1, fetch origin/main; merge only its fresh head with explicit new user authorization and re-run inventory.
- Current post-runtime baseline is 88 errors for four rules (36 any, 24 require, 20 unused, 8 CSS), 109 including React/Next, 29 directives/25 files, and 10 conditional suite selectors. Acceptance is zero; counts refresh after merge.
- Work locally in codex/casn-hardening-20260826. Preserve dirty worktrees; no stash, push, PR, shared merge, deploy, production access, or production DB/Directus mutation.
- Preserve RUN_LIVE_TESTS=1 and jest.config.ts testPathIgnorePatterns as selection, not skip behavior.
- Keep only .next, node_modules, coverage, dist, app/generated, declarations, and explicit vendor/generated ignores. Keep tracked Directus extension linted.
- ESLint 9.39.5 is the only exception, visible and rejected after 2026-09-30. All lint uses --max-warnings 0.
- Preserve eight CSS URLs/order. Material regression from no-img-element, error-boundaries, or set-state-in-effect is a hard stop without a new user-approved exception.
- CSRF remains unchanged/inapplicable to the secret webhook without cookies. No messaging/jobs, CQRS/DDD, migration, deployment, rollback, or HTTP security boundary changes.
- RED/GREEN proves this new work only; existing tests are not historical TDD proof or blanket BDD evidence.

## File and interface map

| Unit | Files | Produces |
| --- | --- | --- |
| Source policy | scripts/ci/first-party-quality-policy{,-test}.sh, package.json, quality-debt-policy.sh | bash policy [root] with [first-party-quality] diagnostic |
| UI suites | five page and seven component tests | static imports plus required roles/links/alt text |
| Module hygiene | jest.setup.ts, cypress.config.ts, prepare-tmp.mjs, mocks | installEdgeFetchPrimitives(), typed fetch/teardown |
| Data/types | analyses/database tests, routes/pages/lib/server/MDX | typed fixture, PageProps, raw rows, unknown guards |
| Presentation | layout, legacy.css, SafeImage, EmailLink, analyses page | CSS wrapper, Image contract, individual rules |

---

### Task 0: Verify runtime prerequisite and fresh integration

**Files:**
- No source edit; local merge only after authorization.

**Interfaces:**
- Consumes: reviewed runtime Tasks 1–7 and fresh origin/main.
- Produces: refreshed prohibited-construct baseline.

- [ ] **Step 1: Verify runtime foundation**

~~~bash
npm run runtime:policy:test
npm run runtime:policy
npm run type-check
npm run lint
~~~

Expected: all pass; otherwise stop.

- [ ] **Step 2: Merge only after explicit approval**

~~~bash
git fetch origin main
git status --porcelain -uall
git rev-parse HEAD
git rev-parse origin/main
git merge --no-edit origin/main
~~~

Expected: clean tree; preserve snapshot/Directus/GHCR/header work and stop on conflict.

- [ ] **Step 3: Capture fresh RED**

~~~bash
npx eslint . --ext .ts,.tsx,.js,.jsx,.cjs --no-inline-config --rule '@typescript-eslint/no-explicit-any: error' --rule '@typescript-eslint/no-require-imports: error' --rule '@typescript-eslint/no-unused-vars: error' --rule '@next/next/no-css-tags: error'
rg -n 'eslint-disable|eslint-enable|\?\s*describe\s*:\s*describe\.skip' app components lib scripts test cypress jest.setup.ts cypress.config.ts
~~~

Expected: red before remediation; recorded count is never acceptance.

### Task 1: Create fixture-tested policy without premature enforcement

**Files:**
- Create: scripts/ci/first-party-quality-policy.sh
- Create: scripts/ci/first-party-quality-policy-test.sh
- Modify: package.json

**Interfaces:**
- Consumes: bash scripts/ci/first-party-quality-policy.sh [root].
- Produces: npm run first-party-quality:policy:test; full gate wiring waits for Task 11.

- [ ] **Step 1: Write fixture RED**

~~~bash
readonly policy="$(cd "$(dirname "$0")" && pwd)/first-party-quality-policy.sh"
readonly test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT
expect_rejected() {
  local diagnostic="$1"
  if "$policy" "$test_root/repo" >"$test_root/out" 2>"$test_root/err"; then
    printf 'Policy unexpectedly accepted: %s\n' "$diagnostic" >&2
    exit 1
  fi
  rg -Fq "[first-party-quality] $diagnostic" "$test_root/err"
}

reset_fixture() {
  rm -rf "$test_root/repo"
  mkdir -p "$test_root/repo/app" "$test_root/repo/test" \
    "$test_root/repo/scripts" "$test_root/repo/.github/workflows/quality-checks"
  git -C "$test_root/repo" init -q
  printf '%s\n' '{"scripts":{"lint":"eslint . --max-warnings 0"}}' >"$test_root/repo/package.json"
  printf '%s\n' \
    'export default [' \
    '  { ignores: [".next/**", "node_modules/**", "coverage/**", "dist/**", "app/generated/**", "**/*.d.ts"] },' \
    '];' >"$test_root/repo/eslint.config.mjs"
  printf '%s\n' 'export default function Page() { return null; }' >"$test_root/repo/app/page.tsx"
  printf '%s\n' "it('renders', () => { expect(true).toBe(true); });" >"$test_root/repo/test/page.test.tsx"
  printf '%s\n' 'export const value = 1;' >"$test_root/repo/scripts/tool.ts"
  printf '%s\n' 'runs:' '  using: composite' '  steps:' '    - run: npm run lint' '      shell: bash' '    - run: npm run quality:policy' '      shell: bash' >"$test_root/repo/.github/workflows/quality-checks/action.yml"
  printf '%s\n' 'jobs:' '  quality:' '    steps:' '      - run: npm run lint' '      - run: npm run quality:policy' >"$test_root/repo/.github/workflows/docker.yml"
  cp "$test_root/repo/.github/workflows/docker.yml" "$test_root/repo/.github/workflows/deploy.yml"
  git -C "$test_root/repo" add .
}
~~~

After proving `reset_fixture` passes once the checker exists, reset before every mutation and exercise the real checker. Use these exact independent cases:

| Mutation | Expected diagnostic |
| --- | --- |
| prepend `/* eslint-disable */` to `app/page.tsx` | `inline-eslint-directive` |
| replace `it(` with `it.skip(` | `focused-or-skipped-test` |
| append `describe.only('x', () => {});` | `focused-or-skipped-test` |
| append `(hasComponent ? describe : describe.skip)('x', () => {});` | `conditional-suite` |
| append `if (element) expect(element).toBeVisible();` | `conditional-assertion` |
| append `{ files: ["test/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } }` to the config array | `broad-rule-disable` |
| change the lint script to `eslint .` | `lint-must-reject-warnings` |
| change the action command to `npm run lint -- --fix` | `workflow-must-not-rewrite` |
| delete the `npm run quality:policy` line from `docker.yml` | `workflow-must-run-quality` |

For file mutations use `sed -i` or `printf >>`, then `git -C "$test_root/repo" add .` before `expect_rejected` so the checker scans the same tracked-source boundary as the repository.

- [ ] **Step 2: Verify RED, implement, verify GREEN**

Run: bash scripts/ci/first-party-quality-policy-test.sh
Expected: non-zero before policy exists.

Implement:

~~~bash
readonly root="$1"
fail() { printf '[first-party-quality] %s\n' "$1" >&2; exit 1; }
readonly source_paths=(app components lib scripts test cypress jest.setup.ts cypress.config.ts server.cjs)
~~~

Build the tracked source list with `git -C "$root" ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.cjs' '*.mjs'`, then remove only `.next/`, `node_modules/`, `coverage/`, `dist/`, `app/generated/`, declarations, and explicitly generated/vendor clients. Shell files are not in the extension list, so checker heredocs are not scanned. Apply separate `rg` checks for directives/TS comments, `.skip`/`.only`, the conditional-suite expression, and an assertion nested directly under an element/collection guard. Parse `package.json` with Node for the exact lint script and inspect the repository-authored ESLint config, composite quality action, `docker.yml`, and `deploy.yml` for broad `off`, missing lint/policy invocation, `--fix`, or `--write`. Each class calls `fail` with the fixture diagnostic above. Run the fixture test and `npm run quality:policy`; the fixture passes while the existing repository gate remains intentionally unwired.

- [ ] **Step 3: Commit**

~~~bash
npm pkg set scripts.first-party-quality:policy:test='bash scripts/ci/first-party-quality-policy-test.sh'
git add scripts/ci/first-party-quality-policy* package.json
git commit -m "test(quality): define first-party zero-suppression policy"
~~~

### Task 2: Replace five page suite guards

**Files:**
- Modify: test/integration/pages/HomePage.test.tsx, KontaktPage.test.tsx, ZbioryPage.test.tsx, AnalysesPage.live.test.tsx, AuthorsPage.live.test.tsx

**Interfaces:** static page default imports; unconditional describe; intentional empty data has explicit UI assertion.

- [ ] **Step 1: Capture an honest policy RED and characterize current behavior**

~~~tsx
import HomePage from '@/app/page';
render(await HomePage());
expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
~~~

Run: npx jest --runInBand --runTestsByPath test/integration/pages/HomePage.test.tsx
Run `bash scripts/ci/first-party-quality-policy.sh .` first. Expected: RED with `conditional-suite`, not a speculative heading failure. Then run the current Jest file as characterization; it may pass.

- [ ] **Step 2: Implement static imports and full branches**

Remove hasComponent, try/catch, require, any, and conditional selectors. Use:

~~~tsx
const links = screen.queryAllByRole('link', { name: /przeczytaj/i });
if (links.length === 0) expect(screen.getByText('Brak dostępnych analiz. Sprawdź ponownie później.')).toBeVisible();
else expect(links[0]).toHaveAttribute('href', expect.stringMatching(/^\/analizy\//));
~~~

RUN_LIVE_TESTS remains the only live selector.

- [ ] **Step 3: Verify GREEN and commit**

~~~bash
npx jest --runInBand --runTestsByPath test/integration/pages/HomePage.test.tsx test/integration/pages/KontaktPage.test.tsx test/integration/pages/ZbioryPage.test.tsx
RUN_LIVE_TESTS=1 npx jest --runInBand --runTestsByPath test/integration/pages/AnalysesPage.live.test.tsx test/integration/pages/AuthorsPage.live.test.tsx
git add test/integration/pages && git commit -m "test(pages): require static page imports and observable contracts"
~~~

### Task 3: Replace seven component suite guards

**Files:** Modify test/unit/components/{ArticleLayout,Chart,CtaSection,Footer,Header,Map,SafeImage}.test.tsx.

**Interfaces:** static imports and required semantic assertions.

- [ ] **Step 1: Capture an honest policy RED and characterize Header**

~~~tsx
const button = screen.getByRole('button', { name: /przełącz menu nawigacyjne/i });
expect(button).toHaveAttribute('aria-expanded', 'false');
fireEvent.click(button);
expect(button).toHaveAttribute('aria-expanded', 'true');
~~~

Run the first-party policy first. Expected: RED with `conditional-suite`; then run Header Jest as characterization before replacing its weak query.

- [ ] **Step 2: Implement and verify**

Remove hasComp, require, any, catch bindings, describe.skip, and guarded required queries. Assert ArticleLayout content; Chart/Map labelled output/fallback; CTA/Footer destinations; SafeImage src/alt. Invalid boundary:

~~~tsx
render(<SafeImage src={123 as unknown as string} alt="Test" />);
expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('src', '123');
~~~

~~~bash
npx jest --runInBand --runTestsByPath test/unit/components/ArticleLayout.test.tsx test/unit/components/Chart.test.tsx test/unit/components/CtaSection.test.tsx test/unit/components/Footer.test.tsx test/unit/components/Header.test.tsx test/unit/components/Map.test.tsx test/unit/components/SafeImage.test.tsx
git add test/unit/components && git commit -m "test(components): eliminate conditional suite guards"
~~~

### Task 4: Remove setup, mock, Cypress, and postbuild module debt

**Files:** Create test/setup/edge-fetch-primitives.ts and test/unit/setup/edge-fetch-primitives.test.ts; modify jest.setup.ts, cypress.config.ts, test mocks, authors-client test, package.json; rename scripts/prepare-tmp.js to scripts/prepare-tmp.mjs.

**Interfaces:** `EdgeFetchPrimitives`, `defineGlobal(key: PropertyKey, value: unknown): void`, and `installEdgeFetchPrimitives(primitives: EdgeFetchPrimitives): void` from test/setup/edge-fetch-primitives.ts.

- [ ] **Step 1: Write RED setup test**

~~~ts
installEdgeFetchPrimitives(fakePrimitives);
expect(globalThis.Request).toBe(fakePrimitives.Request);
expect(globalThis.Headers).toBe(existingHeaders);
~~~

Expected: helper is absent.

- [ ] **Step 2: Implement and GREEN**

~~~ts
const mockedFetch = jest.fn<typeof fetch>();
defineGlobal('fetch', mockedFetch as typeof fetch);
const { AppDataSource } = await import('@/lib/db.shared');
if (AppDataSource?.isInitialized) await AppDataSource.destroy();
~~~

Create helper:

~~~ts
export type EdgeFetchPrimitives = {
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
  FormData: typeof FormData;
  File: typeof File;
  Blob: typeof Blob;
};
export function defineGlobal(key: PropertyKey, value: unknown) { Object.defineProperty(globalThis, key, { value, writable: true, configurable: true }); }
export function installEdgeFetchPrimitives(p: EdgeFetchPrimitives) { for (const key of ['Headers','Request','Response','FormData','File','Blob'] as const) if (typeof globalThis[key] === 'undefined') defineGlobal(key, p[key]); }
~~~

After stream polyfills, jest.setup.ts uses `jest.requireActual<EdgeFetchPrimitives>('next/dist/compiled/@edge-runtime/primitives/fetch')`, `installEdgeFetchPrimitives(edge)`, `defineGlobal('fetch', jest.fn<typeof fetch>() as typeof fetch)`, and `await import('@/lib/db.shared')` inside afterAll. Remove setupNodeEvents entirely. prepare-tmp.mjs is:

~~~js
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of [resolve(root, 'tmp'), resolve(root, 'tmp/next-cache')]) mkdirSync(dir, { recursive: true });
~~~

Set postbuild exactly `node scripts/prepare-tmp.mjs`. Omit unused mock args; raw img remains only in exact Jest renderer.

~~~bash
npx jest --runInBand --runTestsByPath test/unit/setup/edge-fetch-primitives.test.ts test/unit/app/authors-client.test.tsx
npm run build
npx eslint jest.setup.ts cypress.config.ts scripts/prepare-tmp.mjs test/__mocks__/@/lib/db.ts test/__mocks__/nextImageMock.tsx test/unit/app/authors-client.test.tsx --max-warnings 0
git add jest.setup.ts cypress.config.ts scripts/prepare-tmp.mjs package.json test/setup test/unit/setup test/__mocks__ test/unit/app/authors-client.test.tsx
git rm scripts/prepare-tmp.js
git commit -m "refactor(test): use typed ESM setup and postbuild helpers"
~~~

### Task 5: Make API/database tests deterministic

**Files:** Modify test/integration/api/analyses-comprehensive.test.ts, test/unit/lib/database-utils.test.ts, and test/__mocks__/@/lib/db.ts only.

**Interfaces:** type AnalysesRoute = typeof import('@/app/api/analyses/route'); fixed typed fixtures plus exact 500/error branch.

- [ ] **Step 1: Turn no-op into RED then implement**

~~~ts
const analysisFixture = { id: 'analysis-1', slug: 'first-analysis', title: 'First analysis', authorId: 'author-1', contentMdx: '# First' };
expect(response.status).toBe(200);
expect(await response.json()).toEqual([expect.objectContaining(analysisFixture)]);
~~~

Use static imports or jest.resetModules plus await import, never require/any. Mock full fixture; failure asserts exactly 500/error, not [200,500]. Collections require:

~~~ts
expect(result).toHaveLength(1);
expect(result[0]).toMatchObject({ id: 'author-1', slug: 'first-author' });
~~~

If a genuine production defect appears, stop and create a separately reviewed RED task; do not edit lib in this task.

- [ ] **Step 2: Verify and commit**

~~~bash
npx jest --runInBand --runTestsByPath test/integration/api/analyses-comprehensive.test.ts test/unit/lib/database-utils.test.ts
npx eslint test/integration/api/analyses-comprehensive.test.ts test/unit/lib/database-utils.test.ts --max-warnings 0
git add test/integration/api/analyses-comprehensive.test.ts test/unit/lib/database-utils.test.ts test/__mocks__/@/lib/db.ts
git commit -m "test(data): make API and database contracts deterministic"
~~~

### Task 6: Remove remaining no-op assertions

**Files:** Create scripts/ci/with-disposable-app.sh; modify test/integration/pages/HydrationAndDataIntegration.test.tsx, test/integration/pages/HydrationAndDataIntegration.live.test.tsx, test/unit/components/SearchModal.test.tsx, test/unit/snapshot/verify-parity.test.ts, and test/integration/db/seed.live.test.ts; inspect but do not change test/unit/components/searchUtils.test.ts when both branches still assert.

**Interfaces:** fixture cards require data or explicit empty state; search overlay is required; snapshot report assertion is unconditional. `bash scripts/ci/with-disposable-app.sh <command> [args...]` exports `DATABASE_URL`, `LIVE_BASE_URL`, and `CYPRESS_baseUrl` for its child and cleans up one uniquely named MySQL container plus one captured server PID.

- [ ] **Step 1: Write RED assertions and implement**

For fixture-backed cards use `expect(cards.length).toBeGreaterThan(0)` before inspection; where no data is contractual, assert the rendered empty-state text. Replace optional overlay with:

~~~ts
const overlay = document.querySelector('.search-overlay');
expect(overlay).not.toBeNull();
fireEvent.click(overlay!);
~~~

Normalize snapshot report instead of conditional assertion:

~~~ts
const report = statSync(run.report, { throwIfNoEntry: false }) ? readFileSync(run.report, 'utf8') : '';
expect(report).not.toContain(sentinel);
~~~

Do not rewrite searchUtils data-driven if/else: both branches already assert. Retain seed.live runSeed early return as legitimate idempotent setup and assert count before/after seeding.

Create `with-disposable-app.sh` with `set -euo pipefail`, a container name `casn-quality-${$}-$(openssl rand -hex 6)-mysql`, `mktemp -d`, `mysql:8.4`, and a random loopback port (`-p 127.0.0.1::3306`). Its `EXIT/INT/TERM` trap kills only the captured server PID, removes only the exact container, and removes only its validated `casn-quality.*` temporary directory. Bound readiness to 180 seconds and fail immediately if MySQL or the server exits. Run migrations with `RUN_DB_MIGRATIONS=1` and `DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS`, run `npm run build`, start `node server.cjs` with `HOSTNAME=127.0.0.1 PORT=31337`, export the URLs/DSN, then execute `"$@"`.

- [ ] **Step 2: Verify and commit**

~~~bash
npx jest --runInBand --runTestsByPath test/integration/pages/HydrationAndDataIntegration.test.tsx test/unit/components/SearchModal.test.tsx test/unit/components/searchUtils.test.ts test/unit/snapshot/verify-parity.test.ts
bash scripts/ci/with-disposable-app.sh bash -c 'RUN_LIVE_TESTS=1 npx jest --runInBand --runTestsByPath test/integration/pages/HydrationAndDataIntegration.live.test.tsx test/integration/db/seed.live.test.ts'
git add scripts/ci/with-disposable-app.sh test
git commit -m "test(quality): require no-op assertion contracts"
~~~

### Task 7: Type production/server/MDX boundaries

**Files:** Modify app/api/articles/route.ts, app/autor/[slug]/page.tsx, app/analizy/[slug]/page.tsx, components/mdx/MDXContent.tsx, lib/server/{analyses,authors}.ts; test articles provider, analysis-slug page, MDX.

**Interfaces:** PageProps = { params: Promise<{ slug: string }> }; typed raw rows/projections; errorMessage(value: unknown): string.

- [ ] **Step 1: Add RED boundary contract and implementation**

~~~ts
const malformed: unknown = { id: 7 };
expect(() => toArticleResponse(malformed)).toThrow('Invalid article record');
type ArticleRawRow = { id: string; slug: string; title: string; authorId: string | null };
function errorMessage(value: unknown): string { return value instanceof Error ? value.message : String(value); }
~~~

Use getRawMany<ArticleRawRow>(), catch unknown, PageProps, and React.ComponentPropsWithoutRef mappings; retain controlled not-found behavior.

- [ ] **Step 2: Verify and commit**

~~~bash
npx jest --runInBand --runTestsByPath test/unit/api/articles.route.providers.test.ts test/unit/app/analysis-slug-page.test.tsx test/unit/components/MDXContent.test.tsx
npm run type-check
npx eslint app/api/articles/route.ts app/autor/[slug]/page.tsx app/analizy/[slug]/page.tsx components/mdx/MDXContent.tsx lib/server/analyses.ts lib/server/authors.ts --max-warnings 0
git add app components lib test && git commit -m "refactor(types): make application and MDX boundaries explicit"
~~~

### Task 8: Move legacy CSS to ordered wrapper

**Files:** Modify app/layout.tsx, app/legacy.css; create cypress/e2e/legacy-css.cy.ts.

**Interfaces:** globals.css then legacy.css; no manual stylesheet link.

- [ ] **Step 1: Write computed-style and HTTP contracts**

~~~ts
const urls = ['/css/legacy/bootstrap.min.css','/css/legacy/style.css','/css/legacy/menu.css','/css/legacy/owl.carousel.css','/css/legacy/owl.theme.css','/css/legacy/owl.transitions.css','/css/legacy/themify-icons.css','/css/legacy/magnific-popup.css'] as const;
urls.forEach((url) => cy.request(url).its('status').should('eq', 200));
cy.get('body').should('have.css', 'font-family', 'Roboto, sans-serif');
cy.get('#topnav').should('be.visible').find('.navigation-menu > li > a').first().should('have.css', 'color', 'rgb(255, 255, 255)');
cy.get('.row').first().should('have.css', 'display', 'flex');
cy.get('.btn-custom').first().should('have.css', 'background-color', 'rgb(208, 0, 0)').and('have.css', 'color', 'rgb(255, 255, 255)');
~~~

Use the reusable Task 6 harness, which starts the app on `127.0.0.1:31337`. Run `bash scripts/ci/with-disposable-app.sh npm run test:e2e -- --spec cypress/e2e/legacy-css.cy.ts` for initial GREEN. Temporarily remove links without importing the wrapper, rebuild through the harness, and record the expected computed-style RED; immediately restore the file. Then import `./legacy.css` immediately after `./globals.css`, delete the suppression/eight links, and rerun the same harness command to GREEN. Preserve URL order; never use production or port 3000.

- [ ] **Step 2: Verify and commit**

~~~bash
npx eslint app/layout.tsx --max-warnings 0
npm run build
bash scripts/ci/with-disposable-app.sh npm run test:e2e -- --spec cypress/e2e/legacy-css.cy.ts
git add app/layout.tsx app/legacy.css cypress/e2e/legacy-css.cy.ts && git commit -m "refactor(css): import ordered legacy styles through root layout"
~~~

### Task 9: Enable Next Image at the first-party boundary

**Files:** Modify components/SafeImage.tsx, test/unit/components/SafeImage.test.tsx, test/__mocks__/nextImageMock.tsx, test/unit/app/authors-client.test.tsx.

**Interfaces:** SafeImageProps = Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> & { src: string; alt: string }.

- [ ] **Step 1: Capture image RED**

~~~tsx
render(<SafeImage src="/images/example.png" alt="Example" width={80} height={60} />);
expect(screen.getByRole('img', { name: 'Example' })).toHaveAttribute('width', '80');
~~~

Replace production raw img with `next/image` and set `unoptimized={true}` because SafeImage accepts CMS/public dynamic URLs. Raw img remains only in the exact test renderer. Assert alt, src, width, and height before commit:

~~~bash
npx jest --runInBand --runTestsByPath test/unit/components/SafeImage.test.tsx test/unit/app/authors-client.test.tsx
npx eslint components/SafeImage.tsx test/unit/components/SafeImage.test.tsx test/unit/app/authors-client.test.tsx --rule '@next/next/no-img-element:error' --max-warnings 0
bash scripts/ci/with-disposable-app.sh npm run test:e2e:hydration
git add components/SafeImage.tsx test/unit/components/SafeImage.test.tsx test/__mocks__/nextImageMock.tsx test/unit/app/authors-client.test.tsx && git commit -m "refactor(images): use Next Image at first-party boundaries"
~~~

### Task 10: Enable React hook safety rules one at a time

**Files:** Modify components/EmailLink.tsx, app/analizy/page.tsx, eslint.config.mjs; create test/unit/components/EmailLink.test.tsx and test/unit/app/analyses-page.test.tsx; modify test/integration/pages/AnalysesPage.live.test.tsx.

**Interfaces:** EmailLink has client mailto contract without synchronous effect state; AnalysesPage has explicit success/error UI without JSX constructed inside catch.

- [ ] **Step 1: Enable set-state-in-effect alone**

Set exact temporary rule state:

~~~js
'react-hooks/set-state-in-effect': 'error',
'react-hooks/error-boundaries': 'off',
~~~

Run `npx eslint components/EmailLink.tsx --max-warnings 0`; expected RED at line 21. Preserve SSR-empty/email-obfuscation contract with `const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);`, return null when not mounted, assert `renderToStaticMarkup(<EmailLink ... />) === ''`, then assert hydrated mailto link. Stop on material regression.

~~~bash
npx jest --runInBand --runTestsByPath test/unit/components/EmailLink.test.tsx
npx eslint components/EmailLink.tsx --max-warnings 0
~~~

- [ ] **Step 2: Enable error-boundaries alone**

Set exact rule state:

~~~js
'react-hooks/set-state-in-effect': 'error',
'react-hooks/error-boundaries': 'error',
~~~

ESLint AnalysesPage must RED at 48,49,58–64,70–72,76–79,100. Test success link and failure text. Use discriminated result:

~~~ts
type AnalysesLoadResult = { kind: 'ready'; analyses: Analysis[] } | { kind: 'error' };
let result: AnalysesLoadResult;
try { result = { kind: 'ready', analyses: await getAnalyses() }; }
catch (error: unknown) { console.error('Analyses page error:', error); result = { kind: 'error' }; }
if (result.kind === 'error') return <AnalysesLoadError />;
return <AnalysesList analyses={result.analyses} />;
~~~

All JSX is outside try/catch. Run focused Jest/lint; stop rather than exception on material regression, then:

~~~bash
npx jest --runInBand --runTestsByPath test/unit/app/analyses-page.test.tsx
npx eslint app/analizy/page.tsx components/EmailLink.tsx --max-warnings 0
bash scripts/ci/with-disposable-app.sh bash -c 'RUN_LIVE_TESTS=1 npx jest --runInBand --runTestsByPath test/integration/pages/AnalysesPage.live.test.tsx'
git add components/EmailLink.tsx app/analizy/page.tsx eslint.config.mjs test/unit/components/EmailLink.test.tsx test/unit/app/analyses-page.test.tsx test/integration/pages/AnalysesPage.live.test.tsx && git commit -m "fix(react): enable tested hook safety rules"
~~~

### Task 11: Remove broad ESLint overrides and wire green policy

**Files:** Modify eslint.config.mjs, quality-debt-policy.sh, first-party policy, package.json; verify quality action is unchanged when it already has the exact lint/policy sequence.

**Interfaces:** accepted ignores/presets only; exact mock-only no-img exception; first-party policy called by quality:policy.

- [ ] **Step 1: Capture final config RED**

Delete current override blocks lines 22–86, retain ignores/presets, set final rules errors:

~~~js
{
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-require-imports': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/no-var-requires': 'error',
    '@next/next/no-assign-module-variable': 'error',
    '@next/next/no-css-tags': 'error',
    '@next/next/no-img-element': 'error',
    'react-hooks/error-boundaries': 'error',
    'react-hooks/set-state-in-effect': 'error',
  },
},
{
  files: ['test/__mocks__/nextImageMock.tsx'],
  rules: { '@next/next/no-img-element': 'off' },
},
~~~

~~~bash
npx eslint . --ext .ts,.tsx,.js,.jsx,.cjs --no-inline-config --max-warnings 0
bash scripts/ci/first-party-quality-policy.sh .
~~~

Expected: any red is an earlier source defect, never reason to restore override.

- [ ] **Step 2: Wire after GREEN and commit**

Permit no-img-element only for test/__mocks__/nextImageMock.tsx; fixture has a valid exact-file case and rejects the rule anywhere else. Add first-party-quality:policy, call it after runtime checks, verify the action remains exactly npm run lint then npm run quality:policy, with no rewrite flags. Add the action to git only when modified.

~~~bash
npm run first-party-quality:policy:test
npm run first-party-quality:policy
npm run quality:policy
npx eslint . --ext .ts,.tsx,.js,.jsx,.cjs --no-inline-config --max-warnings 0
rg -n 'eslint-disable|eslint-enable|@ts-ignore|@ts-expect-error|\.(skip|only)\b' app components lib scripts test cypress jest.setup.ts cypress.config.ts server.cjs
git add eslint.config.mjs scripts/ci/quality-debt-policy.sh scripts/ci/first-party-quality-policy.sh package.json
git diff --quiet -- .github/workflows/quality-checks/action.yml || git add .github/workflows/quality-checks/action.yml
git commit -m "fix(quality): enforce first-party zero-debt policy"
~~~

### Task 12: Full local acceptance and cleanup proof

**Files:** No source edit; return any failure to owning task.

**Interfaces:** unique MySQL container, captured server PID and temporary directory, local app at 127.0.0.1:31337; produces local evidence only.

- [ ] **Step 1: Run static gates**

~~~bash
npm ci
npm run runtime:policy:test && npm run runtime:policy
npm run first-party-quality:policy:test && npm run first-party-quality:policy && npm run quality:policy
npm run type-check && npm run lint && npm run test:ci -- --coverage --watchAll=false && npm run build
npm run audit:policy && npm run check:posts && npm run check:cms-mdx-media
npm run compose:policy && npm run deploy:policy
bash scripts/ci/assert-no-deployment-db-mutation.sh && bash scripts/ci/remote-deploy-rollback-test.sh
git diff --check
~~~

Expected: zero warnings, zero skipped first-party behavior suites, configured coverage thresholds satisfied, and no checkout rewrite.

- [ ] **Step 2: Run unique disposable live/E2E and cleanup**

~~~bash
test -z "$(ss -ltn '( sport = :31337 )' | tail -n +2)"
casn_quality_id="$(date +%s)-$$-$(openssl rand -hex 4)"
casn_quality_mysql="casn-quality-${casn_quality_id}-mysql"
casn_quality_app="casn-quality-${casn_quality_id}-app"
casn_quality_network="casn-quality-${casn_quality_id}-network"
casn_quality_image="casn-quality-image:${casn_quality_id}"
casn_quality_tmp="$(mktemp -d "${TMPDIR:-/tmp}/casn-quality.XXXXXXXX")"
cleanup_quality_image() {
  docker rm -fv "$casn_quality_app" "$casn_quality_mysql" >/dev/null 2>&1 || true
  docker network rm "$casn_quality_network" >/dev/null 2>&1 || true
  docker image rm "$casn_quality_image" >/dev/null 2>&1 || true
  case "$casn_quality_tmp" in "${TMPDIR:-/tmp}"/casn-quality.*) rm -rf -- "$casn_quality_tmp" ;; *) return 1 ;; esac
}
trap cleanup_quality_image EXIT INT TERM
docker network create "$casn_quality_network"
docker run -d --name "$casn_quality_mysql" --network "$casn_quality_network" --network-alias mysql \
  -e MYSQL_ROOT_PASSWORD=casn-quality-root -e MYSQL_DATABASE=casn_quality \
  -e MYSQL_USER=casn_quality -e MYSQL_PASSWORD=casn-quality-pass \
  -p 127.0.0.1::3306 mysql:8.4
timeout 180 bash -c 'until docker exec "$1" mysqladmin ping -h 127.0.0.1 -ucasn_quality -pcasn-quality-pass --silent; do sleep 2; done' _ "$casn_quality_mysql"
casn_quality_mysql_port="$(docker port "$casn_quality_mysql" 3306/tcp | sed 's/.*://')"
DATABASE_URL="mysql://casn_quality:casn-quality-pass@127.0.0.1:${casn_quality_mysql_port}/casn_quality" \
  RUN_DB_MIGRATIONS=1 DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS npm run migration:run
docker build -t "$casn_quality_image" .
docker run -d --name "$casn_quality_app" --network "$casn_quality_network" \
  -p 127.0.0.1:31337:3000 -e NODE_ENV=production -e PORT=3000 \
  -e DB_HOST=mysql -e DB_PORT=3306 -e DB_USER=casn_quality \
  -e DB_PASSWORD=casn-quality-pass -e DB_NAME=casn_quality "$casn_quality_image"
timeout 180 bash -c 'until curl -fsS http://127.0.0.1:31337/api/health >/dev/null; do test "$(docker inspect -f "{{.State.Running}}" "$1")" = true; sleep 2; done' _ "$casn_quality_app"
docker exec "$casn_quality_app" sh -c 'test -f /app/server.cjs && test -f /app/dist/runtime/server.js && test ! -e /app/lib'
LIVE_BASE_URL=http://127.0.0.1:31337 RUN_LIVE_TESTS=1 npm run test:integration:live
CYPRESS_baseUrl=http://127.0.0.1:31337 npm run test:e2e
cleanup_quality_image
trap - EXIT INT TERM
npm run directus:smoke
docker ps -a --format '{{.Names}}' | rg '^casn-quality-' && exit 1 || true
docker network ls --format '{{.Name}}' | rg '^casn-quality-' && exit 1 || true
docker image ls --format '{{.Repository}}:{{.Tag}}' | rg '^casn-quality-image:' && exit 1 || true
ss -ltn '( sport = :31337 )' | tail -n +2 | rg . && exit 1 || true
git status --short --branch
~~~

Expected: live Jest and every Cypress including legacy-css pass; Docker listings empty. Run directus:smoke separately only with its existing disposable-resource contract; never touch pre-existing casn-directus, production host/volume, or port 3000.

## Plan self-review

### Spec coverage mapping

| Spec requirement | Tasks |
| --- | --- |
| policy, directives, skips, broad overrides | 1, 11 |
| pages/components/no-op tests | 2, 3, 6 |
| setup, scripts, deterministic data | 4, 5 |
| production/MDX types | 7 |
| CSS, Image, React | 8, 9, 10 |
| complete local verification/cleanup | 11, 12 |

### No-placeholder and type-consistency review

- No prohibited placeholder or deferred-implementation marker appears.
- Policy root, EdgeFetchPrimitives, AnalysesRoute fixture, PageProps, AnalysesLoadResult, mock exception, and local port interfaces are defined before later use.
- Source quality/UI/test scope only; CSRF/webhook, transport, messaging/jobs, CQRS/DDD, migrations, deployment, and rollback remain unchanged.
