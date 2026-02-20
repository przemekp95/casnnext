# Centrum Analiz Służby Niepodległej (CASN)

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)

Strona internetowa [Centrum Analiz Służby Niepodległej](https://casn.pl) oparta na **Next.js 16 (App Router)**. Platforma publikująca analizy i artykuły w formacie MDX z myślą o wydajności, SEO i prostym zarządzaniu treścią.

## 🏗️ Architektura

### Tech Stack

**Core:**
- Next.js 16 (App Router) + React 19 + TypeScript 5.6

**Database:**
- TypeORM + MySQL 8.0/MariaDB

**Content:**
- MDX (artykuły i analizy w `posts/`)
- Next.js Image Optimization
- Strapi 5 CMS (opcjonalny provider treści przez `CONTENT_PROVIDER=strapi`)

**Styling:**
- Bootstrap 5 + Custom legacy styles
- Material Design Icons

**Quality:**
- ESLint + TypeScript strict checking
- Cypress E2E testing
- Lighthouse performance monitoring

**Deployment:**
- Docker + Docker Compose
- Nginx reverse proxy
- Self-hosted infrastructure

## 🚀 Szybki start

### Wymagania
- Node.js 20+
- Docker & Docker Compose (dla deploymentu)
- MySQL/MariaDB

### Instalacja lokalna
```bash
# Klonowanie repo
git clone <repository>
cd casn

# Instalacja zależności
npm install

# Konfiguracja środowiska
cp docker-compose.env.example .env
# Edytuj .env z właściwymi ustawieniami

# Uruchomienie migracji bazy danych
npm run migration:run

# Start serwera deweloperskiego
npm run dev
```

### Strapi CMS (opcjonalnie)
```bash
# Uruchom z Docker Compose (app + mysql + strapi)
docker compose -f docker-compose.final.yml up --build

# Import danych legacy -> Strapi
npm run cms:import

# Weryfikacja zgodności po imporcie
npm run cms:verify
```

Szczegóły konfiguracji: `docs/strapi-cms.md`.

### Docker deployment
```bash
# Szybki start wszystkich usług
./docker-start.sh
# lub
docker-compose up --build -d

# Dostęp do aplikacji
# - Aplikacja: http://localhost:3000
# - Z Nginx proxy: http://localhost:80
```

## 🧪 Testowanie

### E2E Tests (Cypress)
```bash
# Uruchomienie testów E2E
npm run test:e2e

# W trybie headless (CI)
npm run test:e2e
```

### Unit Tests (Jest)
```bash
# Uruchomienie testów jednostkowych
npm run test

# Z coverage
npm run test -- --coverage
```

### TypeScript Checking
```bash
# Sprawdzenie typów
npm run type-check
```

### Linting
```bash
# Sprawdzenie kodu
npm run lint

# Auto-fix
npm run lint:fix
```


## Help

W przypadku problemów sprawdź:
- Konfigurację zmiennych środowiskowych w `.env.local`
- Logi błędów w konsoli deweloperskiej
- Dokumentację Next.js i TypeORM

## Authors

Contributors names and contact info

PP Solutions Przemysław Pietrzak
contact@pietrzakprzemyslaw.pl

## Acknowledgments

Inspiration, code snippets, etc.
* [Next.js](https://nextjs.org/)
* [TypeORM](https://typeorm.io/)
* [MDX](https://mdxjs.com/)

## 📋 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checking
npm run test:e2e     # Run Cypress E2E tests
```

### Project Structure
```
casn/
├── app/                 # Next.js App Router
│   ├── api/            # API routes
│   ├── _components/    # Reusable components
│   └── (pages)/        # App pages
├── components/         # UI components
├── lib/               # Database, utilities
├── posts/             # MDX articles
├── cypress/           # E2E tests
└── public/            # Static assets
```

## 🔧 Deployment

### Docker Production Setup
```bash
# Build and deploy
docker-compose -f docker-compose.final.yml up --build -d

# With Portainer management
docker-compose -f docker-compose.portainer.yml up --build -d
```

### Environment Variables
See `docker-compose.env.example` for required configuration:
- Database connection strings
- NextAuth secrets
- Application URLs

## 📄 License

This project is licensed under the MIT License - see the LICENSE.md file for details

## 📊 Version History

- **1.1.0** (2026-01-10)
  - Updated to Next.js 16 and React 19
  - Added Cypress E2E testing
  - Docker deployment improvements
  - TypeScript strict mode enabled

- **1.0.0** (2024)
  - First production release with Next.js 15 and TypeORM
  - MDX article system
  - MySQL database integration

- **0.1.0**
  - Initial development release

## API Documentation

### Endpoints

#### POST /api/articles
Tworzenie nowego artykułu.

**Request Body:**
```json
{
  "title": "Tytuł artykułu",
  "slug": "slug-artykulu",
  "authorId": 1
}
// lub
{
  "title": "Tytuł artykułu",
  "slug": "slug-artykulu",
  "authorSlug": "autor-slug"
}
```

**Response:**
```json
{
  "id": 1,
  "title": "Tytuł artykułu",
  "slug": "slug-artykulu",
  "authorId": 1
}
```

#### GET /api/articles
Pobieranie listy artykułów.

**Response:**
```json
[
  {
    "id": 1,
    "title": "Tytuł artykułu",
    "slug": "slug-artykulu",
    "authorId": 1,
    "author_name": "Nazwa autora",
    "author_slug": "autor-slug"
  }
]
```

#### POST /api/client-log
Logowanie błędów klienta.

**Request Body:**
```json
{
  "type": "error",
  "message": "Error message"
}
```

#### POST /api/revalidate
Invalidacja cache dla taga.

**Request Body:**
```json
{
  "tag": "articles"
}
```

## Database Schema

### Tabele

- **Author**: Autorzy artykułów
  - `id` (PRIMARY KEY)
  - `slug` (UNIQUE)
  - `name` (VARCHAR(255))
  - `img` (VARCHAR(255))
  - `bio` (TEXT)

- **Analysis**: Analizy/artykóły
  - `id` (PRIMARY KEY)
  - `title` (VARCHAR(255))
  - `slug` (UNIQUE, VARCHAR(191))
  - `authorId` (FOREIGN KEY -> Author.id)

## Architecture Diagram

```
[Browser]
    ↓
[Next.js App Router] → API Routes (/api) → MySQL Database
    →
[MDX Files (posts/)] ← Processed by MDXContent Component
    →
[TypeORM] → Migration + Query Builder
```

## Data Flow Diagram

1. User requests page (e.g., /analiza/slug)
2. Next.js fetches article metadata from MySQL DB
3. Next.js reads MDX file from filesystem
4. MDX processed by MDXContent with components (SafeImage, Chart, Map)
5. HTML rendered and served to user
6. Client-side JS handles mobile menu interactions (LegacyScripts)

## 📝 Changelog

Follows [Conventional Commits](https://conventionalcommits.org/):

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation updates
- `test:` testing improvements
- `refactor:` code restructuring
- `build:` build system changes

### Recent Changes
- `fix(build):` exclude Cypress config from TypeScript compilation
- `test(e2e):` fix tests for plain text responses from broken app
- `feat:` add comprehensive Docker deployment setup
