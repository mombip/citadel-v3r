# Migracja bazy: Netlify Database → Supabase

Aplikacja łączy się z PostgreSQL bezpośrednio (sterownik `postgres`, własne SQL, wyzwalacze audytu, transakcje), więc
Supabase jest tu zwykłym serwerem PostgreSQL. Pakiety `@supabase/supabase-js` i `@supabase/ssr` są zainstalowane
(wersje przypięte) na przyszłość, ale migracja ich nie wymaga; klucz publikowalny (`NEXT_PUBLIC_SUPABASE_*`) nie daje
dostępu do bazy przez SQL.

## Zasady

* **Wdrożenie produkcyjne działa przez cały czas.** Nowa baza jest przygotowywana i wypełniana obok, przełączenie to
  jedna zmiana zmiennej środowiskowej i jedno wdrożenie (~2 min), cofnięcie — to samo w drugą stronę.
* **Kopia jest dokładna i sprawdzana**: wszystkie tabele z identyfikatorami, dziennik audytu wiersz w wiersz, pozycje
  sekwencji; po kopii skrypt porównuje liczbę wierszy i MD5 całych wierszy oraz sekwencje w obu bazach.
* **Serverless → pooler**: funkcja Netlify łączy się przez pooler transakcyjny Supabase (port 6543, użytkownik
  `postgres.<ref>`, IPv4). Bezpośredni host `db.<ref>.supabase.co` jest tylko IPv6 i z Netlify nie działa.
  Sterownik wyłącza wtedy prepared statements (`server/db.ts: postgresOptions`).
* **Schemat `public` jest widoczny w Data API Supabase** — dlatego `initSchema` na Supabase włącza RLS bez polityk,
  odbiera uprawnienia rolom `anon`/`authenticated` i ustawia widoki w trybie `security_invoker`
  (`server/schema.ts: SUPABASE_HARDENING_DDL`). Aplikacja łączy się jako właściciel, więc RLS jej nie dotyczy.
  Dodatkowo warto w panelu Supabase wyłączyć ekspozycję schematu `public` w Data API (Settings → Data API).

## Wykonanie (2026-10-17, 19:15–19:21)

* Próba na sucho lokalnie: 13/13 tabel identycznych.
* Pooler projektu: `aws-0-eu-west-1.pooler.supabase.com:6543`, PostgreSQL 17.11 (host bezpośredni `db.<ref>.supabase.co`
  jest tylko IPv6 — nieosiągalny ani z Netlify, ani z Windows bez IPv6).
* Kopia z Netlify Database (617 wierszy, 13 tabel, 445 wpisów audytu, sekwencje) — identyczna; RLS 13/13, 0 uprawnień dla
  ról API, 12 wyzwalaczy, widoki `security_invoker`.
* Test aplikacji na Supabase przez pooler (logowanie, odczyt, zapis z wyzwalaczem, kopia zapasowa) — OK.
* Przełączenie: kopia końcowa 19:15:08 → `DATABASE_URL` w Netlify (production, deploy-preview, branch-deploy) →
  wdrożenie 19:16:31. Brak późnych zapisów w starej bazie (markery identyczne po przełączeniu).
* Dowód: logowanie na produkcji kontem istniejącym tylko w Supabase (potem usunięte razem z 2 wpisami audytu);
  aktywność prawdziwych użytkowników po przełączeniu widoczna tylko w Supabase.
* Netlify Database zostaje nietknięta jako ścieżka cofnięcia; po kilku dniach — krok 6.
* Uwaga: każdy zimny start funkcji wykonuje idempotentne `INSERT … ON CONFLICT` domyślnych wierszy, co przesuwa
  sekwencję `kraje_id_seq` o 1–2 (bez znaczenia dla danych; tak samo działało na Netlify Database).
* Uwaga bezpieczeństwa: łańcuch połączenia roli **tylko do odczytu** starej bazy Netlify trafił raz do zapisu rozmowy
  (błąd skryptu pomocniczego); po wyłączeniu Netlify Database staje się bezużyteczny, wcześniej warto go
  zregenerować w panelu Netlify.

## Przebieg

| Krok | Co | Jak | Sprawdzenie |
| :- | :--- | :--- | :--- |
| 0 | Próba na sucho | `scripts/supabase/migrate-data.ts` z lokalnej kopii do pustej bazy z rolami `anon`/`authenticated` | 13/13 tabel identycznych, RLS i uprawnienia jak oczekiwano, logowanie działa |
| 1 | Dane dostępowe | `.env`: `SOURCE_DB_URL` = Netlify Database (panel → citadel-ng → Database), `TARGET_DB_URL` = Supabase → Connect → *Transaction pooler* | `npm run db:verify` łączy się z obiema bazami |
| 2 | Schemat + pierwsza kopia | `npm run db:migrate` (tworzy schemat, kopiuje, weryfikuje) | „Target is an exact copy of the source” |
| 3 | Test aplikacji na Supabase | lokalnie `DATABASE_URL=<TARGET_DB_URL> npm start`, logowanie, podgląd, kopia zapasowa | jak na produkcji |
| 4 | Okno przełączenia (~3 min, bez zapisów) | `npm run db:migrate` (kopia końcowa), `netlify env:set DATABASE_URL <TARGET_DB_URL>`, `netlify deploy --prod --build` | `/api/health` → `postgres`, logowanie, liczby w tabelach |
| 5 | Kontrola po przełączeniu | `npm run db:verify` (Netlify ↔ Supabase) — brak późnych zapisów w starej bazie | 13/13 identycznych |
| 6 | Sprzątanie (po kilku dniach) | wyłączyć Netlify Database w panelu, usunąć `netlify/database/migrations` i `@netlify/database` | — |

## Cofnięcie

`netlify env:unset DATABASE_URL` + `netlify deploy --prod --build` — funkcja wraca do Netlify Database (nietknięta).
Jeśli w Supabase zdążyły powstać zapisy, przenieś je w drugą stronę tym samym skryptem (zamień SOURCE/TARGET).

## Uwagi

* Hasło w łańcuchu połączenia musi być zakodowane jak w URL (np. `@` → `%40`).
* `migrate-data.ts` zastępuje **całą** zawartość bazy docelowej; nigdy nie kieruj go na bazę z danymi, których nie chcesz stracić.
* Łańcuchy połączeń nie są nigdy wypisywane przez skrypty; trzymaj je tylko w `.env` (gitignore) i w zmiennych Netlify.
