# Directus CMS Migration Guide

## Overview

Migracja z systemu plikowego + bazy danych na **Directus** - bezpłatny, open-source headless CMS.

**Dlaczego Directus?**
- ✅ **Bezpłatny** - zero kosztów licencji
- ✅ **Open source** - pełna kontrola
- ✅ **REST & GraphQL** - nowoczesne API
- ✅ **Real-time** - natychmiastowe aktualizacje

## Quick Start

### 1. Uruchom Directus
```bash
cd directus-setup
docker-compose up -d
```

### 2. Dostęp do panelu admin
- URL: http://localhost:8055
- Email: admin@casn.pl
- Hasło: admin123

### 3. Skonfiguruj kolekcje
Utwórz kolekcje **Authors** i **Analyses** zgodnie z instrukcjami w panelu Directus.

### 4. Import danych
Użyj skryptu migracyjnego do wygenerowania plików CSV:
```bash
node scripts/migrate-to-directus.js
```

### 5. Zaktualizuj kod aplikacji
```typescript
// Zmień importy w komponentach:
import { getAuthors } from 'lib/server/directus-authors';
import { getAnalyses } from 'lib/server/directus-analyses';
```

## Environment Variables

Dodaj do `.env.local`:
```env
DIRECTUS_URL=http://localhost:8055
DIRECTUS_TOKEN=your-static-token-here
```

## Production Deployment

Użyj PostgreSQL w produkcji:
```yaml
# Production docker-compose.yml
services:
  directus:
    environment:
      DB_CLIENT: postgres
      DB_HOST: postgres
      DB_DATABASE: casn
      # ... inne zmienne
```

## Cost Savings

- **Zamiast**: $489/miesiąc (Contentful)
- **Teraz**: ~$30/miesiąc (hosting)

**Oszczędność: 85% kosztów!**
