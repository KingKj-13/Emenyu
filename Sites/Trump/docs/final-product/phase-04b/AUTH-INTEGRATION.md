# AUTH-INTEGRATION.md — Phase 04B Step 2

**Date:** 2026-06-25. **Status: ✅ implemented + validated (token issue/refresh/rotation/reuse/revoke all green live).**

Implements the **Phase 04 token system** on the device. No auth redesign (Rule 1). Web cookie auth is untouched and was re-verified unchanged.

---

## Token model (server-defined, app-consumed)
- **Access token** — stateless, 15 min, the **same HMAC format as the web cookie**; validated server-side by `readToken → findActiveUser` (so suspension / `sessionInvalidBefore` revoke it too). Sent as `Authorization: Bearer`.
- **Refresh token** — opaque `<deviceId>.<secret>`; only `sha256(secret)` stored server-side; **rotates on every use** (reuse ⇒ 401 = theft detection); 30 d; revocable per device.

## Secure storage (Step 2 requirement)
| Data | Store | Rationale |
|---|---|---|
| access + refresh token, device id, user | **expo-secure-store** (Keystore/Keychain) | hardware-backed; never world-readable |
| cached reads (shift/ownership/menu/notifications) | AsyncStorage | non-sensitive only |

**Tokens are NEVER in AsyncStorage** (`src/storage/secureStore.ts` is the only token writer; `cache.ts` carries a comment forbidding token storage).

## Flows
| Flow | Implementation |
|---|---|
| **Login** | `AuthContext.login` → `POST /api/auth/token` (anonymous) → persist `StoredSession` in secure store → start push + socket |
| **Logout** | best-effort `POST /api/auth/token/revoke` + clear server push token + disconnect socket → wipe secure store |
| **Refresh** | `tokenStore.getValidAccessToken()` refreshes when access is within a 60 s skew window or expired |
| **Auto refresh** | every `apiRequest` calls `getValidAccessToken()`; a 401 mid-flight forces one refresh + retry |
| **Single-flight** | concurrent callers share one in-flight refresh promise (no refresh stampede) |
| **Rotation** | the new refresh token from each refresh replaces the stored one |
| **Session persistence** | `hydrateSession()` on cold start restores the session from secure store; app opens already signed in |
| **Multiple devices** | each install has a stable `deviceId` (secure store) → its own `Device` row; `Profile` lists/revokes devices |
| **Hard failure** | refresh 401/403 (rotated/revoked/expired) → `onSessionExpired` → wipe + back to Login |

## Device identity
`src/auth/deviceId.ts` mints a stable per-install id, persisted **separately** so it survives logout — re-login on the same handset reuses the same `Device` row (no ghost sessions). The server still returns the authoritative `deviceId` on issue.

## Live validation (against local Trump server)
| # | Check | Result |
|---|---|---|
| 1 | `POST /auth/token` issues access+refresh+device | ✅ |
| 2 | Bearer authorizes a protected endpoint | ✅ |
| 3–4 | No token / garbage token → 401 | ✅ |
| 14 | Refresh **rotates** the token | ✅ |
| 15 | **Reusing** the old refresh → 401 (theft detection) | ✅ |
| 16 | Rotated access token authorizes | ✅ |
| 19–20 | Device revoke → its refresh → 401 | ✅ |
| 18 | **Web cookie login UNCHANGED** | ✅ |

See `scratchpad/probe-04b-rest.js` (22/22). Nothing about the server auth contract was modified for the app.
