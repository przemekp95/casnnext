# CASN Production and Directus Reconciliation Design

## Objective

Produce one version-controlled CASN Next source tree that preserves the behavior
currently served at `https://casn.pl`, incorporates the current `origin/dev` UI
delta, and replaces the retired Strapi integration with a pinned, safely
configured Directus administration layer over the existing MySQL content.

This work is prepared on branch `codex/reconcile-directus`, based on production
revision `9a8ceea2dce303a9f357a8cbad431d888d5d2235`. The original dirty worktree at
`/home/przemekp95/.codex/worktrees/7c7a/casn` remains an input only and must not
be edited, stashed, reset, or otherwise normalized.

## Evidence Boundary

- Public runtime: the application container reports revision `9a8ceea2...` and
  the public HTML, CSS, routes, SEO data, and content match `origin/main`.
- Repository refs: `origin/main` is `9a8ceea2...`; `origin/dev` is
  `06d290cce1ac05c7bbbd6482a54378ddba759386` and differs in the final tree only
  in `app/analizy/page.tsx` and `app/globals.css`.
- Local migration input: the dirty detached worktree contains an uncommitted
  Strapi-to-Directus migration based on older revision `4d269a935...`.
- Deployment configuration: production currently mounts nginx configuration
  from `/opt/casn/nginx.conf`; that file is not identical to either tracked
  nginx configuration. No production write or deployment is part of this work.

## Non-Goals and Authorization Boundary

- Do not change, stash, commit, or clean the original dirty worktree.
- Do not push branches or images, merge remote branches, alter CI secrets, log
  into Directus, deploy to Mikrus, restart containers, or mutate production data.
- Do not run database migrations against production.
- Do not automatically apply `npm audit fix`; dependency remediation is a
  separate, risk-scoped change.
- Do not retain two active CMS implementations. Strapi compatibility is limited
  to read-only legacy media paths needed by already published content.

## Architecture

### Source Reconciliation

The production revision is the integration base. The two-file `origin/dev`
delta is applied as an explicit content change rather than by merging the
divergent branch histories. The Directus migration is then ported by logical
surface from the dirty worktree. Production-only behavior wins whenever the
older migration input conflicts with later production changes.

The reconciled tree must retain:

- canonical URLs, robots metadata, Open Graph metadata, Organization and
  WebSite JSON-LD, and the homepage heading structure;
- analyses and authors internal linking, related analyses, the Analizy menu
  entry, current cards, image crops, and title wrapping;
- build-phase cache protection and the current database-backed content model;
- the published content inventory and legacy `/cms/uploads/` references.

### CMS and Data Ownership

Next.js remains the public read application. It reads published analyses,
authors, and issue collections from MySQL. Directus is the authenticated write
administration layer over those existing tables; it does not introduce a
second authoritative content store or a request-time synchronization copy.

Directus bootstrap must be idempotent and non-destructive. It may create or
update Directus metadata, roles, policies, fields, and flows, but it must not
truncate or reseed the CASN content tables. The deployment must pin a concrete
Directus version, not `directus/directus:latest`.

Before any future production cutover, a rehearsal against a database and
volume snapshot must prove parity of at least 39 analyses, 32 authors, four
issue PDFs, all sitemap entries, and referenced legacy media.

### HTTP and Security Boundaries

Public reads remain available through the existing pages and read APIs. State
changes must require an explicit secret-bearing server-to-server request or an
authenticated Directus session:

- `/api/articles` must not permit anonymous creation or direct publishing;
- `/api/db-init` must not expose database initialization or migrations through
  anonymous GET or POST requests;
- revalidation/webhook endpoints must fail closed when their secret is absent
  and must compare the supplied credential safely;
- browser cookie authentication is owned by Directus. Next.js write endpoints
  use header-based server credentials, so CSRF tokens are not their primary
  protection; CORS and credential forwarding must remain restricted.

The current code is modular and has a useful read/write distinction, but it is
not full CQRS, hexagonal architecture, or DDD. This change will not introduce a
framework bus or artificial domain layer. HTTP handlers will stay thin, reads
will stay side-effect free, and database/bootstrap operations will be explicit
infrastructure actions.

There are no message queues or background jobs to migrate. The only async
integration contract is the Directus webhook/revalidation flow; it must be
authenticated, retry-safe, and idempotent from the application's perspective.

### Health and Migration Control

Liveness and readiness must be distinct:

- liveness reports that the Next.js process can serve requests;
- readiness returns a non-2xx response when required database connectivity is
  unavailable and is the check used by the application container;
- public health output must not enumerate secret/configuration presence beyond
  what an operator needs to determine service availability.

Database migrations must never be triggered by a public request. If automatic
startup migration support remains, it must be disabled by default and require
both `RUN_DB_MIGRATIONS=1` and
`DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS`. A dedicated, operator-invoked
migration command is preferred for deployment rehearsal and cutover.

### Deployment Configuration

The repository becomes the canonical source for nginx and compose behavior:

- nginx proxies the public application to Next.js, `/cms/` to Directus, keeps
  legacy `/cms/uploads/` read-only, and provides an internal nginx health path;
- secrets have no usable defaults and are declared as required environment
  inputs;
- application and nginx images use immutable full-SHA tags or digests;
- Directus uses a pinned version;
- compose health dependencies use readiness rather than an always-200 status;
- the runtime exposes revision metadata through image labels and, if retained,
  a non-sensitive health field sourced from an explicit build variable.

The production-only nginx and compose files must be captured as backup evidence
before a future deployment. They are not treated as the desired architecture
when they conflict with the tracked, tested configuration.

## Error Handling and Rollback Contract

- Missing secrets prevent the affected write/bootstrap service from starting or
  return an authorization/configuration error; they never fall back to known
  passwords.
- Database readiness failures return a failure status and do not claim
  `healthy`.
- Directus bootstrap exits non-zero on partial configuration and can be safely
  rerun after the cause is corrected.
- A future deployment must snapshot MySQL, compose, nginx, and legacy uploads;
  record the exact image digests; verify internal health before public routing;
  and restore the previous manifest/configuration and database snapshot if the
  parity or smoke gates fail.

## Test Strategy and Acceptance Gates

Implementation follows red-green-refactor for behavior changes. Tests must
exercise observable behavior rather than search source text.

Required automated gates:

1. Existing SEO, canonical, JSON-LD, internal-linking, related-analysis, menu,
   card, and media-path regression tests remain green.
2. Route tests prove anonymous `/api/articles` writes and `/api/db-init` access
   are rejected without causing database initialization or mutation.
3. Health tests prove readiness returns non-2xx for a database failure and does
   not expose detailed configuration flags publicly.
4. Directus integration smoke starts the actual pinned image with the repository
   bootstrap, proves `/server/ping`, validates the expected collections and
   permissions, rejects anonymous writes, and exercises authenticated webhook
   revalidation.
5. Compose validation proves all required variables are explicit and resolves
   to pinned images without placeholder secrets.
6. `npm run type-check`, `npm run lint`, `npm run test:ci`, the CMS media check,
   security audit policy, production build, and relevant container smoke tests
   pass from a clean checkout.

Future staging and deployment gates, not performed in this task:

1. Restore a recent production snapshot into an isolated rehearsal stack.
2. Verify exact counts and identifiers for 39 analyses, 32 authors, four issue
   PDFs, 80 sitemap URLs, and all referenced media.
3. Crawl public routes, canonical redirects, SEO metadata, assets, API reads,
   nginx health, Directus login, and webhook-driven revalidation.
4. Deploy immutable image digests, then verify container revision labels and
   repeat the public smoke. Similar appearance is not sufficient evidence.

## Deliverable

The deliverable is a locally verified reconciliation branch and an evidence-led
handoff describing changed files, test results, remaining dependency findings,
and the exact commands and approval gates for staging and production. Push,
merge, image publication, and deployment require a separate explicit approval.
