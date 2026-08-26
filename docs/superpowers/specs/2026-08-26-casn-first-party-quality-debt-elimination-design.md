# CASN First-Party Quality-Debt Elimination Design

**Date:** 2026-08-26

**Status:** Approved

## Goal

Eliminate the remaining first-party ESLint suppressions, silent Jest skips,
conditional no-op assertions, and project-authored broad rule exceptions. The
result must make missing modules, invalid boundary data, weak tests, and React or
Next violations fail visibly without moving debt from source comments into
`eslint.config.mjs`.

## Relationship to the runtime-boundary work

The TypeScript runtime boundary is a prerequisite and remains specified and
planned separately:

- `docs/superpowers/specs/2026-08-26-casn-typescript-runtime-boundary-design.md`;
- `docs/superpowers/plans/2026-08-26-casn-typescript-runtime-boundary.md`.

That work removes tracked runtime JavaScript copies, source-directory compiler
output, and runtime CommonJS lint exceptions. This specification begins after
that boundary is green and addresses the remaining application, component,
script, setup, and test debt. Keeping the plans separate prevents a CSS or test
failure from obscuring the correctness of the production runtime artifact.

## Verified starting inventory

Running ESLint over the current first-party tree with inline configuration
disabled and the four hidden rules forced to errors produced 106 diagnostics:

- 42 `@typescript-eslint/no-require-imports` violations;
- 36 `@typescript-eslint/no-explicit-any` violations;
- 20 `@typescript-eslint/no-unused-vars` violations;
- 8 `@next/next/no-css-tags` violations.

The checked-in register identifies eight runtime-source suppression files,
fifteen test files with suppressions, and ten conditional Jest suite guards.
The live audit additionally found suppressions in `jest.setup.ts` and
`cypress.config.ts`, as well as project-authored broad exceptions in
`eslint.config.mjs`. Counts will be refreshed after merging the then-current
`origin/main` and completing the runtime-boundary plan; the acceptance condition
is based on zero prohibited constructs, not on preserving the historical count.

## What counts as debt

The following first-party mechanisms are prohibited at acceptance:

- inline `eslint-disable`, `eslint-disable-next-line`, or file-level suppression;
- conditional `(hasComponent ? describe : describe.skip)` or equivalent skip
  selected because an owned import failed;
- an assertion hidden behind `if (element)`, `if (components.length)`, or an
  early return that lets the test pass without exercising its named behavior;
- `any` used to bypass a boundary, mock shape, Page props, TypeORM result, MDX
  component contract, or caught error;
- `require()` in TypeScript, application source, Jest setup, or owned-component
  tests;
- project-authored rule classes that switch off explicit-any, unused variables,
  TypeScript comments, imports, Next image/style rules, or React hook safety for
  broad directories;
- warnings accepted by lint or CI quality steps that rewrite the checkout.

This does not classify every `off` value inherited from official Next,
React, or TypeScript ESLint presets as debt. Those presets deliberately disable
base JavaScript rules that are replaced by type-aware equivalents, React
runtime rules not applicable to modern TypeScript/JSX, or framework-internal
duplicates. The quality policy distinguishes inherited preset behavior from
project-authored overrides in this repository.

Generated `.next`, coverage, `dist`, TypeScript declarations, dependencies, and
explicit vendor/generated clients remain ignored. The checked-in Directus
extension bundle remains linted because it is the deployed source of truth and
has no reproducible source/build counterpart.

## Executable zero-suppression policy

The existing quality policy gains a focused first-party source checker with a
fixture-based behavior test. The checker scans the configured first-party
source extensions while excluding only the accepted generated/vendor paths. It
fails on:

- inline ESLint directives;
- `.skip` or `.only` in Jest/Cypress source;
- conditional selection of a skipped suite;
- project-authored broad rule disables named above;
- lint scripts lacking `--max-warnings 0`;
- active workflows that omit lint and policy checks or invoke `--fix`/`--write`.

The policy is tested against controlled temporary fixtures. Each fixture adds
one forbidden construct and asserts the checker's exit code and diagnostic; a
valid fixture must pass. Tests do not merely assert that the checker source
contains a particular regular expression.

Conditional test selection through Jest's explicit `testPathIgnorePatterns`
for `*.live.test.*` remains allowed. The default suite excludes real external
I/O; `RUN_LIVE_TESTS=1` selects those files in the separately required live
gate. This is visible suite topology, not a runtime `skip`, and both commands
are exercised in CI/local acceptance.

## Typed application boundaries

Every current `any` is replaced according to the boundary it represents:

- Next page props use explicit `Promise<{ slug: string }>` parameter shapes;
- caught values are `unknown` and inspected with `instanceof Error` or a small
  named guard before reading `message`, `stack`, or framework sentinel fields;
- TypeORM raw-query rows use named row interfaces and generic
  `getRawMany<Row>()` results;
- entity relation results use the schema's domain types or a named projection
  type rather than casting the entity to `any`;
- MDX component mappings use React intrinsic prop types and the MDX component
  map type exported by the installed MDX packages;
- Jest mocks use `jest.MockedFunction`, `jest.Mocked`, `typeof import(...)`, or
  a named minimal port type;
- invalid-input tests use `unknown` at the public boundary rather than casting a
  deliberately impossible value to `any`.

Validation is placed at real untyped boundaries. Internal values already
created by typed code are not wrapped in redundant runtime schemas solely to
satisfy lint.

## Static imports and deterministic tests

Owned application pages and components are imported statically at module scope.
An import failure must fail the suite during module loading. The ten
`hasComponent`/`hasComp` variables, surrounding try/catch blocks, dynamic
`require()` calls, and conditional `describe.skip` selectors are removed.

Tests use required queries when the named behavior requires an element:

- `getByRole`, `getByText`, and `getByTitle` replace `queryBy*` plus `if`;
- required collections assert a literal minimum before inspecting entries;
- optional behavior is tested only when optionality is an explicit product
  contract, with separate positive and negative scenarios;
- tests that only assert a render container exists are replaced with an
  accessible role, text, link, state transition, or intentional `null` output;
- `expect(() => render(...)).not.toThrow()` is retained only when error-free
  acceptance is itself the component's public contract and another assertion
  verifies its output.

Header tests must require the menu toggle and navigation links rather than
silently doing nothing. Footer, CTA, ArticleLayout, page, image, chart, and map
tests assert their observable contracts. Existing assertion coverage is not
reduced to make stricter imports pass.

Live page tests use static application imports where the test renders source
code and HTTP requests where the test claims to verify the live server. They do
not mix a live label with a local mock-only assertion.

## Jest, Cypress, and script module cleanup

`jest.setup.ts` replaces conditional `require()` calls with typed Jest module
access or static imports at a level that preserves polyfill ordering and does
not initialize a database for suites that never use one. Global fetch uses a
typed mock compatible with `typeof fetch`. Datasource teardown targets only the
canonical TypeScript datasource left by the runtime-boundary plan.

`cypress.config.ts` removes the empty `setupNodeEvents` callback instead of
suppressing its unused parameters. If a later event hook is needed, it must use
both parameters or intentionally expose only the parameters it consumes.

`scripts/prepare-tmp.js` becomes an ESM script with static `node:fs` and
`node:path` imports and an explicit `.mjs` filename. `postbuild` references that
exact file. No broad `.cjs` or script-directory import exception is retained to
support this one script.

Test-only dynamic module reloads use Jest's typed module APIs or dynamic
`import()`. Environment-isolation tests retain `jest.resetModules()` where the
module reads environment variables at import time.

## Legacy CSS ownership

The eight manual stylesheet links in `app/layout.tsx` are removed. The existing
`app/legacy.css` wrapper is imported once from the root layout immediately after
`globals.css`; it retains the same ordered eight public `/css/legacy/*.css`
imports. Vendor CSS remains under `public/` and is not rewritten or duplicated.

Before changing ownership, browser tests record hand-checked literal computed
style contracts for representative behaviors affected by the legacy stack:

- root typography;
- header/navigation visibility and contrast;
- Bootstrap row/column display;
- primary legacy button presentation.

The same assertions must pass after the wrapper import. The production build
must contain the wrapper and all eight public styles must return HTTP 200 in the
disposable live server. This guards load order and asset availability without
testing Next's implementation details.

The `@next/next/no-css-tags` suppression is then removed and the rule remains an
error.

## Project-authored ESLint overrides

Project-specific broad blocks for tests, MDX, API routes, `lib`, scripts, and
tracked CommonJS bridges are removed as their violations are fixed. In
particular, the final configuration must not broadly disable:

- `@typescript-eslint/no-explicit-any`;
- `@typescript-eslint/no-require-imports`;
- `@typescript-eslint/no-unused-vars`;
- `@typescript-eslint/ban-ts-comment`;
- `@typescript-eslint/no-var-requires`;
- `@next/next/no-assign-module-variable`;
- `@next/next/no-css-tags`.

The project-authored global disables for `@next/next/no-img-element`,
`react-hooks/error-boundaries`, and `react-hooks/set-state-in-effect` are enabled
one at a time. Each produces a captured RED diagnostic before source changes.
First-party images migrate to `next/image` with `unoptimized` only where remote
or CMS variability requires it; hook violations are corrected by moving error
handling to boundaries and deriving state during render or events rather than
blindly suppressing the rule.

If a required public behavior cannot satisfy one of those three rules without a
material product or performance regression, implementation stops at that rule
and reports the exact file, upstream contract, attempted alternatives, and
focused test evidence. No exact-file exception is added without new user
approval.

All active rules run with zero warnings. Rule severity is not lowered to make
the gate pass.

## Test-first sequence

1. Add the fixture-tested zero-suppression policy and observe it reject the
   current repository.
2. Complete the TypeScript runtime-boundary plan so generated CommonJS and
   runtime exceptions leave the inventory.
3. Convert the ten owned-component/page suites to static imports, one suite at
   a time, and watch strengthened assertions fail for the expected reason before
   fixing production behavior.
4. Type test helpers, mocks, Jest setup, Cypress config, and the postbuild script
   while keeping focused suites green.
5. Replace application and database `any` boundaries with named types or
   `unknown` narrowing, with unit tests for every new guard and error branch.
6. Add browser-visible legacy CSS contracts, observe RED when the manual links
   are removed without wrapper ownership, then import the wrapper and restore
   GREEN.
7. Enable and resolve project-authored React/Next rules one at a time.
8. Remove now-unnecessary broad ESLint blocks, run strict lint without inline
   config, and make the repository-level zero-suppression policy pass.

Tests are evidence of behavior and the recorded RED/GREEN cycles prove TDD for
new changes. Existing tests and coverage alone are not described as historical
TDD or BDD. Cypress and accessible Jest scenarios are executable behavior
contracts, but the repository is not labeled globally BDD solely because those
tests exist.

## Verification and acceptance

Acceptance requires fresh results from the final clean tree:

- `npm ci`;
- runtime-source policy tests and the full first-party zero-suppression policy;
- ESLint over all first-party source with `--max-warnings 0`, no inline config,
  and zero warnings;
- an inventory command returning zero prohibited inline directives, conditional
  skips, `.only`, and no-op conditional assertions;
- TypeScript typecheck;
- full Jest coverage with zero skipped first-party behavior tests and no reduced
  threshold;
- production build;
- disposable live integration tests;
- all Cypress specs with zero pending/skipped scenarios;
- HTTP 200 for all eight legacy styles and the computed-style behavior checks;
- dependency audit, content, and CMS-media policies;
- Directus smoke with resource cleanup;
- Compose, immutable deployment, no-database-mutation, and rollback policies;
- Docker image build and health against disposable migrated MySQL;
- `git diff --check`, exact temporary-resource cleanup, and a clean worktree.

The only pre-approved lint-tooling exception remains the separately documented,
CI-expiring ESLint 9.39.5 compatibility window through 2026-09-30. Its warning
stays visible and the policy fails after the deadline. No other new exception is
accepted by this specification.

## Architectural applicability

The changes affect source quality, HTTP-rendered UI, the custom Node runtime,
and test execution. They do not introduce commands, events, background jobs,
message brokers, CQRS, or new bounded contexts. DDD and ports/adapters claims do
not change. CSRF remains inapplicable to the secret-authenticated revalidation
webhook because it has no cookie/session ambient authority. HTTP route,
webhook-secret, migration, deployment, and rollback contracts remain covered by
their existing integration and policy gates.

## Risks and controls

- **Tests reveal real defects:** fix the production behavior only after a
  focused failing assertion proves the defect; do not weaken the assertion.
- **CSS order changes:** preserve wrapper import order and validate computed
  styles plus live asset responses before and after.
- **Image behavior changes:** verify dimensions, alt text, remote/CMS URLs, and
  hydration in Jest and Cypress before enabling the Next rule globally.
- **Hook fixes alter timing:** test visible initial and post-interaction state;
  do not move side effects merely to evade lint.
- **Mock typing changes behavior:** mocks mirror complete real boundary shapes,
  and assertions target the real component behavior rather than mock existence.
- **Updated `origin/main`:** merge only freshly fetched `origin/main` after
  separate authorization, preserve accepted snapshot/header changes, and rerun
  the baseline before implementation.

## Authorization boundary

All source work and verification remain local to the isolated hardening
worktree. The user has approved this design scope but has not yet authorized a
local merge from the newly advanced `origin/main`. No push, pull request, merge,
remote deployment, production access, production database mutation, or changes
to another worktree occur without the required separate authorization. Live
verification uses disposable local resources only.
