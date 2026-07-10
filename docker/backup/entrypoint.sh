#!/usr/bin/env bash
# Backup sidecar entrypoint. Dispatches to a one-shot or the scheduler loop.
#
#   schedule                 (default) run a dump now, then every N hours
#   backup                   run a single dump and exit
#   restore [args...]        run the restore helper (see db-restore.sh)
#   <anything else>          exec it verbatim (debug: `docker compose run backup bash`)
set -euo pipefail

MODE="${1:-schedule}"

case "$MODE" in
  backup)
    exec db-backup.sh
    ;;
  restore)
    shift
    exec db-restore.sh "$@"
    ;;
  schedule)
    interval_h="${BACKUP_SCHEDULE_INTERVAL_HOURS:-24}"
    echo "[backup] scheduler up — a dump runs now, then every ${interval_h}h"
    while true; do
      db-backup.sh || echo "[backup] WARNING: run failed; retrying next cycle"
      sleep "$(( interval_h * 3600 ))"
    done
    ;;
  *)
    exec "$@"
    ;;
esac
