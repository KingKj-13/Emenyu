# DISASTER-RECOVERY.md — Recovering From Serious Failures

**Audience:** operator recovering from data loss or a lost server. **Rule 1:** during service, fall back to paper/POS first, then recover. The source of truth is **PostgreSQL** + the **backups** (local `/root/backups/auto/`, off-box DigitalOcean Spaces).

**Backups (from `backup-trump.sh`):** daily, custom-format `pg_dump` of DB `emenyu` + app data/uploads, checksummed, 14-day local retention, off-box via rclone. Restore was **drill-tested** in Phase 02B2.

---

## DR-1. Server failure (box unresponsive / lost)
1. Provision a new server; follow [INSTALLATION-GUIDE.md](INSTALLATION-GUIDE.md) through step 4 (DB created, env, deps, **no data yet**).
2. Fetch the latest verified backup (off-box if the old box is gone):
   ```bash
   rclone copy spaces:emenyu-backups/trump/<latest> /root/restore/   # off-box → new box
   ```
3. Restore the DB (see DR-2).
4. Restore app data/uploads (Images/Video) from the backup tarball into `Trump/`.
5. Deploy the app ([DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md)); point DNS/nginx at the new box; TLS via certbot.
6. Verify ([SERVER-RECOVERY.md](SERVER-RECOVERY.md) "After recovery").

## DR-2. Database corruption / data loss
**Restore the most recent verified dump into a SCRATCH DB first, confirm, then swap.**
```bash
# 1. restore into a scratch DB (never overwrite live blindly)
sudo -u postgres createdb emenyu_restore
# the postgres OS user must READ the dump → cat it in (avoids /root permission denied):
cat /root/restore/emenyu-<ts>.dump | sudo -u postgres pg_restore -d emenyu_restore --no-owner
# 2. sanity-check row counts vs expectation
sudo -u postgres psql -d emenyu_restore -c 'select count(*) from "Order";'
sudo -u postgres psql -d emenyu_restore -c 'select count(*) from "MenuItem";'
# 3. cutover: stop app, rename DBs, restart
pm2 stop emenuy-trump-api
sudo -u postgres psql -c 'ALTER DATABASE emenyu RENAME TO emenyu_broken;'
sudo -u postgres psql -c 'ALTER DATABASE emenyu_restore RENAME TO emenyu;'
pm2 start emenuy-trump-api && curl -s http://127.0.0.1:3012/readyz
```
> The `cat … | pg_restore` pattern avoids the `pg_restore: Permission denied` on `/root` that the postgres OS user hits (Phase 02B2 finding).
Data since the last backup is lost (max one day with daily backups) — reconcile against the till / paper for that window.

## DR-3. Bad deployment
```bash
./scripts/deploy-trump.sh rollback /root/trump-deploy-snapshots/<last-good>
```
Restores code + (if needed) the pre-deploy DB snapshot. Additive migrations mean code-only rollback is usually enough. → [SERVER-RECOVERY.md](SERVER-RECOVERY.md) §7.

## DR-4. Lost waiter device
- **Revoke its session immediately:** owner/manager (or the waiter on another device) → Profile → My devices → **Revoke** the lost device (`DELETE /api/auth/devices/:id`). Its refresh token stops working; the short-lived access token expires within 15 min.
- Rotate the affected staff password if the device may be unlocked ([PASSWORD-ROTATION.md](PASSWORD-ROTATION.md)).
- No customer PII is stored on the device; tokens live in the OS secure store.

## DR-5. Lost credentials (admin/owner locked out)
- On the box you have full control: `npm run auth:audit` to list accounts; reset a password by setting the `TRUMP_*_PASS` env + re-seed, or use `auth:rotate`. → [PASSWORD-ROTATION.md](PASSWORD-ROTATION.md)
- The session secret (`TRUMP_SESSION_SECRET`) can be rotated to invalidate ALL sessions (forces everyone to re-login) — use if a secret leaked.

## DR-6. Network outage (server reachable, internet flaky)
- The app and DB are local to the box; if the box has connectivity, service continues. nginx/TLS unaffected by transient blips.
- Customers/staff off Wi-Fi: the **Android app is read-resilient** (cached menu/shift/assignments; server-authoritative actions disabled offline, auto-reconnect) — see [../phase-04b/OFFLINE-IMPLEMENTATION.md](../phase-04b/OFFLINE-IMPLEMENTATION.md).

## DR-7. Restaurant internet failure (no uplink at all)
- Trump is **server-hosted** (cloud) — if the restaurant has no internet, customer QR ordering + waiter app can't reach it. **This is a fallback-to-paper situation (Rule 1).** When connectivity returns, the app reconnects and reconciles; no committed data is lost.
- Mitigation to plan with the owner: a backup uplink (mobile hotspot) for the till/manager device.

## Recovery time / point objectives (current)
| | Target | Basis |
|---|---|---|
| **RPO** (max data loss) | ≤ 24 h | daily backups (tighten with more frequent dumps if needed) |
| **RTO** (time to restore) | ~1–2 h (DB restore) / longer for full box rebuild | restore drill timing |

## Golden rules
1. **Restore into a scratch DB and verify before cutover.** Never `pg_restore` over live blindly.
2. **Keep the off-box copy current** — a box-only backup dies with the box.
3. **After any DR action**, run a backup + verify ([BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md)) and log it ([INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md)).
