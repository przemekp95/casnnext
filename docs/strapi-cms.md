# Strapi CMS Integration

This project supports two content providers:

- `legacy`: existing MySQL + `posts/*.mdx`
- `strapi`: Strapi as source-of-truth for authors, analyses and issue collections

## Environment Variables

Set these in runtime environments:

- `CONTENT_PROVIDER=legacy|strapi`
- `STRAPI_INTERNAL_URL` (server-to-server URL, e.g. `http://strapi:1337`)
- `NEXT_PUBLIC_STRAPI_URL` (browser-facing URL, e.g. `https://casn.pl/cms`)
- `STRAPI_API_TOKEN` (required for write/import operations)
- `STRAPI_WEBHOOK_SECRET` and/or `REVALIDATE_SECRET`

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

- `POST /api/revalidate`

Provide secret via one of:

- `x-revalidate-secret` header
- `x-strapi-secret` header
- `Authorization: Bearer <secret>`

`/api/revalidate` revalidates inferred tags for models:

- analysis -> `analyses`, `articles`
- author -> `authors`, `analyses`, `articles`
- issue -> `issues`

## Compatibility Notes

- Public URLs remain unchanged: `/analizy/[slug]`, `/autor/[slug]`, `/autorzy`, `/zbiory`.
- Existing Next API endpoints stay available and are mapped to Strapi in Strapi mode.
- Legacy DB tables remain archival read-only after cutover.
