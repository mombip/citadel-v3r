#!/usr/bin/env bash
# Backup fidelity in both apps: download "Kopia Zapasowa (.sql)" through each UI, restore it into an empty database
# and compare the restored data with the database it was taken from.
# Usage: bash scripts/ops-diff/backup-check.sh [outDir]
set -uo pipefail
OUT="${1:-tests/e2e/results/ops-diff}"; mkdir -p "$OUT"
REF="${OPS_REF_URL:-http://127.0.0.1:8602}"; NEW="${OPS_NEW_URL:-http://127.0.0.1:8702}"
PG="${OPS_PG:-postgresql://citadel:citadel@127.0.0.1:55432}"; CONTAINER="${OPS_CONTAINER:-citadel-ref-pg}"
psql_() { docker exec -i "$CONTAINER" psql -q -v ON_ERROR_STOP=1 -U citadel "$@"; }
RC=0
for K in ref new; do
  URL=$([ "$K" = ref ] && echo "$REF" || echo "$NEW")
  npx tsx scripts/ops-diff/backup.ts "$K" "$URL" "$OUT/backup-$K.sql" || { RC=1; continue; }
  psql_ -d postgres -c "DROP DATABASE IF EXISTS citadel_bk_$K WITH (FORCE)"
  psql_ -d postgres -c "CREATE DATABASE citadel_bk_$K TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'pl-PL' LOCALE 'C'"
  if ! psql_ -d "citadel_bk_$K" < "$OUT/backup-$K.sql" > "$OUT/restore-$K.log" 2>&1; then
    echo "✗ $K backup does not restore cleanly:"; tail -5 "$OUT/restore-$K.log"; RC=1; continue
  fi
  echo "--- $K: restored backup vs. live database"
  npx tsx scripts/ops-diff/diff-db.ts "$PG/citadel_ops_$K" "$PG/citadel_bk_$K" | tail -3 || RC=1
  # exact (unnormalised) comparison: every column incl. timestamps to the microsecond and JSON text
  BAD=""
  for T in kraje regiony kola uzytkownicy czlonkowie wplaty wplaty_oczekujace naliczenia_reczne korekty wydatki korekty_kasy terminy_glosowan audit_log; do
    Q="select md5(coalesce(string_agg(t::text, '|' order by id), '')) from $T t"
    [ "$(psql_ -d "citadel_ops_$K" -tAc "$Q")" = "$(psql_ -d "citadel_bk_$K" -tAc "$Q")" ] || BAD="$BAD $T"
  done
  if [ -n "$BAD" ]; then echo "  exact comparison: differs in$BAD"; [ "$K" = new ] && RC=1; else echo "  exact comparison: identical"; fi
done
exit $RC
