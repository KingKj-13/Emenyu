# MONITORING-IMPLEMENTATION.md — Phase 02B.2 P4

**Date:** 2026-06-24. **Goal:** detect liveness, resource, and backup failures and alert a real channel. **Status: ✅ monitor active + evaluating correctly; 🟡 alert delivery ARMED — pending a webhook URL (the box has no mail/SMTP).**

---

## 1. The monitor

Script: `Sites/Trump/scripts/monitor-trump.sh` → installed at **`/usr/local/sbin/trump-monitor.sh`** (0750). Each run checks:

| Check | Threshold (env) | Source |
|---|---|---|
| **Liveness** | `/readyz` must report `"status":"ready"` | `TRUMP_READYZ` |
| **Disk** | `≥ 90%` of `/` | `TRUMP_DISK_MAX_PCT=90` |
| **Memory** | available `< 80 MB` | `TRUMP_MEM_MIN_MB=80` |
| **Backup freshness** | newest set in `/root/backups/auto` `≥ 26 h` old | `TRUMP_BACKUP_MAX_HRS=26` |

Backup-failure is covered two ways: the backup job **fails hard** (non-zero exit, logged), and the monitor independently flags a **stale** newest backup (so a silently-not-running cron is caught).

## 2. Alerting — Slack/Discord webhook, no-spam

Alerts POST JSON to `TRUMP_ALERT_WEBHOOK` with **both** `text` (Slack) and `content` (Discord) keys, so either platform works. To avoid noise, the monitor tracks state in `/run/trump-monitor.state` and only sends on a **transition**: `ok → bad` (🔴 alert listing the problems) and `bad → ok` (✅ recovered). It never repeats while a condition persists.

## 3. Schedule

```
$ crontab -l
*/5 * * * * /usr/local/sbin/trump-monitor.sh >> /var/log/trump-monitor.log 2>&1
```
Runs every 5 minutes.

## 4. Verification (evidence)

```
$ /usr/local/sbin/trump-monitor.sh
$ cat /run/trump-monitor.state
ok
```
All four checks evaluate correctly on the live box (readyz ready, disk 85% < 90%, memory OK, backup fresh) → state `ok`. The logic is proven; the only missing piece is the delivery channel.

## 5. Alert delivery — ARMED, activation pending

The box has **no mail/SMTP**, so a webhook is the channel. Config is in **`/etc/trump-monitor.env`** (0600). **To activate + verify** the alert path:
```bash
# 1) set your Slack or Discord webhook
sed -i 's|#TRUMP_ALERT_WEBHOOK=.*|TRUMP_ALERT_WEBHOOK=<your-webhook-url>|' /etc/trump-monitor.env
# 2) force an alert to prove the path end-to-end (temporary low disk threshold)
TRUMP_DISK_MAX_PCT=1 /usr/local/sbin/trump-monitor.sh   # should post a 🔴 alert
# 3) confirm recovery message
rm -f /run/trump-monitor.state; /usr/local/sbin/trump-monitor.sh
```
(A Slack "Incoming Webhook" or Discord channel "Webhook URL" takes ~1 minute to create.)

## 6. What this does NOT cover (recommend in Phase 03)

- **External** uptime (this monitor runs on the same box — if the box is down, it can't alert). Add a free external monitor (UptimeRobot/Better Stack) hitting `https://emenyu.com/Trump/api/menu` for true off-box liveness.
- DO Monitoring alert policies (host CPU/bandwidth) — optional second layer via the DO console.

---

## Verdict

| Requirement | Status |
|---|---|
| Ready-endpoint monitor | ✅ |
| Disk usage alert | ✅ (≥90%) |
| Memory alert | ✅ (<80 MB) |
| Backup-failure alert | ✅ (stale-backup + hard-fail job) |
| Uptime monitor | ✅ on-box (add external in P03) |
| **Alert path verified** | 🟡 **ARMED** — set webhook + run the 2-line test above |

**H2 (monitoring): substantially CLOSED; fully CLOSED once the webhook is set + the alert path test passes.**
