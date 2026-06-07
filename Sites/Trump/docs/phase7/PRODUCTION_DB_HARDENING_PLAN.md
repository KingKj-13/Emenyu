# PRODUCTION DB HARDENING PLAN

**Plan only — production is NOT modified by this document.** Resolves launch blocker S1 (Phase 6).
Date: 2026-06-07. Execute during a planned maintenance window with the old credentials/rules kept until
verified.

## Current state (from `.env` + code; no prod connection was made)

| Aspect | Observed | Risk |
|---|---|---|
| Connection string | `postgresql://postgres:<weak>@134.122.99.78:5432/emenyu` | 🔴 |
| Host | `134.122.99.78` — a **public IP** (the workstation, off the server LAN, has it configured) | 🔴 reachable beyond the app server |
| DB user | **`postgres` (superuser)** used by the app | 🔴 over-privileged |
| Password | **weak** (9 chars, dictionary+numeric) | 🔴 brute-forceable |
| Firewall / pg_hba | unknown from here — **must be audited on the host** | ❓ |
| Backups | `BACKUP_AND_DR.md` covers **file** backups (tar), **not `pg_dump`** of Postgres | 🔴 DB not backed up |

> The combination — superuser + weak password + public reachability — is the single highest launch risk.

## Required changes (ordered; least-downtime first)

### 1. Audit the host (read-only, on the server — not from this workstation)
```bash
# on the DB/app droplet
sudo ss -tlnp | grep 5432                     # what is Postgres bound to? (0.0.0.0 = public)
sudo cat /etc/postgresql/*/main/pg_hba.conf   # which hosts/methods are allowed?
sudo ufw status                               # OS firewall
# + check the DigitalOcean Cloud Firewall and (if a Managed DB) its "Trusted Sources"
```

### 2. Rotate credentials → least-privilege app role
```sql
-- as a DB admin
ALTER USER postgres WITH PASSWORD '<new-strong-postgres-pw>';     -- rotate superuser
CREATE ROLE emenyu_app LOGIN PASSWORD '<new-strong-app-pw>';      -- dedicated app role
GRANT CONNECT ON DATABASE emenyu TO emenyu_app;
GRANT USAGE ON SCHEMA public TO emenyu_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO emenyu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO emenyu_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO emenyu_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO emenyu_app;
```
Then update the **production** `.env` `DATABASE_URL` to the new app role and reload:
```bash
# prisma migrate deploy still needs a role that can DDL — run migrations as postgres/owner,
# but run the APP as emenyu_app.
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
```

### 3. Restrict network access (choose by topology)
- **If the app and Postgres are on the SAME droplet (preferred):** bind Postgres to localhost and close
  5432 externally entirely.
  ```
  # postgresql.conf
  listen_addresses = 'localhost'
  # pg_hba.conf — allow only local
  host  emenyu  emenyu_app  127.0.0.1/32  scram-sha-256
  ```
  Then `DATABASE_URL=...@localhost:5432/emenyu` and remove any public 5432 firewall rule.
- **If Postgres is a separate host / Managed DB:** restrict to the **app server's IP / private network only**
  (DigitalOcean Cloud Firewall + Managed-DB "Trusted Sources"); use the **private** network address; require
  TLS (`?sslmode=require`).

### 4. Backups (close the `pg_dump` gap)
```bash
# nightly logical backup of the Postgres DB (add to cron; copy offsite; test restore)
pg_dump --no-owner --format=custom "$DATABASE_URL" > "backups/emenyu-db-$(date -u +%Y%m%dT%H%M%SZ).dump"
# restore drill (to a scratch DB, NOT prod):
createdb emenyu_restore_test && pg_restore --no-owner -d emenyu_restore_test backups/emenyu-db-*.dump
```
(Or enable DigitalOcean Managed-DB automated backups + PITR and verify a restore.) Fold these into
`docs/BACKUP_AND_DR.md`, which currently only tars the file-based data.

### 5. Remove prod `DATABASE_URL` from developer workstations
Use the staging connection string for local work (see `STAGING_SETUP_GUIDE.md`). Never run `migrate`/
`--apply` against the prod URL from a laptop.

## Downtime impact

| Change | Downtime | Notes |
|---|---|---|
| Password rotation + app role + `pm2 reload` | **Seconds** (zero-downtime reload) | existing connections drain; new ones use new creds |
| Firewall restriction (add-before-remove) | **None** | add the app-server allow rule *before* removing the public rule |
| Bind to localhost/private (Postgres restart) | **Brief** (Postgres restart) | the app fails **soft** (JSON/algorithmic fallbacks) during the blip — no hard outage |
| Backups | **None** | additive cron |

## Rollback procedure

1. **Before any change:** take a `pg_dump` + note the current credentials and firewall rules.
2. **Password/role:** revert `DATABASE_URL` in `.env` to the previous value and `pm2 reload`. Keep the old
   password valid until the new one is verified working.
3. **Firewall:** re-add the previous rule (keep the old rule documented).
4. **Bind change:** restore `listen_addresses`/`pg_hba.conf` from the backup copy and restart Postgres.
5. **Verification after each step:** `npm run health` + `npm run smoke:test` against the live URL.

## Acceptance criteria (blocker S1 closed)

- [ ] App connects via a **non-superuser** role with a **strong** password.
- [ ] Postgres is **not reachable from the public internet** (only the app server / private network).
- [ ] A **`pg_dump` backup runs on a schedule**, is copied offsite, and a **restore has been tested**.
- [ ] No developer workstation holds the prod `DATABASE_URL`.
