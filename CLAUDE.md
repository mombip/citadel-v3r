# Citadel for NG — guidance for AI assistants

TypeScript rewrite of the Python/Streamlit app in `../Citadel-V3`. Goal: identical look, behaviour and numbers.

## Conventions
- Code, comments and identifiers in **English**; UI strings in **Polish** (exactly as in the original — copy them, do not paraphrase).
- Database column names stay Polish (schema is shared with the original). Computed member fields (`saldo_akt_gr`, `kdi_str`, …)
  keep their original names on purpose so the API payload mirrors the Python dictionaries.
- Money is integer **grosze** everywhere (`*_gr`). Never store floats.
- Dates are ISO strings `YYYY-MM-DD` (see `shared/dates.ts`); use `todayPL()` for the business date (Europe/Warsaw).
- Rounding/formatting must match Python: use `pyRound` / `fmt` from `shared/num.ts`, never `toFixed` directly for displayed values.
- Authorisation: `can(role, action)` from `shared/rbac.ts` on both server (enforced) and client (visibility only).

## Layout
- `shared/` pure logic (no deps) — `calculations.ts` (fees, KDI, voting rights), `celestia.ts` (rating engine).
- `server/` Hono API; `db.ts` abstracts PostgreSQL (`DATABASE_URL`) vs PGlite (default). Transactions via `db.tx`.
- `web/` Svelte 5 (runes) SPA. Global state in `web/src/lib/state.svelte.ts`; after any mutation call `app.refresh()` so views re-fetch.
- Theme tokens in `web/src/styles/theme.css`; never hard-code colours in components except the KDI/Celestia palettes from `shared/colors.ts`.

## Commands
- `npm run dev` (API + Vite), `npm run build`, `npm start`
- `npm test` — Vitest: `tests/unit`, `tests/api` (in-memory PGlite), `tests/parity` (vs. Python fixture)
- `npm run test:e2e` — Playwright (builds, seeds demo data, port 8711). Spec files are numbered: read-only suites run before mutating ones.
- `npm run parity:gen` — regenerate `tests/parity/python-cases.json` with the ORIGINAL Python engines (needs `../Citadel-V3/.venv`).

## When changing domain logic
1. Change `shared/calculations.ts` or `shared/celestia.ts`.
2. Run `npm test`. If the parity test fails and the change is intentional, regenerate the fixture only after porting the same change
   to the Python original (or document the deliberate divergence in README).
3. Keep audit status strings byte-identical; the UI and tests assert them.

## Visual parity workflow
`scripts/capture-reference.ts <baseUrl> <outDir>` runs the same walkthrough on either app; compare `tests/e2e/screenshots/reference` vs `new`.
