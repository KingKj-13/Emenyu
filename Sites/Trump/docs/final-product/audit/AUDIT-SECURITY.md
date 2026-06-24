# AUDIT-SECURITY.md — Phase 00 Security Audit

**Scope:** `middleware/security.js`, `utils/helpers.js`, uploads, env, Prisma queries, headers. **Date:** 2026-06-24.

---

## 1. Summary

Security posture is **above average for a single-venue SaaS**: Helmet with a hash-based CSP, HSTS in prod, a CORS allowlist, four-tier rate limiting, parameterised Prisma queries, strict upload validation, and a fail-closed production config gate. No critical injection vector was found. Remaining issues are **defense-in-depth and hardening**, not open holes: a permissive style-src CSP, an always-on HTTP Basic auth path, weak password policy, unauthenticated public writes (by design), and the live legacy `admin.html` widening the attack surface.

---

## 2. Controls present (`configureSecurity`)

- **Helmet** with:
  - **CSP** (`buildCspDirectives`): `default-src 'self'`; `script-src 'self' + per-build sha256 hashes` (no `'unsafe-inline'` for scripts — strong); `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'self'`; `form-action 'self'`. Script hashes recomputed from `client/dist/index.html` at startup (self-healing across rebuilds). `report-only` toggle available.
  - **HSTS** in production (`max-age 15552000; includeSubDomains`).
  - `frameguard: sameorigin`, `referrerPolicy: strict-origin-when-cross-origin`, `x-powered-by` disabled, `crossOriginEmbedderPolicy: false`.
- **CORS** allowlist (`isAllowedOrigin`): production origins from `TRUMP_ALLOWED_ORIGINS`/`TRUMP_PUBLIC_ORIGIN`; localhost allowed only in non-prod; `credentials: true`; methods/headers restricted.
- **Rate limiting** (express-rate-limit, 4 buckets):
  - General: `generalRateLimitMax` (prod 600/15min), skips static assets + health.
  - Auth login: `authRateLimitMax` (20/window), `skipSuccessfulRequests`.
  - Public writes (`submit_order`, `ratings`, `reservations`): `publicWriteRateLimitMax` (prod 60), POST-only.
  - Chat + reco events: `chatRateLimitMax` (prod 120), POST-only.
- **HTTPS enforcement** optional (`forceHttps` → 308 redirect) and at nginx (301). `trust proxy = 1` in prod (correct behind nginx).
- **Body limits:** JSON `2mb`, urlencoded `1mb`.
- **Secure cookies** forced in prod; `SameSite=Lax`; `HttpOnly`.
- **Production config gate** (`validateProductionConfig`): refuses to boot without a ≥32-char session secret, real origin, and strong (non-denylisted) account passwords.

---

## 3. SQL injection

**Low risk.** All data access is through **Prisma client methods** (parameterised). The only raw query is `prisma.$queryRaw\`SELECT 1\`` (a static health check — no interpolation). No string-built SQL. `normalizeId`/`normalizeUsername` further sanitise identifiers. **No SQLi vector found.**

---

## 4. XSS

- **React** auto-escapes; no `dangerouslySetInnerHTML` was surfaced in the audited components. CSP blocks inline/injected scripts.
- **Vanilla `admin.html` + `admin.js`** (still live) is the higher-risk surface — older DOM manipulation, not covered by React's escaping. Another reason to retire it.
- **Stored-XSS consideration:** customer-supplied free text (order `notes`, ratings `comment`, reservation `notes`, guest data) is stored and later rendered in staff UIs. React escapes on render; verify the vanilla admin does too before trusting it. CSP is the backstop.
- **Recommendation:** keep CSP enforcing (not report-only) in prod; retire vanilla admin.

---

## 5. CSRF

- State-changing **authenticated** routes are POST/PATCH/DELETE with a **`SameSite=Lax` HttpOnly cookie** → browsers do not attach the cookie to cross-site POST/PATCH/DELETE, which blocks classic CSRF. CORS allowlist + JSON content-type add depth.
- **No CSRF token** is implemented. Given SameSite=Lax + same-origin SPA, residual risk is low. If any sensitive action were ever exposed via top-level GET it would be vulnerable — none currently are.
- **HTTP Basic path** is not cookie-based, so not CSRF-relevant, but it is an alternate credential path (see §8).
- **Recommendation:** acceptable for launch; consider `SameSite=Strict` for the session cookie or a token if admin actions expand.

---

## 6. Uploads

**Well-guarded** (`uploadController.js` + multer):
- Admin-only (`requireRoles(['owner','manager'])`).
- `fileFilter` requires **MIME ∈ allowlist AND extension ∈ allowlist AND (MIME,ext) pair matches** (`MIME_EXTENSION_MAP`) — blocks extension/MIME mismatch tricks.
- Size limit (`TRUMP_UPLOAD_MAX_MB`, default 25 MB), **single file** only.
- Filenames sanitised (`safeUploadName`: lowercased, non-alphanumerics → `-`, timestamp-prefixed) — no path traversal, no original-name injection.
- Stored under `uploads/` (gitignored), served read-only.
- **Gap:** validation is MIME/extension-based, **not magic-byte content sniffing**. A crafted polyglot could pass. Low risk since files are served as static media with `X-Content-Type-Options: nosniff` (nginx) and not executed. Consider content verification for defense-in-depth.

---

## 7. Secrets / environment

- Secrets live in `.env` (gitignored; `.env.example` is the committed template with empty values). Root `.env` holds `DATABASE_URL` only.
- Prod gate enforces secret presence/strength at boot.
- `dont_upload/` (gitignored) contains an `ENV_TEMPLATE.txt` and private notes — correctly excluded.
- **Check:** ensure no real secret ever lands in a tracked file. `.env.example` is clean (placeholders). VAPID keys, session secret, DB URL all externalised.
- **Bootstrap:** `scripts/bootstrap-env.js` generates secrets locally.

---

## 8. Privilege-escalation review

- Role checks centralised (`requireRoles`/`requirePage`); socket events re-check role/table (`socketCanControlTable`). No route relies on client-supplied role.
- `accountService.canManageRole` prevents a manager from creating/elevating owners or editing peers above their level.
- Birthday approval correctly steps up to owner/manager inside the waiter router.
- **HTTP Basic accepted on every protected route** (`getRequestUser` → `readBasicUser`) — not an escalation per se (credentials still verified), but a second auth path that bypasses cookie/SameSite controls. Decide intentionally.
- **Guest socket scoping:** a guest may only control table rooms it joined; staff may control any. Correct.

---

## 9. Insecure endpoints / misc

- **Public writes** (`/submit_order`, `/api/ratings`, `/api/reservations`, `/api/reco/events`, `/api/chat`) are unauthenticated by design (QR guests) and rate-limited. `submit_order` is price-validated server-side. Residual: reservation/rating/analytics spam — monitor.
- **CSP `style-src 'unsafe-inline'`** (needed for React/framer-motion inline styles + Google Fonts) — weakens style CSP; acceptable, common trade-off.
- **`connect-src` allows `ws:`/`wss:`** broadly — fine for same-origin Socket.IO.
- **Live `admin.html`** vanilla panel = extra, less-audited surface (XSS, divergent validation). Retire.
- **No security headers gap at nginx:** the template sets X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS. But the nginx file still has **placeholder `server_name`/certs** (see AUDIT-DEPLOYMENT) — must be filled before it's the real edge.

---

## 10. Findings table

| Severity | Finding | Action |
|---|---|---|
| HIGH | Weak password policy (6-char min), modest PBKDF2 (120k) | Raise min length / iterations (see AUDIT-AUTH) |
| HIGH | Live legacy `admin.html` widens XSS/validation surface | Retire vanilla admin |
| MEDIUM | HTTP Basic accepted on all routes | Decide/disable for browser routes |
| MEDIUM | Uploads validated by MIME/ext, not content bytes | Add magic-byte sniffing |
| MEDIUM | No CSRF token (mitigated by SameSite=Lax) | Consider SameSite=Strict / token if admin grows |
| LOW | Public reservation/rating/reco-event spam | Abuse monitoring / signing |
| LOW | CSP `style-src 'unsafe-inline'` | Accept or hash styles |
| LOW | No account lockout beyond IP rate-limit | Per-account attempt throttle |

**No BLOCKER-level open vulnerability found.** The HIGH items are hardening, not active exploits.
