# TLS-VERIFICATION.md — Phase 02A Step 4

**Date:** 2026-06-24. **Question:** *Is the live domain actually serving valid, auto-renewing TLS — not the repo template?* **Method:** live TLS handshake + cert inspection against the production edge, plus on-box `certbot`/`nginx` verification. **Answer: YES — TLS is real, valid, auto-renewing, with HSTS. Blocker B2 is CLOSED**, with three caveats (repo↔prod config drift, duplicate server blocks, plaintext bypass on :3012).

---

## 1. Domain resolves to the prod box

```
$ nslookup emenyu.com      → 134.122.99.78
$ nslookup www.emenyu.com  → 134.122.99.78 (alias www.emenyu.com)
```
**Conclusion:** `emenyu.com` and `www.emenyu.com` both resolve to the production droplet.

## 2. Live certificate — valid Let's Encrypt (NOT the placeholder)

```
$ echo | openssl s_client -connect 134.122.99.78:443 -servername emenyu.com | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
subject = CN=emenyu.com
issuer  = C=US, O=Let's Encrypt, CN=YE2
notBefore = Jun 11 16:33:36 2026 GMT
notAfter  = Sep  9 16:33:35 2026 GMT
subjectAltName = DNS:emenyu.com, DNS:www.emenyu.com
```
On-box confirmation:
```
$ certbot certificates
  Certificate Name: emenyu.com
    Domains: emenyu.com www.emenyu.com
    Expiry Date: 2026-09-09 16:33:35+00:00 (VALID: 77 days)
    Certificate Path: /etc/letsencrypt/live/emenyu.com/fullchain.pem
```
**Conclusion:** A **real Let's Encrypt certificate** is deployed for `emenyu.com` + `www.emenyu.com`, **valid, 77 days to expiry**. This is **not** the repo's `your-domain.example` placeholder. The earlier audit assumption ("placeholder certs") is **disproven for the live edge.**

## 3. Auto-renewal — enabled

```
$ systemctl is-enabled certbot.timer        → enabled
$ systemctl list-timers '*certbot*'
NEXT: Wed 2026-06-24 18:00:43 UTC (in ~3h41m)   LAST: 2026-06-24 05:01:45 UTC   certbot.timer → certbot.service
```
**Conclusion:** `certbot.timer` is **enabled and active** (runs twice daily). Renewal is automated; the 90-day LE cert will renew well before the 2026-09-09 expiry. ✅

## 4. HTTPS enforcement + HSTS + app security headers

```
$ curl -D- http://134.122.99.78/        → HTTP/1.1 301 Moved Permanently, Location: https://…
$ curl -D- https://emenyu.com/Trump/api/menu
HTTP/2 200
strict-transport-security: max-age=15552000; includeSubDomains
content-security-policy: default-src 'self'; … (full helmet policy)
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
cross-origin-opener-policy: same-origin
$ curl -s -o/dev/null -w '%{http_code}' https://emenyu.com/Trump/Admin   → 302 (redirect to login)
```
**Conclusions:**
- **HTTP → HTTPS 301 redirect** is in force at the edge.
- **HSTS is present** (`max-age=15552000; includeSubDomains` ≈ 180 days) on the Trump paths.
- The Trump app is **correctly served over TLS at `https://emenyu.com/Trump/*`** (HTTP/2 200) with the **full helmet CSP** and security headers from the application layer.
- `/Trump/Admin` returns **302** (auth redirect) over TLS — the protected console is reachable and guarded.

## 5. Caveat A — repo config ≠ deployed config (drift)

The deployed nginx is a **multi-restaurant router**, not the repo's single-app template:
```
$ nginx -T | grep -E 'server_name|proxy_pass'
server_name emenyu.com www.emenyu.com;
proxy_pass http://localhost:3005…   (root/landing site)
proxy_pass http://localhost:3001…   (imli)
proxy_pass http://localhost:3002…   (Greek)
proxy_pass http://localhost:3012;    (Trump  ← /Trump/*)
proxy_pass http://localhost:3012/frontend/;   (legacy /frontend route, still wired)
```
**Conclusion:** `deploy/nginx/emenuy-trump.conf` in the repo is a **template/reference only** — it is **not** the file serving production. The live config routes four apps under one domain. Editing the repo file has **no effect on prod**; future nginx changes must be made on the box (and ideally captured back into the repo). The live config also still routes `/frontend/` → 3012 (moot after Phase 01 deploy).

## 6. Caveat B — duplicate `server_name` blocks (config hygiene)

```
$ nginx -t
[warn] conflicting server name "emenyu.com" on 0.0.0.0:443, ignored   (×4)
nginx: configuration test is successful
```
**Conclusion:** There are **three duplicate `emenyu.com` server blocks** on :80 and :443; nginx uses the first and **ignores** the rest (hence the warnings). Not an outage risk, but a **footgun**: an operator may edit an inactive block and see no effect. Should be consolidated.

## 7. Caveat C — plaintext bypass on :3012 (undermines HSTS)

The app is also reachable **without TLS** at `http://134.122.99.78:3012/…` (PRODUCTION-STATE §9–10). HSTS/redirect only protect traffic that goes through the domain; the open app port is a plaintext side-door. **Firewall :3012 (and :5432) to localhost / DO cloud firewall.**

---

## Verdict

| Check | Result |
|---|---|
| Domain → prod box | ✅ |
| Valid CA cert (not placeholder) | ✅ Let's Encrypt, exp 2026-09-09 |
| Auto-renewal | ✅ `certbot.timer` enabled |
| HTTP→HTTPS redirect | ✅ 301 |
| HSTS | ✅ `max-age=15552000; includeSubDomains` |
| App served over TLS w/ CSP | ✅ `https://emenyu.com/Trump/*` |
| Repo config matches prod | ❌ drift — repo is a template (§5) |
| Single clean server block | ❌ 3 duplicates, warnings (§6) |
| No plaintext bypass | ❌ :3012 open in cleartext (§7) |

**BLOCKER B2 (TLS) status: 🟢 CLOSED** — the deployed environment has valid, auto-renewing TLS with HSTS. **Remaining hardening (move to HIGH, Phase 02B):** firewall the plaintext :3012 bypass, consolidate the duplicate server blocks, and reconcile the repo template with the live config.
