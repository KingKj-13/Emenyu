# NETWORK-HARDENING-REPORT.md — Phase 02B.1 Step 4

**Date:** 2026-06-24. **Finding:** N2 — the Trump app was bound to `0.0.0.0:3012`, i.e. reachable directly from the internet in plaintext, bypassing the nginx TLS/HSTS/rate-limit edge. **Result: 🟢 CLOSED — the app binds to `127.0.0.1` only; external `:3012` is refused; access is via nginx/TLS only.**

---

## 1. Before

```
$ ss -tlnp | grep 3012  → 0.0.0.0:3012  node(pid 1689758)
$ (off-box)  http://134.122.99.78:3012/healthz → 200   ← plaintext app, no TLS/HSTS/rate-limit
```
The app read its bind from `env.TRUMP_HOST || '0.0.0.0'`, and `.env` set `TRUMP_HOST=0.0.0.0`; PM2's `ecosystem.config.js` `env_production` also defaulted to `0.0.0.0`.

## 2. Approach chosen — loopback bind (not a host firewall)

No host firewall was active (`ufw` inactive, `iptables` default ACCEPT). Rather than introduce a box-wide `ufw` (which risks SSH lockout and affects the co-tenant apps), the app was bound to **loopback**. This is Trump-scoped, reversible, and keeps nginx → `localhost:3012` working unchanged (the app already listened IPv4-only and nginx already reached it via `127.0.0.1`).

## 3. Changes applied

**`/var/www/mysite/Emenyu/Trump/.env`:**
```
- TRUMP_HOST=0.0.0.0
+ TRUMP_HOST=127.0.0.1
- DATABASE_URL=…@134.122.99.78:5432/emenyu
+ DATABASE_URL=…@127.0.0.1:5432/emenyu        (prerequisite for the Postgres lockdown)
```
**`/var/www/mysite/Emenyu/Trump/ecosystem.config.js`** (so PM2 `--update-env` doesn't re-inject `0.0.0.0`, since `dotenv` does not override an env var PM2 already set):
```
- TRUMP_HOST: process.env.TRUMP_HOST || '0.0.0.0'   (×2: env + env_production)
+ TRUMP_HOST: process.env.TRUMP_HOST || '127.0.0.1'
```
Reload:
```
$ pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env   → ✓ online
```
**Repo durability:** the in-repo `Sites/Trump/ecosystem.config.js` default was changed the same way, so a future rsync deploy cannot silently revert the bind to `0.0.0.0`.

## 4. After — verification

```
$ ss -tlnp | grep 3012  → 127.0.0.1:3012  node(pid 1748679)     ← 0.0.0.0 GONE
$ curl http://127.0.0.1:3012/readyz → {"status":"ready","menuSections":24}
```
**External (from an off-box machine):**
```
TCP connect 134.122.99.78:3012   → REFUSED (was OPEN)
http://134.122.99.78:3012/healthz → "Unable to connect to the remote server"
https://emenyu.com/Trump/api/menu → HTTP 200      ← via nginx/TLS, unchanged
https://emenyu.com/Trump/table1   → HTTP 200
```

---

## Verdict

| Check | Before | After |
|---|---|---|
| App bind | `0.0.0.0:3012` | `127.0.0.1:3012` |
| External `:3012` | reachable (plaintext) | **REFUSED** |
| nginx/TLS path | 200 | **200** (unchanged) |
| Repo default | `0.0.0.0` | `127.0.0.1` (regression-proof) |

**N2 status: 🟢 CLOSED.** All Trump traffic now flows through nginx (TLS, HSTS, security headers, rate-limits).

**Out-of-scope but flagged for 02B.2:** the co-tenant apps still bind `0.0.0.0` — `imli:3001`, `Greek:3002`, the landing site `:3005` are likewise directly internet-reachable. They were **not** touched (outside Trump scope) but should get the same loopback-bind (or a DO cloud firewall) treatment.
