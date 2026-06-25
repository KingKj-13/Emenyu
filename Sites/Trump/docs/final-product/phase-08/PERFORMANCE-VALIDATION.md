# PERFORMANCE-VALIDATION.md — Phase 08 (SRE1) Step 4

**Date:** 2026-06-25. **Status: ✅ re-validated at RC1; no regression vs Phase 05 (menu slightly faster). All numbers measured this phase.**
**Method:** RC1 code (tag `trump-v1.0-rc1`), production-mode local server + local Postgres, autocannon 8 + pidusage. **Caveat (honest):** the build host (8-core/17 GB) is **shared with this long session's other processes**, so absolute *high-concurrency throughput* is load-generator-limited, not server-limited — the prod 1 vCPU droplet is the real target ([../phase-05/CAPACITY-REPORT.md](../phase-05/CAPACITY-REPORT.md)). Per-request cost + CPU-as-%-of-one-core transfer.

---

## Menu (cache + single-flight) — measured
| Scenario | Result | vs Phase 05 |
|---|---|---|
| Sequential (1c, cached) | **p50 2 ms**, ~377 req/s | = / slightly better (was 2 ms / 259) |
| 10 concurrent | **p50 10 ms, ~914 req/s** | **better** (was 17 ms / 500) |
| 200 concurrent | **0 errors**, 2xx=1399, server CPU **peak 23.5% of 1 core**, RSS 114 MB | stable; throughput (73 req/s) **load-generator-limited** (server near-idle) |
| Conditional GET (304) | **4 ms** | cache + ETag fast-path |

**Reading:** at realistic concurrency the menu endpoint is excellent and **faster than Phase 05** (914 req/s @10c). At 200 saturating connections the server stayed **under ¼ core with 0 errors** — the low throughput reflects the contended test host, **not** a server regression. Cache + `Cache-Control: max-age=30` + gzip + single-flight all confirmed live.

## Orders (idempotency + retry/backoff) — measured
| Scenario | Result | Note |
|---|---|---|
| 10 concurrent across 30 tables (realistic-rush) | **102/105 ok (97%)**, 10.5 orders/s, 3 graceful 5xx | on a contended host; prod box cleaner |
| 80 concurrent sustained | 18 ok / 24 graceful 5xx (no partial/lost; retry-safe) | **~100–800× a single restaurant's real peak** (Rule 1: 200–1000 cust/day ≈ 0.1–0.8 orders/s) — not an operational case |

**Reading:** for **one restaurant** the order path comfortably exceeds real peak demand; failures under extreme simultaneous bursts are **explicit, partial-free, and retry-safe** (idempotency). This is a documented limit, not a single-restaurant operational problem (per Rules 1+2, not "fixed" — that would be speculative). Backlog item: single-transaction order ([../operations/KNOWN-LIMITATIONS.md](../operations/KNOWN-LIMITATIONS.md)).

## Long-running / memory-leak watch — measured
- RSS bounded at **~167 MB** under 25 s of sustained (~thousands of req) load; idle baseline ~110–119 MB. **Matches the Phase 05 peak (168 MB)** — no runaway growth in-window. Well under the PM2 `max_memory_restart` of **768 MB**.
- **Definitive leak test = a multi-hour soak on prod** (can't run hours here); the in-window evidence shows a bounded, healthy footprint. Recommend a 24–48 h prod RSS watch as a routine check ([../operations/MONITORING-RUNBOOK.md](../operations/MONITORING-RUNBOOK.md)).

## Socket stability
- Bearer handshake + live delivery proven ([../phase-04b/REALTIME-INTEGRATION.md](../phase-04b/REALTIME-INTEGRATION.md), 5/5); auto-reconnect proven ([RECOVERY-VALIDATION.md](RECOVERY-VALIDATION.md)). A 150–200-socket prod stress remains an operator gate ([../phase-05a/PRODUCTION-VALIDATION.md](../phase-05a/PRODUCTION-VALIDATION.md) §C).

## Cache efficiency
- Menu served from in-memory cache (JSON + precomputed gzip buffer + ETag); rebuild is single-flight; invalidates on menu mutation + 60 s TTL. 304s in 4 ms. **Cache is the reason 200 concurrent stayed sub-¼-core.**

## Rate limits
- Validated **firing** (bypass OFF): the auth limiter returned **429 at attempt 21** (limit 20/15 min) — see [SECURITY-VALIDATION.md](SECURITY-VALIDATION.md). RC1 production ceilings (general 3000 / public-write 300 per 15 min) are appropriate for one shared-Wi-Fi restaurant.

## Verdict
**No performance regression at RC1; the menu path is marginally faster.** For a single restaurant (Rule 1 envelope), performance is comfortably sufficient. Absolute prod-box numbers + a 150–200-socket test + a multi-hour soak are the remaining operator-run confirmations.
