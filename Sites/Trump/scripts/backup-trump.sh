#!/usr/bin/env bash
#
# Trump production backup — PostgreSQL (custom dump) + app data/uploads.
#
# Properties: automated (cron), compressed, timestamped, checksummed, retained,
# and (optionally) copied off-box via rclone. Fails hard (non-zero exit) on any
# error so a monitor/cron-mailer can alert on failure.
#
#   ./backup-trump.sh                 # run a backup now
#   TRUMP_BACKUP_REMOTE=spaces:emenyu-backups/trump ./backup-trump.sh   # + off-box
#
# Config can also be placed in /etc/trump-backup.env (sourced if present).
#
set -euo pipefail

# ---- configuration (env-overridable) ----------------------------------------
DB_NAME="${TRUMP_DB_NAME:-emenyu}"
APP_DIR="${TRUMP_APP_DIR:-/var/www/mysite/Emenyu/Trump}"
BACKUP_ROOT="${TRUMP_BACKUP_ROOT:-/root/backups/auto}"
RETAIN_DAYS="${TRUMP_BACKUP_RETAIN_DAYS:-14}"
OFFBOX_REMOTE="${TRUMP_BACKUP_REMOTE:-}"     # e.g. "spaces:emenyu-backups/trump" (rclone remote)
LOG="${TRUMP_BACKUP_LOG:-/var/log/trump-backup.log}"
# shellcheck disable=SC1091
[ -f /etc/trump-backup.env ] && . /etc/trump-backup.env

ts="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$BACKUP_ROOT/$ts"

log()  { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"; }
fail() { log "ERROR: $*"; echo "TRUMP-BACKUP-FAILED $ts: $*" >&2; exit 1; }

mkdir -p "$dest"
log "=== backup start $ts (db=$DB_NAME app=$APP_DIR) ==="

# ---- 1) PostgreSQL custom dump (already compressed internally) ---------------
db_file="$dest/${DB_NAME}-${ts}.dump"
sudo -u postgres pg_dump -Fc "$DB_NAME" > "$db_file" || fail "pg_dump failed"
[ -s "$db_file" ] || fail "dump is empty"
pg_restore --list "$db_file" >/dev/null 2>&1 || fail "dump failed integrity check (pg_restore --list)"
tbl="$(pg_restore --list "$db_file" | grep -c 'TABLE DATA' || true)"
log "db dump ok: $(du -h "$db_file" | cut -f1), TABLE DATA entries=$tbl"

# ---- 2) App mutable state (JSON fallback + uploads) --------------------------
data_file="$dest/trump-data-${ts}.tar.gz"
tar -czf "$data_file" -C "$APP_DIR" \
    $( [ -d "$APP_DIR/data" ]    && echo data ) \
    $( [ -d "$APP_DIR/uploads" ] && echo uploads ) \
    $( [ -d "$APP_DIR/orders" ]  && echo orders ) \
    $( [ -d "$APP_DIR/history" ] && echo history ) \
    $( [ -d "$APP_DIR/tables" ]  && echo tables ) \
    2>/dev/null || log "WARN: tar reported missing dirs (continuing)"
log "data tar: $(du -h "$data_file" | cut -f1)"

# ---- 3) Checksums -----------------------------------------------------------
( cd "$dest" && sha256sum ./* > SHA256SUMS )
log "checksums recorded: $(grep -c . "$dest/SHA256SUMS") file(s)"

# ---- 4) Off-box upload (optional, pluggable) --------------------------------
if [ -n "$OFFBOX_REMOTE" ]; then
  command -v rclone >/dev/null || fail "TRUMP_BACKUP_REMOTE set but rclone not installed"
  rclone copy "$dest" "$OFFBOX_REMOTE/$ts" >>"$LOG" 2>&1 || fail "off-box upload failed -> $OFFBOX_REMOTE/$ts"
  # verify the remote has the files
  rclone lsf "$OFFBOX_REMOTE/$ts" >>"$LOG" 2>&1 || fail "off-box verification failed"
  log "off-box upload ok -> $OFFBOX_REMOTE/$ts"
else
  log "WARN: off-box upload SKIPPED (TRUMP_BACKUP_REMOTE unset). LOCAL-ONLY backup — single point of loss."
fi

# ---- 5) Retention (local) ---------------------------------------------------
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETAIN_DAYS" -exec rm -rf {} + 2>/dev/null || true
log "retention: pruned > ${RETAIN_DAYS}d; backup sets on disk: $(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l)"

log "=== backup done $ts -> $dest ==="
