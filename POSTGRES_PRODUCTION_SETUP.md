# POSTGRESQL PRODUCTION SETUP
## PostgreSQL 16 + Prisma Schema Deployment
**Date:** 2026-05-21
**Server:** 134.122.99.78 (emenyu.com)

---

## SUMMARY

PostgreSQL 16 installed from scratch. Database `emenyu` created. Prisma schema deployed with 6 migrations. All 12 schema tables created successfully. Auth users seeded automatically on first Trump server start.

---

## 1. POSTGRESQL INSTALLATION

```bash
apt-get install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
# → active (running), enabled
```

**Installed version:** PostgreSQL 16 (Ubuntu 24.04 apt repo: 16+257build1.1)
**Data directory:** `/var/lib/postgresql/16/main/`
**Config:** `/etc/postgresql/16/main/postgresql.conf`
**HBA:** `/etc/postgresql/16/main/pg_hba.conf`

---

## 2. DATABASE AND USER CONFIGURATION

```sql
-- Set postgres superuser password
ALTER USER postgres PASSWORD '<redacted>';

-- Create application database
CREATE DATABASE emenyu;
```

**pg_hba.conf change:** Added TCP/IP scram-sha-256 authentication for localhost:

```
# TYPE  DATABASE  USER      ADDRESS      METHOD
host    all       all       127.0.0.1/32  scram-sha-256
host    all       all       ::1/128       scram-sha-256
```

Without this change, `peer` auth is the default for localhost, and Prisma (which connects via TCP) would get `FATAL: Peer authentication failed`.

**Connection string:**
```
DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/emenyu
```

Note: Prisma requires `127.0.0.1` (TCP loopback), not `localhost` (which may resolve to Unix socket).

---

## 3. PRISMA SCHEMA DEPLOYMENT

### 3a. Schema location

Shared Prisma schema uploaded to server:

```
/var/www/mysite/Emenyu/prisma/
├── schema.prisma
└── migrations/
    ├── 20260521092747_init/
    │   └── migration.sql
    ├── 20260521094500_auth_user_metadata/
    │   └── migration.sql
    ├── 20260521101500_menu_system/
    │   └── migration.sql
    ├── 20260521103000_order_table_system/
    │   └── migration.sql
    ├── 20260521104000_order_filename_scope/
    │   └── migration.sql
    └── 20260521110000_active_cart_admin_overrides/
        └── migration.sql
```

### 3b. Prisma client generation

```bash
cd /var/www/mysite/Emenyu/Trump
npx prisma generate --schema /var/www/mysite/Emenyu/prisma/schema.prisma
# → Generated Prisma Client (v6.x) to node_modules/@prisma/client
```

Note: Schema has `output = "../../../node_modules/@prisma/client"` relative to `Sites/Trump/` on development. On the server the relative path resolves correctly because Trump is at `/var/www/mysite/Emenyu/Trump/` and node_modules is inside that directory.

### 3c. Migration deployment

```bash
npx prisma migrate deploy --schema /var/www/mysite/Emenyu/prisma/schema.prisma
```

**Output:** All 6 migrations applied without error.

---

## 4. MIGRATION HISTORY

All 6 migrations applied on 2026-05-21 at approximately 22:23 UTC:

| Migration name | Applied at | Steps |
|---------------|------------|-------|
| 20260521092747_init | 2026-05-21 22:23:03 | 1 |
| 20260521094500_auth_user_metadata | 2026-05-21 22:23:03 | 1 |
| 20260521101500_menu_system | 2026-05-21 22:23:03 | 1 |
| 20260521103000_order_table_system | 2026-05-21 22:23:03 | 1 |
| 20260521104000_order_filename_scope | 2026-05-21 22:23:03 | 1 |
| 20260521110000_active_cart_admin_overrides | 2026-05-21 22:23:03 | 1 |

---

## 5. SCHEMA TABLES CREATED

13 tables confirmed present after migration:

| Table | Purpose |
|-------|---------|
| `User` | Auth accounts (owner/manager/waiter roles) |
| `ActiveCartState` | Per-table cart + admin overrides (JSONB) |
| `Order` | Order records (active + history) |
| `OrderItem` | Line items per order |
| `OrderStatusHistory` | Immutable audit log per order |
| `WaiterAssignment` | Waiter call/respond/release state |
| `Table` | Table registration |
| `MenuCategory` | Menu categories |
| `MenuItem` | Menu items |
| `RestaurantMenuSettings` | Per-restaurant menu config |
| `FeaturedItem` | Featured/highlighted items |
| `Recommendation` | AI recommendation cache |
| `_prisma_migrations` | Prisma migration state table |

---

## 6. AUTH USER SEEDING

The Trump server seeds default auth users from the `.env` file on first startup. On 2026-05-21 22:30:05 UTC (first PM2 start), the server logged:

```json
{"event":"auth_postgres_migration_complete","created":4,"updated":0}
```

Users created:

| Username | Role | Source env var |
|----------|------|---------------|
| admin | owner | TRUMP_ADMIN_PASS |
| owner | owner | TRUMP_OWNER_USER / TRUMP_OWNER_PASS |
| manager | manager | TRUMP_MANAGER_USER / TRUMP_MANAGER_PASS |
| waiter | waiter | TRUMP_WAITER_USER / TRUMP_WAITER_PASS |

---

## 7. ADDING MORE MIGRATIONS

When new Prisma migrations are created locally, deploy to production:

```bash
# 1. Upload new migration folder
scp -r d:\Projects\Emenyu\Sites\Trump\prisma\migrations\<new_migration>\ \
    root@134.122.99.78:/var/www/mysite/Emenyu/prisma/migrations/

# 2. Apply migration
ssh root@134.122.99.78 \
  "cd /var/www/mysite/Emenyu/Trump && \
   npx prisma migrate deploy --schema /var/www/mysite/Emenyu/prisma/schema.prisma"

# 3. Restart app
ssh root@134.122.99.78 "pm2 restart emenuy-trump-api"
```

---

## 8. BACKUP PROCEDURE

PostgreSQL data is not included in the pre-deployment backup (PostgreSQL was not installed at backup time). For ongoing backups:

```bash
# Daily PostgreSQL dump (add to crontab):
pg_dump -U postgres -h 127.0.0.1 emenyu > /root/backups/emenyu_$(date +%Y%m%d).sql
```

The Trump application also maintains JSON file fallbacks (`orders/*.json`, `tables/*.json`) for all critical state — these provide a secondary recovery path if the database is unavailable.
