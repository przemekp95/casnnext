# Strapi CMS Integration

This project uses:

- Strapi as the editorial CMS and media library
- MySQL as the public runtime read model for authors, analyses and issue collections
- `posts/*.mdx` only as migration/backfill input for legacy content

## Environment Variables

Set these in runtime environments:

- `STRAPI_INTERNAL_URL` (server-to-server URL, e.g. `http://strapi:1337`)
- `NEXT_PUBLIC_STRAPI_URL` (browser-facing URL, e.g. `https://casn.pl/cms`)
- `STRAPI_API_TOKEN` (required for write/import operations)
- `CMS_SYNC_SECRET` (recommended secret for `/api/cms/sync`)
- `STRAPI_WEBHOOK_SECRET` and/or `REVALIDATE_SECRET`

For reverse proxy setup under `/cms`, also set:

- `STRAPI_ADMIN_PATH=/cms`
- `STRAPI_ADMIN_BACKEND_URL=/cms`
- `STRAPI_URL=https://casn.pl` (without `/cms`; admin path is configured separately)

## Local Runtime (Docker)

1. Start services:
   - `docker compose -f docker-compose.final.yml up --build`
2. Open:
   - Next app: `http://localhost:3001`
   - Strapi admin: `http://localhost:1337/cms`

## Import Legacy Data to Strapi

1. Ensure Strapi is running and API token is set.
2. Run:

```bash
npm run cms:import
```

The importer is idempotent and uses `legacyId`/`slug` upsert rules.

## Verify Parity

```bash
npm run cms:verify
```

Checks:

- record counts (`Author`, `Analysis`) vs Strapi
- random checksum verification (`sourceHash`) for migrated analyses
- orphan analyses without author relation

## Webhook and Revalidation

Use Strapi webhook to call:

- `POST /api/cms/sync`

Provide secret via one of:

- `x-cms-sync-secret` header
- `x-revalidate-secret` header
- `x-strapi-secret` header
- `Authorization: Bearer <secret>`

`/api/cms/sync` fetches the changed entry from Strapi, upserts it into MySQL, and revalidates inferred tags for models:

- analysis -> `analyses`, `articles`
- author -> `authors`, `analyses`, `articles`
- issue -> `issues`

## Compatibility Notes

- Public URLs remain unchanged: `/analizy/[slug]`, `/autor/[slug]`, `/autorzy`, `/zbiory`.
- Public runtime reads come only from MySQL; request-time reads from Strapi are intentionally disabled.
- Strapi downtime should not take down the public site as long as MySQL still has synced content.

## Editorial Rules (MDX + media)

- Article content is synced into `Analysis.contentMdx` in MySQL.
- Always publish entries in Strapi (`publishedAt`) to make them visible publicly.
- For Strapi uploaded files, use media paths under `/cms/uploads/...`.
- Frontend includes a safety rewrite from `/uploads/...` to `/cms/uploads/...` during MDX rendering, but the recommended format is still `/cms/uploads/...`.
- Existing static assets in `public/images` can continue to use `/images/...`.
- CI validates repository MDX files and fails on `/uploads/...` paths:
  - `npm run check:cms-mdx-media`
