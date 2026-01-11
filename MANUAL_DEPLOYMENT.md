# 🚀 Ręczne wdrożenie CASN - Rozwiązanie bez automatycznych błędów

## 📋 Instrukcja krok po kroku

### Krok 1: Uruchomienie bazy danych

```bash
# Uruchom tylko bazę danych
docker-compose -f docker-compose.portainer.yml up -d mysql

# Poczekaj aż baza będzie gotowa (około 30 sekund)
sleep 30
```

### Krok 2: Sprawdzenie gotowości bazy

```bash
# Sprawdź czy baza odpowiada
docker-compose -f docker-compose.portainer.yml exec mysql mysql -u casn_user -pcasn_password123 -e "SELECT 1 as test;"
```

### Krok 3: Ręczne uzupełnienie bazy danych

**UWAGA: Ta komenda ma być wklejona w terminal kontenera, nie lokalnie!**

```bash
# Uruchom shella w kontenerze bazy danych
docker-compose -f docker-compose.portainer.yml exec mysql sh

# W kontenerze, wklej tę komendę:
mysql -u casn_user -pcasn_password123 casn < /docker-entrypoint-initdb.d/docker-init-db.sql

# Wyjdź z kontenera
exit
```

**Alternatywa - jedna komenda (bez wchodzenia do kontenera):**

```bash
docker-compose -f docker-compose.portainer.yml exec mysql mysql -u casn_user -pcasn_password123 casn < ./docker-init-db.sql
```

### Krok 4: Weryfikacja uzupełnienia bazy

```bash
# Sprawdź czy tabele zostały utworzone
docker-compose -f docker-compose.portainer.yml exec mysql mysql -u casn_user -pcasn_password123 -e "USE casn; SHOW TABLES;"

# Sprawdź liczbę autorów
docker-compose -f docker-compose.portainer.yml exec mysql mysql -u casn_user -pcasn_password123 -e "USE casn; SELECT COUNT(*) as authors_count FROM authors;"

# Sprawdź liczbę analiz
docker-compose -f docker-compose.portainer.yml exec mysql mysql -u casn_user -pcasn_password123 -e "USE casn; SELECT COUNT(*) as analyses_count FROM analyses;"
```

### Krok 5: Uruchomienie aplikacji

```bash
# Uruchom aplikację
docker-compose -f docker-compose.portainer.yml up -d app

# Sprawdź logi aplikacji
docker-compose -f docker-compose.portainer.yml logs -f app
```

### Krok 6: Test aplikacji

```bash
# Test aplikacji
curl http://localhost:18080

# Test endpointu autorów
curl http://localhost:18080/autorzy
```

---

## 🎯 Zalety tego podejścia:

✅ **Brak problemów z docker-entrypoint.sh** - pomija wszystkie skrypty automatyczne
✅ **Pełna kontrola** - widzisz dokładnie co się dzieje
✅ **Łatwe debugowanie** - każdy krok można sprawdzić
✅ **Elastyczność** - możesz łatwo poprawić dane bez rebuild'a
✅ **Sprawniejsze** - eliminuje złożone problemy z konfiguracją

---

## 🚨 Komendy w przypadku problemów:

### Reset całego środowiska:
```bash
docker-compose -f docker-compose.portainer.yml down -v
docker system prune -f
```

### Restart tylko aplikacji:
```bash
docker-compose -f docker-compose.portainer.yml restart app
```

### Sprawdzenie logów:
```bash
docker-compose -f docker-compose.portainer.yml logs mysql
docker-compose -f docker-compose.portainer.yml logs app
```

---

**Po wykonaniu tych kroków aplikacja powinna działać na porcie 18080 z pełną bazą danych zawierającą 31 autorów i 39 analiz.**