# Deployment workflow contract

This document describes checked-in workflow behavior. It does not record a
deployment, published artifact, reachable service, or production acceptance.

## CI and artifact workflow

`.github/workflows/docker.yml` runs on pushes to `main` and `dev`, matching
`v*` tags, and pull requests to `main` or `dev`.

- The `test` job runs migrations in its MySQL test service, type checks, lint,
  content checks, the root dependency audit policy, unit/integration/E2E tests.
- `directus-smoke` runs `npm run directus:smoke` with the pinned Directus image.
- `build-and-push` waits for both jobs. Pull requests build app and Nginx images
  without publishing; qualifying pushes publish their tags to GHCR.
- Directus is not built or published by this workflow. Compose uses the pinned
  upstream Directus image.

`.github/workflows/release.yml` creates a GitHub Release for a `v*.*.*` tag.
It has no deployment job. Its release text must not be treated as runtime or
production evidence.

## Manual deployment workflow

`.github/workflows/deploy.yml` runs only through `workflow_dispatch`. Its
required inputs are:

- `environment`: `production` or `staging`;
- `app_image`: `ghcr.io/...@sha256:...`;
- `nginx_image`: `ghcr.io/...@sha256:...`;
- `app_revision`: the full 40-hex Git revision matching the workflow ref and
  both image OCI revision labels.

Before its deployment path, the workflow reruns application and Directus smoke
checks, rejects invalid immutable artifact inputs, pulls the supplied app and
Nginx digests, and checks their OCI revision labels. With `DEPLOY_HOST`, it
uses SSH to check out the supplied revision, writes the artifact references to
`.env` using `scripts/deploy/write-artifact-env.sh`, validates
`docker-compose.portainer.yml`, and starts it with `docker compose ... up -d
--remove-orphans`.

Without `DEPLOY_HOST`, a set `PORTAINER_URL` deliberately fails because a
Portainer-only path cannot inject validated immutable artifacts. With neither,
the workflow only prints a manual-deployment notification. A set
`HEALTH_CHECK_URL` causes a retrying HTTP check, but that check alone is not a
complete post-deploy acceptance suite.

## Runtime contract

The production-oriented Compose file is `docker-compose.portainer.yml`.
It requires all deployment variables and secrets from a deployment-only `.env`.
It exposes Nginx at `18080:8080`; `docker-compose.final.yml` is the analogous
local/rehearsal topology at `3001:8080`.

- MySQL must become healthy before the app or Directus starts.
- The app health check calls database-backed `GET /api/health`.
- Directus health requires `GET /server/ping` and
  `/directus/.casn_bootstrapped`.
- Nginx waits for both application readiness and Directus health; its own probe
  is `GET /nginx-health`.
- `/cms/` proxies to Directus, `/cms/assets/` is new Directus media, and the
  historical `/cms/uploads/` path is read-only legacy-volume access.

Application startup never runs migrations. `npm run migration:run` is the only
supported migration path and refuses to run unless both
`RUN_DB_MIGRATIONS=1` and
`DB_MIGRATION_CONFIRM=RUN_CASN_MIGRATIONS` are present. It also refuses an
existing content schema without the recorded initial migration. The supplied
Compose files deliberately inject neither variable. Use the command only in an
approved isolated rehearsal or separately approved change. A non-zero result
stops the command, but MySQL DDL can commit implicitly and is not guaranteed to
roll back atomically.

## Required secrets and artifact variables

See `docker-compose.env.example` for the exact variable names:
`APP_IMAGE`, `NGINX_IMAGE`, `APP_REVISION`, `MYSQL_ROOT_PASSWORD`,
`MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `DIRECTUS_KEY`,
`DIRECTUS_SECRET`, `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`,
`DIRECTUS_PUBLIC_URL`, `REVALIDATE_SECRET`, `NEXTAUTH_SECRET`, and
`APP_PUBLIC_URL`. Do not commit populated values or place credentials in
workflow logs.

For the mandatory capture, restore, parity, cutover, and rollback gates, use
[deployment-reconciliation.md](deployment-reconciliation.md). None of those
operator steps has been run as part of this repository reconciliation.
