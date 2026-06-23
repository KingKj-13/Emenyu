# Waiter Assistant V2 — Deployment Report

**Branch:** `feat/chatbot-reco-rework`
**Date:** 2026-06-23
**Commits:** `46db4bd` → `13cf234` → `c0b75de` → `451c7a2`

---

## Status

| Step | State |
|---|---|
| Code (server + client) | ✅ committed (4 logical commits) |
| TypeScript typecheck | ✅ `tsc --noEmit` clean |
| Client production build | ✅ `vite build` — 2297 modules, WaiterPage chunk 37.5 kB / CSS 37 kB |
| Server syntax | ✅ `node --check` on all changed files |
| Validators | ✅ reco 41/41 · reco-health 17/17 · chat 38/38 · phase5 17/17 |
| Smart pairing engine | ✅ 783 edges, real pairings + CSV reasoning verified |
| DB migration — **local** (`emenyu_local`) | ✅ applied |
| DB migration — **prod** (`134.122.99.78/emenyu`) | ✅ applied (single additive `WaiterTask` table) |
| Code deploy to prod box | ⏳ **needs SSH** — commands below |

The prod DB migration was the only pending one (`20260622120000_waiter_workflow_tasks`); it is a purely additive `CREATE TABLE IF NOT EXISTS` + indexes, idempotent and backward-compatible with the currently-running app, so applying it ahead of the code deploy is safe.

---

## Remaining: deploy the code to the prod box

I don't have SSH credentials to `/var/www/emenuy/Trump`, so run these on the box (or from local). The client `dist/` is gitignored, so it must be built on the server after pull (or rsynced).

```bash
# 1. On the server: pull the branch
cd /var/www/emenuy/Trump
git fetch origin && git checkout feat/chatbot-reco-rework && git pull

# 2. Install (server already had the WaiterTask migration applied from local)
npm ci --omit=dev
npx prisma generate --schema ../../prisma/schema.prisma   # client knows WaiterTask

# 3. Build the React client on the box
cd client && npm ci && npm run build && cd ..

# 4. (Migration already applied to prod DB. To re-verify:)
npx prisma migrate status --schema ../../prisma/schema.prisma   # -> all applied

# 5. Zero-downtime reload
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
curl -fsS http://127.0.0.1:3012/readyz
```

If deploying by rsync instead of git-on-box, build the client locally first (`cd Sites/Trump/client && npm run build`) and include `client/dist/` in the rsync (it is gitignored but must reach the server).

### Smoke checks after deploy
```bash
curl -I  http://127.0.0.1:3012/Trump/Waiter         # waiter SPA
curl -fsS http://127.0.0.1:3012/Trump/api/floor      # (needs waiter session cookie -> 401 unauth is expected)
curl -fsS http://127.0.0.1:3012/healthz
curl -fsS http://127.0.0.1:3012/readyz
```

---

## Rollback

- **Code:** `git checkout <previous-sha> && cd client && npm run build && pm2 reload …`
- **DB:** the migration only *adds* the `WaiterTask` table; nothing else changed. No rollback needed for forward compatibility. To remove it manually: `DROP TABLE "WaiterTask";` (only if you intend to fully revert).
