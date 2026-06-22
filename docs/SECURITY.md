# Trump — Security

Supersedes the old `SECURITY_HARDENING.md`. Reflects the Phase 1 remediation.

## Implemented controls
- **Production config gate:** the server refuses to boot without a ≥32-char
  `TRUMP_SESSION_SECRET`, an allowed origin, and per-role account passwords; it
  also rejects empty or known-weak/demo seed passwords.
- **Passwords:** PBKDF2-SHA256 (120k iterations), per-user salt. Hash-only
  verification — there is no plaintext password fallback.
- **Sessions:** stateless HMAC-SHA256-signed `trump_session` cookie, validated
  each request against the Postgres user record. `HttpOnly`, `SameSite`, and
  `Secure` (in prod) flags. `sessionInvalidBefore` enables server-side logout /
  global invalidation (rotating `TRUMP_SESSION_SECRET` invalidates all sessions).
- **Accounts:** default users are seeded from env **only when missing** and are
  **never reset on startup**; owner/manager password changes persist.
- **Edge/app:** Helmet baseline headers, CORS restricted to `TRUMP_PUBLIC_ORIGIN`/
  `TRUMP_ALLOWED_ORIGINS`, general + auth-specific rate limits, body/upload size
  limits, sanitized upload filenames + MIME allowlist, optional HTTPS redirect + HSTS.
- **Auditability:** auth success/failure/denial/logout and account changes are
  structured log events with request ids.

## Phase 1 changes (2026-06)
- **Removed the `123456789` backdoor:** the `admin`/`waiter`/`kitchen` accounts no
  longer default to `123456789`, and the startup routine that force-reset their
  passwords on every boot has been removed. Seed passwords now come from env.
- **Removed plaintext credential fallbacks** in `accountService.verifyCredentials`
  and the dead plaintext paths in `helpers` (login / basic-auth).
- **Removed the external AI integration** (Anthropic) — no API key handling, no
  outbound model calls. See [AI.md](AI.md).
- **Removed demo mode** and the public `/api/demo-media` endpoint.

> **Server rotation note:** an existing deployment may still hold accounts whose
> stored hash is the old `123456789`. After deploying, set strong
> `TRUMP_*_PASS` env values and **delete those user rows** so they re-seed from
> env on next boot (or change them in the admin UI). The code no longer resets
> them for you.

## Open risks (tracked, not yet fixed)
- **No Content-Security-Policy** — Helmet CSP is disabled because legacy pages use
  inline scripts/styles. Add a nonce-based CSP before exposing admin widely.
- **Static base-dir serving** — `express.static` serves the site base directory,
  which can expose non-public files (e.g. `data/`, `orders/`). Restrict static
  serving to `client/dist` + explicit asset dirs.
- **Dual-write persistence** — orders/carts write to both Postgres and JSON files;
  they can diverge. Target end-state is Postgres-only.
- **Single-tenant** — no per-tenant isolation; one restaurant per process.
- **Secrets in plain `.env`** — use a secret manager in production.

## Secret handling
Never commit `.env`. Generate the session secret with `openssl rand -base64 48`
and VAPID keys with `npx web-push generate-vapid-keys`.
</content>
