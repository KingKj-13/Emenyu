# PERFORMANCE-AUDIT.md — Phase 05 Step 1 (Menu Performance)

**Date:** 2026-06-25. **Status: ✅ profiled → bottleneck found → optimized → re-measured.**
**Method:** production-mode local server (NODE_ENV=production) + local Postgres (PG 18.4, dataset: 87 categories / 439 items). Tools: autocannon 8.0.0, Prisma query-event logging, curl. Host: 8-core i7-1165G7 / 17 GB (≫ the 1 vCPU / 1 GB prod droplet — absolute throughput is an upper bound; per-request cost + ratios transfer).

> Every number below was taken during this phase. No estimates.

---

## 1. Baseline profile of `GET /api/menu` (BEFORE)
| Metric | Measured |
|---|---|
| Prisma SQL statements / request | **2** (categories + items — `findMany` with `include`; **not N+1**) |
| Pure SQL time | 5 ms + 40 ms ≈ **45–62 ms** |
| Prisma client data-load (deserialize 439 items) | **~285 ms** wall (min 229 / max 593) |
| Payload | **~50 KB raw / 22.7 KB gzip** |
| Compression | gzip **on** (`Content-Encoding: gzip`, `Vary: Accept-Encoding`) |
| Cache headers | ETag present; **`Cache-Control` ABSENT** |
| Recommendation/AI work in path | **none** (separate endpoints) |
| Server-side image/video work | **none** (static assets served separately) |
| HTTP latency p50 — sequential | **148 ms** |
| HTTP latency p50 — 10 concurrent | **802 ms** |
| Throughput — 10 concurrent | **~12 req/s** |
| Conditional GET (If-None-Match) | returns 304 but **still ~161 ms** (ETag computed from a freshly re-run `loadMenu` → saves bytes, **not CPU**) |

**Root cause:** no caching. Every request re-ran `loadMenu` (Prisma load + deserialization of ~440 items, ~150 ms warm of single-core CPU). The endpoint was **CPU/event-loop bound, not DB bound** (SQL is 45 ms; the cost is JS deserialization). At 10 concurrent it serialized to ~800 ms / ~12 req/s. **This would not support 200 concurrent menu viewers.**

## 2. Optimization (measurement-justified)
Two changes, both additive and invalidation-safe:
1. **Menu response cache** (`menuController.js`): cache the serialized JSON + a **precomputed gzip buffer** + ETag; serve directly; add `Cache-Control: public, max-age=30`. Invalidated immediately on any menu mutation (all 7 paths already emit `emitMenuUpdated → onDataChange('menu')`), with a 60 s TTL backstop.
2. **Single-flight rebuild** (same file): a cold cache under N concurrent requests rebuilds **at most once** (the other N−1 await the same promise) — prevents a cache stampede.
3. **Source-level memo** (`fileService.loadMenu`): short-TTL + single-flight memo so the **order validator** (which calls `loadMenu` per order) doesn't re-load the menu on every request (see ORDER-INTEGRITY / LOAD-TEST).

## 3. Re-measured (AFTER) — same machine, same endpoint
| Scenario | Before | After | Gain |
|---|---|---|---|
| Sequential p50 | 148 ms | **2 ms** | ~74× |
| 10-conn p50 | 802 ms | **17 ms** | ~47× |
| 10-conn throughput | ~12 req/s | **~500 req/s** | ~42× |
| 200-conn (cold, single-flight) | collapsed¹ | **257 req/s, 0 errors, p50 741 ms², CPU peak 54.7% of 1 core** | stable |
| Cache headers | ETag only | **ETag + `Cache-Control: public, max-age=30` + gzip buffer** | browser/CDN cacheable |

¹ Without single-flight, 200 concurrent on a cold cache stampeded `loadMenu`: **4.7 req/s, p50 11.9 s, CPU 353%** — fixed by single-flight.
² At 200 *saturating* connections, latency ≈ concurrency ÷ throughput (Little's law); CPU stayed **under one core**, so the server had headroom — the load generator shares the host.

## 4. Findings & recommendations
- ✅ **No N+1** — `loadMenu` is one `include` query (2 SQL).
- ✅ **Optimized:** menu serving dropped from ~150 ms CPU/req to sub-ms; the endpoint is no longer a bottleneck.
- ⚠️ **Cache-Control was missing** → added `max-age=30` so browsers/CDN can serve repeat menu views without hitting the origin.
- ➡️ Optional further win: a CDN in front of `GET /api/menu` (now that it's cacheable) would offload repeat views entirely — see MEDIA-BANDWIDTH.

All changes are in `menuController.js` + `fileService.js`; behaviour is unchanged (same JSON), only faster.
