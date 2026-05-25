# SERVER RUNTIME AUDIT
## DigitalOcean Production Server — Pre-Deployment Inspection
**Date:** 2026-05-22
**Server:** 134.122.99.78 (emenyu.com)

---

## 1. SERVER BASELINE

| Property | Value |
|---------|-------|
| OS | Ubuntu 24.04.3 LTS (Noble) |
| Kernel | 6.8.0-90-generic |
| Node.js | v18.19.1 (path: /usr/bin/node) |
| npm | 9.2.0 |
| PM2 | 6.0.14 |
| PostgreSQL | **NOT INSTALLED** — must be installed |
| Disk | 24G total / 19G used / 4.7G free (80%) ⚠️ |
| SSH | root access via ed25519 key |

---

## 2. PM2 PROCESS INVENTORY

| PM2 ID | Name | Status | Restarts | PID | Port | Path |
|--------|------|--------|----------|-----|------|------|
| 1 | imli | online | 142 | live | 3001 | /var/www/mysite/Emenyu/Imli/server.js |
| 3 | Greek | online | 324 | live | 3002 | /var/www/mysite/Emenyu/Greek/server.js |
| 10 | AlPescatore | online | 399 | live | 3005 | /root/AlPescatore/server.js |
| 12 | Trump | online ⚠️ | 13 | live | 3012 | /var/www/mysite/Emenyu/Trump/server.js → **MISSING** |
| 13 | Josh-Trump | online ⚠️ | 107 | N/A | — | /var/www/mysite/Emenyu/Trump/venv/bin/python → **MISSING** |
| 14 | Recommend-Trump | online 🔴 | **835,981** | N/A | — | /var/www/mysite/Emenyu/Trump/recommend.py → **MISSING** |
| 15 | Josh-Greek | online | 828 | live | 5001 | /var/www/mysite/Emenyu/Greek/josh_enterprise/api/app.py |

**Notes:**
- `Trump` (id 12): Server starts, logs startup banner on port 3012, but crashes on `ENOENT: frontend/pages/menu.html` because the Trump directory was intentionally deleted.
- `Josh-Trump` (id 13): Immediate crash — venv path doesn't exist.
- `Recommend-Trump` (id 14): **835,981 restarts** — crash loop. Missing `recommend.py`. Has consumed 138MB of disk in error logs.

---

## 3. ACTIVE PORTS

| Port | Process | Role |
|------|---------|------|
| 22 | sshd | SSH |
| 80 | nginx | HTTP → redirect to HTTPS |
| 443 | nginx | HTTPS + SSL termination |
| 3001 | imli (node) | Imli restaurant |
| 3002 | Greek (node) | Greek restaurant |
| 3005 | AlPescatore (node) | AlPescatore restaurant |
| 3012 | Trump (node) | Trump restaurant — intermittent crash/restart |
| 5001 | Josh-Greek (python) | Greek JOSH chatbot |
| 5005 | Python processes | AlPescatore recommend/chatbot |

Ports 5011 and 5012 (expected by new Trump for Josh-Trump and Recommend-Trump) are **NOT currently in use**.

---

## 4. NGINX CONFIGURATION

**Active config:** `/etc/nginx/sites-enabled/mysite` → symlink to `/etc/nginx/sites-available/mysite`

| Restaurant | Nginx path | Backend port | Socket.IO path |
|-----------|-----------|--------------|----------------|
| Greek (default) | `/` | 3002 | `/socket.io/` |
| Imli | `/Imli/` | 3001 | `/Imli/socket.io/` |
| Trump | `/Trump/` | 3012 | `/Trump/socket.io/` |
| AlPescatore | `/AlPescatore/` | 3005 | `/AlPescatore/socket.io/` |

Trump-specific nginx extras:
- `location ~ ^/Trump/(?:[Tt]able)?[0-9]+/?$` — table URL routing
- `location ^~ /frontend/` — proxies `/frontend/` requests to Trump (legacy frontend path)
- `location ^~ /food/` — proxies `/food/` requests to Trump

All routes use `proxy_http_version 1.1` with WebSocket upgrade headers. Socket.IO is correctly configured.

**No nginx changes required for the new Trump deployment.**

---

## 5. SSL / TLS

| Property | Value |
|---------|-------|
| Certificate authority | Let's Encrypt |
| Certificate location | `/etc/letsencrypt/live/emenyu.com/` |
| Certificate files | `fullchain.pem`, `privkey.pem` |
| dhparam | `/etc/letsencrypt/ssl-dhparams.pem` |
| SSL options | `/etc/letsencrypt/options-ssl-nginx.conf` |
| Status | **Active and valid** |

No SSL changes required.

---

## 6. SERVER DIRECTORY STRUCTURE

```
/var/www/mysite/Emenyu/
  ├── AlPescatore/    ← duplicate? Primary is /root/AlPescatore (unused?)
  ├── Greek/          ← active (server.js, orders/, tables/, uploads/)
  └── Trump/          ← MISSING (intentionally deleted)

/root/
  ├── AlPescatore/    ← active AlPescatore app (orders/, tables/)
  ├── node_modules/   ← 15M orphaned global node_modules
  ├── venv/           ← Python venv (for AlPescatore/Greek)
  ├── nltk_data/
  └── AlPescatore_backup_20260114_134037.tar.gz (9.4MB backup)
```

**Operational data present (must preserve):**
- `/var/www/mysite/Emenyu/Greek/orders/` — Greek orders
- `/var/www/mysite/Emenyu/Greek/tables/` — Greek table state
- `/var/www/mysite/Emenyu/Greek/uploads/` — Greek media uploads
- `/root/AlPescatore/orders/` — AlPescatore orders
- `/root/AlPescatore/tables/` — AlPescatore table state

**No Trump runtime data** — directory was deleted. Fresh deploy.

---

## 7. ENVIRONMENT FILES

| Location | Status | Notes |
|---------|--------|-------|
| `/var/www/mysite/Emenyu/Greek/.env` | Present | PORT=3002, GROQ_API_KEY present |
| `/root/AlPescatore/.env` | Missing | AlPescatore runs without env file |
| `/var/www/mysite/Emenyu/Trump/.env` | Missing | Directory deleted |

Trump production `.env` must be created at `/var/www/mysite/Emenyu/Trump/.env` during deployment.

---

## 8. POSTGRESQL STATE

PostgreSQL is **not installed** on this server. The `postgresql` apt package is available in Ubuntu 24.04 repos (version 16+257build1.1).

The new Trump platform requires:
- PostgreSQL 16
- Database: `emenyu`
- User: `trump_user` (or `postgres`)
- Connection: `postgresql://localhost:5432/emenyu`

No existing database or data to preserve — fresh install.

---

## 9. PM2 LOGS — DISK IMPACT CRITICAL

| Log file | Size | Action needed |
|---------|------|---------------|
| Josh-Greek-out.log | **841 MB** 🔴 | Truncate immediately |
| Josh-Greek-error.log | 115 MB 🔴 | Truncate |
| Recommend-Trump-error.log | **138 MB** 🔴 | Truncate (process is dead) |
| Josh-Trump-error.log | 160 KB | Truncate (process is dead) |
| Josh-Trump-out.log | 111 KB | Truncate (process is dead) |
| Trump-out.log | 23 KB | Keep (recent, useful) |
| Trump-error.log | 1.6 KB | Keep |
| AlPescatore-out.log | 724 KB | Keep |
| Greek-out.log | 39 KB | Keep |

Total recoverable disk: **~1.1 GB** from log truncation alone.

---

## 10. CRITICAL ISSUES REQUIRING ACTION

| # | Issue | Severity | Action |
|---|-------|---------|--------|
| 1 | `Recommend-Trump` 835K restart crash loop | 🔴 Critical | Stop process, fix on redeploy |
| 2 | `Josh-Trump` 107 restart crash loop | 🔴 Critical | Stop process, fix on redeploy |
| 3 | `Trump` crash loop on ENOENT | 🔴 Critical | Deploy new code |
| 4 | PostgreSQL not installed | 🔴 Critical | Install PostgreSQL 16 |
| 5 | Josh-Greek-out.log at 841MB | 🔴 Critical | Truncate to free disk |
| 6 | Disk at 80% (4.7G free) | ⚠️ Warning | Log cleanup will recover ~1.1GB |
| 7 | No Trump .env on server | ⚠️ Required | Create during deployment |
| 8 | No Trump runtime dirs | ℹ️ Info | Create on deploy (orders/, tables/, etc.) |

---

## 11. SAFE DEPLOYMENT PATH

Based on this audit, the deployment sequence is:

1. **Stop** crash-looping PM2 processes (Trump, Josh-Trump, Recommend-Trump)
2. **Truncate** bloated log files — recover ~1.1GB disk
3. **Install** PostgreSQL 16, create `emenyu` database
4. **Deploy** Trump app to `/var/www/mysite/Emenyu/Trump/`
5. **Deploy** shared Prisma schema to `/var/www/mysite/Emenyu/prisma/`
6. **Create** production `.env` on server
7. **npm install** (includes Prisma devDep for generate + migrate)
8. **npx prisma generate** + **npx prisma migrate deploy**
9. **Set up Python venv** + install Requirements.txt for Josh-Trump + Recommend-Trump
10. **Register new PM2 processes** via new `ecosystem.config.js`
11. **Validate** all endpoints

**Apps NOT touched:** Greek (id 3), Josh-Greek (id 15), AlPescatore (id 10), imli (id 1).
**No nginx changes required.**
**No SSL changes required.**
