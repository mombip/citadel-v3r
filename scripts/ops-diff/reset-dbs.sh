#!/usr/bin/env bash
# Resets the two scenario databases (one per app) to an identical copy of a source database in the local
# reference container.
#   bash scripts/ops-diff/reset-dbs.sh [source_db]           recreate both databases (stop the scenario servers first)
#   bash scripts/ops-diff/reset-dbs.sh --in-place [source]   truncate + reload data; servers may stay connected
set -euo pipefail
MODE=create
if [ "${1:-}" = "--in-place" ]; then MODE=in-place; shift; fi
SRC="${1:-citadel_real}"
CONTAINER="${OPS_CONTAINER:-citadel-ref-pg}"
psql_() { docker exec -i "$CONTAINER" psql -q -v ON_ERROR_STOP=1 -U citadel "$@"; }
for DB in citadel_ops_ref citadel_ops_new; do
  if [ "$MODE" = create ]; then
    psql_ -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)"
    psql_ -d postgres -c "CREATE DATABASE $DB TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'pl-PL' LOCALE 'C'"
    docker exec "$CONTAINER" pg_dump -U citadel --no-owner "$SRC" | psql_ -d "$DB" >/dev/null
  else
    TABLES=$(psql_ -d "$DB" -tAc "select string_agg(quote_ident(tablename), ', ') from pg_tables where schemaname = 'public'")
    { echo "TRUNCATE $TABLES RESTART IDENTITY CASCADE;"; docker exec "$CONTAINER" pg_dump -U citadel --data-only --disable-triggers "$SRC"; } \
      | psql_ -d "$DB" >/dev/null
  fi
  echo "$DB <- $SRC: $(psql_ -d "$DB" -tAc 'select count(*) from czlonkowie') members, $(psql_ -d "$DB" -tAc 'select count(*) from wplaty') payments, $(psql_ -d "$DB" -tAc 'select count(*) from audit_log') audit rows"
done
