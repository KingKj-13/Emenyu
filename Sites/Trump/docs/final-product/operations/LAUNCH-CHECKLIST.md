# LAUNCH-CHECKLIST.md — Before Onboarding the First Restaurant

**Purpose:** every item required before a real restaurant uses Trump. **Nothing relies on memory — tick every box.** Each links to the doc that explains it.

---

## A. Infrastructure
- [ ] Server provisioned; OS patched; firewall on (only 80/443 public; SSH key-only).
- [ ] PostgreSQL installed; DB `emenyu` created; **localhost-only** (`listen_addresses=localhost`, pg_hba no `0.0.0.0/0`). → [INSTALLATION-GUIDE](INSTALLATION-GUIDE.md)
- [ ] nginx + TLS (Let's Encrypt) + HSTS; WebSocket upgrade for `/Trump/socket.io`.
- [ ] App bound `127.0.0.1:3012` (not public). PM2 `emenuy-trump-api` online; `pm2 save && pm2 startup` done.

## B. Application
- [ ] Deployed at tag `trump-v1.0-rc1` via [DEPLOYMENT-RUNBOOK](DEPLOYMENT-RUNBOOK.md).
- [ ] Prisma client generated into **Trump/node_modules** (R1 verified: `order.clientOrderId`/`device`/`shift` present).
- [ ] All migrations applied (`migrate deploy` clean).
- [ ] `/healthz` ok, `/readyz` ready, SPA loads, menu has `Cache-Control: max-age=30`.
- [ ] **`TRUMP_LOAD_TEST_BYPASS` NOT set** (rate limiting ON). No `rate_limit_bypass_active` in logs.

## C. Security
- [ ] `npm run auth:audit` → **0 weak/default passwords** (`auth:rotate` if any).
- [ ] Admin backdoor suspended (Phase 02B1). Default `admin/123456789` NOT usable.
- [ ] `.env` secrets strong; `TRUMP_SESSION_SECRET` random; file perms locked.
- [ ] Rate limits at validated RC1 values (general 3000, public-write 300 / 15 min).
- [ ] HTTPS enforced; cookies secure+HttpOnly. → [PASSWORD-ROTATION](PASSWORD-ROTATION.md)

## D. Data / restaurant setup
- [ ] Menu loaded + media present (images/video) via owner console.
- [ ] Tables created (1…N) + QR codes printed and placed.
- [ ] Staff accounts created (owner/manager/waiter(s)/kitchen) with rotated passwords.

## E. Backups & recovery
- [ ] Daily backup cron active; a backup has **run and verified** → [BACKUP-VERIFICATION](BACKUP-VERIFICATION.md).
- [ ] Off-box copy (DigitalOcean Spaces) configured + confirmed.
- [ ] **Restore drill passed** (restore into a scratch DB, row counts match).
- [ ] Rollback rehearsed (`deploy-trump.sh rollback`). → [SERVER-RECOVERY](SERVER-RECOVERY.md) / [DISASTER-RECOVERY](DISASTER-RECOVERY.md)

## F. Monitoring & logging
- [ ] `monitor-trump.sh` cron every 5 min; alert webhook configured + test-fired.
- [ ] pm2-logrotate active (logs gzipped, bounded). → [MONITORING-RUNBOOK](MONITORING-RUNBOOK.md) / [LOGGING-RUNBOOK](LOGGING-RUNBOOK.md)

## G. Android (waiter app)
- [ ] Release APK built + signed ([../phase-04b/APK-BUILD.md](../phase-04b/APK-BUILD.md)).
- [ ] Installed on ≥3 waiter devices; permissions (notifications) granted; FCM `google-services.json` in place.
- [ ] Device matrix run ([../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md)).
- [ ] `extra.apiBaseUrl` points at production.

## H. Training & people
- [ ] Owner trained → [OWNER-TRAINING](OWNER-TRAINING.md).
- [ ] Manager trained → [MANAGER-TRAINING](MANAGER-TRAINING.md).
- [ ] Waiters trained → [WAITER-TRAINING](WAITER-TRAINING.md).
- [ ] Kitchen briefed on the order flow.
- [ ] **Fallback plan agreed** (paper/POS) — Rule 1: restaurant first.

## I. Validation
- [ ] Production validation matrix green ([../phase-05a/PRODUCTION-VALIDATION.md](../phase-05a/PRODUCTION-VALIDATION.md) §B).
- [ ] Off-hours prod load test passed (§C) — 200 viewers / 80 orders / 150–200 sockets, no regression.
- [ ] Pilot kit ready ([PILOT-CHECKLIST](PILOT-CHECKLIST.md)).

## J. Operations
- [ ] Operator knows the runbook ([OPERATOR-RUNBOOK](OPERATOR-RUNBOOK.md)) + incident response ([INCIDENT-RESPONSE](INCIDENT-RESPONSE.md)).
- [ ] Maintenance schedule set ([MAINTENANCE](MAINTENANCE.md)).
- [ ] On-call contact + escalation path written down.

**All boxes ticked → proceed to [GO-LIVE-CHECKLIST](GO-LIVE-CHECKLIST.md) on launch day.**
Known gaps that are accepted (not blockers, documented): [KNOWN-LIMITATIONS](KNOWN-LIMITATIONS.md).
