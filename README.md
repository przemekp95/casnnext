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

> **EN summary**: This project is a Next.js 15 web app for an NGO, featuring articles in MDX and a Prisma ORM backend.
