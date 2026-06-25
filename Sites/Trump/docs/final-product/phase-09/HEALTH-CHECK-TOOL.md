# HEALTH-CHECK-TOOL.md — Phase 09 (FRP1) Step 5

**Tool:** `scripts/health-check.js` · **alias:** `npm run health:check` · **Status: ✅ built + validated (8 PASS / 0 FAIL locally).**
**Purpose:** one operator command that verifies every critical subsystem and prints a PASS/FAIL report (exit 0 only if no FAIL). Reduces operational risk (Rule 3) — catches problems before service.

---

## Usage
```bash
npm run health:check                                            # check local (default port)
TRUMP_HEALTH_BASE=https://emenyu.com/Trump npm run health:check # check production
node scripts/health-check.js --json                            # machine-readable
```
Exit code: **0** if no FAIL (warnings allowed), **1** if any FAIL, **2** on crash — so it's CI/cron friendly.

## What it checks
| Check | PASS means |
|---|---|
| **database** | reachable + Prisma client has the latest models (R1 canary) |
| **api_health** | `/healthz` returns `status:ok` |
| **api_readyz** | `/readyz` returns `status:ready` (DB-backed) |
| **socket_io** | engine.io handshake responds |
| **menu_cache** | `/api/menu` returns `Cache-Control: max-age` + gzip (Phase 05 cache live) |
| **notifications** | unread-count endpoint alive + auth-gated (401) |
| **storage** | `Images/` + `Video/` readable; app dir writable |
| **disk** | root < 90% (FAIL ≥ 90%, WARN ≥ 80%) |
| **backups** | a backup ≤ 1 day old in `/root/backups/auto` (box) |
| **pm2** | `emenuy-trump-api` online (box) |
| **tls_cert** | cert readable / expiry (when base is https) |

Box-specific checks (backups/pm2/tls) **SKIP** gracefully when run off the prod box (e.g. in dev).

## Validation done this phase (real local run)
```
=== Trump Health Check (http://127.0.0.1:3099/Trump) ===
  ✓ PASS  database         reachable; client models present
  ✓ PASS  api_health       status=200
  ✓ PASS  api_readyz       status=200
  ✓ PASS  socket_io        handshake status=200
  ✓ PASS  menu_cache       cache-control=public, max-age=30 encoding=gzip
  ✓ PASS  notifications    unread-count status=401 (401=alive+gated)
  ✓ PASS  storage          Images/ + Video/ readable; app dir writable
  ✓ PASS  disk             root 28% used
  · SKIP  backups / pm2 / tls_cert  (not the prod box)
  8 pass · 0 warn · 0 fail · 3 skip
  RESULT: ✓ HEALTHY
```

## How to use it operationally
- **Before service** (T-2h, GO-LIVE): `TRUMP_HEALTH_BASE=https://emenyu.com/Trump npm run health:check` — must be HEALTHY with all box checks PASS (backups/pm2/tls).
- **Daily** (operator): part of the morning check ([FIRST-DAY-CHECKLIST.md](FIRST-DAY-CHECKLIST.md)).
- **Cron** (optional): wire alongside `monitor-trump.sh` for an additional deep check ([../operations/MONITORING-RUNBOOK.md](../operations/MONITORING-RUNBOOK.md)).
- **In CI / pre-go-live**: exit code gates a green/red.

## Relation to existing checks
Complements `monitor-trump.sh` (5-min readyz/disk/mem + webhook) and the basic `npm run health` (`/healthz`+`/readyz`). This tool is the **deep, one-shot, full-surface** check.
