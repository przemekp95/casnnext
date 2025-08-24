# Centrum Analiz Służby Niepodległej (CASN)

Strona internetowa [Centrum Analiz Służby Niepodległej](https://casn.pl) oparta na **Next.js 15 (App Router)**.  
Projekt rozwijany z myślą o wydajności, SEO i prostym zarządzaniu treścią.

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
