#!/usr/bin/env bash
#
# Trump production monitor — checks liveness + resource + backup freshness and
# posts an alert to a webhook (Slack/Discord compatible) ONLY on state change
# (ok->bad / bad->ok), so it never spams. Intended to run from cron every 5 min.
#
# Config in /etc/trump-monitor.env (at least TRUMP_ALERT_WEBHOOK).
#
set -uo pipefail
# shellcheck disable=SC1091
[ -f /etc/trump-monitor.env ] && . /etc/trump-monitor.env

WEBHOOK="${TRUMP_ALERT_WEBHOOK:-}"
READYZ="${TRUMP_READYZ:-http://127.0.0.1:3012/readyz}"
DISK_MAX="${TRUMP_DISK_MAX_PCT:-90}"
MEM_MIN_MB="${TRUMP_MEM_MIN_MB:-80}"
BACKUP_DIR="${TRUMP_BACKUP_ROOT:-/root/backups/auto}"
BACKUP_MAX_HRS="${TRUMP_BACKUP_MAX_HRS:-26}"
STATE="${TRUMP_MONITOR_STATE:-/run/trump-monitor.state}"

problems=()

curl -fsS -m 5 "$READYZ" 2>/dev/null | grep -q '"status":"ready"' || problems+=("Trump /readyz NOT ready")

disk=$(df --output=pcent / | tr -dc '0-9')
[ -n "$disk" ] && [ "$disk" -ge "$DISK_MAX" ] && problems+=("Disk ${disk}% >= ${DISK_MAX}%")

memav=$(free -m | awk '/^Mem:/{print $7}')
[ -n "$memav" ] && [ "$memav" -lt "$MEM_MIN_MB" ] && problems+=("Mem available ${memav}MB < ${MEM_MIN_MB}MB")

latest=$(ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | head -1)
if [ -z "$latest" ]; then
  problems+=("No backups found in $BACKUP_DIR")
else
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
  [ "$age_h" -ge "$BACKUP_MAX_HRS" ] && problems+=("Latest backup ${age_h}h old >= ${BACKUP_MAX_HRS}h")
fi

status="ok"; [ ${#problems[@]} -gt 0 ] && status="bad"
prev=$(cat "$STATE" 2>/dev/null || echo "unknown")
echo "$status" > "$STATE"

notify() {
  [ -z "$WEBHOOK" ] && { echo "[monitor] (no webhook configured) $1"; return; }
  # "text" works for Slack, "content" for Discord — send both.
  curl -fsS -m 10 -H 'Content-Type: application/json' \
       -d "{\"text\":\"$1\",\"content\":\"$1\"}" "$WEBHOOK" >/dev/null 2>&1 \
       || echo "[monitor] webhook POST failed"
}

if [ "$status" = "bad" ] && [ "$prev" != "bad" ]; then
  notify "🔴 Trump ALERT ($(hostname)): $(printf '%s; ' "${problems[@]}")"
elif [ "$status" = "ok" ] && [ "$prev" = "bad" ]; then
  notify "✅ Trump recovered ($(hostname)): all checks OK"
fi

# always exit 0 (cron noise control); the webhook is the signal
exit 0
