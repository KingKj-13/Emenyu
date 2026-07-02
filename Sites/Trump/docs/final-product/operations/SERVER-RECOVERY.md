# SERVER-RECOVERY.md — Bringing Trump Back Up

**Audience:** operator recovering a down or misbehaving server. **Restaurant first (Rule 1):** if this is during service, switch staff to the fallback workflow first, then recover.

**Key facts:** PM2 `emenuy-trump-api` @ `127.0.0.1:3012`; app `/var/www/mysite/Emenyu/Trump`; DB `emenyu` (localhost).

---

## Quick triage (run these first)
```bash
pm2 status                               # is the process up?
curl -s http://127.0.0.1:3012/healthz    # app alive?
curl -s http://127.0.0.1:3012/readyz     # DB reachable?
systemctl status postgresql              # DB up?
df -h /                                  # disk full?
free -m                                  # memory?
pm2 logs emenuy-trump-api --lines 80     # what's the error?
```

## Scenario → action

### 1. Process is `stopped`/`errored`
```bash
cd /var/www/mysite/Emenyu/Trump
pm2 restart emenuy-trump-api
pm2 logs emenuy-trump-api --lines 80      # confirm clean boot (server_started, no fatal)
curl -s http://127.0.0.1:3012/readyz      # "ready"
```
If it crash-loops (restart count climbing): read the fatal in the logs.
- `Refusing to start production without required secure configuration` → a `TRUMP_*_PASS` env var is missing → fix `.env`, `npm run env:check`, restart.
- Prisma/`@prisma/client` error or missing field → **R1**: regenerate client into Trump/node_modules (DEPLOYMENT-RUNBOOK step 4b), restart.

### 2. Process up but `/readyz` not ready (DB unreachable)
```bash
systemctl restart postgresql
systemctl status postgresql
sudo -u postgres psql -d emenyu -c "select 1;"   # DB answers?
pm2 restart emenuy-trump-api
```
If Postgres won't start → check disk (`df -h`), Postgres logs (`/var/log/postgresql/`). If data dir is corrupt → [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md).

### 3. Disk full
```bash
df -h /
du -sh /root/backups/auto/* ~/.pm2/logs/* /var/log/* 2>/dev/null | sort -h | tail
pm2 flush                                    # clear app logs (archive first if needed)
find /root/backups/auto -mtime +14 -type d -exec rm -rf {} +   # prune old backups (retention is 14d anyway)
gzip ~/.pm2/logs/*.log 2>/dev/null || true
```
Then restart if it had OOM/crashed. (pm2-logrotate normally prevents this.)

### 4. High memory / `max_memory_restart`
PM2 auto-restarts at **768 MB** RSS. Repeated memory restarts → capture a heap snapshot window, check `pm2 monit`, review recent deploy. Load tests peaked at ~168 MB, so sustained >700 MB is abnormal → likely a leak or runaway request; restart to restore service, then investigate from logs.

### 5. Server rebooted
```bash
pm2 status        # PM2 should have resurrected processes (if pm2 startup+save were done)
# if empty:
cd /var/www/mysite/Emenyu/Trump && npm run pm2:start && pm2 save
systemctl status postgresql nginx
```

### 6. nginx / TLS issue (site unreachable but app healthy on :3012)
```bash
curl -s http://127.0.0.1:3012/healthz       # app fine?
systemctl status nginx && nginx -t          # config ok?
systemctl reload nginx
# TLS expiry: certbot renew --dry-run ; certbot renew ; systemctl reload nginx
```

### 7. Bad deployment (app boots but behaves wrong / new bug)
```bash
./scripts/deploy-trump.sh rollback /root/trump-deploy-snapshots/<last-good-timestamp>
curl -s http://127.0.0.1:3012/readyz
```
Migrations are additive → old code tolerates new columns; a code rollback is safe without a DB downgrade.

## After recovery — verify
- [ ] `pm2 status` online, restart count stops climbing.
- [ ] `/healthz` ok, `/readyz` ready, SPA loads.
- [ ] Menu cache header present; a test login (web + token) works.
- [ ] No data lost (orders/shifts intact — they're in Postgres). If in doubt → [BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md).
- [ ] Log the incident → [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md).

## When to escalate to Disaster Recovery
Data is missing/corrupt, Postgres won't start, or the box itself is lost → [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md).
