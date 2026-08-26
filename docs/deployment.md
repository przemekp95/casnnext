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
uses SSH to fetch the supplied revision and securely execute that revision's
`scripts/deploy/remote-deploy.sh`. The script preserves the previous exact
revision, digest references, and `.env`, deploys with Compose readiness checks,
and runs the exact revision's internal health verifier against `/api/health`
inside the app container.

If candidate readiness or the internal exact-revision gate fails, the same
remote process restores the previous `.env` atomically, checks out the previous
full revision, pulls its exact app and Nginx digests, and proves the restored
revision's internal health again.
The workflow still fails even after a successful restore, so the candidate is
never reported as deployed. This is artifact/configuration rollback only: it
does not reverse MySQL migrations or Directus metadata changes. A failed
rollback emits a critical error and requires the separately approved recovery
procedure in `deployment-reconciliation.md`.

`npm run deploy:policy` mechanically rejects application migration commands,
migration gate variables, and Directus schema/bootstrap mutation in both the
remote deployment implementation and the workflow's SSH deployment block.
Database or Directus recovery must therefore use the separately approved,
backup-backed reconciliation procedure; it cannot be smuggled into artifact
rollback.

Without `DEPLOY_HOST`, a set `PORTAINER_URL` deliberately fails because a
Portainer-only path cannot inject validated immutable artifacts. With neither,
the workflow only prints a manual-deployment notification. The rollback-capable
remote deployment gates both the candidate and any restored release by probing
the database-backed `/api/health` endpoint over loopback inside the app
container. It accepts only JSON reporting `status=ready`,
`database=connected`, and a `revision` exactly equal to the release being
started; transport success alone is insufficient.

After the remote deployment returns successfully, the workflow runs the same
internal exact-revision gate again as a separate, intentionally redundant item
of evidence. Public runtime acceptance remains independent and must probe
`https://casn.pl/api/health` separately. A Cloudflare Managed Challenge can
answer that edge request with HTTP 403 even when the container is healthy, so
the public endpoint is unsuitable as the workflow-success gate. Successful SSH,
the candidate/rollback internal gate, the later workflow internal gate, and
public runtime acceptance remain distinct claims. This checked-in contract does
not establish that production was accessed or deployed.

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
