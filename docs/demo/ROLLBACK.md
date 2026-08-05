# ROLLBACK — Michael Martin Demo Seed (`demo_20260804`)

## Primary path — `trump-preview` tenant (recommended, option B)

The preview tenant IS the batch — every row under `restaurantId='trump-preview'` is seed data, nothing else. Rollback is a full tenant wipe.

```
node Sites/Trump/scripts/rollback-demo-preview.js                  # dry run — shows what would be removed, writes backup
node Sites/Trump/scripts/rollback-demo-preview.js --apply           # backs up, then deletes
```

**Backup path:** `Sites/Trump/backups/rollback_demo_20260804_<timestamp>/` — `orders.json`, `tables.json`, `recommendation-events.json`, `manifest.json`, written **before** any delete, every run (including dry runs).

**Verification query (run automatically at the end of `--apply`, and re-runnable any time):**
```js
await prisma.order.count({ where: { restaurantId: 'trump-preview' } })   // must be 0 after rollback
await prisma.order.count({ where: { restaurantId: 'trump' } })            // must be UNCHANGED from before the seed — proves the live tenant was never touched
```

## Fallback path — tagged rows inside `trump` (only if the preview-flag deploy missed the 20:00 SAST abort condition)

```
node Sites/Trump/scripts/rollback-demo-preview.js --target=trump --tag=demo_20260804              # dry run
node Sites/Trump/scripts/rollback-demo-preview.js --target=trump --tag=demo_20260804 --apply       # backs up, then deletes
```

Matches rows via: `Order.filename` prefix `demo_20260804_`, `Table.tableId` prefix `pv` (the demo's own table-naming convention, never used by real Trump tables), `RecommendationEvent.sessionId` prefix `demo_20260804:`. Real `trump` data — the 43 pre-existing orders being cleaned up separately, table1–table29, any future real guest orders — carries none of these markers and is untouched.

**Verification query:**
```js
await prisma.order.count({ where: { restaurantId: 'trump', filename: { startsWith: 'demo_20260804_' } } })   // must be 0 after rollback
await prisma.order.count({ where: { restaurantId: 'trump' } })                                                 // compare against the pre-seed baseline count
```

## Live-tenant dev/test cleanup (separate batch, not this seed)

The 43 pre-existing dev/test orders, 13 junk tables, and 1,416 real `RecommendationEvent` rows found in `trump` during Phase 1 are **not part of `demo_20260804`** and have their own backup (`Sites/Trump/backups/demo_cleanup_<timestamp>/`, written by `scripts/_tmp_cleanup_live_trump.js` — dry-run only so far, blocked on DB access, see conversation). Do not confuse the two batches when restoring.

## Status as of this writing

**Not yet tested against a live database — DB access has been unavailable for this entire session.** Per your instruction, this rollback script must be tested on a copy before it's trusted as "the" rollback. That test, plus the actual `--apply` write of the seed itself, is the first thing to run the moment SSH access lands.
