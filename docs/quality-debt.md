# CASN quality-debt register

This register records the finite follow-up work discovered while closing the
remaining hardening exceptions on 2026-08-26. It is not a waiver: every active
item has an explicit exit condition. The quality-debt elimination increment
completed on 2026-08-28 resolved QD-002 through QD-004. QD-001 is the only
active item.

## Resolved runtime-output and CommonJS boundary

- **State:** resolved on 2026-08-26
- **Ownership:** TypeScript is the only runtime source of truth. The removed
  tracked JavaScript bridges are `lib/db.shared.js`,
  `lib/server/migration-policy.js`, `lib/server/startup-database.js`,
  `lib/db.node.js`, and `lib/init-db.js`.
- **Artifact boundary:** `tsconfig.runtime.json` emits only to the ignored
  `/dist/runtime/` directory. ESLint ignores `dist/**` as generated output but
  no longer ignores runtime-like paths beneath `lib/` or `migrations/`.
- **Lint boundary:** `server.cjs` no longer needs a runtime CommonJS override;
  the broad `lib/**/*.js` plus `**/*.cjs` override, the `lib/**/*.ts`
  `no-require-imports` exception, and the scripts/config-wide `**/*.cjs`
  exception are removed. The runtime-source fixture rejects their return.

This resolves the generated-output and runtime CommonJS exceptions. The
historical inventories for QD-002 through QD-004 are retained below as an audit
record and are no longer current suppressions or skips.

## QD-001: ESLint 9 upstream compatibility window

- **State:** accepted only through 2026-09-30
- **Current version:** exact `eslint@9.39.5`
- **Reason:** `eslint-config-next@16.3.3` currently installs React, import, and
  accessibility plugins whose peer ranges stop at ESLint 9. A direct ESLint
  10.9.0 attempt emitted peer-resolution warnings.
- **Control:** `npm run quality:policy` prints the exception on every run and
  fails automatically after 2026-09-30.
- **Exit:** install a supported ESLint release with no npm deprecation or peer
  warning while retaining the full Next/React/hooks/import/accessibility rule
  coverage; pass clean install, lint, typecheck, tests, audit, and build.

## QD-002: Runtime-source lint suppressions

- **State:** resolved on 2026-08-28
- **Historical inventory:** eight source files

```text
app/analizy/[slug]/page.tsx
app/api/articles/route.ts
app/autor/[slug]/page.tsx
app/layout.tsx
components/mdx/MDXContent.tsx
lib/server/analyses.ts
lib/server/authors.ts
scripts/prepare-tmp.js
```

The page, API, MDX, and server boundaries now use explicit types or narrowing;
the legacy stylesheet ownership is expressed through the ordered root wrapper;
and the preparation script has an explicit module boundary. Every listed
suppression is absent and the strict first-party lint gate passes with zero
warnings.

## QD-003: Test-file lint suppressions

- **State:** resolved on 2026-08-28
- **Historical inventory:** fifteen test files

```text
test/__mocks__/@/lib/db.ts
test/integration/api/analyses-comprehensive.test.ts
test/integration/pages/AnalysesPage.live.test.tsx
test/integration/pages/AuthorsPage.live.test.tsx
test/integration/pages/HomePage.test.tsx
test/integration/pages/KontaktPage.test.tsx
test/integration/pages/ZbioryPage.test.tsx
test/unit/components/ArticleLayout.test.tsx
test/unit/components/Chart.test.tsx
test/unit/components/CtaSection.test.tsx
test/unit/components/Footer.test.tsx
test/unit/components/Header.test.tsx
test/unit/components/Map.test.tsx
test/unit/components/SafeImage.test.tsx
test/unit/lib/database-utils.test.ts
```

Typed Jest helpers and mock shapes replaced the file-level directives and broad
test overrides. The complete clean-install Jest gate passes without reducing
assertions. The only disabled lint rule is the structurally enforced
`@next/next/no-img-element` exception for
`test/__mocks__/nextImageMock.tsx`, whose purpose is to emulate `next/image` as a
DOM `<img>` in Jest; it is not a general test-file suppression.

## QD-004: Conditional Jest suite skipping

- **State:** resolved on 2026-08-28
- **Historical inventory:** ten `(hasComponent ? describe : describe.skip)` sites

```text
test/integration/pages/HomePage.test.tsx
test/integration/pages/KontaktPage.test.tsx
test/integration/pages/ZbioryPage.test.tsx
test/unit/components/ArticleLayout.test.tsx
test/unit/components/Chart.test.tsx
test/unit/components/CtaSection.test.tsx
test/unit/components/Footer.test.tsx
test/unit/components/Header.test.tsx
test/unit/components/Map.test.tsx
test/unit/components/SafeImage.test.tsx
```

Each owned component is imported normally, so missing modules fail rather than
skip their suite. The conditional `describe.skip` constructs are absent. The
fresh clean-install acceptance gate executed 75/75 Jest suites and 569/569
tests, while Cypress executed 6/6 specs and 22/22 tests with zero pending or
skipped scenarios.

## Not debt in this register

- MySQL DDL is not guaranteed to roll back atomically. Artifact rollback is
  automatic; database/Directus recovery is separately approved and backup-based.
- CSRF is not applicable to the secret-authenticated revalidation webhook because
  it does not use browser cookies or ambient session authority.
- CQRS, messaging/jobs, and DDD boundaries were not introduced or changed by
  this hardening increment.
