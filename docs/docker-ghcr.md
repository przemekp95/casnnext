# Docker Images in GHCR

This repository publishes three images to GitHub Container Registry (GHCR) through `.github/workflows/docker.yml`:

- app: `ghcr.io/przemekp95/casnnext:<tag>`
- Strapi: `ghcr.io/przemekp95/casn-strapi:<tag>`
- nginx: `ghcr.io/przemekp95/casn-nginx:<tag>`

## Source of Truth

The workflow uses:

- `REGISTRY=ghcr.io`
- `APP_IMAGE_NAME=${{ github.repository }}`
- `STRAPI_IMAGE_NAME=${{ github.repository_owner }}/casn-strapi`
- `NGINX_IMAGE_NAME=${{ github.repository_owner }}/casn-nginx`

So published image names are:

```text
ghcr.io/<owner>/<repo>:<tag>
ghcr.io/<owner>/casn-strapi:<tag>
ghcr.io/<owner>/casn-nginx:<tag>
```

For this repository, that is typically:

```text
ghcr.io/przemekp95/casnnext:<tag>
ghcr.io/przemekp95/casn-strapi:<tag>
ghcr.io/przemekp95/casn-nginx:<tag>
```

## When Images Are Published

From `docker.yml`:

- Push to `main`: publishes `:main`
- Push to `dev`: publishes `:dev`
- Push tag `v*`: publishes tag and semver tags
  - `:vX.Y.Z`
  - `:X.Y.Z`
  - `:X.Y`
- Pull requests: build only, no push (all three images)

## Common Tags

| Event | Example tags |
|---|---|
| Push to `main` | `ghcr.io/przemekp95/casnnext:main`, `ghcr.io/przemekp95/casn-strapi:main`, `ghcr.io/przemekp95/casn-nginx:main` |
| Push to `dev` | `ghcr.io/przemekp95/casnnext:dev`, `ghcr.io/przemekp95/casn-strapi:dev`, `ghcr.io/przemekp95/casn-nginx:dev` |
| Push tag `v1.2.3` | `ghcr.io/przemekp95/casnnext:v1.2.3`, `ghcr.io/przemekp95/casnnext:1.2.3`, `ghcr.io/przemekp95/casnnext:1.2`; `ghcr.io/przemekp95/casn-strapi:v1.2.3`, `ghcr.io/przemekp95/casn-strapi:1.2.3`, `ghcr.io/przemekp95/casn-strapi:1.2`; `ghcr.io/przemekp95/casn-nginx:v1.2.3`, `ghcr.io/przemekp95/casn-nginx:1.2.3`, `ghcr.io/przemekp95/casn-nginx:1.2` |

## Pull and Run

Pull latest `main` images:

```bash
docker pull ghcr.io/przemekp95/casnnext:main
docker pull ghcr.io/przemekp95/casn-strapi:main
docker pull ghcr.io/przemekp95/casn-nginx:main
```

Run directly:

```bash
docker run -d --name casn-app -p 3000:3000 \
  -e PORT=3000 \
  -e DATABASE_URL="mysql://user:pass@host:3306/casn" \
  ghcr.io/przemekp95/casnnext:main
```

## Compose Usage

Example service using the GHCR image from this workflow:

```yaml
services:
  app:
    image: ghcr.io/przemekp95/casnnext:main
    environment:
      - PORT=3000
      - DATABASE_URL=mysql://user:pass@mysql:3306/casn
```

## Repository-Specific Note

Current compose files in this repo are aligned with this workflow:

- `docker-compose.final.yml` uses `ghcr.io/przemekp95/casnnext:dev`
- `docker-compose.portainer.yml` uses `ghcr.io/przemekp95/casnnext:main`, `ghcr.io/przemekp95/casn-strapi:main`, and `ghcr.io/przemekp95/casn-nginx:main`

## Package Location

GHCR package page:

```text
https://github.com/przemekp95/casnnext/packages
```
