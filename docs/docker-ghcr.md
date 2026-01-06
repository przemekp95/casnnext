# Docker Images w GitHub Container Registry (GHCR)

## Automatyczne publikowanie

Projekt automatycznie publikuje obrazy Docker do GitHub Container Registry (GHCR) przy każdym push na główną gałąź.

### Workflow `docker.yml`

Workflow automatycznie:
- ✅ Buduje obrazy Docker z `Dockerfile`
- ✅ Taguje obrazy na podstawie branch, PR, semver i SHA
- ✅ Pushuje obrazy do GHCR
- ✅ Używa cache dla szybszych buildów

### Struktura tagów

| Event | Tag | Przykład |
|-------|-----|----------|
| Push na `main` | `ghcr.io/przemekp95/casn:main` | `ghcr.io/przemekp95/casn:main` |
| Push tag `v1.2.3` | `ghcr.io/przemekp95/casn:v1.2.3` | `ghcr.io/przemekp95/casn:v1.2.3` |
| Push tag `v1.2.3` | `ghcr.io/przemekp95/casn:1.2` | `ghcr.io/przemekp95/casn:1.2` |
| Pull Request | `ghcr.io/przemekp95/casn:pr-123` | `ghcr.io/przemekp95/casn:pr-123` |
| SHA commit | `ghcr.io/przemekp95/casn:main-a1b2c3d` | `ghcr.io/przemekp95/casn:main-a1b2c3d` |

### Używanie obrazów

#### Pullowanie najnowszego obrazu z main:
```bash
docker pull ghcr.io/przemekp95/casn:main
```

#### Uruchamianie aplikacji z GHCR:
```bash
# Podstawowe uruchomienie
docker run -d -p 3000:3000 \
  --name casn-app \
  ghcr.io/przemekp95/casn:main

# Z zmiennymi środowiskowymi
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=mysql://user:pass@host:3306/db \
  --name casn-app \
  ghcr.io/przemekp95/casn:main
```

#### Używanie z docker-compose (GHCR version):
```yaml
services:
  app:
    image: ghcr.io/przemekp95/casn:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://user:pass@mysql:3306/casn
    depends_on:
      - mysql
```

### Dostępność obrazów

Obrazy są publicznie dostępne w GHCR pod adresem:
`https://github.com/przemekp95/casn/packages`

### Bezpieczeństwo

- ✅ Używa `GITHUB_TOKEN` do uwierzytelnienia
- ✅ Publiczny dostęp do obrazów (read-only dla publicznych repozytoriów)
- ✅ Cache builds dla bezpieczeństwa i wydajności

### Aktualizacja

Aby zaktualizować aplikację:
1. Wprowadź zmiany w kodzie
2. Push na `main` lub utwórz tag
3. Workflow automatycznie zbuduje i opublikuje obraz
4. Pull nowego obrazu na serwerze produkcyjnym