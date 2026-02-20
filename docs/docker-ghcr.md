# Docker Images in GHCR

This repository publishes application images to GitHub Container Registry (GHCR) through `.github/workflows/docker.yml`.

## Source of Truth

The workflow uses:

- `REGISTRY=ghcr.io`
- `IMAGE_NAME=${{ github.repository }}`

So published image names are:

```text
ghcr.io/<owner>/<repo>:<tag>
```

For this repository, that is typically:

```text
ghcr.io/przemekp95/casnnext:<tag>
```

## When Images Are Published

From `docker.yml`:

- Push to `main`: publishes `:main`
- Push to `dev`: publishes `:dev`
- Push tag `v*`: publishes tag and semver tags
  - `:vX.Y.Z`
  - `:X.Y.Z`
  - `:X.Y`
- Pull requests: build only, no push

There is no SHA tag publishing in the current workflow.

## Common Tags

| Event | Example tags |
|---|---|
| Push to `main` | `ghcr.io/przemekp95/casnnext:main` |
| Push to `dev` | `ghcr.io/przemekp95/casnnext:dev` |
| Push tag `v1.2.3` | `ghcr.io/przemekp95/casnnext:v1.2.3`, `ghcr.io/przemekp95/casnnext:1.2.3`, `ghcr.io/przemekp95/casnnext:1.2` |

## Pull and Run

Pull latest `main` image:

```bash
docker pull ghcr.io/przemekp95/casnnext:main
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
- `docker-compose.portainer.yml` uses `ghcr.io/przemekp95/casnnext:main`

## Package Location

GHCR package page:

```text
https://github.com/przemekp95/casnnext/packages
```
