# Project Title

Centrum Analiz Służby Niepodległej (CASN) - Strona internetowa [Centrum Analiz Służby Niepodległej](https://casn.pl) oparta na **Next.js 15 (App Router)**. Projekt rozwijany z myślą o wydajności, SEO i prostym zarządzaniu treścią.

## Description

Strona internetowa Centrum Analiz Służby Niepodległej (CASN) - platforma publikująca analizy i artykuły w formacie MDX, zbudowana w oparciu o nowoczesne technologie webowe.

## Tech stack

### Core

- Next.js 15 (App Router) + React + TypeScript

### Dane

- Prisma ORM
- MySQL/MariaDB (silnik bazy danych)

### Treści

- MDX (artykuły i analizy w `posts/`)
- Obsługa obrazów w MDX przez `next/image`

### Styling & UI

- Bootstrap 5 + `legacy.css`
- Material Design Icons (mdi)

### Media & typografia

- `next/image` – optymalizacja i responsywne obrazy
- `next/font` – optymalizacja fontów Google (Roboto, Rubik)

### Jakość

- ESLint + type-checking (`tsc`) w trakcie builda
- Lighthouse – ręczne testy wydajności i SEO

### Deployment

- Budowanie: `npm run build`
- Uruchamianie: `npm run start` (z automatycznym `prisma migrate deploy`)
- Hosting: self-hosted (np. Cyber_Folks, własny serwer)

## Setup

Wymagania:
- Node.js 20+
- Baza danych MySQL/MariaDB

Konfiguracja:
1. Zainstaluj zależności: `npm install`
2. Skopiuj plik środowiskowy: `cp .env.example .env.local` i uzupełnij `DATABASE_URL`
3. Uruchom migracje: `npx prisma migrate deploy`
4. Start dev: `npm run dev`

## Getting Started

### Dependencies

* Node.js 20+
* MySQL/MariaDB
* Next.js 15
* React
* TypeScript

### Installing

* Sklonuj repozytorium
* Zainstaluj zależności: `npm install`
* Skonfiguruj bazę danych i zmienne środowiskowe
* Uruchom migracje: `npx prisma migrate deploy`

### Executing program

* Uruchom serwer deweloperski: `npm run dev`
* Otwórz http://localhost:3000 w przeglądarce
* Zbuduj aplikację produkcyjną: `npm run build`

## Help

W przypadku problemów sprawdź:
- Konfigurację zmiennych środowiskowych w `.env.local`
- Logi błędów w konsoli deweloperskiej
- Dokumentację Next.js i Prisma ORM

## Authors

Contributors names and contact info

PP Solutions Przemysław Pietrzak
contact@pietrzakprzemyslaw.pl

## Acknowledgments

Inspiration, code snippets, etc.
* [Next.js](https://nextjs.org/)
* [Prisma](https://www.prisma.io/)
* [MDX](https://mdxjs.com/)

## Version History

- 1.0
  - Pierwsza wersja produkcyjna z Next.js 15 i Prisma
- 0.1
  - Initial Release

## License

This project is licensed under the MIT License - see the LICENSE.md file for details

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
[Prisma ORM (optional)] → Migration + Query Builder
```

## Data Flow Diagram

1. User requests page (e.g., /analiza/slug)
2. Next.js fetches article metadata from MySQL DB
3. Next.js reads MDX file from filesystem
4. MDX processed by MDXContent with components (SafeImage, Chart, Map)
5. HTML rendered and served to user
6. Client-side JS handles mobile menu interactions (LegacyScripts)

## Changelog

Follows Conventional Commits.

- feat: add API endpoint for articles
- fix: correct table names case sensitivity
- refactor: move mobile menu to separate component

> **EN summary**: This project is a Next.js 15 web app for an NGO, featuring articles in MDX and a Prisma ORM backend.
