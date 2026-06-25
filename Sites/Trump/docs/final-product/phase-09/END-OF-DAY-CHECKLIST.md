# END-OF-DAY-CHECKLIST.md — Restaurant Closing + Monthly Maintenance

**For:** manager/owner closing the restaurant + the operator's nightly/monthly routine. Tick every box.

---

## Closing (every night)
**Front-of-house**
- [ ] All waiters **End shift**; tables closed out / handed over.
- [ ] No lingering active sessions on the Operations dashboard.
- [ ] Notifications bell cleared of handled alerts.

**Reports**
- [ ] Owner/manager pulls the day's **Summary / Top items / Per-table / By-hour**.
- [ ] **Reconcile** the Trump revenue total against the till (Trump takes no payments — totals are informational).
- [ ] Note anything odd (a missing order, a wrong total) → [../phase-07/ISSUE-TRACKER.md](../phase-07/ISSUE-TRACKER.md).

**Operator — nightly**
- [ ] Backup ran (`tail /var/log/trump-backup.log`; new dir in `/root/backups/auto`) — or run `./scripts/backup-trump.sh` now.
- [ ] `npm run health:check` HEALTHY; `pm2 status` online, restart count stable.
- [ ] Disk < 80%; no `error`/`fatal` spikes in `pm2 logs`.
- [ ] Confirm **bypass off** (`npm run diagnostics` → rateLimitBypass off).

## Restaurant closes
- [ ] System left running (PM2 keeps it up; next day's open is just "log in").
- [ ] First-day only: debrief + capture feedback ([../phase-06/](../phase-06/) forms).

---

## Monthly maintenance (operator)
*(Canonical detail: [../operations/MAINTENANCE.md](../operations/MAINTENANCE.md) — this is the quick monthly tick.)*
- [ ] **Full restore drill** into a scratch DB ([../operations/BACKUP-VERIFICATION.md](../operations/BACKUP-VERIFICATION.md)) — sign off.
- [ ] `npm run auth:audit` → **0 weak**; review device list; suspend departed staff.
- [ ] TLS cert > 30 days to expiry (`certbot certificates`); `certbot renew --dry-run`.
- [ ] OS + npm security updates (`apt`, `npm run audit:prod`) — patch in a window, verify after.
- [ ] DB size + disk growth trend (orders ~0.5 GB/yr) — ensure headroom.
- [ ] **Media:** `npm run media:optimize` coverage — fix new oversized images; consider the Spaces+CDN offload if volume grew ([MEDIA-OPTIMIZER.md](MEDIA-OPTIMIZER.md)).
- [ ] Review `rate_limit_*` counts; tune ceilings if they fired in normal service.
- [ ] `npm run diagnostics` snapshot archived (versions/SHA) for support history.

## Quarterly (reference)
- Rotate credentials; dependency refresh + regression test on staging; DR rehearsal — [../operations/MAINTENANCE.md](../operations/MAINTENANCE.md).

**Closed by:** ____  **Date:** ____  **Operator nightly by:** ____
