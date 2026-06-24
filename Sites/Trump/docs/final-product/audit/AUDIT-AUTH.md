# AUDIT-AUTH.md — Phase 00 Authentication Audit

**Scope:** `utils/helpers.js` (`createRoleAuth`), `services/accountService.js`, `services/prismaAuthService.js`, socket handshake. **Date:** 2026-06-24.

---

## 1. Summary

Auth is a **custom, stateless, HMAC-signed session cookie** scheme backed by **PostgreSQL accounts (PBKDF2-hashed passwords)** with a `data/accounts.json` fallback. There is **no JWT library, no OAuth/Google login, and no refresh-token flow** — despite the audit brief asking about them, they are **not present** in this codebase. The design is coherent and reasonably hardened (timing-safe comparisons, per-user server-side invalidation, prod-startup weak-password enforcement). The main gaps are a **weak 6-char minimum password**, a **hardcoded `admin` account**, an **always-on HTTP Basic alternate path**, and **no per-restaurant scoping** of accounts.

---

## 2. Login flow

1. `POST /api/auth/login` `{ username, password }` (rate-limited: `authRateLimitMax`, default 20/window; `skipSuccessfulRequests`).
2. `auth.login` → if account `status === 'suspended'` → 403.
3. `accountService.verifyCredentials(username, password)`:
   - Look up user in **Postgres** first (`prismaAuth.findUser`); if found and not suspended, verify with `verifyPasswordHash` (PBKDF2).
   - Else fall back to `data/accounts.json`; on a successful JSON verify, **lazily upsert** the account into Postgres.
4. On success → `issueSession` sets the signed cookie; returns sanitised user + `defaultPath` (role home).
5. Failures log `auth_login_failed` and return generic `401 Invalid credentials`.

**Credential acceptance is dual:** session cookie **or** HTTP `Authorization: Basic` (`readBasicUser` → `verifyCredentials`) is honoured on every protected route via `getRequestUser`.

---

## 3. Token / session flow

- **Token format:** `base64url(JSON{username, issuedAt, expiresAt}) + "." + HMAC_SHA256(payload, sessionSecret)` (`createToken`/`readToken`).
- **Cookie:** name `trump_session` (configurable). Flags: `HttpOnly`, `SameSite=Lax` (configurable), `Path=/`, `Priority=High`, `Max-Age = sessionTtlMs`, **`Secure` in production** (or when request is HTTPS).
- **Verification (`readToken`):** timing-safe HMAC compare (`crypto.timingSafeEqual` with length guard) → expiry check → `accountService.findActiveUser(username, issuedAt)`.
- **Stateless:** no server session store. Validity is re-derived per request from the DB user record.
- **Server-side invalidation:** `User.sessionInvalidBefore` (BigInt). Logout (`accountService.invalidateSessions`) and password change set it to `now`; any token with `issuedAt <= sessionInvalidBefore` is rejected → effective global logout / forced re-auth.
- **Socket.IO:** the same signed cookie is validated on the WS handshake (`authenticateCookieHeader` → `readToken`). Connection always allowed (guests), but staff identity is attached and per-event handlers enforce role/table authz.

### Expiry / "refresh"
- **TTL:** `TRUMP_SESSION_TTL_HOURS` (default **12h**). Single token; **no refresh token and no sliding renewal** — the cookie is reissued only on a fresh login. After 12h the user must log in again. Acceptable for staff shifts; document it.

---

## 4. Password storage

- **Algorithm:** PBKDF2-HMAC-SHA256, **120,000 iterations**, 16-byte random salt, 32-byte key. Stored as `pbkdf2$<iters>$<salt>$<hash>` (`accountService.hashPassword`).
- **Verification:** `verifyPasswordHash` recomputes and compares with `timingSafeEqual`. **Good** — no plaintext, no fast hash.
- **At rest:** `User.password` (Postgres) and `data/accounts.json` (`passwordHash`). The JSON file is gitignored.
- **Weakness:** **minimum length is only 6 characters** (`createAccount`/`updateAccount`). Too low for staff accounts. 120k PBKDF2 iterations is also on the low side by 2026 standards (consider ≥310k or argon2/scrypt).

---

## 5. Accounts / role handling

- **Roles:** `owner | manager | waiter | kitchen` (free-text `User.role`, validated in code via `VALID_ROLES`). Hierarchy: `owner > manager > waiter > kitchen`.
- **Management hierarchy (`canManageRole`):** owner → manager/waiter/kitchen; manager → waiter/kitchen; owners are never listed or editable through the accounts API (must be seeded via env).
- **Default seed accounts:** `owner`, `manager`, `waiter`, `kitchen`, and a hardcoded **`admin`** (role `owner`). Seeded from env **only when missing**; never reset/overwritten on startup (passwords/suspensions persist).
- **Prod hardening (`validateProductionConfig`):** server **refuses to start** in production if any seeded account has an empty or known-weak/demo password (denylist in `utils/weakPasswords.js`, shared with `npm run auth:audit` / `auth:rotate`), if `TRUMP_SESSION_SECRET` is missing or <32 chars, or if origins/secrets are unset. Strong fail-closed posture.

---

## 6. Role coverage check (brief asked: Owner/Manager/Waiter/Kitchen/Customer)

| Identity | Supported | Mechanism |
|---|---|---|
| Owner | ✓ | seeded + DB account, role `owner` |
| Manager | ✓ | account, role `manager` |
| Waiter | ✓ | account, role `waiter` |
| Kitchen | ✓ | account, role `kitchen` |
| Customer | ✓ (anonymous) | no login; QR → table room; socket guest scoped to joined table only |

---

## 7. Risks & findings

| Severity | Finding |
|---|---|
| HIGH | **6-char minimum password** for staff accounts — too weak. |
| HIGH | **Hardcoded `admin` (owner) account** always seeded — broadens the privileged surface; ensure its env password is strong/rotated (the prod weak-password gate helps, but the username is predictable). |
| MEDIUM | **HTTP Basic accepted on every endpoint** as an alternate to the cookie — a second, header-based auth path. Fine over TLS, but expands attack surface and bypasses SameSite protections; keep only if intentionally needed. |
| MEDIUM | **No multi-restaurant account scoping** — `User` has no `restaurantId`; `username` is globally unique (see AUDIT-DATABASE §5–6). Blocker for multiple restaurants. |
| MEDIUM | **PBKDF2 iteration count (120k)** is modest for 2026; consider raising or moving to argon2id. |
| LOW | **No account lockout** beyond IP rate-limiting on login (20/window). No per-account failed-attempt throttle. |
| LOW | **12h fixed TTL, no refresh** — acceptable, but document the re-login behaviour for staff. |
| LOW | **`createAdminAuth`** (Basic-only legacy guard) exported but seemingly unused — dead code. |

---

## 8. Recommendations

1. Raise minimum password length (≥12) and add complexity guidance; raise PBKDF2 iterations or switch to argon2id.
2. Decide on HTTP Basic: keep (documented, for API/mobile) or disable for browser routes.
3. Make the `admin` account optional / renameable; ensure rotation via `npm run auth:rotate` on the prod host (project memory flags this as a still-pending prod step).
4. (Future) add `User.restaurantId` for multi-tenant.
5. Remove `createAdminAuth` if confirmed unused.
