# PHASE-02B1-COMPLETION-REPORT.md

**Phase:** 02B.1 — Emergency Production Lockdown. **Date:** 2026-06-24. **Status: ✅ COMPLETE — all three CRITICAL/active findings CLOSED with before/after evidence; Trump remains fully operational.**

Executed **live** on the production droplet (`134.122.99.78`) over root SSH. A full snapshot was taken first (rollback-ready), then changes were applied one at a time, each verified before proceeding.

---

## 1. Findings closed

| Finding | Before (evidence) | After (evidence) | Status |
|---|---|---|---|
| **B3 — weak creds / admin backdoor** | `audit` → 5/6 weak (`123456789`), `admin` owner backdoor active; console internet-reachable | `audit` → **`weakOrInsecure: 0`**; `admin` suspended (login **403**); old pw **401**; staff logins 200 | 🟢 **CLOSED** |
| **N1 — Postgres internet-exposed** | `listen_addresses=*`, `pg_hba 0.0.0.0/0`, `0.0.0.0:5432`, reachable off-box | `listen_addresses=localhost`, hba `0.0.0.0/0` commented, `127.0.0.1`/`[::1]` only, off-box `:5432` **REFUSED** | 🟢 **CLOSED** |
| **N2 — app port internet-exposed** | `0.0.0.0:3012`, `http://…:3012/healthz` 200 off-box | `127.0.0.1:3012`, off-box `:3012` **REFUSED**, domain 200 | 🟢 **CLOSED** |

## 2. Completion criteria (per the brief)

| Criterion | Result |
|---|---|
| `weakOrInsecure = 0` | ✅ |
| admin backdoor resolved | ✅ disabled (suspended) + rotated; login 403 |
| PostgreSQL no longer internet reachable | ✅ off-box `:5432` REFUSED; listens localhost only |
| Port 3012 no longer internet reachable | ✅ off-box `:3012` REFUSED; binds localhost only |
| Trump remains operational | ✅ see §3 |
| Evidence documented | ✅ this folder (4 step reports + this) |

## 3. No-regression validation (Step 5)

| Surface | Result |
|---|---|
| Credential audit | `weakOrInsecure: 0`, no backdoor |
| `/healthz` · `/readyz` · `/Trump/api/menu` (on-box) | **200 · 200 · 200** (readyz: 24 menu sections, real DB load) |
| `https://emenyu.com/Trump/api/menu` · `/Trump/table1` (off-box, TLS) | **200 · 200** |
| Logins (owner / manager / waiter / kitchen, new pw) | **200 / 200 / 200 / 200** |
| Negative: `admin` (suspended) | **403** |
| Negative: `owner` with old `123456789` | **401** |
| PM2 `emenuy-trump-api` | online, stable (1 reload restart, uptime climbing) |
| nginx config | `test is successful` |
| External ports | `22` OPEN, `443` OPEN, **`3012` REFUSED**, **`5432` REFUSED** |
| Co-tenant restaurants | untouched (no PostgreSQL dependency; their nginx routing unchanged) |

## 4. Changes made (inventory)

**On the box (`/var/www/mysite/Emenyu/Trump` unless noted):**
- Accounts: 5 rotated (PG+JSON lockstep), `admin` suspended, sessions invalidated. Secrets → `backups/phase1.1-rotated-credentials-2026-06-24T14-42-49-450Z.txt` (0600).
- `.env`: `TRUMP_HOST=127.0.0.1`, `DATABASE_URL` host → `127.0.0.1`.
- `ecosystem.config.js`: `TRUMP_HOST` default → `127.0.0.1`; `pm2 reload`.
- `/etc/postgresql/16/main/postgresql.conf`: `listen_addresses='localhost'`.
- `/etc/postgresql/16/main/pg_hba.conf`: `0.0.0.0/0` rule commented; `systemctl restart postgresql@16-main`.

**In the repo (this branch, `feat/chatbot-reco-rework`):**
- `Sites/Trump/ecosystem.config.js`: `TRUMP_HOST` default `0.0.0.0` → `127.0.0.1` (+ comment) — regression-proofs the bind across deploys.
- `Sites/Trump/docs/final-product/phase-02b/`: this report set.

**Snapshot (rollback):** `/root/phase-02b1-snapshot-20260624T144208Z/` (DB dump + all configs + app env + pre-state).

## 5. Important operational notes

1. **New staff credentials must be distributed** (password manager) from the `0600` secrets file on the box. They are not in git and are unrecoverable later.
2. **Remote DB admin now needs an SSH tunnel:** `ssh -L 5432:localhost:5432 root@134.122.99.78`. The workstation root `.env` pointing at the public IP will no longer connect (intended).
3. **Box `.env` is persistent and not in the repo.** If `.env` is ever regenerated from `.env.example`, set `DATABASE_URL` host to `127.0.0.1` and `TRUMP_HOST=127.0.0.1`. The repo `ecosystem.config.js` default now also enforces loopback.
4. **`emenyu_restore_test` DB** (from a prior restore drill) still exists on the box — harmless, candidate for cleanup in 02B.2.

## 6. Prepare Phase 02B.2 — Infrastructure Hardening

These remain OPEN from Phase 02A (none are active-compromise, so deferred out of this emergency phase):

1. **Automated, off-box DB backups + retention + failure alert** (B1) — *highest remaining priority*.
2. **Documented + drilled restore runbook with RPO/RTO** (B1).
3. **`pm2-logrotate` + disk hygiene** — 472 MB unrotated logs on an 87%-full disk (N3); prune on-box backups off the disk.
4. **Monitoring/alerting** — external uptime + `/readyz`; verify DO alert policies; DO managed backups (N3/H2).
5. **Scripted, idempotent deploy** (build-fail-hard + `/readyz` smoke gate + rollback) and **ship the Phase 01 branch** so prod matches the repo (H5).
6. **nginx hygiene** — consolidate the 3 duplicate `emenyu.com` server blocks; drop the moot `/frontend/` route post-Phase-01 deploy.
7. **Co-tenant port exposure** — loopback-bind or firewall `imli:3001`, `Greek:3002`, landing `:3005` (same class as N2; out of Trump scope here).
8. **Capacity (N4)** — 1 GB box runs 7 Node apps + Postgres with swap active and OOM-driven restarts; right-size or split tenants.
9. **Defense-in-depth** — a DO cloud firewall (allow 22/80/443 only) would back-stop all the loopback binds at the network edge.
10. **Password policy** — enforce the weak denylist + a longer minimum at set-time (the 6-char rule alone did not stop `123456789`).

---

**Phase 02B.1 is complete. The three active compromise paths are closed, Trump is operational, and a verified rollback snapshot exists. Proceed to Phase 02B.2 — Infrastructure Hardening.**
