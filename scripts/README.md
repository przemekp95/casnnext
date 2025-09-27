# Scripts

Prosty przegląd użycia/celu.

## Description

Katalog `scripts/` zawiera skrypty pomocnicze do automatyzacji zadań związanych z projektem, takich jak sprawdzanie postów, przygotowywanie plików tymczasowych i seedowanie bazy danych.

## Getting Started

### Dependencies

* Node.js
* Bash (dla skryptów powłoki)

### Installing

* Skrypty są gotowe do użycia po zainstalowaniu zależności projektu
* Upewnij się, że masz uprawnienia do wykonania: `chmod +x scripts/*.sh`

### Executing program

* Sprawdź posty w projekcie
```
./scripts/check-posts.sh
```
* Przygotuj pliki tymczasowe
```
node scripts/prepare-tmp.js
```
* Seeduj bazę danych
```
node scripts/seed.cjs
```

## Help

W przypadku problemów sprawdź uprawnienia plików i upewnij się, że wszystkie zależności są zainstalowane.
