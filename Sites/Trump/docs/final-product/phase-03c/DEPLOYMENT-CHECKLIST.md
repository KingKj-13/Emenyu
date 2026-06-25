# DEPLOYMENT-CHECKLIST.md — Phase 03C Step 2

**Date:** 2026-06-25. **Target:** production droplet `134.122.99.78` (`/var/www/mysite/Emenyu/Trump`). **Result: ✅ deployed, migration applied, readyz OK.**

---

## Pre-deploy
- [x] Branch committed (4 logical commits) + pushed; **PR #3** opened against `master`.
- [x] Secrets/debug scan clean; `.env*`, `backups/`, `client/dist/` gitignored.
- [x] Migration reviewed — additive (`Shift`/`AuditLog`/`Notification` + `WaiterAssignment` cols + indexes) + drift reconciliation (drops 2 unused `MenuItemRecommendation` FKs, index renames). **No data loss.**
- [x] Client built locally (`vite build`, exit 0).
- [x] **Snapshot:** `/root/trump-deploy-snapshots/pre-phase03-20260625T054106Z/` — DB dump (276 K, 23 tables) + app code tar + `prisma-bak`.

## Sequence executed
1. [x] **Snapshot** (DB + app + prisma).
2. [x] **Sync schema + migration** → `/var/www/mysite/Emenyu/prisma/` (16 migrations).
3. [x] **`prisma migrate deploy`** → prod `emenyu`: *"All migrations have been successfully applied."* New tables verified (`Shift, AuditLog, Notification`).
4. [x] **Sync app code** (server + client/dist + server.js + scripts + ecosystem) via tar-over-ssh.
5. [x] **`prisma generate`** + **reload** + **`/readyz` gate** (auto-rollback armed).
6. [x] **Smoke:** healthz=200, menu=200.
7. [x] `pm2 save`.

## ⚠️ Deployment regression caught + fixed (see REGRESSION-REPORT)
`prisma generate --schema ../prisma/schema.prisma` wrote the client to `Emenyu/node_modules` (next to the schema), but the app loads `Trump/node_modules/@prisma/client` → the runtime client lacked the new models (`shift=undefined`). **Fix-forward:** synced the new schema to `Trump/prisma/schema.prisma` and regenerated from there → client emitted into `Trump/node_modules`; verified `shift=object auditLog=object notification=object`; reloaded. **This is the documented "local-stub" gotcha and must be encoded in `deploy-trump.sh` for the box** (generate from the Trump-local schema, not the root one).

## Rollback (not needed)
`deploy-trump.sh rollback <snap>` or: restore `app-code.tar.gz` + reload; DB restore from the snapshot dump (additive migration needs no rollback). Snapshot retained.

## Post-deploy state
- App online, uptime reset at deploy, **0 crash restarts** after; bound `127.0.0.1:3012` (lockdown intact); Postgres localhost-only.
- Production validation **15/15** (PRODUCTION-VALIDATION.md); performance nominal (PERFORMANCE-REPORT.md).
