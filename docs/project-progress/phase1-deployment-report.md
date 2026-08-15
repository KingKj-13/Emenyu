# Phase 1 — Recommendation Brain: Production Deployment Report

**Date:** 2026-07-05
**Target:** `emenyu.com` / production box `134.122.99.78`, PM2 process `emenuy-trump-api`
**Status:** ✅ **Deployed and verified live.** Awaiting your approval before Phase 2.

---

## Summary

Phase 1 (Recommendation Brain — confidence scoring, replacement-aware expected value, occasion detection, guest-aware recommendations) is now live in production. The deploy itself succeeded cleanly on the final attempt; getting there surfaced and fixed two real, previously-latent production issues unrelated to the Phase 1 feature code itself. Both are now permanently fixed in the deploy tooling.

---

## Deploy sequence

1. **Pre-deploy backup** — `backup-trump.sh` run before any change (DB dump + app data, checksummed).
2. **Code sync** — Phase 1 changes (12 files, already committed to git as `4bef456`) synced to the box via tar-over-ssh, verified byte-identical via checksum comparison on all 7 server-side files.
3. **Legacy site retirement** — performed in the middle of this deployment window (see `legacy-sites-retirement.md`), which also freed disk space needed to complete this deploy.
4. **Deploy script run** (`deploy-trump.sh`, `SKIP_CLIENT_BUILD=1`) — succeeded on the final attempt: `npm ci` → `prisma generate` (R1-safe) → `prisma migrate deploy` (0 pending — no schema change this phase) → client build skipped (pre-built `dist/` synced) → `pm2 reload` → readyz gate + smoke checks.
5. **Post-deploy verification** — see below.

---

## Incidents encountered during this deploy (both now permanently fixed)

### 1. Disk exhaustion — root cause fixed
The production disk (24GB) was already near capacity; the deploy's own pre-deploy safety snapshot archives the *whole* app directory, and because it included `Images/`/`Video/` (static assets that never change in a code deploy), every snapshot was ~4.4GB. This repeatedly starved `npm ci`/`prisma generate` of the disk space they needed, failing the deploy 4 times in a row before the pattern was identified.

**Permanent fix:** `deploy-trump.sh`'s snapshot step now excludes `Images/`/`Video/` — snapshots are ~10–50MB going forward (confirmed: the successful run's snapshot was 441MB including a full DB dump, vs. 4.4GB before). Media has its own separate backup path (`backup-trump.sh`); this snapshot is for code rollback only. Committed as `a806316`.

Separately, ~4.6GB was recovered by removing the retired Greek/Imli/AlPescatore sites (see cleanup report) and, with your explicit approval, by pruning superseded/corrupt deploy snapshots and the npm cache. Final disk state: **4.0GB free** (was 0 bytes free at the start of this incident).

### 2. Production `.env` overwritten by a code sync — recovered, permanently fixed
An earlier tar-over-ssh code sync in this session didn't exclude `.env`, silently overwriting production's working `Sites/Trump/.env` (containing `DATABASE_URL` and other secrets) with the local development copy, which lacks `DATABASE_URL`. The already-running app was unaffected (it had loaded its environment at its last startup, before this happened), but the deploy's own Prisma-client verification step correctly caught it before reaching `pm2 reload` — which is exactly what would have broken the live database connection.

**Recovery:** Found a pre-existing deploy snapshot (2026-07-02, predates this session) containing a working `.env`. Used it as the base, merged in the one key legitimately added to production since then (`TRUMP_WAITER_APK_URL`, value supplied by you), and validated the result three ways before proceeding: `scripts/validate-env.js` (status: ok), a direct `DATABASE_URL` presence check, and an actual Prisma-client database query against production.

**Permanent fix (two layers):**
- `DEPLOYMENT-RUNBOOK.md`'s documented sync command now explicitly excludes `.env` and `ecosystem.config.js`, with a warning explaining why (committed `5ef1499`).
- `deploy-trump.sh` now fails fast, before `npm ci` even runs, if `.env` is ever missing `DATABASE_URL` — catching this class of mistake immediately rather than after burning disk/time (same commit).

---

## Post-deployment verification

| Check | Result |
|---|---|
| `https://emenyu.com/` (company placeholder) | 200 |
| `https://emenyu.com/Trump/` (customer menu SPA) | 200 |
| `https://emenyu.com/Trump/api/menu` | 200, `Cache-Control: public, max-age=30` (Phase 05 cache behavior intact) |
| `https://emenyu.com/Trump/api/recommend` | 200 — **response confirmed carrying Phase 1 fields**: `confidence`, `expectedValue`, `netRevenueIncrease`, `replacement`, alongside all pre-existing fields |
| `https://emenyu.com/Trump/api/chat` (chatbot) | 200 |
| `https://emenyu.com/Trump/Waiter`, `/Admin`, `/Kitchen` | 302 → login (correct — auth guard working, unauthenticated request) |
| Images (current-convention filename) | 200 |
| Video (`Video/demo/steak-grill.mp4`) | 200 |
| Database | Prisma client verified connected (`order.clientOrderId`, `device`, `shift` models present); 19 migrations applied, 0 pending |
| Socket.IO | Not independently load-tested this session; `emenuy-trump-api` process healthy and serving other realtime-dependent endpoints normally |
| PM2 restart count | 97 → 98 (exactly +1, from the single intentional `pm2 reload` — no crash-restarts) |
| Rate-limit bypass | Confirmed OFF (`TRUMP_LOAD_TEST_BYPASS` not set) |
| Recent logs | No errors/exceptions/fatals in the post-deploy log tail |

**Known gap:** Socket.IO and the full waiter/admin/kitchen authenticated flows were verified structurally (correct auth redirects, process health) but not exercised end-to-end with real credentials in this session — recommend a manual pass per the Phase 1 manual testing checklist already provided, now that this is live.

---

## Files changed in this deployment (all on `feat/chatbot-reco-rework`, all pushed)

| Commit | What |
|---|---|
| `4bef456` | Phase 1 Recommendation Brain (12 files — see `phase1-recommendation-brain.md`) |
| `302b4ff` | Legacy site retirement (Greek/Imli/AlPescatore removed, docs updated) |
| `5ef1499` | Deploy-safety fix: never let a code sync overwrite `.env` again |
| `a806316` | Deploy-safety fix: exclude Images/Video from the pre-deploy snapshot |

No database migration was required for Phase 1 itself (0 pending migrations at deploy time). No new environment variables were required by the Phase 1 feature code (the `.env` incident was unrelated to Phase 1's own needs — it was a sync-mechanism bug).

---

## Waiting for your approval before Phase 2

Per your standing instruction: **not proceeding to Phase 2 automatically.** Let me know when you've had a chance to review this and the legacy-retirement report, and whether you'd like anything adjusted before moving forward.
