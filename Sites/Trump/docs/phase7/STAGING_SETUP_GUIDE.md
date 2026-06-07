# STAGING SETUP GUIDE

A staging environment that mirrors production (**Ubuntu + PM2 + PostgreSQL**, no Docker) with a **separate
database**, **separate env**, and **no production data** — for safe migration/seed/recommendation testing.
Date: 2026-06-07.

> Golden rule: staging uses its **own** `DATABASE_URL`. It must **never** be the production string
> (`…@134.122.99.78…`). Seed fresh data — **do not** copy production data (avoids guest PII on staging).

## 1. Provision a staging PostgreSQL

Pick one (all native — no Docker):

**A) PostgreSQL on the staging host (simplest):**
```bash
sudo apt-get update && sudo apt-get install -y postgresql
sudo -u postgres psql -c "CREATE DATABASE emenyu_staging;"
sudo -u postgres psql -c "CREATE ROLE emenyu_stg LOGIN PASSWORD '<strong-staging-pw>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE emenyu_staging TO emenyu_stg;"
sudo -u postgres psql -d emenyu_staging -c "GRANT ALL ON SCHEMA public TO emenyu_stg;"
# keep it private: listen_addresses='localhost' + pg_hba allow 127.0.0.1 only
```
**B) A separate DigitalOcean Managed Postgres** (a distinct instance from prod) — use its connection string
and add the staging host to Trusted Sources.

Resulting connection string (example A): `postgresql://emenyu_stg:<pw>@localhost:5432/emenyu_staging`

## 2. Get the code

```bash
git clone https://github.com/KingKj-13/Emenyu.git && cd Emenyu
git checkout feat/phase3-reco-implementation
npm install
cd Sites/Trump && npm install && cd ../..
```

## 3. Configure staging environment (separate from prod)

```bash
# root .env — Prisma reads DATABASE_URL from here (staging, NOT prod)
printf 'DATABASE_URL="postgresql://emenyu_stg:<pw>@localhost:5432/emenyu_staging"\n' > .env

# Sites/Trump/.env — generate fresh secrets for staging
cd Sites/Trump
node scripts/bootstrap-env.js          # writes Sites/Trump/.env with strong secrets
# set staging-appropriate values:
#   TRUMP_PUBLIC_ORIGIN / TRUMP_ALLOWED_ORIGINS = the staging URL
#   TRUMP_FORCE_HTTPS / TRUMP_HSTS_ENABLED as per the staging TLS setup
cd ../..
npm run env:check                       # validate Prisma env
```

## 4. Apply schema + generate client

```bash
npx prisma migrate deploy --schema prisma/schema.prisma   # creates ALL tables on the empty staging DB
npx prisma generate        --schema prisma/schema.prisma
```

## 5. Seed staging data (fresh — no prod data)

```bash
cd Sites/Trump
npm run auth:migrate      # seed default accounts (from env) — idempotent
npm run menu:migrate      # load the menu into Postgres (chef-rec/bundle seeds resolve items by name)
npm run reco:seed -- --apply       # chef recommendations
npm run bundles:seed -- --apply     # persona bundles
```

## 6. Start the app

```bash
# from Sites/Trump
npm run pm2:start          # or: node server.js
npm run health             # general health
```

## 7. Verify (the deferred Phase 6 steps — now runnable on staging)

```bash
# from Sites/Trump
npm run reco:health                       # chef-rec integrity vs the staging menu → expect exit 0
npm run reco:verify:live -- --confirm      # live ingest/aggregation/dashboard/chef-rec/bundle/rotation → expect all PASS
SMOKE_BASE_URL="https://<staging-url>" \
  SMOKE_LOGIN_USER="<owner>" SMOKE_LOGIN_PASS="<pw>" \
  npm run smoke:test                       # customer/waiter/owner/admin endpoints
```

## 8. Rehearse rollback on staging (optional but recommended)

```bash
# confirm the app still boots after dropping the reco tables (fallbacks)
psql "$DATABASE_URL" -c 'DROP TABLE IF EXISTS "RecommendationBundleItem","RecommendationBundle","RecommendationEvent","MenuItemRecommendation" CASCADE;'
npm run pm2:restart && npm run health      # expect: app boots, recommendations fall back to algorithmic
npx prisma migrate deploy --schema ../../prisma/schema.prisma   # re-apply (idempotent) to restore
```

## Teardown

```bash
sudo -u postgres psql -c "DROP DATABASE emenyu_staging;"   # example A
pm2 delete emenuy-trump-api
```

## Parity checklist (staging ≈ production)

- [ ] Same Node major version, same branch (`feat/phase3-reco-implementation`).
- [ ] Same PostgreSQL major (16), separate DB, **non-prod** `DATABASE_URL`.
- [ ] Separate secrets (own `Sites/Trump/.env`); **no prod data**.
- [ ] PM2 + (optionally) the same Nginx config as prod.
- [ ] All of §7 green before signing off the deployment runbook.
