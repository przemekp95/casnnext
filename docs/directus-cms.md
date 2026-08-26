# Directus CMS contract

Directus is the only editorial UI in this repository. It manages the existing
MySQL tables `Author`, `Analysis`, and `IssueCollection`; it is not the public
read model. The Next.js application reads those tables directly and has no CMS
synchronization route or import job.

This is a source-verified contract, not evidence that Directus has been
deployed or accepted by editors.

## Publication and write boundaries

- A public `Author`, `Analysis`, or `IssueCollection` row has
  `publishedAt IS NOT NULL`. The server queries enforce that condition for
  public content.
- Directus is the authenticated editorial writer. The Directus bootstrap only
  configures metadata, access, permissions, and its revalidation flow; it does
  not run SQL or modify content rows.
- `POST /api/articles` is disabled with `405 Allow: GET`.
- `GET /api/db-init` and `POST /api/db-init` are disabled with `404`.
- `POST /api/revalidate` is the authenticated cache-invalidation endpoint. It
  accepts `x-revalidate-secret`, `x-directus-secret`, or Bearer authorization;
  `REVALIDATE_SECRET` takes precedence over `DIRECTUS_WEBHOOK_SECRET`.

## Directus bootstrap, access, and readiness

The pinned upstream image is:

```text
directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869
```

`directus/start.sh` runs the image-bundled Directus CLI bootstrap, starts the
server, and then runs `directus/bootstrap.cjs`. On success it creates
`/directus/.casn_bootstrapped`; startup removes that marker first and on exit.
The Compose health check requires both the marker and `GET /server/ping`.

Bootstrap maintains the `CASN Editor` role, `CASN Editor Policy`, CRUD access
for the three managed tables, and the `CASN Revalidate Website Cache` flow.
The policy uses Directus's `fields: ["*"]` permission entitlement because these
existing tables must stay editable as their schema evolves. That entitlement is
not sufficient protection: the loaded
`directus-extension-casn-field-guard` hook is mandatory and rejects create or
update payloads containing `strapiId` or `sourceHash` on the managed tables.
Do not remove or bypass that hook when changing permissions.

## Required deployment configuration

The deployment-only `.env` is created from `docker-compose.env.example` and
must contain real, non-source-controlled values for:

- immutable artifacts: `APP_IMAGE`, `NGINX_IMAGE`, `APP_REVISION`;
- MySQL: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`,
  `MYSQL_PASSWORD`;
- Directus: `DIRECTUS_KEY`, `DIRECTUS_SECRET`, `DIRECTUS_ADMIN_EMAIL`,
  `DIRECTUS_ADMIN_PASSWORD`, and optionally `DIRECTUS_PUBLIC_URL`;
- cache revalidation: `REVALIDATE_SECRET`;
- Next.js: `NEXTAUTH_SECRET` and optionally `APP_PUBLIC_URL`.

The Compose services derive Directus `ADMIN_EMAIL` and `ADMIN_PASSWORD` from
the `DIRECTUS_ADMIN_*` variables, use `DIRECTUS_REVALIDATE_URL` internally as
`http://app:3000/api/revalidate`, and set the Directus database connection from
the MySQL variables. `DIRECTUS_INTERNAL_URL` is an internal bootstrap default
of `http://127.0.0.1:8055`; it is not a browser URL.

## CMS paths and media compatibility

- `/cms/` is proxied by Nginx to Directus. `/cms` redirects to `/cms/`.
- New Directus uploads are served under `/cms/assets/` from the writable
  `directus_uploads` volume.
- `/cms/uploads/` is a historical compatibility path: Nginx serves it from the
  legacy `strapi_uploads` volume mounted read-only at
  `/legacy-strapi-uploads`. It accepts only `GET` and `HEAD` there.
- Historical MDX `/uploads/...` references are normalized to
  `/cms/uploads/...`; `npm run check:cms-mdx-media` rejects new raw
  `/uploads/...` paths in repository MDX files.

## Source-level smoke

Run the repository's disposable topology smoke (Docker is required):

```bash
npm run directus:smoke
```

It starts the pinned Directus image against a disposable migrated MySQL
database, uses this repository's `directus/start.sh`, bootstrap, and field-guard
extension, verifies restart/idempotency, anonymous-write denial, editor CRUD,
technical-field denial, and the item-bound revalidation webhook. This is CI and
local smoke evidence only; it is not production deployment evidence.
