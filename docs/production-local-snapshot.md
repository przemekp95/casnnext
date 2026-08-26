# Snapshot produkcji CASN do odizolowanego środowiska lokalnego

Ten runbook odtwarza lokalnie pełną bazę MySQL oraz wolumeny plików Directusa i starego Strapi. Kierunek danych jest wyłącznie produkcja → zaszyfrowany artefakt → nowy lokalny kandydat. Skrypty lokalne nie mają funkcji wysyłania bazy ani plików do produkcji. Nie wolno przechodzić przez bramki zgody na podstawie samego statusu kontenera; każda bramka wymaga wskazanych kontroli zdrowia i tożsamości.

## Stałe bezpieczeństwa

- Jedyny publikowany port lokalny to HTTP nginx przypięty do `127.0.0.1`. MySQL, aplikacja i Directus pozostają wyłącznie w wewnętrznej sieci Dockera; baza jest dostępna administracyjnie przez `docker compose exec`, nie przez port hosta.
- Nginx jest jedyną usługą podłączoną także do sieci wejściowej. Importer i verifier sprawdzają faktyczne etykiety, obrazy, montowania, powiązania portów i dokładne zestawy sieci przed uruchomieniem kandydata oraz podczas parytetu.
- Lokalna baza zawsze nazywa się `casn_local`, a jej `server_uuid` musi różnić się od produkcyjnego.
- Import tworzy nowe, nazwane snapshotem wolumeny i nie usuwa poprzedniego środowiska.
- Eksporter produkcyjny korzysta z osobnego konta tylko do odczytu, zatrzymuje wyłącznie Directusa i zawsze próbuje go ponownie uruchomić w `trap`.
- Przed zatrzymaniem Directusa eksporter potwierdza, że wskazany wolumen Directusa jest faktycznie zamontowany jako zapisywalny w `/directus/uploads`, a wolumen legacy jako tylko do odczytu w `/legacy-strapi-uploads` usługi nginx. `SOURCE_NGINX_SERVICE` jest obowiązkową częścią konfiguracji źródła.
- Manifest zapisuje dla każdego rodzaju mediów reprezentatywną ścieżkę i źródło dowodu (`public-api`, `directus-db`, `volume-inventory`, `empty-volume` lub jawne `no-directus-record`). Każda zapisana ścieżka przechodzi później rzeczywisty test HTTP przez lokalny nginx.
- Artefakt jest szyfrowany `age` przed opuszczeniem katalogu tymczasowego. Klucz prywatny pozostaje lokalnie i ma tryb `0600`.
- Dowody API mogą być pobierane przez zweryfikowany origin `http://127.0.0.1:PORT`, gdy edge blokuje hairpin przez Cloudflare. Eksporter odrzuca każdy zwykły HTTP poza dokładnym loopbackiem, a zewnętrzne publiczne health-checki pozostają osobną bramką.
- Wyniku `SHOW GRANTS` nie wolno wklejać do Git, czatu, zgłoszenia ani logu CI. To wrażliwy dowód operacyjny; zapisujemy go tylko w zatwierdzonym katalogu właściciela z trybem `0600`.

## Bramka 1 — inwentaryzacja tylko do odczytu

Ustaw nazwany alias SSH; surowy adres IP nie jest akceptowany przez instalator:

```bash
CASN_SNAPSHOT_SSH_TARGET=casn-mikrus
CASN_SNAPSHOT_EVIDENCE_DIRECTORY="$(mktemp -d /tmp/casn-snapshot-evidence.XXXXXXXX)"
chmod 700 "$CASN_SNAPSHOT_EVIDENCE_DIRECTORY"
```

Na serwerze, bez zatrzymywania i bez modyfikowania usług, ustal dokładnie po jednym zasobie dla każdej etykiety Compose. Zapisuj tylko identyfikatory, etykiety, skróty tożsamości oraz stan zdrowia — bez wartości rekordów i sekretów:

```bash
ssh "$CASN_SNAPSHOT_SSH_TARGET" 'bash -s' > "$CASN_SNAPSHOT_EVIDENCE_DIRECTORY/inventory.txt" <<'REMOTE'
set -euo pipefail
docker ps --format '{{.ID}} {{.Image}} {{.Labels}} {{.Status}}'
docker volume ls --format '{{.Name}} {{.Labels}}'
docker network ls --format '{{.Name}} {{.Labels}}'
docker inspect $(docker ps -q) --format '{{.Id}} image={{.Image}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'
REMOTE
chmod 600 "$CASN_SNAPSHOT_EVIDENCE_DIRECTORY/inventory.txt"
```

Operator bazy wylicza hash nazwy wybranej bazy i `@@server_uuid` po stronie serwera. Surowych wartości nie zapisujemy:

```bash
ssh "$CASN_SNAPSHOT_SSH_TARGET" 'bash -s' > "$CASN_SNAPSHOT_EVIDENCE_DIRECTORY/database-identity.sha256" <<'REMOTE'
set -euo pipefail
read -r -p 'Exact MySQL container id: ' mysql_id
read -r -p 'Exact production database name: ' database_name
[[ "$mysql_id" =~ ^[0-9a-f]{12,64}$ ]]
[[ "$database_name" =~ ^[A-Za-z0-9_.-]+$ ]]
docker exec "$mysql_id" sh -ec \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root --database="$1" --execute "SELECT DATABASE(), @@server_uuid;"' \
  sh "$database_name" \
  | while IFS=$'\t' read -r database_name server_uuid; do
      printf 'database_name_sha256=%s\n' "$(printf %s "$database_name" | sha256sum | awk '{print $1}')"
      printf 'server_uuid_sha256=%s\n' "$(printf %s "$server_uuid" | sha256sum | awk '{print $1}')"
    done
REMOTE
chmod 600 "$CASN_SNAPSHOT_EVIDENCE_DIRECTORY/database-identity.sha256"
```

Potwierdź osobno publiczne `200` dla `/`, `/api/health`, `/api/authors`, `/api/analyses` i `/cms/server/ping`. Jeśli inwentaryzacja nie rozwiązuje dokładnie jednego kontenera, wolumenu lub sieci dla wymaganej etykiety, przerwij.

## Bramka 2 — konto tylko do odczytu i instalacja

Przed wykonaniem tej sekcji przedstaw użytkownikowi dokładne nazwy/etykiety, hashe tożsamości bazy, digesty obrazów, ścieżkę instalacji, zakres grantów i komendę odzyskania Directusa. Wymagana jest jawna zgoda na utworzenie konta oraz instalację. Ta zgoda nie obejmuje snapshotu.

DBA tworzy konto z silnym hasłem podanym interaktywnie na serwerze, nigdy w argv ani w czacie:

```sql
CREATE USER 'casn_snapshot'@'%' IDENTIFIED BY '<wartość podana bezpośrednio w sesji DBA>';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON `casn`.* TO 'casn_snapshot'@'%';
GRANT SHOW_ROUTINE ON *.* TO 'casn_snapshot'@'%';
```

Następująca kontrola musi zwrócić `PASS`. Każdy inny wynik blokuje dalsze kroki:

```sql
SELECT IF(COUNT(*) = 0, 'PASS', 'FAIL') AS forbidden_privileges
FROM (
  SELECT PRIVILEGE_TYPE, 'GLOBAL' AS privilege_scope
  FROM information_schema.USER_PRIVILEGES
  WHERE GRANTEE = '''casn_snapshot''@''%'''
    AND PRIVILEGE_TYPE NOT IN ('USAGE', 'SHOW_ROUTINE')
  UNION ALL
  SELECT PRIVILEGE_TYPE, 'SCHEMA'
  FROM information_schema.SCHEMA_PRIVILEGES
  WHERE GRANTEE = '''casn_snapshot''@''%'''
    AND TABLE_SCHEMA = 'casn'
    AND PRIVILEGE_TYPE NOT IN ('SELECT', 'SHOW VIEW', 'TRIGGER', 'EVENT')
  UNION ALL
  SELECT PRIVILEGE_TYPE, 'OTHER_SCHEMA'
  FROM information_schema.SCHEMA_PRIVILEGES
  WHERE GRANTEE = '''casn_snapshot''@''%''' AND TABLE_SCHEMA <> 'casn'
  UNION ALL
  SELECT PRIVILEGE_TYPE, 'TABLE'
  FROM information_schema.TABLE_PRIVILEGES
  WHERE GRANTEE = '''casn_snapshot''@''%'''
) forbidden;
```

Sprawdź też obecność wszystkich pięciu wymaganych uprawnień. `SHOW GRANTS FOR 'casn_snapshot'@'%';` przechowuj wyłącznie jako właścicielski dowód `0600` poza repozytorium i czatem.

Instaluj pliki wyłącznie z przejrzanego commita:

```bash
CASN_SNAPSHOT_REVIEWED_COMMIT="$(git rev-parse HEAD)"
bash scripts/snapshot/install-production-exporter.sh \
  --ssh-target "$CASN_SNAPSHOT_SSH_TARGET" \
  --remote-root / \
  --reviewed-commit "$CASN_SNAPSHOT_REVIEWED_COMMIT"
```

Instalator nie uruchamia eksportera. Administrator uzupełnia bezpośrednio na serwerze `/etc/casn-snapshot/export.env`, ustawia `root:root` i `0600`, a następnie wykonuje tylko:

Eksporter wymaga `age`, `curl`, `docker`, `jq`, `openssl`, `sha256sum` i `tar` na serwerze. Na Ubuntu 24.04 brakujące `age` instalujemy jako pojedynczy pakiet systemowy, bez aktualizacji pozostałych pakietów:

```bash
sudo apt-get install --no-install-recommends age
age --version
```

Następnie wykonaj tylko preflight:

```bash
sudo /usr/local/libexec/casn-snapshot/export-production.sh \
  --env-file /etc/casn-snapshot/export.env --preflight-only
```

Preflight ma zakończyć się komunikatem `preflight verified`, bez `docker stop` i bez utworzonego artefaktu.

## Bramka 3 — okno snapshotu i odzyskanie Directusa

Przed snapshotem pokaż: wynik preflight, publiczne health-checki, dokładny kontener Directusa, przewidywaną przerwę zapisu, katalog wyjściowy i poniższą komendę odzyskania. Wymagana jest osobna jawna zgoda na krótkie zatrzymanie Directusa.

Komenda awaryjna rozwiązuje dokładnie jeden kontener po zatwierdzonych etykietach; niczego nie usuwa:

```bash
CASN_SOURCE_COMPOSE_PROJECT='wartość z zatwierdzonej inwentaryzacji'
CASN_SOURCE_DIRECTUS_SERVICE='wartość z zatwierdzonej inwentaryzacji'
ssh "$CASN_SNAPSHOT_SSH_TARGET" 'bash -s' -- \
  "$CASN_SOURCE_COMPOSE_PROJECT" "$CASN_SOURCE_DIRECTUS_SERVICE" <<'REMOTE'
set -euo pipefail
compose_project="$1"
directus_service="$2"
mapfile -t ids < <(docker ps -a \
  --filter "label=com.docker.compose.project=$compose_project" \
  --filter "label=com.docker.compose.service=$directus_service" \
  --format '{{.ID}}')
[[ "${#ids[@]}" == 1 ]]
docker start "${ids[0]}" >/dev/null
for attempt in {1..30}; do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "${ids[0]}")"
  [[ "$state" == healthy ]] && exit 0
  sleep 1
done
exit 1
REMOTE
```

Po zgodzie wykonaj eksporter raz:

```bash
ssh "$CASN_SNAPSHOT_SSH_TARGET" \
  sudo /usr/local/libexec/casn-snapshot/export-production.sh \
  --env-file /etc/casn-snapshot/export.env
```

Przed pobraniem potwierdź `0600` manifestu i zaszyfrowanego artefaktu, zapisz ich SHA-256 w dowodach, a następnie sprawdź stan Directusa oraz publiczne `/`, `/api/health`, `/api/authors`, `/api/analyses` i `/cms/server/ping`. Nie usuwaj kopii serwerowej.

## Bramka 4 — lokalny kandydat i parytet

Pobierz manifest i artefakt do właścicielskiego katalogu `0700`, ustaw pliki na `0600` i porównaj lokalne SHA-256 z dowodami produkcyjnymi. Dopiero wtedy odszyfruj/importuj:

```bash
bash scripts/snapshot/import-local.sh \
  --artifact "$CASN_SNAPSHOT_ARTIFACT" \
  --manifest "$CASN_SNAPSHOT_MANIFEST" \
  --identity "$CASN_SNAPSHOT_AGE_IDENTITY" \
  --env-file "$CASN_SNAPSHOT_LOCAL_ENV" \
  --snapshot-id "$CASN_SNAPSHOT_ID"

node scripts/snapshot/verify-parity.mjs \
  --handoff "$CASN_SNAPSHOT_HANDOFF" \
  --manifest "$CASN_SNAPSHOT_MANIFEST" \
  --base-url "$CASN_SNAPSHOT_LOCAL_URL" \
  --report "$CASN_SNAPSHOT_PARITY_REPORT"
```

Raport musi mieć `passed: true`. Następnie w lokalnej przeglądarce sprawdź widoki desktop/mobile: stronę główną, autorów, analizy, zbiory, strony szczegółowe, logowanie Directusa, nowy asset i historyczny upload. Akceptacja wizualna uzupełnia parytet manifestu, ale go nie zastępuje.

## Bramka 5 — lokalne przełączenie i późniejsze sprzątanie

Przed zmianą `.env.local` przedstaw snapshot id, czas pozyskania, wszystkie liczniki i hashe, raport parytetu, wynik przeglądarki oraz nazwę poprzedniego lokalnego projektu. Wymagana jest jawna zgoda na lokalne przełączenie.

Po zgodzie ustaw w `.env.local` wyłącznie loopbackowy host/port kandydata i nazwę `casn_local`, zrestartuj lokalny serwer aplikacji i powtórz health-checki oraz kontrolę przeglądarkową. Poprzednie kontenery i wolumeny zachowaj jako rollback. Cofnięcie polega na przywróceniu poprzednich lokalnych wartości i restarcie aplikacji; nie wymaga żadnej operacji na produkcji.

Usunięcie starego lokalnego projektu, lokalnych odszyfrowanych plików lub serwerowej kopii artefaktu jest odrębną operacją destrukcyjną i wymaga późniejszej, osobnej zgody z dokładną listą zasobów.
