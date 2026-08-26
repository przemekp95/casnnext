# CASN quality-debt register

This register contains finite follow-up work discovered while closing the
remaining hardening exceptions on 2026-08-26. It is not a waiver: each item has
an explicit exit condition. The current increment removed broad `lib/` and
`migrations/` lint exclusions, all four unconditional Cypress skips, the custom
server suppression, and all lint warnings.

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

- **State:** deferred to the next isolated quality cleanup
- **Inventory:** eight source files

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

The page, API, MDX, and server suppressions cover broad `any` use or individual
boundary conversions. `app/layout.tsx` suppresses the Next stylesheet-tag rule.
`scripts/prepare-tmp.js` suppresses CommonJS imports instead of declaring its
module format explicitly.

- **Exit:** replace `any` with named boundary types or `unknown` plus narrowing;
  express the script's CommonJS format explicitly; resolve the stylesheet
  ownership without hiding the Next rule; remove every listed suppression; keep
  lint at zero warnings.

## QD-003: Test-file lint suppressions

- **State:** deferred to the next isolated quality cleanup
- **Inventory:** fifteen test files

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

Most file-level directives duplicate broad test overrides already present in
`eslint.config.mjs`, while two mock lines use narrow unused-variable directives.

- **Exit:** introduce typed Jest helpers and mock shapes, remove redundant
  file-level directives, narrow or remove the test-class overrides, and pass the
  complete Jest suite without reducing assertions.

## QD-004: Conditional Jest suite skipping

- **State:** deferred to the next isolated quality cleanup
- **Inventory:** ten `(hasComponent ? describe : describe.skip)` sites

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

These constructs can turn an import or repository-layout regression into a
silent skip. They did not create the four Cypress pending tests removed by the
current increment, but they remain a weaker failure mode.

- **Exit:** import each owned component normally, let missing modules fail the
  suite, remove every conditional `describe.skip`, and prove zero Jest skips in
  both clean-install CI and the production-build test gate.

## Not debt in this register

- MySQL DDL is not guaranteed to roll back atomically. Artifact rollback is
  automatic; database/Directus recovery is separately approved and backup-based.
- CSRF is not applicable to the secret-authenticated revalidation webhook because
  it does not use browser cookies or ambient session authority.
- CQRS, messaging/jobs, and DDD boundaries were not introduced or changed by
  this hardening increment.
