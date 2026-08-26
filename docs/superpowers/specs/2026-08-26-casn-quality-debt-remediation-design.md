# CASN quality-debt remediation design

**Date:** 2026-08-26

**Status:** Proposed

## Goal

Close the avoidable exceptions reported after the remaining CASN hardening
without hiding findings, weakening checks, or pretending that MySQL DDL can be
rolled back atomically. The result must make the checked-in quality gate stricter
and deterministic while preserving the already verified Directus, immutable
artifact, and exact-revision deployment contracts.

## Scope

This increment covers the exceptions explicitly reported for the hardening
branch:

- remove the broad ESLint exclusion of `lib/` and `migrations/`;
- make lint fail on warnings and remove the current Directus warning;
- replace the `server.js` inline suppression with an explicit module boundary;
- move from unsupported ESLint 9 to a supported ESLint 10 release compatible
  with the checked-in Next.js lint configuration;
- turn the four unconditional Cypress `it.skip` scenarios in
  `cypress/e2e/hydration.cy.ts` into deterministic executable coverage;
- ensure CI quality checks are verification-only and never rewrite the checkout;
- encode the deployment/database rollback boundary as an enforceable policy;
- remove the retained disposable local server log after verification.

The wider inventory of legacy test-file suppressions and conditional
`describe.skip` calls is recorded but intentionally deferred to a separate
repo-wide cleanup. This increment must not add any new inline lint suppression,
unconditional skip, mutable deployment reference, production mutation, or
automatic database rollback.

## Lint architecture

The `lint` and `lint:fix` scripts will use the flat `eslint.config.mjs` as the
single source of truth. The stale legacy `.eslintrc.json` will be removed after
equivalent relevant rules are confirmed or deliberately represented in the flat
configuration.

`lib/**/*.ts`, tracked `lib/**/*.js`, and `migrations/**/*.ts` are source and
must be linted. Only untracked JavaScript emitted by `build:lib` may be ignored.
The ignore patterns must identify those generated files narrowly instead of
excluding entire source directories. CommonJS files that are runtime source
will use an explicit `.cjs` boundary or a narrow flat-config file class; the
design preference is to rename the custom server entrypoint to `server.cjs` so
the module format is expressed by the filename rather than an inline disable.

The Directus hook has no separate source tree or build command: its checked-in
`dist/index.js` is the deployed source of truth. It therefore remains linted and
will use a named registration function before its default export. Generated
code may be excluded only when a reproducible source/build relationship exists.

Lint will run with `--max-warnings 0`. The composite quality action will call
the repository scripts and must not invoke Prettier or ESLint with `--write` or
`--fix`. A clean CI result must mean that the checkout already conforms.

## ESLint upgrade

Upgrade the exact root ESLint version and lockfile to the current supported
ESLint 10 release. Keep `eslint-config-next` aligned with the application Next.js
version unless compatibility evidence requires a coordinated Next.js patch
upgrade. The upgrade is accepted only if clean installation, lint, typecheck,
tests, audit, and production build all pass; dependency warnings or new rule
findings are fixed rather than suppressed.

## Deterministic Cypress scenarios

The four unconditional skips will be replaced with assertions that work against
the disposable migrated database used by the live verification:

1. author-card structure;
2. analysis-card structure;
3. authors/articles API contracts;
4. client-side navigation between the existing public routes.

Tests must not silently pass when zero cards exist. The repository migrations
already provide deterministic Author and Analysis fixtures, so card assertions
will first require at least one rendered item. Selectors will be aligned with
the current accessible/runtime markup rather than historical styling alone.
Navigation will start from a known route and assert each resulting pathname.

The live server address remains configurable. CI may retain port 3000 on its
isolated runner, while local verification uses an available loopback port via
`LIVE_BASE_URL` and the Cypress `baseUrl` override. Port selection is an
environment detail, not a skipped behavior.

## Deployment and database boundary

Artifact rollback continues to restore the previous exact Git revision,
mode-600 environment file, and digest-pinned app/Nginx images, then prove
internal and public health. It must continue to return a failing candidate
status even when restoration succeeds.

The deploy workflow must not run application migrations or Directus metadata
mutation. Deployment policy will assert that absence. Database migrations remain
a separately approved, double-gated operation using the existing reconciliation
runbook for capture, rehearsal, backup, and restore. This is the safe mitigation
for MySQL implicit DDL commits; automatic `migration:revert` during application
rollback is explicitly prohibited because it cannot provide atomic recovery.

The policy test will distinguish:

- **artifact rollback:** automated and health-verified;
- **database/Directus recovery:** operator-controlled from verified backup and
  reconciliation evidence.

This limitation remains documented as a platform property, not hidden as a
green transactional guarantee.

## Temporary artifacts

The retained mode-600 disposable server log will be inspected only for scope and
then deleted by its exact path. No wildcard or recursive cleanup is permitted.
Disposable test containers, networks, volumes, and listening ports must be
verified absent after every live run.

## Test-first sequence

1. Add policy assertions that fail while source directories are broadly ignored,
   warnings are accepted, CI mutates files, or deployment invokes migrations.
2. Run lint explicitly over the newly included source surfaces and capture RED.
3. Narrow generated-artifact ignores, express CommonJS boundaries, and remove
   actual lint findings until lint passes with zero warnings.
4. Upgrade ESLint and repeat installation/lint/typecheck before proceeding.
5. Remove one Cypress skip at a time, observe the focused failure, align the
   fixture/selector/route contract, and make it pass before the next scenario.
6. Run rollback behavior and deployment policy tests after the new database
   boundary assertion.
7. Delete the exact disposable log and verify its absence.

## Verification and acceptance

Acceptance requires fresh evidence from the final clean tree:

- `npm ci` without an unsupported-ESLint warning;
- lint over all tracked application, `lib`, migration, test, script, and checked-in
  Directus runtime sources with zero warnings;
- TypeScript typecheck;
- full Jest with coverage at or above the existing 70% line threshold;
- all Cypress specs with the four target scenarios executed and no target
  pending tests;
- disposable live integration tests;
- content and CMS media checks;
- dependency audit policy;
- production build;
- Directus smoke with verified resource cleanup;
- Compose and immutable deployment policies, including executable rollback;
- `git diff --check` and a clean worktree.

Any remaining legacy suppressions or conditional test skips outside this scope
will be enumerated explicitly for the follow-up cleanup. Tests are evidence of
behavior, not proof of historical TDD. This work does not introduce or change
CQRS, messaging/jobs, DDD boundaries, or cookie-authenticated browser actions;
CSRF remains inapplicable to the secret-authenticated machine webhook.

## Authorization boundary

All implementation and verification remain local to
`codex/casn-hardening-20260826`. No push, pull request, merge, remote deployment,
production access, database mutation outside disposable local resources, or
production log access is authorized by this design.
