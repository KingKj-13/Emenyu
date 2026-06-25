# MONITORING-AUDIT.md — Phase 02A Step 6

**Date:** 2026-06-24. **Method:** read-only inspection of running monitoring agents, PM2 modules, log sizes, and health-check polling. **Answer: only DigitalOcean host-level metrics exist; there is no application/uptime monitoring, no health-check polling, no alerting, and no log rotation. Blocker H2 remains OPEN.**

---

## 1. What exists — DigitalOcean host agents

```
$ systemctl list-units --state=running | grep -iE 'do-agent|droplet|prometheus|netdata|datadog|newrelic|monit'
do-agent.service         active running  The DigitalOcean Monitoring Agent
droplet-agent.service    active running  The DigitalOcean Droplet Agent
```
**Conclusion:**
- **`do-agent`** ships **host metrics** (CPU, memory, disk, bandwidth, load) to DigitalOcean. This means **DO Monitoring alert policies are *possible*** (e.g., "disk > 90%", "memory > 80%") — **but whether any alert policy is actually configured cannot be seen from the box; it must be checked in the DO console.** Assume none until confirmed.
- **`droplet-agent`** provides DO web-console/SSH-key support — **not** application monitoring.
- These cover **infrastructure**, not the app. They will not tell you the Trump API is returning 500s, the menu failed to load, the session secret is missing, or a backup didn't run.

## 2. What's missing — application & uptime monitoring

| Capability | Present? | Evidence |
|---|---|---|
| External uptime monitor (pings the site) | ❌ | no such agent; DO uptime check not visible on box (verify in console) |
| **`/healthz` / `/readyz` polled by anything** | ❌ | endpoints work but nothing on the box calls them; no monitor service |
| App error tracking (Sentry/etc.) | ❌ | not in deps or running |
| Metrics (p95 latency, event-loop lag, error rate) | ❌ | none; `do-agent` is host-only |
| **Backup-failure alerting** | ❌ | no backup job exists to alert on (BACKUP-VERIFICATION) |
| Cert-expiry alerting | ⚠️ partial | `certbot.timer` auto-renews; no independent "cert expiring" alert |
| Disk/memory **alert policy** | ❓ | `do-agent` enables it; **not confirmed configured** — check DO console |

**Conclusion:** The single-instance Trump app is a **SPOF with no application-level observability.** `/readyz` performs a real storage+menu check (a good signal) but **is polled by nothing** — if the app crash-loops or returns errors, no one is paged. Detection today is **manual / customer-reported.**

## 3. PM2 process monitoring

PM2 provides `autorestart` + `max_memory_restart` and local `pm2 monit`, but:
- The **84 restarts** on `emenuy-trump-api` (and 300–800 on co-tenants) are **recorded but not alerted** — no one is notified when a process flaps.
- `pm2 monit` is interactive/local only; there is no `pm2 plus`/Keymetrics link configured.

## 4. Log management — NO rotation (disk risk)

```
$ ls ~/.pm2/modules            → (empty — pm2-logrotate NOT installed)
$ cat ~/.pm2/module_conf.json  → {}
$ du -sh ~/.pm2/logs           → 472M
$ ls -laS ~/.pm2/logs
 348 MB  imli-out.log
 143 MB  imli-error.log
   …
$ du -sh /var/log              → 2.7G
```
**Conclusion:** **`pm2-logrotate` is not installed.** PM2 logs grow unbounded — **`imli-out.log` alone is 348 MB** and the PM2 log dir is **472 MB**; `/var/log` is **2.7 GB**. On a disk that is already **87% full** (PRODUCTION-STATE §5), unrotated logs are a **slow-motion outage**: at 100% disk, Postgres and every app fail. This makes H2/M6 a **HIGH** practical risk here, not a "MEDIUM/LOW" nicety.

---

## Verdict

| Check | Result |
|---|---|
| Host metrics (DO agent) | ✅ present (`do-agent`) |
| DO alert policies configured | ❓ **verify in DO console** |
| App uptime / health polling | ❌ none |
| `/readyz` consumed by a monitor | ❌ none |
| Error tracking / APM | ❌ none |
| PM2 flap alerting | ❌ none |
| Backup-failure alert | ❌ none (no backup job) |
| **Log rotation** | ❌ **none — 472 MB PM2 logs on an 87%-full disk** |

**BLOCKER/HIGH H2 (monitoring) status: 🔴 OPEN.** Phase 02B should add: an **external uptime + `/readyz` monitor with alerting** (UptimeRobot/Better Stack/DO uptime), **`pm2-logrotate`** (immediate, cheap disk win), **DO alert policies** for disk/memory, and a **backup-success/failure alert** once the backup job exists.
