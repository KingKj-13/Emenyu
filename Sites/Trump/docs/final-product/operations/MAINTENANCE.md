# MAINTENANCE.md — Keeping Trump Healthy

**Audience:** operator. A tickable schedule so nothing relies on memory. Most items are 1–2 commands.

---

## Daily
- [ ] `pm2 status` — online, restart count stable.
- [ ] `pm2 logs emenuy-trump-api --lines 100` — scan for `error`/`fatal`/`_failed`/`rate_limit_`.
- [ ] Backup ran (`tail /var/log/trump-backup.log`; new dir in `/root/backups/auto/`).
- [ ] `df -h /` < 80%; `free -m` healthy.
- [ ] (During pilot) review any staff-reported issue → BUG-LIST.

## Weekly
- [ ] Backup integrity + off-box copy present ([BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md) steps 1–3).
- [ ] Log rotation healthy (`pm2 conf pm2-logrotate`; logs gzipped, bounded) — [LOGGING-RUNBOOK.md](LOGGING-RUNBOOK.md).
- [ ] `npm run smoke:test` (or the curl smoke set) green.
- [ ] Disk trend — prune if growing (`du -sh /root/backups/auto/* ~/.pm2/logs/*`).
- [ ] Review `rate_limit_*` counts — tune limits if they fired in normal service.
- [ ] Monitor webhook still delivering (it alerts on state change; confirm it's wired).

## Monthly
- [ ] **Full restore drill** into a scratch DB ([BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md) step 4) — sign off.
- [ ] `npm run auth:audit` → 0 weak; review device list; suspend departed staff.
- [ ] TLS cert: `certbot certificates` (expiry > 30 days?); `certbot renew --dry-run`.
- [ ] OS security updates: `apt update && apt list --upgradable` → patch in a window + reboot (PM2 resurrects).
- [ ] `npm run audit:prod` (npm advisories) — patch criticals (test on staging first).
- [ ] DB size + growth (`SELECT pg_size_pretty(pg_database_size('emenyu'));`) — projection ~0.5 GB/yr orders; ensure disk headroom.
- [ ] Review monitoring thresholds vs. real usage.

## Quarterly
- [ ] Rotate credentials per [PASSWORD-ROTATION.md](PASSWORD-ROTATION.md) (departed staff, periodic).
- [ ] Postgres housekeeping: confirm autovacuum healthy; `ANALYZE` if query plans drifted (DB is tiny, usually unnecessary).
- [ ] Dependency refresh: review `npm outdated` (server + client + app); update + regression-test on staging (idempotency/e2e probes), then deploy.
- [ ] Capacity review: re-check Phase 05 baselines vs. real traffic; revisit deferred items (media→CDN, per-table rate keying) if volume grew — [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md).
- [ ] DR rehearsal: walk a server-rebuild on a scratch box (DISASTER-RECOVERY DR-1) at least yearly.

## Certificates (TLS)
- Let's Encrypt auto-renews via certbot's timer. Verify monthly. If a renewal failed: `certbot renew && systemctl reload nginx`. Expired cert = site untrusted → P1.

## Updates / patching policy
- **No code edits on the box.** All app changes go through [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) from a tagged release, with a pre-deploy backup + rollback ready.
- OS/Postgres/nginx patches: apply in a low-traffic window; verify `/readyz` + smoke after.
- During the RC1 freeze: **only critical/operational fixes** (Rule 2 / freeze policy).

## Storage hygiene
- Backups: 14-day local retention (auto-pruned by the backup script); off-box keeps longer.
- Logs: pm2-logrotate bounds them; `pm2 flush` if pressured.
- Media: Images/Video live on the box (1.5 GB video) — the bandwidth/storage grower; CDN migration is the planned offload ([KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md)).

## Maintenance log (record actions)
| Date | Task | By | Result |
|---|---|---|---|
|  |  |  |  |
