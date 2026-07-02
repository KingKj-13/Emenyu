# BACKUP-IMPLEMENTATION.md — Phase 02B.2 P1

**Date:** 2026-06-24. **Goal:** automated, compressed, timestamped, retained PostgreSQL backups with an off-box copy. **Status: ✅ automated local backups live + verified; 🟡 off-box upload ARMED (rclone installed, pluggable) — pending DO Spaces credentials to activate.**

---

## 1. The backup job

Script: `Sites/Trump/scripts/backup-trump.sh` → installed on the box at **`/usr/local/sbin/trump-backup.sh`** (0750). Per run it produces a timestamped set under **`/root/backups/auto/<UTC-ts>/`**:

| Artifact | How | Notes |
|---|---|---|
| `emenyu-<ts>.dump` | `pg_dump -Fc` | custom format (internally gzip-compressed); integrity-checked with `pg_restore --list` |
| `trump-data-<ts>.tar.gz` | `tar -czf` | app mutable state: `data/ uploads/ orders/ history/ tables/` |
| `SHA256SUMS` | `sha256sum` | checksums for every artifact |

Properties: **automated** (cron), **compressed** (`-Fc` + gzip), **timestamped** (UTC), **retained** (`find -mtime +14` prune), **fails hard** (non-zero exit on any error → cron/monitor can alert).

## 2. Schedule

```
$ crontab -l
10 3 * * * /usr/local/sbin/trump-backup.sh >> /var/log/trump-backup.log 2>&1
```
**Frequency:** daily 03:10 UTC. **Retention:** 14 days local (env `TRUMP_BACKUP_RETAIN_DAYS`).

## 3. Verification (Step 2 — evidence)

```
$ /usr/local/sbin/trump-backup.sh
[..] db dump ok: 276K, TABLE DATA entries=23
[..] data tar: 18M
[..] checksums recorded: 2 file(s)
[..] retention: pruned > 14d; backup sets on disk: 1

$ ls /root/backups/auto/20260624T190809Z/
SHA256SUMS  emenyu-20260624T190809Z.dump  trump-data-20260624T190809Z.tar.gz
$ sha256sum -c SHA256SUMS
./emenyu-...dump: OK
./trump-data-...tar.gz: OK
$ pg_restore --list emenyu-...dump | grep -c 'TABLE DATA'   → 23
```
✅ file created, checksums recorded + verified, dump integrity confirmed.

## 4. Off-box destination (DigitalOcean Spaces) — ARMED, activation pending

The box had **no** off-box tooling/credentials. **`rclone v1.60.1` is now installed**, and `backup-trump.sh` already contains a verified-on-upload off-box step gated by `TRUMP_BACKUP_REMOTE`. Config lives in **`/etc/trump-backup.env`** (0600).

**To activate** (one time), with your Spaces key/secret/region/bucket:
```bash
# 1) create the rclone remote
rclone config create spaces s3 provider DigitalOcean \
  access_key_id <SPACES_KEY> secret_access_key <SPACES_SECRET> \
  endpoint <region>.digitaloceanspaces.com           # e.g. blr1 / nyc3 / ams3
# 2) create the bucket (if new) and point the backup at it
rclone mkdir spaces:emenyu-backups
sed -i 's|#TRUMP_BACKUP_REMOTE=.*|TRUMP_BACKUP_REMOTE=spaces:emenyu-backups/trump|' /etc/trump-backup.env
# 3) prove it
/usr/local/sbin/trump-backup.sh        # log should show: off-box upload ok -> spaces:.../<ts>
rclone lsf spaces:emenyu-backups/trump # lists uploaded sets
```
The script **verifies** the upload (`rclone lsf` after copy) and fails hard if it didn't land.

**Cost estimate (DO Spaces):** flat **$5/mo** (250 GB storage + 1 TB transfer included). Backups are tiny (~0.3 MB DB + ~18 MB data per day); even years of daily retention is well under the base tier → effectively **$5/mo total**. (AWS S3 equivalent would be pennies/month at this volume.)

## 5. Restore command (quick reference)

```bash
# DB (postgres user can't read /root → pipe as root):
cat emenyu-<ts>.dump | sudo -u postgres pg_restore --clean --if-exists -d emenyu
# data/uploads:
tar -xzf trump-data-<ts>.tar.gz -C /var/www/mysite/Emenyu/Trump
```
Full procedure + drill evidence in **RESTORE-RUNBOOK.md**.

---

## Verdict

| Requirement | Status |
|---|---|
| Automated | ✅ cron daily |
| Compressed | ✅ `-Fc` + gzip |
| Timestamped | ✅ UTC dirs |
| Retention | ✅ 14 days |
| Created/verified | ✅ checksums + integrity (Step 2) |
| **Off-box destination** | 🟡 **ARMED** (rclone installed, pluggable) — set Spaces creds to activate + verify |

**B1-backup: substantially CLOSED locally; fully CLOSED once Spaces creds are set** (one-step activation above; the off-box copy is the last verification).
