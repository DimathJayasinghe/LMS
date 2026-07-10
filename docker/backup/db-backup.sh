#!/usr/bin/env bash
# One verified, rotated, optionally-encrypted + off-site logical backup.
# Runs inside the `backup` container. See context/documents/12-data-backup-and-recovery.md.
set -euo pipefail

# ── Config (from backend/.env via the container env) ─────────────────────────
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:?POSTGRES_USER is required}"
PGDATABASE="${POSTGRES_DB:?POSTGRES_DB is required}"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
export PGHOST PGPORT PGUSER PGDATABASE

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RET_DAYS="${BACKUP_RETENTION_DAYS:-7}"
RET_WEEKS="${BACKUP_RETENTION_WEEKS:-5}"
RET_MONTHS="${BACKUP_RETENTION_MONTHS:-6}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
HC_URL="${BACKUP_HEALTHCHECK_URL:-}"

log()     { echo "[backup $(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
ping_hc() { [ -n "$HC_URL" ] && curl -fsS -m 10 "$1" >/dev/null 2>&1 || true; }
fail()    { log "ERROR: $*"; ping_hc "${HC_URL%/}/fail"; exit 1; }
trap 'fail "unexpected error near line $LINENO"' ERR

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR"/daily "$BACKUP_DIR"/weekly "$BACKUP_DIR"/monthly

ts="$(date -u '+%Y%m%d_%H%M%S')"
base="${PGDATABASE}_${ts}.dump"
tmp="$(mktemp "${BACKUP_DIR}/.${base}.XXXXXX")"

# ── 1) Dump (custom format: compressed, supports selective + parallel restore) ─
log "dumping ${PGDATABASE} from ${PGHOST}:${PGPORT} ..."
pg_dump --format=custom --compress=9 --file="$tmp" || fail "pg_dump failed"

# ── 2) Verify the archive is readable NOW (catch truncation/corruption early) ──
pg_restore --list "$tmp" >/dev/null || fail "verification failed (pg_restore --list)"
size="$(du -h "$tmp" | cut -f1)"
log "dump verified (${size})"

# ── 3) Encrypt at rest (recommended — dumps contain PII: NIC, phone) ───────────
final="${BACKUP_DIR}/daily/${base}"
if [ -n "$PASSPHRASE" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase "$PASSPHRASE" --output "${final}.gpg" "$tmp" || fail "gpg encryption failed"
  rm -f "$tmp"
  final="${final}.gpg"
  log "encrypted (AES-256)"
else
  mv "$tmp" "$final"
  log "stored UNENCRYPTED — set BACKUP_ENCRYPTION_PASSPHRASE to encrypt"
fi
chmod 600 "$final"

# ── 4) Checksum (integrity proof for restores) ─────────────────────────────────
( cd "$(dirname "$final")" && sha256sum "$(basename "$final")" > "$(basename "$final").sha256" )

# ── 5) Promote to weekly (Sunday) / monthly (1st) tiers ────────────────────────
dow="$(date -u '+%u')"   # 1=Mon .. 7=Sun
dom="$(date -u '+%d')"
if [ "$dow" = "7" ]; then
  cp -p "$final" "${final}.sha256" "${BACKUP_DIR}/weekly/"
  log "promoted to weekly"
fi
if [ "$dom" = "01" ]; then
  cp -p "$final" "${final}.sha256" "${BACKUP_DIR}/monthly/"
  log "promoted to monthly"
fi

# ── 6) Rotate: drop anything older than each tier's retention window ────────────
find "${BACKUP_DIR}/daily"   -type f -mtime "+${RET_DAYS}"            -delete
find "${BACKUP_DIR}/weekly"  -type f -mtime "+$(( RET_WEEKS * 7 ))"   -delete
find "${BACKUP_DIR}/monthly" -type f -mtime "+$(( RET_MONTHS * 31 ))" -delete

# ── 7) Off-site copy (optional — survives total VPS loss = the 1 of 3-2-1) ─────
if [ -n "$RCLONE_REMOTE" ]; then
  log "off-site sync → ${RCLONE_REMOTE}"
  rclone sync "$BACKUP_DIR" "$RCLONE_REMOTE" --transfers 2 --checkers 4 --exclude ".*.XXXXXX" \
    || fail "rclone off-site sync failed"
fi

# ── 8) Record status + dead-man's-switch ping ──────────────────────────────────
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') OK ${final} ${size}" >> "${BACKUP_DIR}/last-backup.log"
ping_hc "$HC_URL"
log "done → ${final}"
