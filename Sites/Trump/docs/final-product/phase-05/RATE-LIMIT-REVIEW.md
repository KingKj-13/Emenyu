# RATE-LIMIT-REVIEW.md — Phase 05 Step 2

**Date:** 2026-06-25. **Status: ✅ audited + measured; removable load-test bypass added (default OFF); production limits recommended from measured behaviour.**

---

## Configuration (measured from `security.js` + `helpers.js`)
`express-rate-limit` v7, four limiters. Production values:

| Limiter | Scope | Limit | Window | Notes |
|---|---|---|---|---|
| **General** | all requests / IP | **600** | 15 min | skips GET static assets + `/healthz`/`/readyz` |
| **Auth** | `/api/auth/login` / IP | 20 | 15 min | `skipSuccessfulRequests` |
| **Public-write** | order/rating/reservation **POST** / IP | **60** | 15 min | the order submit limit |
| **Chat** | chat + reco-events POST / IP | 120 | 15 min | chattier endpoint |

- **`trust proxy`** = `1` in production (`app.set('trust proxy', 1)`) → `req.ip` is taken from the **first** `X-Forwarded-For` hop. Correct for a single fronting nginx: the limiter keys on the **real client IP**, not nginx's loopback.
- Keying: default `express-rate-limit` key = `req.ip`. No session/table/cookie keying.

## The shared-IP problem — MEASURED
A restaurant's customers behind **one NAT/Wi-Fi IP all share one bucket.**
- **Direct proof:** a 200-connection load test from a single client IP returned **6308/6308 = 100% HTTP 429** (general limiter) before the bypass was added. One IP = one bucket, exactly the restaurant-Wi-Fi case.
- **General limit math:** 600 req / 15 min = **40 req/min for the entire restaurant**. A single customer's session (menu + recommendations + cart sync + chat) is easily 10–20 requests, so the shared bucket supports only ~2–4 *new* customers per minute before throttling.
- **Order limit math:** public-write 60 / 15 min = **4 order submissions/min for the entire restaurant**. A dinner rush where many tables submit within a few minutes **will** hit this.

**Conclusion: on shared restaurant Wi-Fi the rate limiter — not CPU, DB, or bandwidth — is the FIRST resource a busy restaurant exhausts.** (Customers on cellular have distinct IPs and are unaffected; QR-on-Wi-Fi ordering is the at-risk path.)

## Removable load-test bypass (Step 2 requirement) — implemented
- Env flag **`TRUMP_LOAD_TEST_BYPASS`**, **default `false`**. When set, every limiter's `skip()` returns true.
- A **loud startup warning** is logged (`rate_limit_bypass_active`) whenever it is on.
- Production safety: it is off unless explicitly set; it does **not** weaken production (prod env never sets it). It exists solely to run controlled capacity tests from one IP. **Remove or leave-unset for production.**
- Code: `helpers.js` (`security.loadTestBypass`) + `security.js` (warn + `skip` OR-clauses).

## Recommended production limits (evidence-based)
The current per-IP model is correct for abuse protection but mis-fits shared Wi-Fi. Recommendations, in priority order:

1. **Key the limiter by something finer than IP for the customer surface.** Add a `keyGenerator` that prefers a per-table/session identifier (e.g. the `tableId` from the path/body or a per-device cookie) for menu/recommend/chat/order, falling back to IP. This converts "one bucket per restaurant" into "one bucket per table" — the natural unit. *(Design change; measure before/after.)*
2. **Until (1): raise the shared-IP ceilings to restaurant-realistic levels.** Based on the math above and the ~1,000 customers/day target (≈ peak 3–4 customers/min → ~60–80 customer-requests/min on Wi-Fi):
   - General: **600 → 3,000 / 15 min** (≈ 200/min/restaurant).
   - Public-write (orders): **60 → 300 / 15 min** (≈ 20 orders/min/restaurant — covers a rush).
   - Auth/chat: leave (20 / 120) — not the constraint.
   These are starting points to validate against real traffic logs (`rate_limit_*` warnings).
3. **Monitor** `rate_limit_general` / `rate_limit_public_write` warn-log counts in production for one week and tune to keep them at ~0 during normal service.

## Verdict
Rate limiter is **correctly built and proxy-aware**, but its **default ceilings throttle a busy single-IP restaurant**. Certified for use **with the recommended limit increase (or per-table keying)**; the bypass is in place for controlled testing and is safe-by-default.
