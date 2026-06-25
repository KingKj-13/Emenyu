# DATABASE-PERFORMANCE.md — Phase 05 Step 5

**Date:** 2026-06-25. **Status: ✅ certified; the DB is not a read bottleneck. One write-path tuning recommendation.**
**Method:** Prisma raw queries + `EXPLAIN (ANALYZE)` against local Postgres **18.4** (`scratchpad/db-stats.js`).

---

## Engine / config (measured)
| Setting | Value |
|---|---|
| PostgreSQL | **18.4** |
| `max_connections` | **100** |
| `shared_buffers` | 128 MB (default) |
| Prisma pool size | default = `num_cpus*2+1` (no `connection_limit` set) |
| Transaction-acquire timeout | Prisma default **5 s** (observed in LOAD-TEST as the order-burst failure mode) |

## Table sizes & growth (measured)
Whole database < ~4 MB today. Largest tables (incl. indexes), excluding load-test rows:
| Table | Rows | Size |
|---|---|---|
| Order | ~37 | 752 kB |
| MenuItem | 851 (439 trump + others) | 752 kB |
| OrderItem | — | 408 kB |
| OrderStatusHistory | — | 240 kB |
| MenuCategory | 174 | 184 kB |

**Per-order footprint (measured):** ~1.4 kB/order (`Order` + `OrderItem` + `OrderStatusHistory`).
**Growth estimate (evidence-based):** 1,000 orders/day → **~0.5 GB/year** for order data. Negligible for the droplet's disk **provided disk monitoring is active** (it is — Phase 02B `trump-monitor.sh`). Menu/reference tables are effectively static.

## Index audit (measured)
Well-indexed: Order **8**, MenuItem **7**, MenuCategory **6**, WaiterAssignment **5**, AuditLog **5**, RecommendationEvent **5**, Notification **4**, Device **4**. No missing index surfaced on any hot path.

## Hot-path query plans (`EXPLAIN ANALYZE`, measured)
| Query | Plan | Exec time |
|---|---|---|
| Menu categories (`restaurantId='trump'`) | Seq Scan (174 rows) + quicksort | **0.65 ms** |
| Menu items (the `include`) | Seq Scan (851→439 rows) | **0.96 ms** |
| Active table ownership (table+status+order+limit) | Sort+Limit | **0.10 ms** |
| Notification unread count | aggregate | < 1 ms |

**Seq scans on `MenuCategory`/`MenuItem` are optimal** at this size (tiny tables; an index would be ignored). All buffers were `shared hit` (cached). **No slow query exists** — the earlier "menu is slow" symptom was Prisma **client-side deserialization** (~285 ms for 439 items), not Postgres (sub-millisecond) — addressed by caching (PERFORMANCE-AUDIT), not by DB changes.

## Lock contention (measured)
The only contention observed was on the **order write path**: concurrent orders to the **same table** serialize on that table's `ActiveCartState`/cart transaction, and the **2 interactive transactions per order** exhaust the Prisma pool under simultaneous bursts (`"Unable to start a transaction in the given time"`, LOAD-TEST §B). This is a **pool/transaction-design** limit, not a query or index problem.

## Migration timing (measured)
The Phase 04B migration (`ALTER TABLE "Device" ADD COLUMN … DEFAULT ''` ×2) applied **instantly** on the current data (small tables). All 19 migrations replay deterministically. At the projected data sizes, `ADD COLUMN … DEFAULT` is fast (Postgres 11+ doesn't rewrite the table for a constant default).

## Recommendations (evidence-based)
1. **Order write path** (the only DB-adjacent constraint): add **transaction retry/backoff** on the transient acquire-timeout, and collapse order-save + cart-clear into **one** `$transaction` (halves pool pressure). Set a **modest `connection_limit`** in the prod `DATABASE_URL` matched to the shared droplet's `max_connections` budget (e.g. 15–20; the box hosts other DBs — do **not** over-allocate).
2. **Keep disk monitoring** — order growth is the main grower (~0.5 GB/yr); current monitor covers it.
3. No new indexes required at current/near-term scale. Re-evaluate a `restaurantId` partial index on `MenuItem`/`Order` only if the multi-tenant row counts grow by ~50×.

## Verdict
**Database certified.** Reads are sub-millisecond and well-indexed; storage growth is trivial; migrations are fast. The sole DB-adjacent limit is **order-write transaction concurrency under artificial burst**, addressed by the write-path recommendations above (not by schema/index changes).
