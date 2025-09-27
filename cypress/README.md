# Cypress

Prosty przegląd użycia/celu.

## Description

Katalog `cypress/` zawiera testy end-to-end (E2E) dla aplikacji webowej, napisane przy użyciu frameworka Cypress.

## Getting Started

### Dependencies

* Node.js
* Cypress

### Installing

* Testy są uruchamiane jako część głównego procesu instalacji
* Upewnij się, że wszystkie zależności są zainstalowane: `npm install`

### Executing program

* Uruchom testy w trybie interaktywnym
```
npx cypress open
```
* Uruchom testy w trybie headless
```
npx cypress run
```

## Help

W przypadku problemów sprawdź konfigurację Cypress w `cypress.config.ts` i upewnij się, że serwer deweloperski jest uruchomiony.
