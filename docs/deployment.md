# Deployment Guide

This document describes the deployment-related GitHub Actions workflows and how they currently behave in this repository.

## Workflows

- `docker.yml` (`.github/workflows/docker.yml`)
  - Runs CI (type-check, lint, tests, Strapi smoke).
  - Builds and pushes Docker images to GHCR after CI passes.
- `deploy.yml` (`.github/workflows/deploy.yml`)
  - Runs CI again on `main`.
  - Runs deployment steps (SSH, Portainer stub, or manual notification).
- `release.yml` (`.github/workflows/release.yml`)
  - Creates a GitHub Release for tags matching `v*.*.*`.

## Trigger Matrix

### `docker.yml`

- Push to `main`: CI + push image tags for `main`.
- Push to `dev`: CI + push image tags for `dev`.
- Push tag `v*`: CI + push semver tags.
- Pull request to `main` or `dev`: CI + build-only Docker image (no push).

### `deploy.yml`

- Push to `main`: CI + deploy job.
- Manual trigger (`workflow_dispatch`): CI + deploy job.

### `release.yml`

- Push tag `v*.*.*`: create GitHub release.

## GHCR Image Naming Used by Workflows

Both `docker.yml` and `deploy.yml` use:

- `REGISTRY=ghcr.io`
- `IMAGE_NAME=${{ github.repository }}`

So images are published and pulled as:

```text
ghcr.io/<owner>/<repo>:<tag>
```

For this repository, that is typically:

```text
ghcr.io/przemekp95/casnnext:<tag>
```

## Deployment Paths in `deploy.yml`

The deploy job can run one of three paths:

1. SSH deployment (`appleboy/ssh-action`)
   - Condition: `if: env.DEPLOY_HOST`
2. Portainer API placeholder step
   - Condition: `if: env.PORTAINER_URL && !env.DEPLOY_HOST`
3. Manual deployment notification
   - Condition: when both are false

Optional health check:

- Condition: `if: env.HEALTH_CHECK_URL`
- Uses `curl` with retries (30 attempts, every 10 seconds).

## Important Current Limitation

`deploy.yml` step conditions use `env.*` variables (`DEPLOY_HOST`, `PORTAINER_URL`, `HEALTH_CHECK_URL`), while connection values are read from `secrets.*`.

This means:
- setting only repository secrets does not satisfy those `if: env.*` conditions by itself,
- and the workflow may fall back to the "Manual deployment notification" path.

## Secrets Used by `deploy.yml`

When corresponding steps are enabled, these secrets are referenced:

```text
DEPLOY_HOST
DEPLOY_USER
DEPLOY_KEY
DEPLOY_PORT
DEPLOY_PATH
PORTAINER_URL
PORTAINER_WEBHOOK_ID
HEALTH_CHECK_URL
```

## Target Compose File and Runtime

The SSH deployment script in `deploy.yml` runs:

```bash
docker-compose -f docker-compose.portainer.yml down
docker-compose -f docker-compose.portainer.yml up -d
```

`docker-compose.portainer.yml` currently exposes:
- nginx: `18080:80`
- Next.js app internal port: `3000` (behind nginx)

## Image Name Consistency Check

Image naming is now aligned between workflow and compose:

- `deploy.yml` pulls `ghcr.io/<owner>/<repo>:main` (for this repo: `ghcr.io/przemekp95/casnnext:main`)
- `docker-compose.portainer.yml` uses `ghcr.io/przemekp95/casnnext:main`

## Manual Deployment (Current Compose)

If automated deployment is not active, deploy manually on the server:

```bash
cd /opt/casn
git pull origin main
docker pull ghcr.io/przemekp95/casnnext:main
docker-compose -f docker-compose.portainer.yml down
docker-compose -f docker-compose.portainer.yml up -d
```
