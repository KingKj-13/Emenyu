# Task 4 — Public Endpoint Protection: Abuse Prevention Report

**File:** `server/middleware/security.js` (+ config in `server/utils/helpers.js`).

## 1. Problem

Only `POST /api/auth/login` had a strict limiter. The other unauthenticated write
endpoints (order submission, ratings, reservations, chat) were covered solely by
the broad general limiter (600 / 15 min), leaving room for spam and resource abuse.

## 2. Public write surface (unauthenticated)

| Endpoint | Method | New limiter |
|---|---|---|
| `/submit_order` (+ `/Trump`, `/trump`) | POST | public-write |
| `/api/ratings` | POST | public-write |
| `/api/reservations` | POST | public-write |
| `/api/chat` | POST | chat |

(The authenticated GET/PATCH/DELETE variants of ratings/reservations are **not**
throttled by these limiters — the middleware skips non-POST requests, so admin
reads/edits are unaffected.)

## 3. Controls added

- **`publicWriteLimiter`** — `TRUMP_PUBLIC_WRITE_RATE_LIMIT_MAX` (prod default
  **60** / 15 min per IP) applied to order/ratings/reservations POSTs.
- **`chatLimiter`** — `TRUMP_CHAT_RATE_LIMIT_MAX` (prod default **120** / 15 min per
  IP) for the chatbot, which is legitimately chattier than a one-off order.
- Both reuse the existing window (`TRUMP_RATE_LIMIT_WINDOW_MS`), emit RFC
  draft-8 `RateLimit` headers, log on trip (`rate_limit_public_write` /
  `rate_limit_chat`), and stack **on top of** the general limiter.
- Limits are env-tunable; dev defaults are high (1000) to avoid friction.
  Production config validation rejects non-positive values.

## 4. Validation (live)

`POST /Trump/submit_order` returned **two** active policies (general + public-write),
confirming the new limiter is attached:

```
RateLimit: "600-in-15min"; r=589; t=822          ← general limiter
RateLimit: "1000-in-15min"; r=992; t=825         ← public-write limiter (dev default 1000)
RateLimit-Policy: "600-in-15min"; q=600; w=900; …
RateLimit-Policy: "1000-in-15min"; q=1000; w=900; …
```

In production the second policy reads `60-in-15min`. Method scoping verified by
design: the `skip(req => req.method !== 'POST')` guard leaves admin GET/PATCH/DELETE
on `/api/ratings` and `/api/reservations` untouched.

## 5. Residual / notes

- Limiter state is **per-process, in-memory** (consistent with the rest of the
  stack). Horizontal scaling would need a shared store (Redis) — out of Phase 1
  scope and not required for a single-instance pilot.
- Limits are per-IP; behind the proxy `trust proxy` is enabled in production so the
  real client IP is used.
