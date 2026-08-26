# CASN TypeScript Runtime Boundary Design

**Date:** 2026-08-26

**Status:** Approved in principle; awaiting review of this written contract

## Goal

Make TypeScript the only checked-in source of truth for the custom CASN Node
runtime. Build its CommonJS artifacts reproducibly into an ignored
`dist/runtime/` directory, prevent compiler output from overwriting source
directories, and remove tracked JavaScript copies and obsolete runtime bridges
without weakening database startup or migration safety.

## Current state

The production entrypoint is the hand-written `server.cjs`. It loads
`lib/db.shared.js` and `lib/server/startup-database.js` directly. The current
`build:lib` command invokes TypeScript with `--outDir .`, so compilation writes
JavaScript beside TypeScript source. It creates ignored entity and migration
files and overwrites the tracked `lib/db.shared.js` file.

The source inventory is not uniform:

- `lib/db.shared.ts` and tracked `lib/db.shared.js` are a source/output pair;
- `lib/server/migration-policy.ts` and tracked
  `lib/server/migration-policy.js` are a source/output pair;
- `lib/server/startup-database.js` is hand-written JavaScript with no current
  TypeScript counterpart;
- `lib/db.node.js` and `lib/init-db.js` are legacy CommonJS paths referenced by
  legacy tests and Jest teardown, while application code uses the TypeScript
  `db.shared`, `db.server`, and `server/init-db` paths;
- entity and migration JavaScript files are untracked compiler output already
  ignored narrowly by Git and ESLint.

This mixture makes a clean checkout depend on build side effects, permits
tracked JavaScript to drift from TypeScript, and forces broad CommonJS lint
exceptions over first-party runtime source.

## Target architecture

Checked-in runtime source consists only of TypeScript plus a minimal stable
launcher:

- `server.ts` owns the HTTP/Next bootstrap and fail-closed database startup;
- `lib/db.shared.ts` remains the canonical application datasource;
- `lib/server/startup-database.ts` becomes the typed startup readiness policy;
- `lib/server/migration-policy.ts` remains the canonical explicit migration
  gate used by the operator migration runner;
- entity and migration classes remain canonical TypeScript sources.

A new `tsconfig.runtime.json` compiles the graph rooted at `server.ts` into
`dist/runtime/` using Node-compatible CommonJS and ES2022. It must not emit into
`lib/`, `migrations/`, or the repository root. The expected production entry is
`dist/runtime/server.js`; its imported datasource, entities, migrations, and
startup policy retain their relative directory structure beneath
`dist/runtime/`.

`server.cjs` remains only as the stable command/deployment entrypoint requested
by the current runtime surfaces. It contains no database logic and no
`require()` calls: it dynamically imports `dist/runtime/server.js` and exits
non-zero if the compiled entry cannot be loaded. This lets existing Compose,
workflow, and operator commands retain `node server.cjs` while removing the
CommonJS lint exception from hand-written runtime logic.

`dist/runtime/` is ignored by Git and ESLint as reproducible compiler output.
No generated JavaScript under `dist/` is linted; its TypeScript source is linted
and typechecked instead.

## Legacy bridge removal

The following tracked JavaScript files are removed:

- `lib/db.shared.js`, replaced at runtime by
  `dist/runtime/lib/db.shared.js`;
- `lib/server/migration-policy.js`, because migration commands and tests consume
  the canonical TypeScript module through `tsx` or Jest;
- `lib/server/startup-database.js`, replaced by the new TypeScript source and
  its `dist/runtime` artifact;
- `lib/db.node.js` and `lib/init-db.js`, after their remaining tests and Jest
  teardown are moved to canonical TypeScript modules.

Removal must be reference-driven. Before each deletion, repository tests and
policy checks must prove that active application, migration, build, Compose,
Docker, and deployment surfaces no longer load the path. Historical design and
plan documents may describe filenames that were valid at the time and are not
runtime consumers.

The existing behavior coverage in `db.node.test.ts` is not discarded. Unique
datasource parsing and fail-closed migration assertions move to tests for
`db.shared.ts`, `db.server.ts`, or `migration-policy.ts`; duplicated assertions
are removed only after equivalent canonical coverage is green.

## Build and image contract

`package.json` gains a `build:runtime` command backed only by
`tsconfig.runtime.json`. The main build runs `build:runtime` before `next build`.
A clean build must create `dist/runtime/server.js` and its dependency graph
without creating or modifying JavaScript under `lib/` or `migrations/`.

The production image copies:

- `.next/` and `public/` for the Next application;
- production `node_modules/`;
- the stable `server.cjs` launcher;
- `dist/runtime/` for the custom Node runtime;
- `posts/` for current runtime content loading.

It no longer copies source `lib/` or `migrations/` merely to obtain generated
CommonJS files. Deployment continues to use immutable, exact-revision images;
there is no change to image tagging, GHCR authentication, health gates, or
rollback provenance.

## Database and migration safety

The refactor preserves these observable contracts:

- the server does not listen until the configured database initializes;
- missing database configuration and unavailable databases stop startup;
- application startup never runs migrations;
- migrations remain a separate `tsx scripts/run-migrations.ts` operation;
- migrations require both `RUN_DB_MIGRATIONS=1` and
  `DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS`;
- deployment and artifact rollback never mutate the application database or
  Directus metadata.

The production runtime artifact includes migration classes because TypeORM's
datasource metadata references them, but their presence does not authorize or
trigger execution.

## Lint and quality policy

The quality policy will reject:

- `--outDir .` or another build output inside source directories;
- tracked JavaScript counterparts for the canonical runtime TypeScript files;
- active references to `lib/db.node.js` or `lib/init-db.js`;
- a missing or unignored `dist/runtime/` output directory;
- runtime source using inline ESLint suppression or `require()`;
- Docker/runtime commands that bypass the stable launcher or omit the compiled
  runtime artifact.

Policy tests execute the checker against controlled failing fixtures and assert
its exit status and diagnostics. They do not merely assert that a source file
contains a particular line.

This increment removes the runtime-output and CommonJS portion of the broader
quality-debt register. The separately approved cleanup of first-party `any`,
test suppressions, weak conditional assertions, and conditional Jest skips
continues as the next active frontier after this runtime boundary is green.

## Test-first implementation sequence

1. Add failing policy and build-contract tests that reject source-directory
   emission, tracked runtime JS pairs, legacy bridge references, and missing
   `dist/runtime` output.
2. Add a failing launcher contract proving that a missing compiled entry exits
   non-zero and a present entry is loaded.
3. Port `startup-database.js` to typed source and run its existing behavioral
   tests against the TypeScript module.
4. Introduce `server.ts` and `tsconfig.runtime.json`, then make the focused
   runtime build produce the expected isolated tree.
5. Move remaining consumers and unique tests away from `db.node.js` and
   `init-db.js` before deleting legacy files.
6. Delete tracked generated/legacy JavaScript, narrow lint configuration, and
   prove a clean build leaves source directories unchanged.
7. Update Docker and quality/deployment policies, then boot the built image
   against a disposable migrated MySQL database.

Every production behavior change starts with a failing test that names the
broken contract. Configuration-only steps are preceded by executable policy or
integration tests that fail against the old configuration.

## Verification and acceptance

Acceptance requires fresh evidence from the final clean tree:

- `npm ci`;
- runtime policy tests and `npm run quality:policy`;
- `npm run build:runtime` from a clean artifact state;
- proof that the build creates nothing under source `lib/` or `migrations/`;
- lint with zero warnings and no runtime CommonJS suppression;
- TypeScript typecheck;
- full Jest with zero skipped tests attributable to runtime modules;
- production Next build;
- Compose and deployment policies;
- Docker image build and health check against disposable migrated MySQL;
- live integration and full Cypress against that disposable runtime;
- dependency audit policy and `git diff --check`;
- exact cleanup of temporary containers, networks, volumes, ports, and logs;
- a clean worktree after committing the implementation.

Tests prove the observable runtime and build contracts, not historical TDD.
The work does not add CQRS, messaging/jobs, DDD boundaries, cookie sessions, or
browser-authorized mutations. CSRF remains inapplicable to the existing
secret-authenticated machine webhook.

## Risks and mitigations

- **Node module resolution:** moving output can break relative imports. The
  focused build test and real production boot exercise the emitted tree.
- **Docker omissions:** removing source directory copies can omit runtime data.
  The image smoke test starts the exact final stage, checks health, and exercises
  database-backed endpoints.
- **Legacy test coupling:** old tests may depend on module cache behavior of
  CommonJS bridges. Their behavioral contracts move to canonical modules before
  deletion; no assertion is removed solely to make the refactor pass.
- **Dirty output masking:** an earlier build can hide missing compiler outputs.
  CI and local verification remove only the exact ignored `dist/runtime`
  directory before rebuilding and verify the resulting manifest.

## Authorization boundary

All changes and verification remain local to
`codex/casn-hardening-20260826` in its isolated worktree. No push, pull request,
merge, remote deployment, production access, production database mutation, or
modification of another worktree is authorized. Live database verification uses
only disposable local resources and proves their cleanup.
