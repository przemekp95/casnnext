# Test CI/CD + GHCR - Instrukcje

## Status

✅ **Pomyślnie dodano workflow dla GHCR**  
❌ **Nie można przetestować lokalnie (brak Docker)**  
❌ **Repozytorium wymaga Pull Request do merge**  

## Dodane pliki

### 1. Workflow GitHub Actions
**Plik: `.github/workflows/docker.yml`**
- Automatyczne budowanie i publikowanie obrazów Docker
- Push do GHCR przy każdym push na `main`
- Inteligentne tagowanie (branch, PR, semver, SHA)

### 2. Dokumentacja
**Plik: `docs/docker-ghcr.md`**
- Kompletna dokumentacja użycia GHCR
- Przykłady komend Docker
- Instrukcje deploymentu

## Aby przetestować GHCR

### Opcja 1: Utworzenie Pull Request
```bash
# 1. Utwórz branch
git checkout -b feat/docker-ghcr

# 2. Przenieś pliki workflow (muszą być w PR)
git checkout feature/docker-compose-setup -- .github/workflows/docker.yml
git checkout feature/docker-compose-setup -- docs/docker-ghcr.md

# 3. Commit + push + utwórz PR przez GitHub UI
```

### Opcja 2: Uruchomienie testowe
```bash
# 1. Temporarily disable PR requirement w repo settings
# 2. Push na main
git push origin main
# 3. Workflow automatycznie się uruchomi
```

### Opcja 3: Manual test w GitHub Actions
1. Idź na GitHub Actions
2. Wybierz workflow "Docker Build and Push"
3. Kliknij "Run workflow"
4. Sprawdź GHCR dla obrazów

## Sprawdzenie obrazów

Po uruchomieniu workflow sprawdź:
- GitHub Actions tab
- Package registry: https://github.com/przemekp95/casn/packages

## Struktura tagów

| Event | Tag |
|-------|-----|
| Push na `main` | `ghcr.io/przemekp95/casn:main` |
| Tag `v1.2.3` | `ghcr.io/przemekp95/casn:v1.2.3` |
| PR | `ghcr.io/przemekp95/casn:pr-123` |

## Błędy napotkane

❌ **Docker nie zainstalowany lokalnie** - nie można przetestować lokalnie  
❌ **Repository rules** - PR wymagany do merge na main  
✅ **Workflow dodany pomyślnie** - gotowy do testowania przez PR