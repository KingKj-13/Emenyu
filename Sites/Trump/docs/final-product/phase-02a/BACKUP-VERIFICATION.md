# BACKUP-VERIFICATION.md — Phase 02A Step 2

**Date:** 2026-06-24. **Question:** *Does an automated PostgreSQL backup currently exist?* **Method:** read-only SSH inspection of cron, systemd timers, and on-disk backup artifacts. **Answer: NO automated backup exists. Blocker B1 remains OPEN.**

---

## 1. Scheduled jobs — none for the database

**cron:**
```
$ crontab -l                 → no crontab for root
$ crontab -l -u postgres     → no crontab for postgres
$ ls /etc/cron.d /etc/cron.daily /etc/cron.hourly
cron.d:     certbot  e2scrub_all  sysstat
cron.daily: apport apt-compat do-agent dpkg logrotate man-db sysstat
cron.hourly:droplet-agent
```
**systemd timers:**
```
$ systemctl list-timers --all | grep -iE 'backup|dump|pg'
… dpkg-db-backup.timer  → dpkg-db-backup.service   (Debian package DB, NOT our data)
… certbot.timer, apt-daily-upgrade.timer
```
**Conclusion:** There is **no `pg_dump` cron job, no systemd backup timer, no backup script on a schedule.** The only "backup" timer (`dpkg-db-backup`) backs up the OS package list, not the application database. **No automated database backup is running.**

## 2. DigitalOcean backup service — unverified (needs DO console)

`do-agent.service` is running (host metrics), but **DigitalOcean weekly Droplet Backups / snapshots cannot be confirmed from inside the box** — that is a control-panel/API setting. **This must be checked in the DigitalOcean console** (Droplet → Backups). Until confirmed, assume **not enabled**.

> Even if DO weekly backups were on, they are **weekly, whole-disk, crash-consistent** images — not point-in-time DB dumps, and a poor RPO for a live restaurant.

## 3. What DOES exist — manual, ad-hoc, pre-deploy dumps (on the same disk)

Backups are taken **by hand before deploys**, scattered across several directories, **all on the droplet's own disk**:

```
/root/backups/
  emenuy-trump-app-predeploy-20260621T163040Z.tar.gz   406 MB  (full app tree)
  emenyu-db-predeploy-20260621T163040Z.dump            150 KB  (pg_dump custom)
/root/emenyu-predeploy-20260616T064859Z.dump            145 KB  (2026-06-16)
/var/www/mysite/Emenyu/Trump/backups/
  emenyu_predeploy2_20260622_135402.dump               183 KB  (2026-06-22 — most recent DB dump)
  emenyu_predeploy_20260622_075524.dump                166 KB  (2026-06-22)
  deploy_app.tgz / deploy2_app.tgz / code_predeploy_*.tgz     (code snapshots)
/var/www/mysite/Emenyu/deploy-backups/   (dist + helpers snapshots, 2026-05-30)
/root/trump-deploy-backups/              (asset snapshots, 2026-05-31)
```

**Conclusions:**
- The team **does** take DB dumps (`pg_dump` custom format) and app tarballs **before each deploy** — good discipline, and the dumps are valid (see RESTORE-READINESS). 
- But this is **manual and deploy-triggered, not scheduled.** **Latest DB dump = 2026-06-22**, 2 days before this audit. Between deploys there is **zero** backup coverage — a failure today loses everything since 06-22.
- **All backups live on the same droplet / same disk** (`/root`, `/var/www/...`). **There is no off-box copy** (no S3/Spaces, no remote rsync). A droplet loss or disk failure destroys the live DB **and** every backup simultaneously. This is the core of B1.
- On-disk backups (the 406 MB tarball especially) are **also contributing to the 87%-full disk** (PRODUCTION-STATE §5).

## 4. Persistent JSON folders — also unbacked

`data/`, `orders/`, `history/`, `tables/`, `uploads/` (the JSON fallback + uploads) are preserved across rsync deploys but are **not** part of any scheduled backup either. They are only captured incidentally inside the manual pre-deploy app tarballs.

---

## Verdict

| Criterion | Result | Evidence |
|---|---|---|
| Automated DB backup (cron/timer) | ❌ **NONE** | §1 |
| DO managed backup | ❓ **Unverified — check DO console** | §2 |
| Manual/ad-hoc dumps | ✅ exist, valid, deploy-triggered | §3 |
| Off-box / off-disk copy | ❌ **NONE** (single point of loss) | §3 |
| Backup frequency | ⚠️ only when a deploy happens (latest 2026-06-22) | §3 |
| Retention policy | ❌ none defined (files accumulate, eating disk) | §3 |
| JSON/uploads backed up | ❌ only inside ad-hoc app tarballs | §4 |

**BLOCKER B1 (backup) status: 🔴 OPEN.** No scheduled, off-box, retained PostgreSQL backup exists. Manual pre-deploy dumps are a partial mitigation but do not satisfy a production backup requirement. **Phase 02B must add a scheduled `pg_dump` → off-box copy (DO Spaces/S3) with retention + a backup-failure alert.**
