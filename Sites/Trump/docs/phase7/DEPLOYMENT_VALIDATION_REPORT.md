# DEPLOYMENT VALIDATION REPORT

Validates that every deployment process for the recommendation/launch release is documented and sound, and
flags gaps. **Documentation review + offline validation only** (live DB steps deferred to staging).
Date: 2026-06-07.

## Process-by-process

| Process | Documented in | Validated? | Status |
|---|---|---|---|
| App deploy (PM2) | `docs/DEPLOYMENT.md` (first deploy, `pm2 reload`, shutdown) | yes (existing prod model) | 🟢 OK |
| **Prisma migrations** | `docs/phase5/deployment-checklist.md` (14 refs), `docs/phase6/03` | offline: schema generates; migrations additive + idempotent | 🟡 OK but **not in the canonical `DEPLOYMENT.md`** |
| Recommendation migrations | phase3/4/5 `migration.sql` + checklist | offline-validated (additive, 0 destructive ops — Step 5) | 🟢 OK |
| Recommendation seeding | `reco:seed`, `bundles:seed` (phase5) | offline (`--json` ran); `--apply` needs DB (staging) | 🟢 OK (runbook ready) |
| File backup | `docs/BACKUP_AND_DR.md` (tar of data/orders/…; retention; offsite rsync) | commands present | 🟢 OK |
| **Postgres DB backup (`pg_dump`)** | **NOT in `BACKUP_AND_DR.md` (0 refs)**; provided in `PRODUCTION_DB_HARDENING_PLAN.md` + `STAGING_SETUP_GUIDE.md` | not run | 🔴 **GAP** |
| File restore | `BACKUP_AND_DR.md` | commands present | 🟢 OK |
| **Postgres DB restore (`pg_restore`)** | hardening plan / staging guide | not run | 🟡 add to canonical doc |
| App rollback | `docs/phase6/05` | validated — boots without the new tables (fallbacks) | 🟢 OK |
| DB rollback | phase5 checklist + `docs/phase6/05` (`DROP TABLE` block) | validated by inspection | 🟡 OK but not in `BACKUP_AND_DR.md` |
| Smoke testing | `docs/phase6/04` + `scripts/smoke-test.js` + `DEPLOYMENT.md` "Route Smoke Test" | script built + dry-run-verified | 🟡 not yet run live |

## Findings

1. 🔴 **Postgres DB backup gap (the one that matters).** `BACKUP_AND_DR.md` backs up the **file-based** data
   only. Since Trump is **Postgres-primary** (menu, orders, chef recs, analytics events, bundles all live in
   Postgres), the canonical backup doc does **not** protect the production database. `pg_dump`/`pg_restore`
   commands now exist in `PRODUCTION_DB_HARDENING_PLAN.md §4` and `STAGING_SETUP_GUIDE.md` — they must be
   **adopted as a scheduled prod backup** and a **test restore performed** before launch (blocker).
2. 🟡 **Documentation is complete but fragmented.** The authoritative DB migration/seed/rollback sequence
   lives in `docs/phase5/deployment-checklist.md` + `docs/phase6/*`, not in the older `DEPLOYMENT.md`/
   `BACKUP_AND_DR.md` (which predate the Postgres-primary + recommendation work). Recommend a one-time
   consolidation: add a "Database (Postgres) backup/restore" section to `BACKUP_AND_DR.md` and a "Database
   migrations + seeds" pointer in `DEPLOYMENT.md` referencing the phase5 checklist.
3. 🟡 **Smoke + live verification not yet executed** (no staging DB) — runbooks ready; execute on staging.

## What is sound (no change needed)

- Migrations are additive, idempotent, and reversible (Step 5); app fails soft without the tables.
- Recommendation seeds are idempotent and re-runnable.
- The PM2 deploy/reload/shutdown model is established and unchanged.
- The smoke test (`npm run smoke:test`) and live verifier (`reco:verify:live`) cover the new surfaces.

## Required before launch (deployment-doc actions)

- [ ] **Add Postgres `pg_dump` backup to the production schedule** + **test a `pg_restore`** (closes Finding 1).
- [ ] Take a **`pg_dump` immediately before `migrate deploy`** at cutover (authoritative restore point).
- [ ] (Recommended) Consolidate the fragmented runbook (Finding 2) so one document — the phase5 checklist —
      is the canonical launch runbook, with `DEPLOYMENT.md`/`BACKUP_AND_DR.md` cross-referencing it.
- [ ] Run the **staging rehearsal + `reco:verify:live` + `smoke:test`** (Finding 3).

## Authoritative launch runbook

Use **`docs/phase5/deployment-checklist.md`** (migration/seed/health/rollback sequence + env reference) as
the canonical runbook, plus the Phase 7 guides for staging (`STAGING_SETUP_GUIDE.md`), DB hardening
(`PRODUCTION_DB_HARDENING_PLAN.md`), and the launch checklist (`FIRST_RESTAURANT_LAUNCH_CHECKLIST.md`).
