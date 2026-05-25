# Security Hardening

## Implemented

- Production env validation blocks startup without secure session and seed account secrets.
- Cookies are `HttpOnly`, `SameSite=Lax`, `Priority=High`, and `Secure` in production.
- `trust proxy` is enabled in production so secure cookies work behind Nginx.
- CORS and Socket.IO origins are restricted by `TRUMP_PUBLIC_ORIGIN` and `TRUMP_ALLOWED_ORIGINS`.
- Helmet adds safer baseline headers without enabling CSP yet, preserving existing inline frontend behavior.
- HTTP request bodies and uploads have size limits.
- Upload filenames are sanitized and MIME types are restricted.
- Login and general request rate limits are active in Express.
- Nginx adds edge rate limits, gzip, TLS, and security headers.
- Auth success, failure, denial, logout, and account changes are structured log events.
- Transitive `ws` dependency is pinned with an npm override to clear current audit advisories.

## Required Secret Handling

Never commit `.env`. Generate the session secret with:

```bash
openssl rand -base64 48
```

Rotate staff account passwords from the admin UI or by replacing the relevant env seed before first account creation.

## CORS

For production:

```bash
TRUMP_PUBLIC_ORIGIN=https://your-domain.example
TRUMP_ALLOWED_ORIGINS=https://your-domain.example
```

Use comma-separated origins only when the restaurant needs multiple approved hostnames.

## Sessions

Current sessions are signed stateless cookies backed by account invalidation timestamps in `data/accounts.json`. Logging out invalidates existing sessions for that user. Production restarts preserve auth as long as `TRUMP_SESSION_SECRET` and `data/accounts.json` are preserved.

## CSP Next Step

Helmet Content Security Policy is intentionally disabled in Phase 1 because existing pages use inline scripts/styles. A later frontend-safe CSP pass should add nonces or move inline code before enforcing CSP.

