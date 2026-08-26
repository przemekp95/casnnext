# CASN

CASN is a Next.js 16 application for publishing analyses and articles for
Centrum Analiz Sluzby Niepodleglej.

The public application reads MySQL directly. Directus is the authenticated
editorial UI for the existing `Author`, `Analysis`, and `IssueCollection`
tables; it is not a public CMS read dependency. Public rows satisfy
`publishedAt IS NOT NULL`.

## Stack

- Next.js 16, React 19, TypeScript 5
- TypeORM with MySQL 8
- Directus 12.3.1 (pinned upstream image) for editorial administration
- Docker Compose and Nginx

## Repository layout

```text
app/        Next.js pages and API routes
directus/   Directus bootstrap, entrypoint, and field-guard extension
lib/        database and server-side read logic
migrations/ TypeORM migrations
posts/      historical MDX inputs and legacy-media compatibility fixtures
public/     static assets
scripts/    CI, deployment, and verification scripts
test/       unit and integration tests
```

## Local application development

Requirements: Node.js `>=22.19`, npm, and MySQL 8. Create a local
`.env.local` with either `DATABASE_URL` or the `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, and `DB_NAME` values required by the database connection. Do not
copy a production deployment `.env` into the repository.

```bash
npm ci
npm run migration:run
npm run dev
```

The development server listens on `http://localhost:3000` by default.
`npm run migration:run` is an explicit TypeORM action: the initial migration
can recreate and seed `Author` and `Analysis`, so use only an approved local or
isolated database.

## Runtime safety

- `GET /api/health/live` is database-free liveness and returns
  `{ "status": "alive" }`.
- `GET /api/health` is database-backed readiness. It returns `200` only after
  `SELECT 1` succeeds and otherwise returns `503` without exposing errors.
- Application startup does not automatically run migrations unless both
  `RUN_DB_MIGRATIONS=1` and
  `DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS` are present. Neither variable is
  injected by the supplied production Compose files.
- `POST /api/articles` is disabled (`405`) and both methods of `/api/db-init`
  are disabled (`404`). Editorial writes go through Directus.

## Directus and legacy media

Read [docs/directus-cms.md](docs/directus-cms.md) for the Directus access,
revalidation, and smoke contracts. New Directus media is `/cms/assets/`.
Historical `/cms/uploads/` remains a read-only compatibility path backed by the
legacy `strapi_uploads` volume; the word "Strapi" there is historical only and
does not denote a running service.

## Compose and immutable artifacts

Both Compose files require a deployment-only `.env` based on
`docker-compose.env.example`. It must contain explicit MySQL, Directus,
revalidation, and NextAuth secrets plus `APP_IMAGE`, `NGINX_IMAGE`, and
`APP_REVISION`. The app and Nginx images must be GHCR `@sha256:` references,
not mutable tags. Validate before starting a stack:

```bash
docker compose --env-file .env -f docker-compose.portainer.yml config --quiet
docker compose --env-file .env -f docker-compose.portainer.yml up -d --remove-orphans
```

`docker-compose.final.yml` maps Nginx to `3001:8080`; the Portainer-oriented
file maps it to `18080:8080`. In both, Nginx waits for app readiness and
Directus bootstrap health. These commands describe a configured stack; they do
not prove any production deployment occurred.

## Verification commands

```bash
npm run type-check
npm run lint
npm run test:ci
npm run check:posts
npm run check:cms-mdx-media
npm run audit:policy
npm run directus:smoke
npm run compose:policy
npm run deploy:policy
```

`npm run audit:policy` audits the complete application dependency tree,
including development and optional packages, and blocks at `info` or higher.
The current lockfile reports zero vulnerabilities in every severity category.
There are no active security exceptions; see
[SECURITY_EXCEPTIONS.md](SECURITY_EXCEPTIONS.md).

The toolchain intentionally remains on ESLint 9.39.5. Next 16.3.3 accepts
ESLint 10, but its current React, import, accessibility, and hooks plugins do
not yet declare ESLint 10 peer compatibility. Do not bypass that boundary with
`--force`, `--legacy-peer-deps`, or peer overrides; upgrade only when the whole
installed lint chain declares support.

Project installs enforce `strict-allow-scripts=true`. `package.json` approves
only the reviewed, exact versions of bcrypt, Cypress, esbuild, unrs-resolver,
and the macOS-only optional fsevents package. A version change or a new package
with lifecycle scripts must be reviewed and explicitly re-approved before
`npm ci` can pass.

## CI and release boundaries

`.github/workflows/docker.yml` runs application checks and the Directus smoke,
then publishes app and Nginx images for qualifying pushes. It does not build a
CASN Directus image. `.github/workflows/deploy.yml` is manual
(`workflow_dispatch`) and requires immutable image digests plus a matching
40-hex `app_revision`; it validates those inputs before an SSH deployment path.
A GitHub Release is not deployment evidence. See
[docs/docker-ghcr.md](docs/docker-ghcr.md) and
[docs/deployment-reconciliation.md](docs/deployment-reconciliation.md).
