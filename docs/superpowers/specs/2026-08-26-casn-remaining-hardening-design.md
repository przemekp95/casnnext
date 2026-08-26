# CASN Remaining Hardening Design

## Objective

Remove the remaining unsafe public write, bound and validate Directus cache
revalidation, make application startup and database migrations fail closed,
and restore the previous immutable deployment automatically when candidate
health checks fail.

The work is based on `origin/main` revision
`3205a2acb9a9244070730c0005be33002f780c95` and is implemented only on
`codex/casn-hardening-20260826` in the existing isolated linked worktree.

## Authority and non-goals

- Do not modify, stash, reset, or merge any other worktree or branch.
- Do not copy commit `6f74150` wholesale. Port only behavior that remains valid
  after the Directus, GHCR digest, and exact-revision changes on current main.
- Do not add `ARTICLES_ADMIN_TOKEN`, Strapi, `CMS_SYNC_SECRET`, or automatic
  production database mutation.
- Do not push, create a pull request, merge, publish images, or deploy.
- Do not contact or mutate production during implementation or verification.
- Do not automate database or Directus metadata rollback. That continues to
  require the protected snapshot procedure in `docs/deployment-reconciliation.md`.

## Public client logging

`POST /api/client-log` becomes a compatibility sink. It must not parse the
request, create a directory, append a file, or retain attacker-controlled
browser telemetry. It returns `204` with `Cache-Control: no-store` so already
cached clients do not create noisy failures. Removing the browser-side sender
is outside this change because it is a separate client-behavior decision.

## Directus revalidation webhook

Authentication happens before body consumption. The existing server-side
secret precedence and accepted transports remain stable: `REVALIDATE_SECRET`
with the current Directus fallback, `x-directus-secret`, the existing
`x-revalidate-secret`, or Bearer authentication. Body credentials remain
invalid.

An authenticated request body is read as a bounded stream with a 64 KiB
maximum. Both declared and streamed overflow return `413`. Malformed JSON or a
payload outside the runtime schema returns `400` without cache invalidation.
The schema bounds tag counts and string lengths while allowing Directus `key`
and `keys` fields to pass through unused. The current tag/path inference and
successful response remain stable.

## Database startup and migrations

The production server treats the database as a required dependency. Missing
configuration, a null datasource, failed initialization, or failed `SELECT 1`
prevents `app.prepare()` and socket listening; the process exits non-zero.
Compose already waits for MySQL health and restarts the application process.

Application datasources never execute migrations implicitly. The supported
migration path is `npm run migration:run`, which requires both
`RUN_DB_MIGRATIONS=1` and
`DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS`. The runner connects without
automatic migrations, inspects the current schema and migration history, and
refuses to proceed if `Author` or `Analysis` exists without a recorded
`InitialSetup1736424470000`. An empty database is allowed. TypeORM failures
propagate as a non-zero command result. MySQL DDL may commit implicitly, so
fail-closed execution must not be described as transactional database rollback.

The obsolete Docker entrypoint that logs migration failures and continues is
removed because the image does not use it and its presence advertises an unsafe
alternative path.

## Deployment rollback

The existing manual workflow keeps its immutable GHCR digest and 40-hex
revision validation. Before changing the remote checkout or `.env`, the SSH
deployment path validates a clean tracked checkout and securely captures the
previous revision and deployment environment. It then installs the candidate
revision and exact image digests, waits for Compose health, verifies application
readiness internally, and verifies the configured public health URL.

After candidate stack mutation begins, any command failure or handled shell
signal triggers artifact/configuration rollback. Rollback atomically restores
the previous `.env`, checks out the previous exact revision, pulls its exact
digests, brings the prior Compose definition up with health waiting, and repeats
internal and public health checks. The workflow still fails after a successful
rollback so the candidate is never reported as deployed.

`HEALTH_CHECK_URL` is mandatory for an SSH deployment and is checked before any
candidate mutation. Authentication-only mode remains non-deploying. A host
failure, `SIGKILL`, corrupted previous state, or database mutation outside this
workflow cannot be repaired by the artifact rollback and requires operator use
of the reconciliation runbook.

## Architecture applicability

The affected code is modular but is not full CQRS, DDD, BDD, hexagonal
architecture, or ports-and-adapters. This change keeps handlers thin and
extracts only boundaries with direct test value. There are no queues,
background jobs, outbox, or message bus. The Directus webhook is the sole async
integration contract.

CSRF is not applicable to the revalidation webhook because it uses an explicit
header credential rather than browser cookie authentication. CORS stays
disabled. The application remains behind Nginx; the application body limit is
defense in depth for internal/direct access. TLS termination and browser CSP
are outside the changed surfaces.

## Verification

Every behavior change follows red-green-refactor and is committed separately.
Final verification includes a clean install; focused and full Jest suites;
typecheck; lint; content checks; dependency audit policy; production build;
Directus smoke; Compose policy; deployment policy with an executable rollback
fixture; and the repository's local integration/E2E gates where their isolated
MySQL and browser prerequisites are available.

Passing source and local checks proves neither publication, deployment,
production health, public runtime revision, webhook delivery under real traffic,
nor human editorial acceptance.
