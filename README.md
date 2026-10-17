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
(cd ../Citadel-V3/citadel && DATABASE_URL=postgresql://citadel:citadel@localhost:55432/citadel_db uv run streamlit run app.py --server.port 8601)
npx tsx scripts/capture-reference.ts http://localhost:8601 tests/e2e/screenshots/reference
# nowa aplikacja:
npx tsx scripts/capture-reference.ts http://localhost:8700 tests/e2e/screenshots/new
```

---

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
