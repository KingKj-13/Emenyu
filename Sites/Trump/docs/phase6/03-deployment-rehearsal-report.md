# Step 3 — Deployment Rehearsal Report

**Mode: document-only (per decision).** Every step that does **not** require a database was **executed**
and timed below. The database-gated steps are provided as an **exact, copy-paste runbook** to execute
against a **staging** Postgres (never the production `DATABASE_URL` — see Step 2). Date: 2026-06-07,
Node v22.17.1, Windows workstation.

## A. Executed now (offline-safe) — all ✅

| # | Step | Command | Result | Time |
|---|---|---|---|---|
| 1 | Prisma client generate | `npx prisma generate --schema prisma/schema.prisma` | ✅ Generated Prisma Client v6.19.3 (incl. `RecommendationEvent`, `RecommendationBundle(+Item)`, `MenuItemRecommendation`) | 639 ms (8.1 s incl. npm) |
| 2 | Bundle JSON fallback seed | `npm run bundles:seed -- --json` | ✅ wrote 5 bundles to `data/recommendation-bundles.json` | 181 ms |
| 3 | Reco engine/safety/rotation/NLU suite | `npm run reco:validate` | ✅ **41/41** | 195 ms |
| 4 | Health analyzer + analytics aggregator | `npm run reco:health:test` | ✅ **17/17** | 202 ms |
| 5 | Bundles/attribution/insights suite | `npm run reco:validate:phase5` | ✅ **17/17** | 198 ms |
| 6 | Client typecheck | `cd client && npx tsc --noEmit` | ✅ clean | 13.1 s |
| 7 | Client production build | `cd client && npx vite build` | ✅ built in 1.23 s → 17 JS + 6 CSS bundles in `client/dist` | 3.1 s |
| 8 | Performance benchmark | `npm run reco:bench` | ✅ aggregate 50k events ≈ 10.9 ms; classify ≈ 0.8 µs; rotate ≈ 5.9 µs | <1 s |

**No failures.** Migrations are valid (the schema generates cleanly), the build is green, all three
deterministic suites pass, and the bundle fallback writes/reads correctly.

## B. Database-gated steps — runbook for STAGING (not executed; deferred)

> Prerequisites: a **dedicated non-production** PostgreSQL and a connection string in `DATABASE_URL`
> (or a git-ignored `.env.staging`). **Confirm the host is NOT `134.122.99.78` (production) before each
> command.** Take a backup first if the target already holds data.

```bash
# from repo root
export DATABASE_URL="postgresql://dev:<strong>@<staging-host>:5432/emenyu_staging"   # NEVER the prod URL

# 1) migrations (additive, idempotent — CREATE TABLE IF NOT EXISTS, guarded FKs)
npx prisma migrate deploy --schema prisma/schema.prisma     # applies phase3/4/5 migrations
npx prisma generate        --schema prisma/schema.prisma

# from Sites/Trump
cd Sites/Trump
# 2) seeds (idempotent; only write the recommendation tables)
npm run reco:seed    -- --apply     # chef recommendations
npm run bundles:seed -- --apply      # persona bundles (+ refreshes the JSON fallback)

# 3) start the server (loads env, connects lazily)
node server.js   # or: npm run pm2:start

# 4) health checks
npm run reco:health                  # chef-rec integrity vs the live menu → expect exit 0 (no fail-level issues)
node scripts/healthcheck.js          # general server/env healthcheck

# 5) live end-to-end verification (writes ONLY an isolated 'verify-suite' id, then deletes it)
npm run reco:verify:live -- --confirm     # expect: ingest/aggregation/dashboard/chef-rec/bundle/rotation all PASS
```

### Expected outcomes (from the offline-validated logic)

| Step | Expected |
|---|---|
| `migrate deploy` | 3 reco migrations applied (or "already applied"); no destructive ops |
| `reco:seed --apply` | chef recs upserted (steak/seafood → wines/sides/sauce/dessert) |
| `bundles:seed --apply` | 5 persona bundles upserted |
| `reco:health` | exit 0; warnings only if a recommended item is hidden/missing |
| `reco:verify:live --confirm` | "N/N live checks passed" incl. `sink: postgres`, `byBundle` attribution, deterministic+varied rotation |

## C. Why this is safe

- No command above was run against production; the only DB write performed locally was to a **JSON file**.
- The migrations are **additive + idempotent**; re-running them is safe.
- `reco:verify:live` is self-guarding (`--confirm`, isolated `verify-suite` restaurantId, auto-cleanup).

## D. Blocking item for a full rehearsal

A **dedicated staging PostgreSQL** must be provisioned (Step 2 plan). Until section B is executed on
staging, the live DB path (real ingest, real migration apply, `reco:verify:live`) remains **unproven in
this environment** — this is the single CONDITION on the GO/NO-GO (Step 8).
