# SECURITY-VALIDATION.md — Phase 08 (SRE1) Step 6

**Date:** 2026-06-25. **Status: ✅ 11/11 security checks + clean account audit. No regressions.**
**Method:** live probe against the RC1 server with **rate limiting ON** (`scratchpad/probe-security.js`) + `scripts/audit-accounts.js`.

---

## Results (measured)
| # | Check | Result |
|---|---|---|
| 1 | Unauthenticated request → 401 | ✅ |
| 2 | Garbage Bearer token → 401 | ✅ |
| 3 | Waiter Bearer → own endpoint (`/shift/me`) 200 | ✅ |
| 4 | **Role separation** — waiter **FORBIDDEN (403)** on all admin-only endpoints | ✅ **6/6** |
| 4b | Owner allowed on admin endpoint (analytics 200) | ✅ |
| 5 | Refresh token **rotates** (new token issued) | ✅ |
| 5b | **Old refresh reuse → 401** (single-use / theft detection) | ✅ |
| 6 | Device revoke → its refresh → 401 | ✅ |
| 7 | **Auth rate limiter FIRES** — 429 at attempt 21 (limit 20/15 min) | ✅ |
| 8 | **Audit logging** — auditable action writes an AuditLog row (14→15) | ✅ |
| 9 | **Password policy** — `audit-accounts.js`: 6 accounts, **0 weak, no backdoor** | ✅ |

The 6 admin-only endpoints a **waiter was correctly denied (403):** `GET /api/analytics/summary`, `GET /orders`, `GET /api/owner/operations`, `GET /api/audit`, `POST /api/notifications` (create), `POST /api/ownership/:t/reassign`.

## Verified properties
- **Authentication:** stateless HMAC token (cookie + Bearer), validated by the same `readToken → findActiveUser` path; suspension + `sessionInvalidBefore` revoke it.
- **Authorization / role separation:** `requireRoles` gates every protected route; roles owner>manager>waiter>kitchen enforced server-side (proven 6/6 above) — the **server is the authority**, not the client.
- **Token expiry:** a correctly-signed but **expired** access token is rejected (401) — proven in [RECOVERY-VALIDATION.md](RECOVERY-VALIDATION.md) (and a fresh future-expiry token is accepted, isolating expiry from signature).
- **Refresh rotation:** single-use; reuse of a rotated token → 401 (theft detection); device-scoped revoke.
- **Rate limits:** fire correctly (auth 20/15 min proven); RC1 production ceilings (general 3000, public-write 300 per 15 min); **bypass OFF** by default (no `rate_limit_bypass_active` in logs).
- **Audit logging:** account/table/notification actions write immutable `AuditLog` rows (proven live).
- **Password policy:** no weak/default/backdoor credentials; the `admin/123456789` backdoor stays **suspended**.
- **Backup integrity:** verifiable + restore-drilled ([../operations/BACKUP-VERIFICATION.md](../operations/BACKUP-VERIFICATION.md)) — operator runs the monthly drill.

## Transport / headers (RC1, unchanged)
- HTTPS enforced; HSTS on; CSP enabled; secure HttpOnly cookies; `trust proxy: 1` for correct client IP behind nginx. Postgres bound localhost; app bound 127.0.0.1 (Phase 02B lockdown).

## No regressions
All token-auth behaviours match the Phase 04/04B validation (27/27). Nothing in RC1 (idempotency, menu cache, rate-limit raise) weakened auth/authz. The rate-limit *ceilings* were raised (Phase 05A) but the limiter still **fires** (proven) and the bypass is off.

## Open (operator-run)
- A full external pen-test / dependency-CVE sweep (`npm run audit:prod`) on the live box is a routine operator task ([../operations/MAINTENANCE.md](../operations/MAINTENANCE.md) monthly).

## Verdict
**Security validated — 11/11, no regressions.** Authentication, role separation, token expiry + rotation, rate limiting, audit logging, and password policy all behave correctly under live test.
