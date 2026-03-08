# CASN

CASN is a Next.js 16 application for publishing analyses and articles for Centrum Analiz Sluzby Niepodleglej.

Runtime reads are DB-only:
- Strapi 5 is the editorial CMS and media storage
- MySQL is the public read model for Next.js
- `posts/*.mdx` are legacy migration inputs, not a runtime content source

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- TypeORM + MySQL 8
- Strapi 5 (`strapi/`, editorial CMS)
- Docker / Docker Compose / Nginx

## Repository Layout

```text
app/                Next.js routes (pages + API)
components/         Shared UI components
lib/                DB, CMS, server-side logic
migrations/         TypeORM migrations
posts/              Legacy MDX files kept for migration/backfill
public/             Static assets
strapi/             Strapi project
scripts/            Utility and CI scripts
test/               Unit and integration tests
```

## Prerequisites

- Node.js 20+
- npm
- MySQL 8 (local or Docker)
- Docker (optional)

If the DB is unavailable, some server paths fall back to mock/fallback data instead of hard failing.

## Local Development (without Docker)

1. Install dependencies:

```bash
npm install
```

2. Create local runtime env file:

```bash
cp .env.example .env.local
```

3. Start MySQL and ensure credentials match your env values.

4. Run migrations (recommended with explicit DB URL):

```bash
DATABASE_URL="mysql://casn_user:casn_password123@127.0.0.1:3306/casn" npm run migration:run
```

5. Start Next.js:

```bash
npm run dev
```

App URL: `http://localhost:3000`

## Migration Safety

`migrations/1736424470000-InitialSetup.ts` drops and recreates `Author` and `Analysis`, then seeds data.

Treat `npm run migration:run` as destructive for those two tables.

## Strapi

Run Strapi:

```bash
npm run strapi:dev
```

Build/start Strapi in production mode:

```bash
npm run strapi:build
npm run strapi:start
```

Sync helpers:

```bash
npm run cms:import
npm run cms:verify
npm run cms:sync-db
```

More details: `docs/strapi-cms.md`.

## Docker

### Local integrated stack (`docker-compose.final.yml`)

Run:

```bash
docker compose -f docker-compose.final.yml up --build
```

Services:
- `mysql` (published on `localhost:3306`)
- `strapi`
- `app`
- `nginx` (published on `localhost:3001`)

Default URLs:
- App via nginx: `http://localhost:3001`
- CMS via nginx: `http://localhost:3001/cms`
- Strapi admin direct: `http://localhost:1337/cms`

Important:
- The `app` service uses prebuilt image `ghcr.io/przemekp95/casnnext:dev`.
- `--build` rebuilds `strapi` and `nginx` (both use local Dockerfiles), but not the app image.
- To run your current branch in this compose setup, build/tag the app image first:

```bash
docker build -t ghcr.io/przemekp95/casnnext:dev .
docker compose -f docker-compose.final.yml up --build
```

### Portainer/server-oriented stack (`docker-compose.portainer.yml`)

Run:

```bash
docker compose -f docker-compose.portainer.yml up --build -d
```

Differences:
- nginx port mapping: `18080:8080`
- app image: `ghcr.io/przemekp95/casnnext:main`
- strapi image: `ghcr.io/przemekp95/casn-strapi:main`
- nginx image: `ghcr.io/przemekp95/casn-nginx:main`
- nginx config is baked into the nginx image (no host-mounted `nginx.conf`)

## Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run lint:fix
npm run type-check
npm run test
npm run test:ci
npm run test:integration:live
npm run test:e2e
npm run check:posts
npm run check:cms-mdx-media
npm run audit:policy
```

## Environment Variables

See:
- `.env.example`
- `docker-compose.env.example`

Most important:
- DB: `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Strapi: `STRAPI_INTERNAL_URL`, `NEXT_PUBLIC_STRAPI_URL`, `STRAPI_API_TOKEN`
- CMS sync / revalidation: `CMS_SYNC_SECRET`, `STRAPI_WEBHOOK_SECRET`, `REVALIDATE_SECRET`
- NextAuth: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`

## CI/CD

GitHub workflows:
- `.github/workflows/docker.yml` (CI + build/push for app, Strapi, and nginx images)
- `.github/workflows/deploy.yml` (deploy pipeline)
- `.github/workflows/release.yml` (tag-based release)

## Notes

- `npm run start` is `next start -p $PORT`, so set `PORT`.
- For reverse proxy setup under `/cms`, keep `nginx.conf` and Strapi env aligned:
  `STRAPI_ADMIN_PATH=/cms`, `STRAPI_ADMIN_BACKEND_URL=/cms`, and `STRAPI_URL` without `/cms`
  (for example `https://casn.pl`).
