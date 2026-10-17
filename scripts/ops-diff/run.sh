#!/usr/bin/env bash
# Functional differential test: same UI scenario in the original (Streamlit) and the new app, each on its own identical
# copy of the data, then a full database diff and a diff of the validation messages both apps showed.
#
# Prerequisites (see docs/PARITY.md, "Funkcjonalna zgodność"):
#   original: cd ../Citadel-V3/citadel && DATABASE_URL=postgresql://citadel:citadel@localhost:55432/citadel_ops_ref \
#             ../.venv/Scripts/python.exe -m streamlit run app.py --server.port 8602 --server.headless true
#   new app:  PORT=8702 DATABASE_URL=postgresql://citadel:citadel@localhost:55432/citadel_ops_new npx tsx server/index.ts
# Usage: bash scripts/ops-diff/run.sh [outDir] [step ...]
set -uo pipefail
OUT="${1:-tests/e2e/results/ops-diff}"; shift || true
REF="${OPS_REF_URL:-http://localhost:8602}"; NEW="${OPS_NEW_URL:-http://localhost:8702}"
PG="${OPS_PG:-postgresql://citadel:citadel@localhost:55432}"
mkdir -p "$OUT"
bash scripts/ops-diff/reset-dbs.sh --in-place "${OPS_SOURCE_DB:-citadel_real}" || exit 1
BASE=$(docker exec "${OPS_CONTAINER:-citadel-ref-pg}" psql -U citadel -d citadel_ops_new -tAc "select coalesce(max(id),0) from audit_log")
npx tsx scripts/ops-diff/scenario.ts ref "$REF" "$OUT/ref.json" "$@" & P1=$!
npx tsx scripts/ops-diff/scenario.ts new "$NEW" "$OUT/new.json" "$@" & P2=$!
wait $P1; R1=$?; wait $P2; R2=$?
echo "--- database"
npx tsx scripts/ops-diff/diff-db.ts "$PG/citadel_ops_ref" "$PG/citadel_ops_new" "$BASE"; R3=$?
echo "--- validation messages"
if diff "$OUT/ref.json" "$OUT/new.json"; then echo "identical ($(grep -c '"' "$OUT/new.json") lines)"; R4=0; else R4=1; fi
echo "--- backups"
bash scripts/ops-diff/backup-check.sh "$OUT"; R5=$?
exit $(( R1 || R2 || R3 || R4 || R5 ))
