# PRODUCTION-STATE.md — Phase 02A Step 1

**Date:** 2026-06-24. **Method:** live, read-only verification over **root SSH** to the production droplet (`134.122.99.78`) plus external HTTP(S) probes. No production state was modified. Every block below gives the **command → observed output → conclusion**.

> ⚠️ **Access note:** Contrary to the prior project note ("no SSH"), `root@134.122.99.78` is reachable via key-based SSH (`ssh -o BatchMode=yes root@134.122.99.78 'echo CONNECTED'` → `CONNECTED`, exit 0). All Phase 02A evidence was collected this way, **read-only only**.

---

## 1. Headline: the real topology is a shared multi-app droplet

The repo implies a single Trump app on a dedicated box at `/var/www/emenuy/Trump`. **Reality:** one **1 GB** droplet hosts **all four restaurants + extras + a staging copy**, and Trump lives at `/var/www/mysite/Emenyu/Trump`.

| | Repo/docs assumption | Verified reality |
|---|---|---|
| Host | dedicated droplet | **shared** 1 GB droplet, 7 PM2 apps + Postgres + nginx |
| App path | `/var/www/emenuy/Trump` | `/var/www/mysite/Emenyu/Trump` |
| Domain edge | repo `emenuy-trump.conf` (template) | live multi-app nginx routing `emenyu.com` |
| Deployed code | branch `feat/chatbot-reco-rework` | **pre-Phase-01** (vanilla `frontend/` + `recommend.py` still present & running) |

---

## 2. OS / kernel / uptime

```
$ ssh root@134.122.99.78 'cat /etc/os-release; uname -r; uptime'
PRETTY_NAME="Ubuntu 24.04.3 LTS"
6.8.0-90-generic
 14:17:08 up 190 days,  4:22,  2 users,  load average: 0.02, 0.06, 0.03
```
**Conclusion:** Ubuntu 24.04.3 LTS, kernel 6.8. Box uptime 190 days. Load is low (CPU is not the bottleneck — memory/disk are, see §5/§6).

## 3. Node / npm / PM2

```
$ node -v; npm -v; pm2 -v
v18.19.1   9.2.0   6.0.14
```
**Conclusion:** Node **18.19.1** (matches `engines: >=18.18.0`), PM2 6.0.14. Fine for current code.

## 4. Process manager (PM2) — 7 apps on one box

```
$ pm2 list
 id  name                uptime   ↺(restarts)  status   mem
 10  AlPescatore         31D      399+         online   41.7mb
 3   Greek               31D      327          online   62.1mb
 15  Josh-Greek          32D      828+         online   13.3mb
 18  Recommend-Trump     32D      16           online   10.1mb   (./venv/bin/python recommend.py)
 16  emenuy-trump-api    18h      84           online   92.8mb   (node .../Emenyu/Trump/server.js)
 1   imli                31D      145          online   44.5mb
 19  trump-staging       7D       92           online   43.4mb   (.../staging/Sites/Trump)
```
**Conclusions:**
- `emenuy-trump-api` (the production Trump app) is **online**, 18 h uptime, **84 lifetime restarts**, pid 1689758, ~93 MB.
- **High restart counts everywhere** (Josh-Greek 828, AlPescatore 399, Greek 327) — consistent with memory pressure / OOM-driven crash loops on a 1 GB box (see §6).
- **`Recommend-Trump` is a live Python `recommend.py` service** — the same file Phase 01B deleted from the repo. It is still running in production. The repo and prod have diverged.
- A separate **`trump-staging`** instance runs on the same droplet.

## 5. Disk — 87% full

```
$ df -h /
/dev/vda1  24G  21G  3.1G  87% /
$ du -sh /var/www/* /root /var/log
8.3G  /var/www/mysite        4.7G  /root        2.7G  /var/log
```
Largest consumers: restaurant media (Greek `Video/*` files are 100–216 MB each), `/root` backups (incl. a **406 MB** app tarball), `/var/log` (2.7 G), and **472 MB of unrotated PM2 logs** (`imli-out.log` alone is 348 MB — see MONITORING-AUDIT §4).

**Conclusion:** **3.1 GB free and trending down.** Unrotated logs + on-disk backups will eventually fill the disk; at 100% Postgres and every app fail. This is a **HIGH operational risk** not in the original blocker list.

## 6. Memory — pressure + swap in use

```
$ free -m
              total   used   free   buff/cache   available
Mem:            961    656     77          397          304
Swap:          1023    408     615
```
**Conclusion:** ~1 GB RAM total, **304 MB available, 408 MB of swap already in use**. Seven Node apps + Postgres on 1 GB is oversubscribed; the high PM2 restart counts (§4) are the visible symptom. The Trump PM2 `max_memory_restart: 768M` is effectively unreachable on a 961 MB box (the OOM killer fires first).

## 7. Database engine

```
$ sudo -u postgres psql -tAc 'select version();'
PostgreSQL 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1) ... 64-bit
$ pg_database sizes
emenyu = 11 MB ; emenyu_restore_test = 10 MB ; postgres = 7503 kB
```
**Conclusion:** PostgreSQL **16.14**. Live DB `emenyu` is **11 MB** (small). A second DB **`emenyu_restore_test` (10 MB)** exists — evidence a backup was restored (see RESTORE-READINESS). Live data scale: 6 users, **851 menu items**, 36 orders.

## 8. Current deployment version

```
$ git -C /var/www/mysite/Emenyu/Trump rev-parse HEAD
fatal: not a git repository
$ ls -la .../Trump/client/dist/index.html      # built SPA present
-rw-r--r-- 1 197609 197609 2200 Jun 23 19:24 index.html
$ ls -d .../Trump/frontend                      # vanilla frontend STILL present
/var/www/mysite/Emenyu/Trump/frontend
```
**Conclusions:**
- The app dir is **not a git checkout** (deployed by rsync, `.git` excluded) → **no deployed SHA is recoverable from the box.** Version provenance is by file mtime only (`client/dist` built **2026-06-23 19:24**, matching the app start at 19:27 UTC).
- The deployed tree **still contains `frontend/` and `recommend.py`** → production is running **pre-Phase-01** code. The Phase 01 consolidation branch is **not deployed**.
- Files owned by UID **197609** (a Windows numeric UID) confirm rsync-from-Windows deploys.

## 9. Live application health (external, unauthenticated)

```
$ curl http://134.122.99.78:3012/healthz
{"status":"ok","app":"emenuy-trump","env":"production","uptimeSeconds":67633,"startedAt":"2026-06-23T19:27:48.227Z"}
$ curl http://134.122.99.78:3012/readyz
{"status":"ready","menuSections":24}
$ curl https://emenyu.com/Trump/api/menu   → HTTP/2 200 (333 KB JSON)
```
**Conclusion:** The app is **healthy and ready** (24 menu sections loaded) and is correctly served over TLS at `https://emenyu.com/Trump/*`. **However** `/healthz` and `/readyz` answered on **`http://…:3012` directly**, proving the app port is internet-exposed in plaintext (see §10 / SECURITY findings).

## 10. Network exposure (finding — not in original blocker list)

```
$ ss -tlnp        # (abridged)
0.0.0.0:22 sshd | 0.0.0.0:80,443 nginx | 0.0.0.0:5432 postgres | 0.0.0.0:3012 node(trump) | 0.0.0.0:3002 node | *:3001 node
# from a remote machine, TCP connect succeeded on 22,80,443,3012,5432
```
**Conclusion — two new internet-exposure findings:**
- **N1 (CRITICAL): PostgreSQL is bound to `0.0.0.0:5432` and reachable from the public internet** (`pg_hba: host all all 0.0.0.0/0`). See CREDENTIAL-AUDIT §4.
- **N2 (HIGH): the Trump app is bound to `0.0.0.0:3012`** and answers in plaintext, bypassing the nginx TLS/HSTS/rate-limit edge. Both should be firewalled to localhost (or via DO cloud firewall).

---

## Summary table

| Aspect | State | Evidence |
|---|---|---|
| OS | Ubuntu 24.04.3 LTS, kernel 6.8 | §2 |
| Node / PM2 | 18.19.1 / 6.0.14 | §3 |
| Trump app | online, 18 h up, 84 restarts | §4 |
| Co-tenants | 4 restaurants + Josh-Greek + Recommend-Trump (python) + staging | §4 |
| Disk | **87% full, 3.1 GB free** | §5 |
| Memory | 1 GB, 304 MB avail, **swap active** | §6 |
| Database | PostgreSQL 16.14, `emenyu` 11 MB | §7 |
| Deployed code | **pre-Phase-01** (frontend/ + recommend.py live), no git, rsync | §8 |
| Health | `/healthz` ok, `/readyz` ready (24 sections) | §9 |
| Exposure | **Postgres :5432 and app :3012 internet-facing** | §10 |
