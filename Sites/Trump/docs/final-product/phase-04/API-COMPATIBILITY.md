# API-COMPATIBILITY.md — Phase 04 Step 2

**Date:** 2026-06-25. **Method:** audit of every route registrar against the new Bearer-token resolver. **Headline: because Bearer was added to the shared `getRequestUser` resolver, EVERY `requireRoles` endpoint is token-compatible with no per-route change. One real gap: the Socket.IO handshake.**

Legend: 🟢 Compatible (works with Bearer now) · 🟡 Requires token support · 🔵 Web-only (not needed for native) · ⚪ Deprecated.

---

## REST API — by area

| Area | Endpoints | Status |
|---|---|---|
| **Native auth** | `POST /api/auth/token{,/refresh,/revoke}`, `GET/DELETE /api/auth/devices` | 🟢 (the token layer itself) |
| **Web auth** | `POST /api/auth/login`,`/logout`, `GET /api/auth/me`, `*/auth/accounts` | 🟢 `/me` + accounts accept Bearer; login/logout are cookie flows (web) |
| **Menu (read)** | `GET /api/menu`, `/api/config`, `/api/recommend`, `/api/chat`, `/api/ai-pairing` | 🟢 public (no auth) |
| **Menu admin** | `/api/menu/items*`, `/categories`, `/chef-recs*`, `/bundles*`, `/deals`, `/api/upload` | 🟢 `requireRoles(['owner','manager'])` → Bearer ok |
| **Analytics** | `/api/analytics/*`, `/api/analytics/recommendations*` | 🟢 owner/manager → Bearer ok |
| **Orders / kitchen** | `/orders`,`/history`,`/complete`,`/api/kitchen/*` | 🟢 role-guarded → Bearer ok |
| **Reservations / ratings** | `/api/reservations*`, `/api/ratings` | 🟢 owner/manager → Bearer ok |
| **Waiter app API** | `/api/floor`, `/api/waiter/*` (tasks, coach, shift-report, performance, leaderboard, guests, covers, seat-guest, chat-center, birthday) | 🟢 `['owner','manager','waiter']` → Bearer ok |
| **Operations (Phase 03)** | `/api/shift/*`, `/api/shifts*`, `/api/ownership*`, `/api/notifications*`, `/api/owner/operations`, `/api/audit` | 🟢 Bearer verified live-equivalent (token-probe) |
| **Customer/public writes** | `POST /submit_order`, `/api/reco/events`, reservation create | 🟢 public by design |
| **Push (web)** | `/api/push/vapid-key`, `/api/push/subscribe` | 🟢 works; web-push payload is browser-oriented (native uses FCM — see PUSH-ARCHITECTURE) |
| **Real-time** | **`/Trump/socket.io` handshake** | 🟡 **cookie-only today** — native needs token in the handshake auth |
| **Pages / SPA** | `/Trump/{Admin,Waiter,Kitchen,Owner,login}`, `*.html` redirects, static `Images/Video/dist` | 🔵 browser-rendered; native renders its own UI + calls APIs |
| **HTTP Basic** | `Authorization: Basic` accepted as a cookie alternative | ⚪ keep for web/tools; native uses Bearer |
| **Legacy `Recommendation`** | consumed internally as mid-tier fallback | ⚪ superseded (not an app concern) |

## The one gap — Socket.IO handshake (🟡)
`socketService` authenticates the handshake via `auth.authenticateCookieHeader(cookieHeader)` (cookie only). Native clients hold a Bearer token, not a cookie. **Fix (small, Phase 04B):** in the socket handshake, also read `socket.handshake.auth.token` (or `Authorization`) and validate via the already-exposed **`auth.getUserFromToken(token)`** (same HMAC). No new model, ~10 lines. Until then, native real-time falls back to **polling** (notifications already poll at 20 s; floor/tasks can poll) — fully functional, just not push-live.

## Conclusion
- **No REST endpoints are token-incompatible.** Bearer is universal across the authed API.
- **No new REST endpoints are required** for native parity (the 5 `auth/token*` + `devices` routes are the only additions, already built).
- **One small real-time addition** (socket token handshake) is the sole "requires token support" item — optional for v1 (polling works), recommended for 04B.
- Web-only surfaces (pages/SPA/static) are irrelevant to native, which has its own UI.
