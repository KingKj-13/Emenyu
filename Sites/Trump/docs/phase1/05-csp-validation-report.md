# Task 5 — Content Security Policy: Validation Report

**File:** `server/middleware/security.js` (helmet CSP + inline-script hashing).

## 1. Problem

`helmet({ contentSecurityPolicy: false })` shipped **no** CSP, leaving the
DB-driven menu UI and user-uploaded media without an XSS containment layer.

## 2. Policy

CSP is now enabled by default (`TRUMP_CSP_ENABLED=true`) with a report-only escape
hatch (`TRUMP_CSP_REPORT_ONLY=true`). Directives:

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | deny by default |
| `script-src` | `'self'` + per-inline `sha256` | bundled SPA JS is same-origin; the inline service-worker registration is allowed by **exact hash**, never `'unsafe-inline'` |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | React/framer-motion set inline styles at runtime; Google Fonts CSS |
| `font-src` | `'self' https://fonts.gstatic.com data:` | Google Fonts + data URLs |
| `img-src` | `'self' data: blob:` | menu images, uploads, client-generated QR (data:) |
| `media-src` | `'self' blob: data:` | menu videos |
| `connect-src` | `'self' ws: wss:` | same-origin REST + Socket.IO (polling + ws upgrade) |
| `worker-src` | `'self'` | service worker |
| `manifest-src` | `'self'` | PWA manifest |
| `object-src` | `'none'`; `base-uri 'self'`; `frame-ancestors 'self'`; `form-action 'self'` | hardening |

### Self-maintaining script hashes

`computeInlineScriptHashes()` reads `client/dist/index.html` **at startup**, hashes
every inline `<script>` body, and injects the `'sha256-…'` tokens into `script-src`.
Because each deploy rebuilds the client and reloads the process, the policy
auto-heals when the inline script changes — no manual hash maintenance, and no need
for `'unsafe-inline'` on scripts. If the build is absent, `script-src` falls back to
`'self'` only (inline SW registration would be blocked, but the app still loads).

## 3. Validation (live)

`curl -sI /Trump/` returned the header (abridged):

```
Content-Security-Policy: default-src 'self';base-uri 'self';object-src 'none';
  frame-ancestors 'self';form-action 'self';
  script-src 'self' 'sha256-31NAp5fDoM5gxhPXiAgc9pkCI4BlzjrukMFuXx/iz+A=';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob:; media-src 'self' blob: data:;
  connect-src 'self' ws: wss:; worker-src 'self'; …
```

The `sha256-31NAp5…` token is the computed hash of the real inline SW-registration
script — confirming hash generation works end-to-end.

Functional checks against the running server with CSP active (all pass):

- SPA entry + hashed modules load (`/Trump/` 200, asset `script-src 'self'`).
- `GET /Trump/api/menu` 200; menu renders (`connect-src 'self'`).
- Socket.IO connects (guest + owner probes connected) under `connect-src ws: wss:`.
- Upload media path stays `img-src 'self' data: blob:` (uploads served same-origin).
- Google Fonts allowed via `style-src`/`font-src`.

Startup log confirms activation: `{"event":"csp_enabled","reportOnly":false}`.

## 4. Rollout guidance

- To trial safely on a new front end, set `TRUMP_CSP_REPORT_ONLY=true` (emits
  `Content-Security-Policy-Report-Only`) and watch the browser console, then flip to
  enforcing.
- After any client rebuild, restart/reload the Node process so the inline-script
  hashes refresh (PM2 `reload` already does this on deploy).
