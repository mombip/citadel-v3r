#!/usr/bin/env bash
# Copies the production (Neon) database into a local Docker PostgreSQL for development and testing.
#
#   1. reads DATABASE_URL from .env (production, read-only use: pg_dump only)
#   2. dumps it with pg_dump (custom format) into backups/neon_<timestamp>.dump   (backups/ is gitignored)
#   3. starts/refreshes the local container `citadel-local-pg` (postgres:17, port 5433, persistent volume)
#   4. restores the dump into database `citadel_local` (owner/ACL statements skipped)
#
# Usage:  bash scripts/db-pull-prod.sh            # dump + restore
#         bash scripts/db-pull-prod.sh --restore-only backups/neon_XXXX.dump
# Then run the app against the copy:
#   DATABASE_URL=postgresql://citadel:citadel@localhost:5433/citadel_local npm start
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash on Windows: keep container paths like /tmp untouched; use a Windows path for the volume mount.
export MSYS_NO_PATHCONV=1
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"

IMAGE=postgres:17-alpine
CONTAINER=citadel-local-pg
PORT=5433
LOCAL_URL="postgresql://citadel:citadel@localhost:${PORT}/citadel_local"
mkdir -p backups

if [[ "${1:-}" == "--restore-only" ]]; then
  DUMP="${2:?path to .dump file required}"
else
  # Neon: use the direct endpoint for pg_dump (the -pooler endpoint runs PgBouncer in transaction mode).
  PROD_URL="$(node -e "const t=require('fs').readFileSync('.env','utf8');const m=t.match(/^\s*DATABASE_URL\s*=\s*['\"]?([^'\"\r\n]+)/m);if(!m)process.exit(1);process.stdout.write(m[1].replace('-pooler.','.'))")"
  DUMP="backups/neon_$(date +%Y%m%d_%H%M%S).dump"
  echo "Dumping production database (read-only) to ${DUMP} ..."
  docker run --rm -e PROD_URL="$PROD_URL" -v "${HOST_DIR}/backups:/backups" "$IMAGE" \
    sh -c "pg_dump \"\$PROD_URL\" --format=custom --no-owner --no-acl --file=/backups/$(basename "$DUMP")"
  echo "Dump size: $(du -h "$DUMP" | cut -f1)"
fi

if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Creating container ${CONTAINER} on port ${PORT} ..."
  docker run -d --name "$CONTAINER" -e POSTGRES_USER=citadel -e POSTGRES_PASSWORD=citadel -e POSTGRES_DB=citadel_local \
    -p "${PORT}:5432" -v citadel-local-pgdata:/var/lib/postgresql/data "$IMAGE" >/dev/null
fi
docker start "$CONTAINER" >/dev/null
until docker exec "$CONTAINER" pg_isready -U citadel -d citadel_local >/dev/null 2>&1; do sleep 1; done

echo "Restoring into ${CONTAINER}/citadel_local (existing objects are replaced) ..."
docker cp "$DUMP" "$CONTAINER:/tmp/restore.dump"
docker exec "$CONTAINER" pg_restore -U citadel -d citadel_local --clean --if-exists --no-owner --no-acl /tmp/restore.dump || true
docker exec "$CONTAINER" rm -f /tmp/restore.dump
docker exec "$CONTAINER" psql -U citadel -d citadel_local -Atc \
  "select relname || ': ' || n_live_tup from pg_stat_user_tables order by relname"
echo
echo "Local copy ready:  DATABASE_URL=${LOCAL_URL}"
