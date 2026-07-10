#!/usr/bin/env bash
# Restore a dump into a database. DESTRUCTIVE for the target DB (drops & recreates objects).
#
# Usage (run via the backup container, see the runbook §7):
#   db-restore.sh --latest                          newest daily dump → the live DB (asks to confirm)
#   db-restore.sh /backups/daily/lms_2026....dump   a specific dump → the live DB
#   db-restore.sh --latest --dbname lms_verify --create --yes   restore into a SCRATCH db (drill)
#
# Flags: --latest | <path>   source
#        --dbname NAME        target DB (default POSTGRES_DB)
#        --create             CREATE the target DB first (for restore drills)
#        --yes | -y           skip the interactive confirmation
set -euo pipefail

PGHOST="${PGHOST:-postgres}"; PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:?}"; export PGPASSWORD="${POSTGRES_PASSWORD:?}"
export PGHOST PGPORT PGUSER
TARGET_DB="${POSTGRES_DB:?}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
ASSUME_YES=0; CREATE=0; SRC=""

while [ $# -gt 0 ]; do
  case "$1" in
    --latest) SRC="$(ls -1t "$BACKUP_DIR"/daily/*.dump* 2>/dev/null | grep -v '\.sha256$' | head -1 || true)";;
    --dbname) shift; TARGET_DB="${1:?--dbname needs a value}";;
    --create) CREATE=1;;
    --yes|-y) ASSUME_YES=1;;
    -*) echo "unknown flag: $1" >&2; exit 2;;
    *) SRC="$1";;
  esac
  shift
done

[ -n "$SRC" ] || { echo "No backup specified (use --latest or a path)"; exit 1; }
[ -f "$SRC" ] || { echo "Backup not found: $SRC"; exit 1; }
echo "Source : $SRC"
echo "Target : ${PGHOST}:${PGPORT}/${TARGET_DB}"

# Verify checksum if we have one.
if [ -f "${SRC}.sha256" ]; then
  ( cd "$(dirname "$SRC")" && sha256sum -c "$(basename "$SRC").sha256" ) \
    || { echo "CHECKSUM MISMATCH — aborting"; exit 1; }
  echo "checksum ok"
fi

# Decrypt if needed.
work="$SRC"
if [ "${SRC##*.}" = "gpg" ]; then
  [ -n "$PASSPHRASE" ] || { echo "Encrypted backup but BACKUP_ENCRYPTION_PASSPHRASE is unset"; exit 1; }
  work="$(mktemp)"
  gpg --batch --yes --quiet --passphrase "$PASSPHRASE" --decrypt "$SRC" > "$work" \
    || { echo "decrypt failed"; exit 1; }
  echo "decrypted"
fi

pg_restore --list "$work" >/dev/null || { echo "archive invalid"; exit 1; }

if [ "$ASSUME_YES" != "1" ]; then
  echo "!! This OVERWRITES objects in '${TARGET_DB}'. Type the database name to proceed:"
  read -r confirm
  [ "$confirm" = "$TARGET_DB" ] || { echo "aborted"; exit 1; }
fi

if [ "$CREATE" = "1" ]; then
  echo "ensuring database ${TARGET_DB} exists ..."
  psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" | grep -q 1 \
    || psql -d postgres -c "CREATE DATABASE \"${TARGET_DB}\""
fi

echo "restoring ..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_DB" "$work"
echo "restore complete → ${TARGET_DB}"
[ "$work" != "$SRC" ] && rm -f "$work" || true
