# Recommendation Performance Review (Phase 5, Task 6)

Two layers: **pure CPU paths** (measured offline, reproducibly, via `npm run reco:bench`)
and **DB-bound latency** (analysed statically here; measured live by `reco:verify:live`).
Only behaviour-preserving optimizations are applied (constraint: no logic rewrites).

## Pure-path micro-benchmark (`npm run reco:bench`)

Node v22, representative run (your hardware will vary; the point is the order of magnitude):

```
  path                                        iters       total ms     per-op ms
  ------------------------------------------------------------------------------
  aggregate(1000 events)                           1         1.18        1.1821
  aggregate(10000 events)                          1         3.85         3.855
  aggregate(50000 events)                          1        13.61       13.6136
  classify (categoryType+beverageKind)         50000        36.17       0.00072
  rotate (3-member group)                       5000        29.87       0.00597
  toPersonaOrder                                5000         4.21       0.00084
  health.analyze (400 recs / 200 items)            1          3.9        3.9048
```

Takeaways:

- **Dashboard aggregation is cheap.** Aggregating a **50 000-event** window in memory
  takes ~14 ms. For a single venue this is comfortably below any interactive threshold,
  which validates the Phase 4 decision to aggregate in JS (identical math on the Postgres
  and JSON paths, fully unit-tested) instead of bespoke SQL.
- **Per-request work is negligible.** Classification ~0.7 µs/op, rotation ~6 µs/call,
  bundle mapping ~0.8 µs — all dwarfed by a single DB round-trip.
- **Health analysis** over 400 recs / 200 items (incl. cycle detection) is ~4 ms — fine
  for a CLI / on-demand admin check.

## DB-bound latency (per request)

| Endpoint | Queries | Notes |
|---|---|---|
| `POST /api/recommend`, `/api/ai-pairing` | 1 menu load + recs + chef recs (2) + orders/history (2) + popular (1) ≈ **7** | Phase 4 removed the duplicate menu load via the `menuContext` passthrough. |
| `GET /api/menu/bundles` (guest) | **1** (`findMany` + `include items`), indexed `(restaurantId, active, priority)` | falls back to a single JSON read when the DB is down. |
| `POST /api/reco/events` | **1** `createMany` (batched), fire-and-forget (`202`, `sendBeacon`) | never blocks the UX. |
| `GET /api/analytics/recommendations` | **1** `findMany` (date-windowed, cap 20 000) + in-memory aggregate (~ms) | indexed `(restaurantId, eventType, createdAt)`. |
| `GET /api/analytics/recommendations/insights` | analytics query + chef recs (2) + admin items (1) + pure health/insights | owner-only, on-demand. |

All new tables are indexed on their query shapes (see the migrations). The bundle query
is a single indexed `findMany`; the analytics read is one indexed, date-bounded scan.

## Optimizations applied this phase (behaviour-preserving)

- **Bundle query is a single indexed read** with a nested `include` (no N+1); ordered by
  the `(restaurantId, active, priority)` index.
- **Bundle JSON fallback** avoids any DB hit when Postgres is unavailable (one file read),
  and the client keeps a built-in constant so the strip never blocks on the network.
- **Client**: `RecommendedOrders` paints from the constant immediately, then swaps in live
  bundles when the API resolves (no layout shift, no blocking fetch); bundle impressions
  reuse the Phase 4 dedupe/batch/`sendBeacon` pipeline.
- (Carried from Phase 4) `recommend()` `menuContext` passthrough — still in place.

## Deliberately NOT changed (to preserve behaviour / avoid risk)

- **No SQL `GROUP BY` aggregation.** In-memory aggregation is fast at this scale and keeps
  one tested code path. Revisit only if a venue exceeds the 20 000-row window meaningfully.
- **No caching of `recommend()` support data** (orders/recs/popular) — a TTL cache would
  change when new data appears (a behaviour change). Documented as a future option.
- **No rotation of which bundles show.** The guest strip still shows all active bundles
  ordered by priority (existing behaviour); `rotationGroup` is stored for reporting and
  future use.

## How to measure live latency

```bash
npm run reco:verify:live -- --confirm   # exercises ingest/aggregate/dashboard/bundle/chef/rotation against a dev DB
```

For production latency, read the request logger timings (`server/middleware/requestLogger.js`)
or put the endpoints behind your APM. The pure-path budget above shows the CPU portion is
single-digit milliseconds; the rest is DB round-trip time.
