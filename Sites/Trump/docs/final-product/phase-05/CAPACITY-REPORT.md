# CAPACITY-REPORT.md — Phase 05 Step 8

**Date:** 2026-06-25. **Status: ✅ evidence-based capacity statement + first-limiting-resource identified.**

> Every figure traces to a measurement in this phase. **Scope:** load/profiling ran on the test host (8-core i7 / 17 GB) against the production-mode app + local Postgres. Production is a **documented** (prior-phase audits) **shared 1 vCPU / 1 GB DigitalOcean droplet** — **not re-measured this session** (remote-shell to prod was not authorized). Absolute prod throughput requires the off-hours prod load test named as the final gate. The app is a **single fork process (1 core for JS)**, so test-host CPU-as-%-of-one-core transfers directly to a 1 vCPU droplet; absolute req/s does not.

---

## What was measured (the transferable facts)
| Fact | Measured value |
|---|---|
| Menu endpoint, cached, per request | **~2 ms / sub-ms CPU** (was ~150 ms before Phase 05) |
| Menu @ 200 concurrent | 257 req/s, **0 errors**, **< 1 core CPU**, 168 MB RSS |
| Order accepted-throughput @ realistic concurrency | **~21 orders/s** (10 concurrent) |
| Order path failure mode under simultaneous burst | Prisma pool acquire-timeout (graceful 500s) |
| Per-order DB footprint | ~1.4 kB → **~0.5 GB/year** at 1,000 orders/day |
| RSS under all loads | **105–168 MB** (PM2 limit 768 MB; box 1 GB) |
| Hot DB queries | **sub-millisecond** |
| Video footprint | **1.5 GB, 51 MB avg** per file |

## Capacity statement (evidence-based)
For the **~1,000 customers/day** target, the *required* sustained load is small: menu views are bursty but now **cached** (sub-ms CPU, browser/CDN-cacheable), and order submits are **~0.03–0.1/s sustained** (≤ ~0.5/s in a rush). The measured per-request costs sit **well within a 1 vCPU / 1 GB budget** for this target. Specifically, on the **test host**:

- **Menu viewers:** ✅ **200 concurrent validated** (0 errors, < 1 core). Because the menu is cached + CDN-cacheable, concurrent *viewers* are effectively bounded by bandwidth, not compute.
- **Concurrent orders:** ✅ realistic rates (tens of orders/min) supported with good latency; ⚠️ an artificial **70 simultaneous** burst degrades to graceful 500s (pool-bound) — far above any real per-restaurant rate.
- **Daily customers:** ✅ 1,000/day is comfortably within the measured compute envelope.

**Honest caveat:** these certify the **application's efficiency** and that 1,000/day is not compute-bound. The exact "req/s the 1 vCPU droplet sustains" must come from the **off-hours prod load test** (below) — it was not run against the shared production box.

## First limiting resource — ranked (measured)
1. **Rate limiter (shared-IP)** — **the first real-world ceiling.** 600 req & 60 orders / 15 min **per IP**; a whole restaurant on one Wi-Fi NAT shares one bucket (proven: 100% 429 from one IP at load). Hits *before* CPU/DB/bandwidth. **Must fix** (per-table keying or raised limits — RATE-LIMIT-REVIEW).
2. **Bandwidth — video** — 1.5 GB of 51 MB-avg videos served from the droplet; ~99% of egress. The scaling ceiling once customer volume grows. **Offload to Spaces+CDN** (MEDIA-BANDWIDTH).
3. **Order-write transaction concurrency** — 2 interactive transactions/order exhaust the pool under simultaneous bursts. Realistic rates fine; add retry + single-transaction (LOAD-TEST / DATABASE-PERFORMANCE).
4. **Single-core CPU** — one fork process = 1 core. Menu is cached (cheap); the per-request CPU of dynamic endpoints is the ceiling on a 1 vCPU droplet. Headroom is large after the menu cache.
5. **Memory / Disk / DB reads** — **not constraints**: RSS 105–168 MB (of 768 MB / 1 GB); ~0.5 GB/yr disk growth (monitored); sub-ms queries.

**The binding constraint is configuration + bandwidth (rate limiter, then video egress), not raw compute.**

## Recommended actions before scaling beyond ~1,000/day
1. Fix the **rate limiter** for shared Wi-Fi (per-table key or raised ceilings) — **#1 priority** (RATE-LIMIT-REVIEW).
2. Move **media (esp. video) to Spaces + CDN** (MEDIA-BANDWIDTH) — removes the bandwidth ceiling and offloads the droplet.
3. Order write: **retry/backoff + single transaction**; modest `connection_limit` (DATABASE-PERFORMANCE).
4. Add **order idempotency** (`clientOrderId`) — robustness (ORDER-INTEGRITY).
5. **Run the off-hours prod load test** to convert these test-host numbers into certified prod numbers, and load-test **Socket.IO at 150–200 sockets** (not separately stressed this phase).

## Final certification gate (the one thing not done here)
A controlled **off-hours load test against the production droplet** (using `TRUMP_LOAD_TEST_BYPASS` on a maintenance window, or per-table keying) — to measure real req/s, CPU, RAM, and Socket.IO behaviour on the 1 vCPU / 1 GB box. Until then, capacity is certified **at the application level** (efficient, 1,000/day not compute-bound) with prod absolute numbers pending that test.
