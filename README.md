# 🏰 Citadel for NG — wersja TypeScript (Citadel V3 rewrite)

Pełne przepisanie aplikacji **Citadel V3** (Python / Streamlit) na lekki stos **TypeScript**:
ten sam wygląd, te same funkcje, te same wyniki obliczeń — bez Pythona.

| Warstwa | Oryginał | Teraz |
| :--- | :--- | :--- |
| Backend | Python 3.11 + Streamlit (serwer reruns) | **Node 22 + Hono** (API JSON, ~14 kB) |
| Baza danych | PostgreSQL przez psycopg | **PostgreSQL** przez `postgres` **lub wbudowany PGlite** (Postgres w WASM, zero instalacji) |
| UI | Streamlit + wstrzykiwany CSS | **Svelte 5 + Vite** (SPA), CSS custom properties dla 3 motywów |
| Wykresy | Plotly (Python) | **Plotly.js** (te same wykresy, ten sam wygląd) |
| Testy | pytest | **Vitest** (jednostkowe + API + parity z Pythonem) i **Playwright** (E2E) |

Schemat bazy jest **identyczny** z oryginałem (te same tabele, trigger audytu, widoki, indeksy), a hasła
są haszowane tak samo (PBKDF2-HMAC-SHA256, 200 000 iteracji), więc **istniejącą bazę produkcyjną można podłączyć bez migracji**
i wszystkie konta działają od razu.

---

## 🚀 Uruchomienie

```bash
npm install
npm run build          # buduje frontend do web/dist
npm start              # http://localhost:8700
```

Bez `DATABASE_URL` aplikacja startuje na **wbudowanej bazie PGlite** (dane w `PGLITE_DIR`, domyślnie w pamięci).
Z `DATABASE_URL` łączy się z PostgreSQL:

```bash
cp .env.example .env   # i uzupełnij DATABASE_URL / SESSION_SECRET
```

| Zmienna | Znaczenie |
| :--- | :--- |
| `DATABASE_URL` | `postgresql://user:haslo@host:5432/citadel_db` — pusta = PGlite |
| `PGLITE_DIR` | katalog danych PGlite (pusty = baza w pamięci, znika po restarcie) |
| `SESSION_SECRET` | sekret podpisu ciasteczka sesji (wymagany produkcyjnie) |
| `PORT` | port HTTP (domyślnie 8700) |
| `SEED_DEMO=1` | ładuje dane demo do pustej bazy (regiony, koła, członkowie, konta testowe) |

Pierwsze uruchomienie tworzy konto `admin` / `Centauri2026!` z wymuszoną zmianą hasła (jak w oryginale).

### Kopia bazy produkcyjnej (Neon) w lokalnym Dockerze

```bash
npm run db:pull-prod          # pg_dump z DATABASE_URL w .env → backups/neon_*.dump → kontener citadel-local-pg (port 5433)
npm run db:restore -- backups/neon_XXXX.dump   # ponowne wczytanie istniejącego zrzutu
npm run start:local-db        # aplikacja na lokalnej kopii (postgresql://citadel:citadel@localhost:5433/citadel_local)
```

Zrzut wykonywany jest wyłącznie odczytem (`pg_dump`) przez bezpośredni endpoint Neon (bez `-pooler`).
Katalog `backups/` jest w `.gitignore` — zrzuty zawierają dane produkcyjne.

### Wdrożenie: Netlify (https://citadel-ng.netlify.app)

* SPA z `web/dist` + API jako Netlify Function (`netlify/functions/api.mts`), konfiguracja w `netlify.toml`.
* Baza: **Netlify Database** (Postgres). Schemat jest migracją `netlify/database/migrations/*_citadel_schema`
  (generowaną przez `npx tsx scripts/gen-netlify-migration.ts`), stosowaną przy każdym wdrożeniu. Wyzwalacze audytu
  instaluje aplikacja przy starcie, jak oryginał.
* Zmienne: `SESSION_SECRET` (ustawiona), opcjonalnie `DATABASE_URL` (nadpisuje Netlify Database), `SKIP_SCHEMA_INIT=1`.
* Wdrożenie: `npx netlify deploy --prod --build`.
* Dane zostały zaimportowane jednorazowo ze zrzutu Citadel V3 migracją `*_import_citadel_data`, która zawiera dane
  rzeczywiste i **nie jest w repozytorium** (`.gitignore`). Wdrożenie z innej kopii repozytorium pominie ten plik;
  Netlify zgłosi wtedy brak zastosowanej migracji — należy wdrażać z tej kopii lub zachować plik lokalnie.

### Tryb deweloperski (hot reload)

```bash
npm run dev            # API (tsx watch) + Vite dev server na http://localhost:5173
```

### Konta demo (`SEED_DEMO=1`)

| Login | Hasło | Rola |
| :--- | :--- | :--- |
| `admin2` | `Admin1234!` | ADMIN |
| `krajowy` | `Krajowy1234!` | SKARBNIK_KRAJOWY |
| `region_maz` | `Region1234!` | SKARBNIK_REGIONU (Mazowsze) |
| `kolo_waw` | `Kolo1234!` | SKARBNIK_KOLA (Koło Warszawa) |

---

## 🧪 Testy

```bash
npm test               # Vitest: jednostkowe (port pytest), API (PGlite in-memory), parity z Pythonem
npm run test:e2e       # Playwright: pełny przebieg UI na zasilonej bazie PGlite
npm run test:e2e:ui    # tryb interaktywny Playwright
```

* `tests/unit` — przeniesione testy `test_celestia.py` i `test_kdi.py` plus testy pomocników zgodności z Pythonem (zaokrąglanie, formatowanie).
* `tests/parity` — **test różnicowy**: 400 losowych członków policzonych oryginalnym silnikiem Python (`gen_python_cases.py`)
  musi dać identyczne wyniki w TypeScript (score, rating, filary, audyt głosowań — co do znaku).
  Regeneracja fixture: `npm run parity:gen` (wymaga `.venv` oryginalnego projektu w `../Citadel-V3`).
* `tests/api` — testy HTTP: logowanie, wersja sesji, RBAC per rola, wpłaty/duplikaty, kolejka, członkowie, kosz, audyt, backup, konta.
* `tests/e2e` — Playwright: logowanie i motywy, widoki kraj/region/koło, każda zakładka, operacje skarbnika i administratora,
  wygaszanie sesji zablokowanego konta w drugiej przeglądarce. Spec `20-screenshots` zapisuje zrzuty do `tests/e2e/screenshots/new`.

### Porównanie wizualne z oryginałem

`scripts/capture-reference.ts` wykonuje ten sam przebieg (login → wszystkie zakładki → region → kraj → motywy → skarbnik koła)
na dowolnej instancji i zapisuje zrzuty ekranu:

```bash
# oryginał (Streamlit) na tych samych danych demo:
docker run -d --name citadel-ref-pg -e POSTGRES_USER=citadel -e POSTGRES_PASSWORD=citadel -e POSTGRES_DB=citadel_db -p 55432:5432 postgres:16-alpine
DATABASE_URL=postgresql://citadel:citadel@localhost:55432/citadel_db npm run seed:reference
# Polska kolacja (ICU), żeby oryginał sortował regiony tak jak nowa aplikacja:
docker exec citadel-ref-pg pg_dump -U citadel -d citadel_db -Fc -f /tmp/ref.dump
docker exec citadel-ref-pg psql -U citadel -d citadel_db -c "CREATE DATABASE citadel_pl TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'pl-PL' LOCALE 'C.UTF-8'"
docker exec citadel-ref-pg pg_restore -U citadel -d citadel_pl --no-owner /tmp/ref.dump
(cd ../Citadel-V3/citadel && DATABASE_URL=postgresql://citadel:citadel@localhost:55432/citadel_pl uv run streamlit run app.py --server.port 8601)
npx tsx scripts/capture-reference.ts http://localhost:8601 tests/e2e/screenshots/reference
# nowa aplikacja:
npx tsx scripts/capture-reference.ts http://localhost:8700 tests/e2e/screenshots/new
```

### Porównanie treści (tekst każdego ekranu)

`scripts/compare-text.ts` przechodzi oba programy (oryginał i nowy) tą samą ścieżką — sesja administratora przez wszystkie
zakładki i podzakładki, region, kraj, następnie sesja skarbnika koła — i porównuje cały widoczny tekst (etykiety, wartości pól,
komórki tabel). Raport trafia do `tests/e2e/results/text-compare.json`.

```bash
npx tsx scripts/compare-text.ts http://localhost:8601 http://localhost:8700
```

Ostatni przebieg (baza referencyjna z kolacją pl-PL): na poziomie słów w sesji skarbnika koła brakuje 0 z 658 słów, w sesji administratora 5 z 832 — źródło TeX niewidocznej strzałki, błąd „(nan)” oryginału i trzy znaczniki czasu audytu. Pozostałe różnice są wyłącznie
techniczne lub zamierzone:

* fragmenty widżetów Streamlit („Skip to main content", `keyboard_arrow_right`, składowe daty `2026`/`10`/`17`, LaTeX `
ightarrow`);
* emoji renderowane w tym samym węźle tekstu zamiast osobnego (np. „🎉 Kosz kół jest pusty.");
* sortowanie regionów wg polskiej kolacji (oryginał na Postgresie z Alpine sortuje bajtowo, więc pierwszym regionem jest „Mazowsze");
* poprawiony błąd oryginału: koło bez regionu w zakładce Struktura opisane było jako „(nan)", teraz „(Bez regionu)";
* znaczniki czasu wpisów audytu (różne momenty zasilenia baz).

### Porównanie pikselowe

`scripts/compare-pixels.ts` porównuje zrzuty z `tests/e2e/screenshots/reference` i `tests/e2e/screenshots/new`
(piksel zgodny = różnica każdego kanału RGB ≤ 40). Ostatni przebieg: średnio **93.3%** zgodnych pikseli na 24 ekranach
(zakres 89.9–96.1%). Resztę stanowią różnice renderowania czcionek i natywnych kontrolek (np. format daty).

```bash
npx tsx scripts/compare-pixels.ts
```

---

## 🎨 Logo

* `web/public/logo.svg` — znak główny (inicjał „C” ze złotą monetą), favicona i ikona aplikacji.
* `web/public/citadel-wordmark.svg` — pełne logo: znak słowny „Citadel for NG” (Noto Serif Italic zamieniony na krzywe, 1024×1024).
* `web/public/brand/` — sześć propozycji znaku słownego, jednowierszowy znak z żółtą kropką nad „i” (używany w aplikacji)
  i strona z koncepcjami (`/brand/`). Wszystko generuje `node scripts/brand/gen-wordmarks.mjs`.

## 📁 Struktura

```
shared/            kod wspólny (przeglądarka + serwer), czysty TypeScript bez zależności
  dates.ts         daty ISO, relativedelta, strefa Europe/Warsaw
  num.ts           zaokrąglanie i formatowanie zgodne z Pythonem (round half-even, f-stringi)
  colors.ts        skale barw KDI / uprawnionych / Celestia
  rbac.ts          role i macierz uprawnień can(rola, akcja)
  calculations.ts  silnik naliczeń składek, KDI, prawa głosu, dynamiczny próg, kalkulator
  celestia.ts      silnik ratingowy Celestia (4 filary, audyt głosowań i zbiórek kwartalnych)
server/
  index.ts         start: baza → schemat → (seed) → API + statyczny SPA
  db.ts            adapter: postgres (DATABASE_URL) lub PGlite
  schema.ts        DDL, migracje, trigger audytu, konto admin
  auth.ts          PBKDF2 + podpisane ciasteczko sesji
  finance.ts       agregacje finansowe per koło/region/kraj, Celestia dla koła, seria dzienna profilu
  backup.ts        zrzut .sql
  routes/          auth, views (słowniki, kraj, region, koła), kolo (zakładki koła), admin (kolejka, struktura, audyt, konta)
  seed.ts          dane demo
web/src/
  App.svelte       bramka logowania → wymuszenie hasła → nagłówek → widoki
  lib/             api.ts, state.svelte.ts (motyw, sesja, nawigacja), charts.ts (figury Plotly), format.ts
  components/      BentoCard, Tabs, DataTable, Plot, Alert, Select, NumberInput, Radio, Checkbox, Expander
  views/           Login, ForcePassword, Header, ViewKraj, ViewRegion, ViewKolo, kolo/Tab*.svelte (13 zakładek)
  styles/theme.css tokeny 3 motywów (fiolet / dark_mono / light_mono) i style komponentów
tests/             unit, parity, api, e2e
```

## 🔌 API (skrót)

Wszystkie trasy pod `/api`, JSON, sesja w ciasteczku `citadel_session`. Uprawnienia egzekwowane po stronie serwera (`shared/rbac.ts`).

* `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`
* `GET /dictionaries`, `GET /views/kraj`, `GET /views/region`, `GET /kola`
* `GET /kolo/:id` (przegląd + Celestia), `GET /kolo/:id/members/:mid/profile`
* `GET|POST|DELETE /kolo/:id/terminy`, `GET|POST|PUT|DELETE /kolo/:id/wplaty`, `GET|POST /kolo/:id/wplaty-oczekujace`
* `GET|POST|DELETE /kolo/:id/naliczenia`, `GET /kolo/:id/kasa`, `POST /kolo/:id/wydatki`, `POST /kolo/:id/korekty-kasy`, `POST /kolo/:id/korekty`
* `POST|PUT|DELETE /kolo/:id/czlonkowie`, `GET /kolo/:id/rejestr-wplat`
* `GET /pending`, `POST /pending/:id/accept|reject`
* `GET /structure`, `POST|PUT /regiony`, `POST /regiony/:id/trash|restore`, `DELETE /regiony/:id` (analogicznie `/kola`)
* `GET /audit`, `GET /backup`, `GET|POST /users`, `POST /users/:id/toggle-active|role|reset-password`, `DELETE /users/:id`

## 📖 Dokumentacja dziedzinowa

Zasady finansowe, wzory KDI i pełna specyfikacja ratingu Celestia pozostają opisane w oryginalnym `DOKUMENTACJA.md`
projektu Citadel V3 — implementacja w `shared/` odwzorowuje je 1:1 (potwierdzone testem różnicowym).
