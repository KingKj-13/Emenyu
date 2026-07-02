# AUDIT-PERFORMANCE.md — Phase 00 Performance Audit

**Scope:** runtime topology, Socket.IO, DB access, caching, memory/CPU. **Date:** 2026-06-24.

**Target load:** 1,000 customers/day · 100 concurrent customers · 25 concurrent orders · multiple waiters/managers (single venue).

---

## 1. Summary

For a **single venue** at the stated load, the current architecture is **adequate** — Node + Postgres + a warmed in-memory recommendation cache will comfortably handle ~100 concurrent customers and 25 in-flight orders on one process. The constraint is **architectural, not throughput**: the app **cannot scale horizontally** as written, because critical state (Socket.IO rooms/table memory, rate-limiter counters, recommendation cache) is **in-process**. Running 2+ PM2 instances would split rooms and break real-time sync. The single instance is also a **single point of failure** and bounded by one CPU core.

**Verdict: meets the single-venue target; not yet horizontally scalable. No multi-instance until a Redis adapter + shared rate store are added.**

---

## 2. Runtime topology

- **PM2 `fork` mode, `instances: 1`** (`ecosystem.config.js`) — one Node process, one core. Not `cluster`.
- `max_memory_restart: 768M` in ecosystem (note: `.env.example` says `PM2_MAX_MEMORY_RESTART=512M` — **mismatch**; ecosystem hardcodes 768M default).
- `autorestart`, `exp_backoff_restart_delay`, `max_restarts: 10`, `min_uptime: 10s`, graceful shutdown (`kill_timeout`, SIGTERM handlers closing sockets + DB).
- Node engine `>=18.18`; local dev observed on Node v22.

---

## 3. Socket.IO (real-time)

- Single `socketService` instance; **rooms and `tableMemory` cart cache are in-process JS objects** (`getTableRoom`, `this.tableMemory[...]`).
- **No Redis/socket.io adapter** → **cannot run multiple instances**: a guest on instance A and waiter on instance B would not share a room. This is the primary horizontal-scaling blocker.
- Handshake does a DB-backed cookie validation per connection (cheap, cached by Postgres).
- A `setInterval` (every 60s) recomputes the deal-active snapshot and emits updates — in-process timer (won't duplicate at 1 instance; would multi-fire at N instances).
- 100 concurrent WS connections is trivial for one Socket.IO process. Memory per connection is small; `tableMemory` grows with active tables (≤ table count, ~30) — negligible.

---

## 4. Database access

- **Single `PrismaClient`** (default connection pool). For one instance this is fine; verify the Postgres `connection_limit` vs. concurrency (Prisma default pool ≈ `num_cpus*2+1`). 25 concurrent orders × short transactions is well within range.
- Schema is **well-indexed** for the hot queries (orders by status/timestamp/table, menu by category, waiter tasks) — see AUDIT-DATABASE §4. No N+1 patterns surfaced in the order/menu services (Prisma `include` used).
- **Analytics endpoints** aggregate in-memory over a date window (per the `RecommendationEvent` model comment) — fine for one venue's volume, but **will not scale** to large date ranges / high event volume (full-table scan + JS aggregation). Acceptable now; revisit if event volume grows.
- **Dual persistence I/O:** writes also touch JSON files (`orders/`, `tables/`) via `fileService` — extra disk I/O per mutation. At 25 concurrent orders this is minor but is duplicated work (see AUDIT-BACKEND §6).

---

## 5. Caching

- **Recommendation caches** are warmed off the request path at startup (`aiService.warmCaches()`) and invalidated on data-change events (`socketService.onDataChange → aiService.invalidateCaches`). Good: the first guest request is not a cold recompute.
- Project memory records a prior fix: reco was 5–10s due to **uncached per-request menu loads + an O(439) fuzzy popularity loop**; resolved with an SWR cache + memoization + warm. Confirm these remain in place under load (the `aiService` is the hot path for `/api/recommend`, `/api/ai-pairing`, `/api/chat`).
- Static assets cached 7d in prod (`staticAssets.cacheSeconds`) + nginx `expires 7d`. SPA `index.html` and `sw.js` are `no-store`/`no-cache` (correct).
- HTTP compression (gzip) at both Express (`compression`) and nginx.

---

## 6. Memory / CPU risks

- **Single core** = CPU-bound work (recommendation scoring, NLG, analytics aggregation) blocks the event loop. The heavy reco loops are cached, but a burst of cache-miss `/api/recommend` calls (e.g., right after a menu edit invalidates caches during a rush) could spike latency. Mitigated by warm-on-invalidate, but worth load-testing.
- **In-memory rate limiter** (express-rate-limit default `MemoryStore`) — counters reset on restart and are per-instance; fine at 1 instance, breaks fairness at N.
- **Memory growth:** `chat_logs.json` and JSON order files grow unbounded on disk; `tableMemory` is bounded. `max_memory_restart` provides a safety net.
- No memory leak indicators found in the wiring; timers are `unref`'d where appropriate in shutdown.

---

## 7. Can it support the target?

| Target | Verdict | Notes |
|---|---|---|
| 1,000 customers/day | ✅ Yes | ~trivial aggregate throughput |
| 100 concurrent customers | ✅ Yes (1 instance) | WS + cached reco handle this |
| 25 concurrent orders | ✅ Yes | short Prisma txns, well-indexed |
| Multiple waiters/managers | ✅ Yes | socket rooms in-process |
| **Horizontal scale (2+ instances)** | ❌ No | in-process socket/rate/cache state |
| **HA / no single point of failure** | ❌ No | single PM2 fork instance |

---

## 8. Bottlenecks (ranked)

1. **In-process Socket.IO state** → no multi-instance. (Add `@socket.io/redis-adapter`.)
2. **Single PM2 instance** → one core, SPOF. (Move to cluster *after* shared state.)
3. **In-memory rate-limit store** → per-instance only. (Move to Redis store.)
4. **Analytics in-memory aggregation** → won't scale with event volume. (Push aggregation into SQL.)
5. **Dual JSON+Postgres writes** → redundant I/O. (Demote JSON path.)
6. **CPU-bound reco on cache miss** → event-loop latency spikes during invalidation. (Keep warm; load-test.)

---

## 9. Recommendations

- **For launch (single venue):** ship as-is on one instance; it meets the target. Add **load testing** (k6/autocannon) for `/api/recommend`, `/api/menu`, `submit_order`, and 100 concurrent WS to validate latency under cache-miss bursts.
- **Before scaling / second venue:** add the **Redis socket.io adapter + Redis rate-limit store + Redis cache**, then enable PM2 cluster (2+ instances). Move analytics aggregation into SQL.
- Reconcile the **768M vs 512M** memory-restart discrepancy.
- Add basic runtime metrics (event-loop lag, p95 latency) — none today.
