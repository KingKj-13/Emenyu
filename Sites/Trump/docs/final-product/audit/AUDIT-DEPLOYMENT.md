# AUDIT-DEPLOYMENT.md — Phase 00 Deployment Audit

**Scope:** `ecosystem.config.js`, `deploy/nginx/emenuy-trump.conf`, `.env.example`, `scripts/`, `deployment/*.md`. **Date:** 2026-06-24.

---

## 1. Summary

Deployment is **PM2 (single fork instance) behind nginx (TLS reverse proxy)** on a DigitalOcean droplet (`134.122.99.78`, app at `/var/www/emenuy/Trump`, port 3012), PostgreSQL 16/18 as the DB. The process model, health checks, graceful shutdown, and nginx hardening are solid. The gaps that matter for production are **operational, not architectural**: the nginx config ships with **placeholder domain/cert values**, there is **no automated database backup**, **no monitoring/alerting**, deploys are **manual/SSH with a build-on-box step**, and `client/dist/` is gitignored so a forgotten build serves a broken UI.

---

## 2. Process management (PM2)

- `ecosystem.config.js`: app `emenuy-trump-api`, `exec_mode: fork`, `instances: 1`, `autorestart`, `wait_ready`, `max_memory_restart: 768M`, `max_restarts: 10`, `exp_backoff_restart_delay`, structured log files under `logs/pm2/`.
- Graceful shutdown in `server/server.js` (SIGTERM/SIGINT → close sockets + DB, `shutdownTimeoutMs`). Good.
- `npm run pm2:start | pm2:restart (reload) | pm2:stop | pm2:logs`. Reload is zero-downtime.
- **Single instance = SPOF and one core** (see AUDIT-PERFORMANCE). No cluster, no second node.
- **Discrepancy:** ecosystem default `768M` vs `.env.example` `PM2_MAX_MEMORY_RESTART=512M`. Reconcile.

---

## 3. Reverse proxy (nginx)

`deploy/nginx/emenuy-trump.conf` is well-built:
- HTTP→HTTPS 301; TLS 1.2/1.3; ACME challenge location.
- Security headers (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS).
- `limit_req` zones: general 10r/s (burst 60), auth 5r/m (burst 10) — a second rate-limit layer in front of the app's.
- WebSocket upgrade for `/(Trump|trump)/socket.io/`; long read/send timeouts; `proxy_buffering off`.
- Static media cached 7d; `client_max_body_size 30m` (matches upload limit headroom).
- `/healthz` + `/readyz` proxied.

**Gaps:**
- **Placeholders not filled:** `server_name your-domain.example`, `ssl_certificate .../your-domain.example/...`. This file is a **template**, not the deployed config — confirm the live `/etc/nginx/sites-available/*.conf` has the real domain + Let's Encrypt certs.
- This is the file currently open in the IDE — likely the active editing target; ensure the deployed copy is in sync.

---

## 4. Environment / config

- `.env.example` is a complete, documented template (runtime, secrets, security tuning, order/tax rates, uploads, CSP, PM2, VAPID).
- Production **fails closed** without required secrets/strong passwords (`validateProductionConfig`) — strong.
- Root `.env` holds only `DATABASE_URL` for Prisma; Trump `.env` holds `TRUMP_*`.
- **Local vs prod gotcha (project memory):** Prisma CLI loads the root `.env` (= prod `DATABASE_URL`); always set `DATABASE_URL` explicitly when running migrations locally to avoid hitting prod.

---

## 5. Deployment process

From `deployment/deployment trump.md` + `WAITER_V2_DEPLOYMENT_REPORT.md`:
1. `git fetch && checkout && pull` (or rsync) on the box.
2. `npm ci --omit=dev`; `npx prisma generate --schema ../../prisma/schema.prisma`.
3. `npx prisma migrate deploy` (when migrations pending).
4. **`cd client && npm ci && npm run build`** — build on the box (or rsync `client/dist/`).
5. `pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env`; `curl /readyz`.
6. Smoke checks: `/Trump/Waiter`, `/Trump/api/menu`, `/healthz`, `/readyz`; `npm run smoke:test`.

**Risks:**
- **Manual, multi-step, SSH-based** — no CI/CD pipeline, no single deploy script. Error-prone (the build step is easy to skip).
- **`client/dist/` gitignored** — if neither built on box nor rsynced, the SPA is missing/stale. This is the most common deploy footgun here.
- Per project memory, the latest branch's **code deploy to the box was still pending (no SSH)** as of 2026-06-23 while the DB migration was already applied — a state where DB is ahead of code (here, safely, because the migration was additive).

---

## 6. Database migrations

- Prisma migrations via `npx prisma migrate deploy`. `migrate status` to verify.
- Latest (`WaiterTask`) is additive `CREATE TABLE IF NOT EXISTS` + indexes — idempotent, backward-compatible. Good migration hygiene.
- **No migration rollback strategy** beyond manual `DROP TABLE`. Forward-only migrations are fine, but document a tested rollback for risky ones.

---

## 7. Backup strategy

- **None automated in the repo.** `backups/` exists and is gitignored, created during first deploy (`mkdir -p ... backups`), but there is **no `pg_dump` cron, no documented restore procedure, no off-box copy**.
- Persistent JSON folders (`data/`, `orders/`, `history/`, `tables/`, `uploads/`) are preserved across deploys by rsync excludes — but also **not backed up**.
- **This is a production gap:** a DB loss or droplet failure has no documented recovery path. (See PRODUCTION-BLOCKERS.)

---

## 8. Logging

- Structured JSON logger (`utils/logger.js`) → stdout → PM2 log files (`logs/pm2/*-{out,error,combined}.log`), timestamped, `merge_logs:false`.
- Request logging middleware (`requestLogger.js`) with request IDs; security events logged (`rate_limit_*`, `cors_origin_blocked`, `auth_denied`, etc.).
- nginx access/error logs separate.
- **Gaps:** no log rotation configured for PM2 logs (needs `pm2-logrotate` or logrotate), no centralised/queryable log store. Disk could fill over time.

---

## 9. Monitoring

- **None.** Health endpoints (`/healthz`, `/readyz`) exist and are proxied, but nothing polls them externally; no uptime monitor, no alerting, no metrics (event-loop lag, p95, error rate), no APM.
- `readyz` does a real storage + menu-load check — good signal, currently unused by any monitor.

---

## 10. Restart / rollback

- **Restart:** `pm2 reload` (zero-downtime) / `pm2 restart`.
- **Rollback (code):** `git checkout <prev-sha> && cd client && npm run build && pm2 reload`. Manual.
- **Rollback (DB):** none automated; additive migrations need none, destructive ones would need manual SQL.

---

## 11. Findings / recommendations

| Severity | Finding | Action |
|---|---|---|
| BLOCKER | No automated DB backup or tested restore | Add nightly `pg_dump` + off-box copy + documented restore |
| HIGH | nginx config has placeholder domain/certs | Verify the deployed config has real domain + valid Let's Encrypt certs + auto-renew |
| HIGH | No monitoring/alerting on a single-instance SPOF | Add uptime monitor on `/readyz` + alerting; consider metrics |
| MEDIUM | Manual SSH deploy, easy to skip client build | Script the deploy (build → migrate → reload → smoke) or add CI/CD |
| MEDIUM | No PM2 log rotation | Install `pm2-logrotate` |
| LOW | 768M vs 512M memory-restart mismatch | Reconcile |
| LOW | No migration rollback runbook | Document for destructive migrations |
