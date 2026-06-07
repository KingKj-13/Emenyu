# Step 5 — Rollback Validation Report

**Validated by migration inspection + code analysis** (execution against a DB is deferred — document-only).
Date: 2026-06-07.

## Migration safety (the three recommendation migrations)

| Migration | Additive stmts | Idempotent guards | Destructive ops on existing tables |
|---|--:|--:|--:|
| `…phase3_menu_item_recommendation` | 5 | 7 | **0** |
| `…phase4_recommendation_event` | 5 | 6 | **0** |
| `…phase5_recommendation_bundle` | 6 | 7 | **0** |

All three are **purely additive**: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and guarded
`ADD CONSTRAINT` (`DO $$ … EXCEPTION WHEN duplicate_object`) — **on their own new tables only**. There are
**no** `DROP`/`ALTER COLUMN`/`UPDATE`/`DELETE` against existing/core tables (`MenuItem`, `Order`, `Guest`,
`Account`, …). They are safe to **re-run** and safe to **leave applied** after an application rollback.

## Application boots WITHOUT the new tables (key rollback property)

Verified by code: the server does **not** auto-migrate on boot and **does not hard-require** the new tables.
Every consumer degrades gracefully if a table is missing or the DB is down:

| Feature | Fallback when table/DB absent | Evidence |
|---|---|---|
| Chef recommendations | returns `[]` → engine uses algorithmic recs | `prismaMenuService` — 21 `withPrisma` wrappers (try/catch → fallback) |
| Analytics events | writes to `data/recommendation-events.json` ring buffer; reads from it | `recommendationEventService` JSON fallback |
| Bundles | reads `data/recommendation-bundles.json`, else returns `[]` → client uses built-in constant | `recommendationBundleService` + `RecommendedOrders` (2× `RECOMMENDED_ORDERS` fallback) |
| Recommendations overall | chef-first → algorithmic fallback | `aiService.recommend()` |

⇒ **If a migration fails to apply, or is rolled back, the server still starts and serves** (recommendation
*content* degrades to algorithmic/fallback; no crash, no 500 storms).

## Rollback procedures (per Phase 5 checklist, re-validated)

1. **Application rollback (preferred, no DB change):** redeploy the previous build / `git checkout master`
   / `pm2 reload`. The new tables simply become unused. **No schema rollback required.**
2. **Disable-in-place (no rollback):** set chef recs / bundles inactive in Admin → engine falls back to
   algorithmic; bundle strip falls back to the built-in constant.
3. **Database rollback (only if explicitly required):**
   ```sql
   DROP TABLE IF EXISTS "RecommendationBundleItem";
   DROP TABLE IF EXISTS "RecommendationBundle";
   DROP TABLE IF EXISTS "RecommendationEvent";
   DROP TABLE IF EXISTS "MenuItemRecommendation";
   ```
   Removes only recommendation/analytics data; orders, menu, accounts and all core data are untouched.
4. **Backup restore (worst case):** restore the pre-migration snapshot (see `docs/BACKUP_AND_DR.md`).
   **A snapshot must be taken before `migrate deploy`** — this is the authoritative restore point.

## Irreversible operations

| Operation | Reversible? | Notes |
|---|---|---|
| `migrate deploy` (the 3 reco migrations) | ✅ Yes | additive; undo via the `DROP TABLE` block above |
| `reco:seed --apply` / `bundles:seed --apply` | ✅ Yes | idempotent; re-runnable; rows are `createdBy='seed'` |
| Dropping the new tables | ⚠️ Loses **that** data only | chef recs + bundles are **re-seedable**; **analytics event history is not recreatable** (telemetry only — acceptable loss on rollback) |
| Any change to existing/core data | **N/A** | the migrations make none |

**Only genuinely non-recreatable item on a full table-drop:** accumulated `RecommendationEvent` rows
(historical analytics). This is telemetry, not transactional data, so its loss is an acceptable rollback
cost. There are **no irreversible operations on orders, menu, accounts, or any pre-existing data.**

## Status

✅ **Rollback path validated** by inspection: additive/idempotent migrations, graceful no-table startup,
documented DROP + backup-restore procedures, and no irreversible core-data operations. ⏳ A live drill
(apply → drop → confirm boot) should be performed on **staging** as part of the deferred DB rehearsal.
