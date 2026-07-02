# BACKUP-VERIFICATION.md — Proving Backups Actually Work

**Audience:** operator. **A backup you haven't restored is not a backup.** This is how to confirm Trump's backups are complete, off-box, and restorable.

**Backup tool:** `scripts/backup-trump.sh` — custom-format `pg_dump` of DB **`emenyu`** + app data/uploads (Images/Video), **checksummed**, **timestamped**, retained **14 days** locally at `/root/backups/auto/<ts>/`, and copied **off-box** to DigitalOcean Spaces via rclone when `TRUMP_BACKUP_REMOTE` (or `/etc/trump-backup.env`) is set. Fails hard (non-zero exit) on any error.

---

## 1. Confirm backups are running
```bash
crontab -l | grep backup-trump                 # daily schedule present?
ls -lt /root/backups/auto/ | head              # recent dated dirs?
tail -20 /var/log/trump-backup.log             # last run succeeded (no ERROR)?
```
Healthy: a new `/root/backups/auto/<today>` exists with a `.dump`, an app tarball, and a checksum file; the log ends without `ERROR`.

## 2. Confirm integrity (checksums)
```bash
cd /root/backups/auto/<ts>
sha256sum -c *.sha256        # all "OK"
```

## 3. Confirm off-box copy exists
```bash
rclone ls spaces:emenyu-backups/trump | tail   # the latest <ts> present off-box?
```
If empty → the off-box remote isn't configured. Set `TRUMP_BACKUP_REMOTE=spaces:emenyu-backups/trump` (or `/etc/trump-backup.env`) and re-run `./scripts/backup-trump.sh`. **A box-only backup dies with the box.**

## 4. THE REAL TEST — restore into a scratch DB
```bash
sudo -u postgres createdb emenyu_restore_test
# postgres OS user can't read /root → pipe the dump in:
cat /root/backups/auto/<ts>/emenyu-<ts>.dump | sudo -u postgres pg_restore -d emenyu_restore_test --no-owner
```
Then verify the restored data is sane (compare to live):
```bash
for t in Order MenuItem MenuCategory WaiterAssignment Notification; do
  echo -n "$t live/restored: "
  echo -n "$(sudo -u postgres psql -tAd emenyu -c "select count(*) from \"$t\";") / "
  sudo -u postgres psql -tAd emenyu_restore_test -c "select count(*) from \"$t\";"
done
sudo -u postgres dropdb emenyu_restore_test     # clean up
```
Counts should match (allow for live writes since the dump). This proves a restore would actually work (the Phase 02B2 drill **passed** this way).

## 5. App-data restore spot check
```bash
mkdir -p /tmp/restore-check && tar xzf /root/backups/auto/<ts>/app-*.tar.gz -C /tmp/restore-check
ls /tmp/restore-check/Images | head; ls /tmp/restore-check/Video | head    # media present?
rm -rf /tmp/restore-check
```

## Verification cadence
| When | Do |
|---|---|
| Daily (automated) | backup runs via cron; monitor alerts on failure |
| Weekly | check the log + off-box copy (steps 1–3) |
| **Monthly** | **full restore drill into a scratch DB (step 4)** — the only test that proves restorability |
| Before any deploy | a fresh pre-deploy snapshot (deploy script does this automatically) |

## Sign-off (record monthly)
- Date: ____  Backup `<ts>`: ____  Checksums OK: ☐  Off-box present: ☐  Restore drill passed: ☐  Row counts matched: ☐  By: ____

## If a verification fails
- Backup not running → check cron + `/var/log/trump-backup.log`; run manually; fix the error it prints (it fails hard).
- Checksum mismatch → discard that backup; investigate disk; take a fresh one.
- Restore fails → **this is a P1** ([INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md)) — you have no safety net until fixed. Most common cause: the `/root` read-permission issue → use the `cat … | pg_restore` pattern above.
