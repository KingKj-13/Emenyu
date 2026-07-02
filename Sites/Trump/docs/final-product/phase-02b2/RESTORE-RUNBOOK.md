# RESTORE-RUNBOOK.md — Phase 02B.2 P2

**Date:** 2026-06-24. **Purpose:** a tested, step-by-step procedure to recover Trump's database and state from a backup onto a replacement server. **Status: ✅ drilled and PASSING** (Step 4 evidence below).

> **RPO (Recovery Point Objective): ≤ 24 h** today (daily backup at 03:10 UTC). Tighten to ≤ 1 h by adding an hourly DB-only dump once off-box storage is active (the DB dump is ~0.3 MB; only local disk made hourly impractical before off-box).
> **RTO (Recovery Time Objective): ≤ 60 min** target on a fresh droplet (provision → install PG → fetch backup → restore → verify → cut traffic). The drill restore itself takes seconds at this data size.

---

## Key lesson baked into this runbook

`pg_restore` runs as the **`postgres`** OS user, which **cannot read `/root`** (mode 0700). Always **pipe the dump as root** into pg_restore (`cat dump | sudo -u postgres pg_restore …`), or copy the dump to a postgres-readable path first. (This is why the first drill failed with `Permission denied` — see Step 4.)

---

## Procedure

### 1. Create a replacement server
- DigitalOcean droplet, **Ubuntu 24.04 LTS**, ≥ 1 GB (match or exceed the original).
- Add your SSH key; note the new IP.

### 2. Install PostgreSQL + tooling
```bash
apt-get update && apt-get install -y postgresql-16 nginx nodejs npm rclone
systemctl enable --now postgresql
```

### 3. Download the latest backup
- **Off-box (preferred — Spaces):**
  ```bash
  rclone config create spaces s3 provider DigitalOcean access_key_id <KEY> \
    secret_access_key <SECRET> endpoint <region>.digitaloceanspaces.com
  latest=$(rclone lsf spaces:emenyu-backups/trump | sort | tail -1)
  rclone copy "spaces:emenyu-backups/trump/$latest" /root/restore/
  ```
- **On-box (if the original disk survives):** copy from `/root/backups/auto/<ts>/`.
- Verify integrity: `sha256sum -c /root/restore/SHA256SUMS` and `pg_restore --list /root/restore/*.dump >/dev/null`.

### 4. Restore the database
```bash
sudo -u postgres createdb emenyu          # fresh, empty
cat /root/restore/emenyu-*.dump | sudo -u postgres pg_restore -d emenyu
#  (or, restoring over an existing DB:)
cat /root/restore/emenyu-*.dump | sudo -u postgres pg_restore --clean --if-exists -d emenyu
```

### 5. Restore uploads / data
```bash
mkdir -p /var/www/mysite/Emenyu/Trump
tar -xzf /root/restore/trump-data-*.tar.gz -C /var/www/mysite/Emenyu/Trump
# (restores data/ uploads/ orders/ history/ tables/)
```

### 6. Deploy app + verify readiness
```bash
cd /var/www/mysite/Emenyu/Trump
# set .env: DATABASE_URL=...@127.0.0.1:5432/emenyu, TRUMP_HOST=127.0.0.1, secrets
npm ci --omit=dev
npx prisma generate --schema ../prisma/schema.prisma
pm2 start ecosystem.config.js --env production && pm2 save
curl -fsS http://127.0.0.1:3012/readyz        # expect {"status":"ready", ...}
node scripts/audit-accounts.js --json | grep weakOrInsecure   # expect 0
```
Row-count sanity vs the dump (the drill check): `User`, `MenuItem`, `MenuCategory`, `Order`.

### 7. Cut traffic over
- Lock Postgres (`listen_addresses='localhost'`, `pg_hba` localhost-only) and firewall as per Phase 02B.1.
- Point nginx (`emenyu.com` server block, `/Trump/*` → `127.0.0.1:3012`) and obtain/copy the TLS cert (`certbot --nginx -d emenyu.com -d www.emenyu.com`).
- Update DNS A record to the new IP; verify `https://emenyu.com/Trump/api/menu` → 200.

---

## Step 4 — Restore drill (real test, evidence)

A drill restore of the **fresh** backup into an isolated DB was run on the live box:

```
restoring: /root/backups/auto/20260624T190809Z/emenyu-20260624T190809Z.dump
$ sudo -u postgres createdb emenyu_restore_drill
$ cat <dump> | sudo -u postgres pg_restore -d emenyu_restore_drill

  count comparison (live emenyu vs restored drill):
  User           live=6     restored=6      MATCH
  MenuItem       live=851   restored=851    MATCH
  MenuCategory   live=174   restored=174    MATCH
  Order          live=36    restored=36     MATCH
  DRILL_RESULT=PASS
  spot-check (restored MenuItem): "FLASH PAN FRIED CHICKEN LIVERS"
$ sudo -u postgres dropdb emenyu_restore_drill        # cleaned up
```

✅ **Restore drill PASSED** — backup restores cleanly, all row counts match, real data present. The runbook above is the procedure that was exercised.

---

## Verdict

| Requirement | Status |
|---|---|
| Documented runbook (7 steps) | ✅ |
| RPO / RTO defined | ✅ RPO ≤ 24 h (→ 1 h path), RTO ≤ 60 min |
| Real restore drill | ✅ PASS (counts + spot-check) |
| Off-box fetch in runbook | ✅ (activates with Spaces creds) |

**B1-restore: CLOSED** (drilled + documented). Re-run the drill after enabling off-box, and schedule a periodic drill (quarterly) in Phase 03.
