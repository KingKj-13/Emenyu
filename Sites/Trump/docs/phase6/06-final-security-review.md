# Step 6 — Final Security Review

Read-only code audit of the launch surface (auth, authz, session, sockets, rate limiting, CSP, uploads,
recommendation + chatbot endpoints). Date: 2026-06-07.

## Verdict

**The application-layer security posture is strong.** The one **High** item is **infrastructure**, not code:
a production database on a public IP with a weak password (carried from Step 2). No application-code
vulnerabilities were found in the Phase 3–5 recommendation work.

## Findings

| ID | Severity | Area | Finding | Action |
|---|:--:|---|---|---|
| S1 | 🔴 High | DB / infra | Prod Postgres on **public IP** `134.122.99.78` with a **weak password** | **Rotate password + firewall to app-server only** before/at launch (Step 2) |
| S2 | 🟡 Medium | Analytics ingest | `POST /api/reco/events` is **unauthenticated** (guests have no session) | Mitigated: hard sanitisation, 100-event/req cap, shared chat rate-limiter. Residual = junk telemetry, not a breach. Monitor; optionally add a lightweight token. |
| S3 | 🟢 Low/Info | Session | `SameSite=Lax` (not `Strict`) | Acceptable — combined with the CORS allowlist + JSON content-type, CSRF risk is low. Consider `Strict` for the admin cookie if desired. |

No other issues. Details by area below.

## Authentication — ✅ strong
- Passwords hashed with **PBKDF2** (no plaintext; `accountService`); default accounts seeded from env only when missing, never reset on boot.
- Session = an **HMAC-SHA256-signed** token in the `trump_session` cookie, **validated on every request** against the PostgreSQL user record and a per-user `sessionInvalidBefore` (enables server-side logout/invalidations). Stateless; no in-memory store.
- Login is **rate-limited** (`/api/auth/login`, 20/window, `skipSuccessfulRequests`).
- Account/session secrets are **strong** (32-char passwords, 64-char session secret — verified Step 2).

## Authorization (roles) — ✅ correct
- `owner > manager > waiter > kitchen`. Enforced via `requireRoles` (403 JSON) / `requirePage` (redirect).
- Recommendation surface gating (verified in route files + `server.js`):
  | Endpoint | Auth |
  |---|---|
  | `POST /api/reco/events` | **public** (by design — guest ingest) |
  | `GET /api/menu/bundles` | **public** (read-only active bundles) |
  | `GET /api/analytics/recommendations[/insights]` | owner\|manager |
  | `GET/POST/PATCH/DELETE /api/menu/chef-recs` | owner\|manager |
  | `GET(admin)/POST/PATCH/DELETE /api/menu/bundles` | owner\|manager |
  | `GET /api/menu/items`, analytics, accounts | owner\|manager |
  | uploads | owner\|manager |

## Session handling — ✅ strong
- Cookie flags: **`HttpOnly`**, **`SameSite=Lax`** (configurable), **`Secure`** when HTTPS/secureCookies, `Path=/`, `Priority=High`. Tamper-proof (HMAC signature).

## Socket permissions — ✅ strong
- Handshake attaches the **authenticated staff identity from the signed cookie**; guests are allowed (QR) but privileged events are gated.
- `joinAdmin` requires `ADMIN_ROLES`; `joinAsWaiter` requires `TABLE_CONTROL_ROLES` — else `denySocket`. **Identity is taken from the session, not the client payload**, so names/roles cannot be spoofed.

## Rate limiting — ✅ present
- General (~600/15m prod, static assets skipped), auth (20/15m, skip-successful), public-write (order/rating/reservation, ~60/15m prod, POST-only), and chat **+ `reco/events`** (~120/15m prod, POST-only). All tunable via env.

## CSP / headers — ✅ strong
- Helmet CSP: `default-src 'self'`; **`script-src 'self' <exact-hashes>` — no `'unsafe-inline'`/`'unsafe-eval'` for scripts**; `style-src` allows inline + Google Fonts; `connect-src 'self' ws: wss:` (socket.io). `frameguard: sameorigin`; **HSTS** in production.

## Upload security — ✅ strong
- Owner|manager only. **MIME ↔ extension cross-validation** against allowlists (`allowedMimeTypes` + `allowedExtensions`), **`fileSize` limit** (`maxFileSizeBytes`), and **sanitised filenames** (`Date.now()_<safe-stem><ext>`). Rejects mismatched/oversized/disallowed files.

## Recommendation endpoints — ✅ safe
- All inputs validated/coerced: `sanitizeChefRec`, `sanitizeBundleInput`, `sanitizeEvent` (reject bad types/ids; cap lengths; bound batches to 100).
- **Prisma parameterised queries** throughout (no string-built SQL → no SQL injection).
- **No sensitive data in responses:** the analytics aggregator returns name/source/group **tallies + rates + revenue only** — no `sessionId`, no PII; insights return suggestions only.
- Public ingest is fire-and-forget (`202`), capped, and rate-limited.

## Chatbot endpoint — ✅ safe
- `POST /api/chat` is public + rate-limited (chat bucket). **Fully local & deterministic — no external/LLM calls** (no SSRF/data-exfil vector). Input is normalised (`chatbotNlu`); the matching regexes are simple bounded alternations (low ReDoS risk). Replies derive only from local menu/knowledge data.

## Pre-launch security actions (from this review)

1. **S1 (required):** rotate the production DB password to a strong value and restrict the DB to the app
   server (remove public-internet exposure).
2. **Prod credential hygiene:** run `npm run auth:rotate` on the production host (carried from Phase 1).
3. **S2 (recommended, optional):** monitor `reco/events` volume; add a lightweight shared token if abused.
4. Confirm `TRUMP_FORCE_HTTPS`/HSTS are enabled on the production `.env` (the local `.env` has HTTPS off — expected for dev).
