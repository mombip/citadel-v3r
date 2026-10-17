# Backlog: better solutions than the original (revisit later)

While replicating the original 1:1 we sometimes see a better way to do something. Each such case is recorded here instead of
being changed silently. "Status" says what the new app does today.

| # | Area | Original behaviour | Better solution | Status |
| :- | :--- | :--- | :--- | :--- |
| 1 | All forms | After a successful save the page reruns, so the success message (`st.success` + `st.rerun`) is never visible. | Show a short confirmation (toast). | **Done** — the new app shows toasts. |
| 2 | Unit tabs | After some saves Streamlit re-creates the tab bar and jumps back to "Tabela Zbiorcza". | Stay on the tab the user worked in. | **Done** — the new app keeps the tab. |
| 3 | Failed-search text | Empty dropdown search shows the English "No results". | Polish "Brak wyników". | **Done**. |
| 4 | Header dropdowns | Adding a region (or unit) re-creates the key-less "Aktywny Region:" / unit dropdowns, so the active selection jumps to the alphabetically first entry; the unit view can turn empty ("Brak dostępnych aktywnych kół"). | Keep the user's active region and unit. | **Done** — the new app keeps the selection. |
| 5 | Confirmation checkboxes | Keyed confirmation checkboxes (e.g. "Potwierdzam przeniesienie do kosza regionu: …") stay ticked after the action, so the next destructive action on another item needs no new confirmation. | Clear every confirmation after the action. | **Done** — the new app clears them. |
| 6 | Login security | A blocked account gets "Konto zostało zablokowane przez Administratora." **before** the password is checked, so anyone can learn that a login exists and is blocked. | Check the password first; show the blocked message only after a correct password. | **Open** — replicated 1:1 for now. |
| 7 | Login security | No limit on failed login attempts (brute force). | Throttle per login/IP (e.g. 5 failures → 1 min pause), log failures to `audit_log`. | **Open**. |
| 8 | Session cookie | (new app) The session cookie is `HttpOnly; SameSite=Lax` but not `Secure`. | Add `Secure` when served over HTTPS (Netlify). | **Open**. |
| 9 | SQL backup | Decimal values inside the audit JSON lose trailing zeros (`1.50` → `1.5`) because rows go through Python floats. | Read timestamps, JSON and decimals as PostgreSQL text so the dump is lossless. | **Done** — the new app's dump restores to an exact copy (verified per table, timestamps to the microsecond). |
| 10 | Start aplikacji | Każdy zimny start wykonuje `initSchema` (DDL + `INSERT … ON CONFLICT` domyślnych wierszy), co przesuwa sekwencję `kraje_id_seq` i kosztuje kilka zapytań. | Wersjonowane migracje uruchamiane raz (np. `supabase migration`) zamiast DDL przy każdym starcie; `SKIP_SCHEMA_INIT=1` po migracji. | **Open**. |
