# AUTH-ARCHITECTURE.md — Phase 04 Step 1

**Date:** 2026-06-25. **Status: ✅ token auth IMPLEMENTED + validated 16/16 on local** (not yet deployed). Web cookie auth unchanged.

---

## Design

Two coexisting schemes, one identity model:

| | Web (existing, unchanged) | Native (new) |
|---|---|---|
| Carrier | `trump_session` cookie (HttpOnly, SameSite) | `Authorization: Bearer <access>` |
| Access token | the cookie itself | short-lived HMAC token (**15 min**, `TRUMP_ACCESS_TTL_MINUTES`) |
| Refresh | cookie TTL (12 h) | opaque rotating refresh token (**30 d**, `TRUMP_REFRESH_TTL_DAYS`), DB-backed |
| Revocation | logout → `sessionInvalidBefore` | revoke device, or `sessionInvalidBefore` (all) |

**Key reuse:** the access token is the **same HMAC-signed format** as the cookie (`createToken`/`readToken` in `createRoleAuth`). So a Bearer token is validated **identically** — signature + expiry + `accountService.findActiveUser` (which enforces `suspended` and `sessionInvalidBefore`). Adding Bearer was a 3-line change to the request-user resolver; **every existing `requireRoles` endpoint now accepts Bearer with no per-route change.**

## Components

- **`config.auth.accessTtlMs` / `refreshTtlMs`** (helpers.js) — env-tunable.
- **`createRoleAuth`** (helpers.js): `getBearerUser(req)` added to `getRequestUser` (cookie → Bearer → Basic); `createAccessToken(username, ttlMs)` exposed.
- **`Device` model** (migration `20260625070500_phase04_device_tokens`, local): `deviceId` (uuid), `username`, `deviceName`, `platform`, `refreshTokenHash` (sha256 of the secret only), `refreshExpiresAt`, `lastSeenAt`, `revokedAt`. Multiple rows per user = **multiple concurrent devices**.
- **`tokenService`**: `issueRefresh`, `rotateRefresh` (verify + rotate, timing-safe), `revokeByRefresh`, `listDevices`, `revokeDevice`.
- **`authTokenController` + `authTokenRoutes`**.

## Endpoints

| Method · Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/token` | public | login → `{ accessToken, refreshToken, expiresIn, user, device }` |
| `POST /api/auth/token/refresh` | refresh token | rotate → new access + refresh (old refresh invalidated) |
| `POST /api/auth/token/revoke` | refresh token | logout this device |
| `GET /api/auth/devices` | staff | session management — list my active devices |
| `DELETE /api/auth/devices/:deviceId` | staff | revoke one device |

## Token lifecycle
1. **Login:** `POST /auth/token` (username/password + deviceName/platform) → access (15 m) + refresh (30 d). Refresh = `<deviceId>.<secret>`; only `sha256(secret)` stored.
2. **Use:** `Authorization: Bearer <access>` on any API.
3. **Refresh:** when access expires → `POST /auth/token/refresh` → new pair; **refresh rotates** (single-use; reuse → 401 — detects token theft).
4. **Revoke:** per-device (`DELETE /auth/devices/:id` or `/token/revoke`) or all (`sessionInvalidBefore` via web logout / suspension).

## Security properties
- Access tokens **stateless + short-lived** → no per-request DB hit beyond the existing active-user check; bounded exposure.
- Refresh tokens **hashed at rest** (sha256 of high-entropy secret), **rotated each use**, **revocable**, **expiring**.
- **Suspension / global logout** instantly invalidate access tokens (shared `findActiveUser` path).
- Timing-safe hash comparison; no token secrets logged.

## Validation (local, 16/16)
issue 200 + tokens · bad creds 401 · Bearer → protected 200 (×2) · garbage/no Bearer 401 (×2) · device listed · refresh rotates · **old refresh 401** · new access 200 · multi-device (2) · device revoke → refresh 401 · explicit revoke 401 · **web cookie login still 200** · cookie `/auth/me` 200. (`scripts`-style harness.)

## Not yet done
- **Deploy** (local-first; ships with Phase 04B or a deploy window — additive `Device` table).
- **Socket.IO handshake** still cookie-only — native real-time needs token support there (see API-COMPATIBILITY + PHASE-04-READINESS; small addition).
