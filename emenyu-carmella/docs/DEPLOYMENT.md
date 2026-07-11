# Deployment — Carmella by Sir Gaspard

**Status: not yet deployed.** Everything in this build was done and verified against local dev processes only. This document is the exact remaining checklist for a production rollout, following the same conventions already established for Trump/Demo (see `docs/project-progress/demo-steakhouse-decisions.md` in the main repo for the precedent this follows).

## Prerequisites on the droplet

1. Postgres: create the `emenyu_carmella` database (same server as `emenyu`/`emenyu_demo`).
2. Run the shared-schema migration against **every** existing tenant database, not just the new one:
   ```bash
   DATABASE_URL="<emenyu prod URL>"         npx prisma migrate deploy --schema prisma/schema.prisma
   DATABASE_URL="<emenyu_demo prod URL>"    npx prisma migrate deploy --schema prisma/schema.prisma
   DATABASE_URL="<emenyu_carmella prod URL>" npx prisma migrate deploy --schema prisma/schema.prisma
   ```
   Skipping Trump's or Demo's database here reproduces the exact regression this build caught locally (`GET /api/menu` breaks with "column MenuCategory.intro does not exist").

## Files to ship

- `Sites/Trump/server/` (all changes are additive/bugfixes, safe to deploy over the existing Trump server code — this **is** Trump's updated server).
- `Sites/Trump/client/dist/` — rebuild fresh: `cd Sites/Trump/client && npx vite build` (Trump's default build; verify no unintended diff before shipping).
- `Sites/Demo/client/dist/` — rebuild fresh: `npx vite build --mode demo --outDir ../../Demo/client/dist`.
- **New**: `Sites/Carmella/` in full — `server.js`, `.env` (create directly on the server per the existing convention, never sync a local `.env`), `scripts/import-menu.js`, `Images/` (optimized WebP + thumbnails only, ~15MB — **not** the raw JPGs).
- **New**: `Sites/Carmella/client/dist/` — build fresh: `npx vite build --mode carmella --outDir ../../Carmella/client/dist`.
- `Sites/Trump/ecosystem.config.js` — already updated with the `emenuy-carmella-api` PM2 app entry (port 3015, 512M memory cap).

## Carmella's production `.env`

Create directly on the server (never commit or sync a `.env` with real secrets). Same shape as the local dev `.env` in this repo, but with:
- Fresh, unique `TRUMP_SESSION_SECRET` and all five `TRUMP_*_PASS` values (do **not** reuse the dev secrets committed nowhere but present in this session's history — rotate them).
- `TRUMP_HOST=127.0.0.1` (loopback only, matching Trump's own production binding — never `0.0.0.0`).
- `DATABASE_URL` pointing at the production `emenyu_carmella` database.
- `NODE_ENV=production`.

## PM2

```bash
cd Sites/Trump
pm2 start ecosystem.config.js --only emenuy-carmella-api --env production
pm2 save
```

## nginx

Add a `location /Carmella/` block proxying to `127.0.0.1:3015` — a **direct reverse proxy**, not a path-rewrite. Unlike Demo (which needed `/demo/* → /Trump/*` rewriting because its internal routes were hardcoded to `/Trump`), Carmella's routes are natively `/Carmella/*` (see `ARCHITECTURE_DECISIONS.md` AD-001), so the nginx config is simpler — a straight `proxy_pass` with no path substitution.

## Data import (run once, safe to re-run)

```bash
cd Sites/Carmella
node scripts/import-menu.js
```

Idempotent — wipes and rebuilds Carmella's rows in one transaction, safe to re-run whenever `emenyu-carmella/data/carmella-menu-data.json` is updated.

## Post-deploy verification checklist

- [ ] `curl https://emenyu.com/Carmella/healthz` → 200
- [ ] `curl https://emenyu.com/Carmella/api/config` → correct `assistantName: "Gaspard"`, `currentDayPart` present
- [ ] `curl https://emenyu.com/Carmella/api/menu` → 190 items across 8 chapters
- [ ] Log in as `carmella-owner` with the production password, confirm the Admin dashboard loads
- [ ] Trump regression: `curl https://emenyu.com/Trump/healthz` and a real menu load — confirm nothing changed
- [ ] Demo regression: same, for `/demo/*`
- [ ] A real browser check of the menu at all three day-parts (see `TESTING.md` — this was not possible to verify in the build environment)

## Rollback

Every change to shared Trump code in this build is additive or a scoped bugfix — reverting the deploy (redeploy the previous `Sites/Trump/server` + `client/dist`) fully restores prior behavior for Trump and Demo. Carmella itself is new; rolling it back is simply stopping/removing the `emenuy-carmella-api` PM2 process and the nginx location block.
