# MONITORING-RUNBOOK.md — Watching Trump in Production

**Audience:** operator. Trump's monitoring is **on-box checks + a webhook alert** (no external APM). This describes what's watched, how to read it, and how to respond.

---

## The monitor (`scripts/monitor-trump.sh`)
Runs every **5 minutes via cron**. Each run checks:
| Check | Threshold (env-overridable) | Alert text |
|---|---|---|
| App readiness | `/readyz` must return `"status":"ready"` | `Trump /readyz NOT ready` |
| Disk | `≥ 90%` (`TRUMP_DISK_MAX_PCT`) | `Disk N% >= 90%` |
| Memory available | `< 80 MB` (`TRUMP_MEM_MIN_MB`) | `Mem available NMB < 80MB` |

- Posts to a **Slack/Discord-compatible webhook** (`TRUMP_ALERT_WEBHOOK`) **only on state change** (alerts on going bad, and on recovery) — no spam.
- Config in `/etc/trump-monitor.env`. Always exits 0 (cron stays quiet); **the webhook is the signal**.
```bash
# cron: */5 * * * * /var/www/mysite/Emenyu/Trump/scripts/monitor-trump.sh
cat /etc/trump-monitor.env          # TRUMP_ALERT_WEBHOOK=...
./scripts/monitor-trump.sh          # run once manually
```

## Set up / test the webhook
```bash
echo 'TRUMP_ALERT_WEBHOOK="https://hooks.slack.com/services/XXX"' | sudo tee /etc/trump-monitor.env
# force an alert to confirm delivery (e.g. point READYZ at a dead port for one run):
TRUMP_READYZ=http://127.0.0.1:9/readyz ./scripts/monitor-trump.sh   # expect a webhook message
```
**You must receive the test alert before go-live** (LAUNCH-CHECKLIST §F).

## Manual health dashboard (anytime)
```bash
pm2 status                      # process up, restart count
pm2 monit                       # live CPU% / RAM
curl -s …/healthz ; curl -s …/readyz
df -h / ; free -m               # disk / memory headroom
```

## What "normal" looks like (from Phase 05 baselines)
| Signal | Normal | Worry if |
|---|---|---|
| CPU (app) | low; spikes < 1 core | pinned at 1 core sustained |
| RSS | 105–168 MB | approaching 768 MB (auto-restarts there) |
| `/readyz` | ready | not ready (DB) |
| Disk | < 80% | ≥ 90% (alert) |
| Restart count | stable | climbing (crash loop) |
| `rate_limit_*` warnings | ~0 in normal service | frequent → tune limits |
| 5xx in logs | ~0 | any sustained |

## Respond to an alert
| Alert | First action |
|---|---|
| `/readyz NOT ready` | [SERVER-RECOVERY.md](SERVER-RECOVERY.md) §1–2 (process? DB?) |
| `Disk ≥ 90%` | SERVER-RECOVERY §3 (flush logs, prune backups) |
| `Mem available low` | SERVER-RECOVERY §4 (restart restores; investigate leak) |
| Backup failure (from backup log/monitor) | [BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md) |

## During service (live watch)
Open `pm2 monit` + `pm2 logs emenuy-trump-api`. Watch CPU/RAM and grep for `error`, `_failed`, `rate_limit_`. Capture latency spikes for [../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md).

## Gaps / future (documented, not blockers)
- No historical metrics/graphs (point-in-time only). A lightweight metrics exporter is a Phase 06+ option.
- Notification/socket health isn't directly alerted — covered indirectly by `/readyz` + logs. See [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md).
