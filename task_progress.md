# Prisma Docker Fix - Task Progress

## Cel
Naprawi bBd "datasource.url property is required" w obrazie Docker, który powoduje ptl restartów aplikacji.

## Kroki do wykonania
- [ ] Przeanalizowa obecn konfiguracj Prisma
- [ ] Sprawdzi prisma/schema.prisma
- [ ] Sprawdzi prisma.config.ts
- [ ] Doda brakujcy datasource.url do schema.prisma
- [ ] Naprawi prisma.config.ts je[li potrzeba
- [ ] Utworzy/zmodyfikowa docker-entrypoint.sh
- [ ] Zaktualizowa Dockerfile
- [ ] Zweryfikowa zmiany

## Oczekiwany rezultat
- Aplikacja uruchamia si bez ptli restartów
- Prisma migrations dziaBaj poprawnie
- Konfiguracja Docker respektuje SKIP_PRISMA_MIGRATE=1