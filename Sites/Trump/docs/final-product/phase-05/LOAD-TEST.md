# LOAD-TEST.md — Phase 05 Step 3

**Date:** 2026-06-25. **Status: ✅ executed locally (with the load-test bypass) against the production-mode server.**
**Method:** autocannon 8.0.0 + pidusage CPU/RSS sampling of the server PID. CPU is reported as **% of one core** (the app is a single fork process — directly comparable to a 1 vCPU droplet). Host: 8-core i7 / 17 GB. `TRUMP_LOAD_TEST_BYPASS=1` so the per-IP limiter didn't mask compute.

> **Scope honesty:** these measure the **application's** behaviour and per-request cost on the test host. They are an **upper bound** on the 1 vCPU / 1 GB prod droplet. A 200-connection test was **not** run against production (shared droplet hosting other live restaurants — see CAPACITY-REPORT for the prod off-hours gate).

---

## A. 200 concurrent menu viewers (target: 200) — ✅ PASS
`GET /api/menu`, gzip, cached + single-flight:

| c | requests | req/s | p50 | p99 | 2xx | errors | CPU peak | RSS peak |
|---|---|---|---|---|---|---|---|---|
| 1 | — | 259 | 2 ms | — | 100% | 0 | — | — |
| 10 | 5,000 / 10 s | **500** | 17 ms | 101 ms | 100% | 0 | — | — |
| 200 | 5,151 / 20 s | **257** | 741 ms¹ | 1,276 ms | 100% | 0 | **54.7%** | 168 MB |

¹ 200 *saturating* connections → latency ≈ concurrency ÷ throughput (Little's law). Real menu viewers load once and read for minutes; 200 viewers generate a few req/s, not 200 continuous. CPU stayed **under one core** at 200 connections with **0 errors** → 200 concurrent viewers is comfortably supported.

**Before the Phase 05 cache:** the same endpoint did ~12 req/s at 10 concurrent (p50 802 ms) and **collapsed** at 200 (without single-flight: 4.7 req/s, p50 11.9 s, CPU 353%). See PERFORMANCE-AUDIT.

## B. 60–80 concurrent orders (target: 60–80) — ⚠️ PARTIAL (pool-bound under simultaneous burst)
`POST /Trump/submit_order` (valid orders, spread across 30 tables):

| c | requests | req/s | p50 | 2xx | 5xx | server error |
|---|---|---|---|---|---|---|
| 10 | 255 / 12 s | 21.3 | 455 ms | 250 | **5** | pool acquire timeout |
| 70 (1 table) | 6 / 8 s | 0.8 | 5,145 ms | 0 | 6 | pool acquire timeout |
| 70 (30 tables) | 91 / 12 s | 7.6 | 5,013 ms | **58** | **33** | pool acquire timeout |
| 70 (30 tables, `connection_limit=30`) | 16 / 12 s | 1.3 | 2,830 ms | 2 | 14 | still pool-bound |

**Measured root cause:** `order_postgres_cart_save_failed: "Transaction API error: Unable to start a transaction in the given time."` (the 5 s p50 = Prisma's default transaction-acquire timeout). Each order runs **two** interactive transactions (`saveOrder` + `replaceTableCart`); 70 simultaneous orders = up to 140 acquisitions against the default pool (~17 on this host) → timeouts. Raising `connection_limit` to 30 did **not** fix it → the constraint is the **2-transactions-per-order design + same-table cart contention**, not pool size alone.

**Realistic-rate check:** 1,000 customers/day ≈ **0.03–0.1 order submits/s** sustained; even a rush of all 30 tables ordering within a minute ≈ **0.5/s**. The measured path sustains **~21 accepted orders/s** at 10 concurrent — **~40–200× the real peak**. So normal and rush service are fine; only an artificial *simultaneous* 70-order burst degrades, and it degrades **gracefully** (explicit 500 + ret-able; ORDER-INTEGRITY proves no partial/lost orders).

**Recommendations (evidence-based):**
1. Wrap the order write in a **retry-with-backoff** on the transient "unable to start a transaction" error (turns burst 500s into slightly-slower 200s).
2. Collapse the two transactions into **one** (save order + clear cart in a single `$transaction`) to halve pool pressure per order.
3. Tune `connection_limit` to the prod Postgres `max_connections` budget (shared droplet) — modest, not large.

## C. Resource utilisation (sampled)
| Test | CPU avg / peak (1 core) | RSS avg / peak |
|---|---|---|
| Menu 200c | 5.5% / 54.7% | 147 / 168 MB |
| Orders 70c | 11.8% / 100.1% | 114 / 122 MB |
| Orders 10c | 6.9% / 70.3% | 105 / 110 MB |

RSS stayed **105–168 MB** under all loads (well under the PM2 `max_memory_restart` of 768 MB). The app never exceeded ~1 core of CPU (single fork process). **Memory is not a constraint; single-core CPU and the order-transaction path are.**

## D. Socket.IO under load
Socket auth + live delivery validated in REALTIME (Phase 04B, 5/5) and reconnect in FAILURE-RECOVERY. Socket fan-out was not separately load-tested at 200 sockets in this phase — flagged in CAPACITY-REPORT as a prod-gate item.

## Summary
- **200 concurrent menu viewers: validated** (0 errors, sub-core CPU) — after the Phase 05 cache.
- **60–80 concurrent orders: supported at realistic rates; degrades gracefully under an artificial simultaneous burst** — pool/transaction-bound, recommendations above.
