# prisma/

Katalog `prisma/` zawiera pliki ORM Prisma:

- **schema.prisma** – definicja modeli bazy danych.
- **migrations/** – automatycznie wygenerowane migracje.
- **analyses_missing_authors.txt** – (tymczasowe) logi importu treści.

Aby zsynchronizować schemat bazy:
```bash
npx prisma migrate deploy
