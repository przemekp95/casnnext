# CASN Standalone

**Centrum Analiz Strategicznych i Naukowych - Wersja Standalone**

To jest gotowa do wdrożenia wersja aplikacji CASN, która może być uruchomiona na dowolnym serwerze z Node.js.

## Szybki start

### 1. Wymagania systemowe
- Node.js 20+ 
- MySQL 8.0+ lub MariaDB 10.6+

### 2. Konfiguracja
```bash
# Skopiuj plik konfiguracyjny
cp .env.example .env

# Edytuj plik .env zgodnie z Twoją konfiguracją bazy danych
nano .env
```

### 3. Uruchomienie
```bash
# Uruchom aplikację
./start.sh
```

Aplikacja będzie dostępna pod adresem: http://localhost:3000

## Struktura plików

```
casn-standalone-package/
├── .env.example           # Przykładowy plik konfiguracyjny
├── .next/                 # Kompilowane pliki Next.js
├── public/                # Zasoby statyczne
├── static/                # Dodatkowe zasoby
├── start.sh              # Skrypt uruchomienia
├── server.js             # Serwer aplikacji
└── DEPLOYMENT.md         # Szczegółowa instrukcja wdrożenia
```

## Funkcjonalności

- ✅ Pełna funkcjonalność aplikacji CASN
- ✅ Obsługa MDX i dynamicznego renderowania
- ✅ Responsywny design
- ✅ Optymalizacja obrazów
- ✅ SEO-friendly
- ✅ API endpoints
- ✅ Obsługa wielu autorów
- ✅ System publikowania artykułów

## Rozwiązywanie problemów

Najczęstsze problemy i rozwiązania znajdziesz w pliku `DEPLOYMENT.md`.

### Podstawowe polecenia diagnostyczne:
```bash
# Sprawdź wersję Node.js
node -v

# Sprawdź połączenie z bazą danych
mysql -u casn_user -p -h localhost casn_database

# Sprawdź logi aplikacji
./start.sh
```

## Licencja i wsparcie

- **Wersja**: 1.0.0
- **Data kompilacji**: 2025-12-23
- **Next.js**: 16.1.1

Szczegółowe instrukcje wdrożenia, konfiguracji i rozwiązywania problemów znajdują się w pliku `DEPLOYMENT.md`.