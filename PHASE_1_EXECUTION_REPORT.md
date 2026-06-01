# Phase 1 — Production Baseline Cleanup: Execution Report

**Date:** 2026-06-02 · **Scope:** Trump only · **Status:** Local steps 1–5 complete & verified. **Server deploy (Step 6) NOT started — blocked on access (see §6).**

## Branches & commits
- **Pre-cleanup baseline:** `f2f0c6b` on `feat/waiter-ai-app` (your WIP committed as a checkpoint, demo media excluded).
- **Cleanup branch:** `chore/phase1-prod-cleanup`
  | commit | step |
  |---|---|
  | `b05f631` | 1 — security remediation |
  | `bc28e0b` | 2 — demo removal |
  | `53d924e` | 3 — external AI removal |
  | `f06d34d` | 4 — legacy cleanup |
  | `ea3fef1` | 5 — documentation |
- **Net change vs baseline:** 129 files, +338 / −11,024 lines.
- **Nothing pushed; nothing deployed.**

## Rollback plan (local — fully reversible)
| To undo | Command |
|---|---|
| All of Phase 1 | `git checkout feat/waiter-ai-app` (baseline `f2f0c6b`) or `git reset --hard f2f0c6b` on the cleanup branch |
| One step | `git revert <commit>` |
| One file | `git checkout f2f0c6b -- <path>` |
| Demo media (343 MB) | restored from `D:\tmp\trump-demo-media-backup\media` (moved out of repo, not deleted) |

---

# Step 1 — Security Remediation
**Files modified:** `server/utils/helpers.js`, `server/services/accountService.js`
**Removed:** `123456789` defaults for admin/waiter/kitchen; the boot-time password-reset (`demo`/`passwordFromEnv` refresh); plaintext password fallbacks in `verifyCredentials` and the dead plaintext login/basic-auth paths.
**Replaced with:** env-seeded passwords (`TRUMP_WAITER_PASS`/`TRUMP_KITCHEN_PASS`/`TRUMP_ADMIN_PASS`), seed-only-when-missing, and a production guard that rejects empty or known-weak/demo passwords (now also requires `TRUMP_KITCHEN_PASS`).
**Risk:** Medium (auth path). **Validation:** `node --check` both files; full boot — bad login returns `401 Invalid credentials`; no backdoor accepted.
**⚠️ Server follow-up required:** existing prod DB rows for admin/waiter/kitchen may still hold the old `123456789` hash. After deploy, set strong `TRUMP_*_PASS` and delete those rows so they re-seed (or change them in the admin UI). See §6.

# Step 2 — Demo Removal
**Deleted:** `server/config/trumpDemo.js`, `server/services/demoMediaService.js`, `client/src/config/trumpDemoConfig.ts`, `client/src/lib/demoMedia.ts`, `client/src/components/menu/FeaturedExperience.{tsx,module.css}`, `scripts/seed-waiter-demo.js`, `scripts/apply-demo-polish.js`; 343 MB `client/public/media/` moved to backup.
**Modified:** `aiService.js` (stripped all showcase/journey/event injection), `server.js` (removed DemoMediaService + public `/api/demo-media`), `helpers.js` (brand default `Trump`, not `Aurum & Ember`), and client `menuUtils`, `imageResolver`, `MenuPage`, `ItemModal`, `AdminPage` (removed Showcase Media panel + route), `App.tsx`, `constants/api`, `services/api`, `constants/waiter`, `package.json` (dropped `seed:waiter-demo`).
**Preserved:** real menu, orders, customers, recommendations, pairings, chat.
**Risk:** Medium-High (touched the recommendation engine + several UI files). **Validation:** `tsc` clean, `vite build` clean, AI smoke test returns only real menu items, `eventRec: null`.

# Step 3 — External AI Removal
**Deleted:** `server/services/nlg/llmNlgProvider.js` (Anthropic). **Modified:** `nlgService.js` (template-only; `status()` keeps `llmConfigured/llmAvailable=false`), `helpers.js` (removed `TRUMP_LLM_*` config).
**Kept:** `aiService.js`, `templateNlgProvider.js`, deterministic recommendations.
**Risk:** Low. **Validation:** no `anthropic`/`TRUMP_LLM`/`config.llm` refs remain; NLG sommelier line generated locally; `nlg-status → provider: template`. **Trump now makes zero outbound AI calls.**

# Step 4 — Legacy Cleanup
**Removed (tracked, git-recoverable):** `josh_enterprise/`, `josh_main.py`, `ChatBot.py`, `stt.py`, `tts.py`, `Requirements.txt`, `vosk-model/` (50 MB), `data/Voice.html`.
**Rationale:** none are referenced/spawned by the Node runtime (verified: no `child_process`/`spawn`/`python` refs). Browser Web Speech API (client) is unaffected.
**Risk:** Low. **Validation:** server module graph still loads; no runtime references.

# Step 5 — Documentation Cleanup
**Fixed:** `CLAUDE.md` (AI is local/deterministic, not LLM/Groq; sessions are HMAC cookies + Postgres, not in-memory).
**Created:** `README.md`, `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, `docs/AI.md`, `docs/SECURITY.md`.
**Consolidated to `docs/` (git mv):** DEPLOYMENT, PM2, NGINX, BACKUP_AND_DR, DATABASE.
**Archived 21** historical reports → `docs/archive/`. **Deleted 35** superseded/misleading docs (incl. the 3 Groq-wrong architecture maps and all FINAL_*/*_VALIDATION snapshots).
**Risk:** None (docs only). **Validation:** no surviving doc references a deleted file (verified in Phase 0.6).

---

# Local Validation Report

**Build status**
- Client `tsc --noEmit`: **exit 0** (no type errors).
- Client `vite build`: **exit 0** (built in ~1.6s; dist no longer carries the 343 MB media).
- Server `node --check` on all edited files: **OK**.
- Server full module graph (`require('./server/server.js')`): **loads cleanly** (no broken requires after deletions).

**Runtime smoke (real local Postgres, dev mode, port 3099)**
| Check | Result |
|---|---|
| Server boots | ✅ started, structured logs |
| `GET /healthz`, `/readyz` | ✅ served |
| `GET /Trump/table5` (SPA) | ✅ 200, index.html |
| `POST /api/chat` | ✅ 200 — **real menu** (Prime Steak & Lamb Chops, Rump Steak, Boerewors & Ribs), no demo dishes |
| `POST /api/recommend` | ✅ 200 — real items |
| `POST /api/auth/login` (bad creds) | ✅ 401 Invalid credentials — **no backdoor** |

**Test status:** No automated test suite exists in the repo (pre-existing gap). Validation above is build + manual smoke.
**Dependency status:** No npm dependency changes. Removed only the Python `Requirements.txt` (dead). `package.json` lost the `seed:waiter-demo` script.

---

# §6 — Server Deployment (Step 6): STOPPED — access required

I have the server **IP (134.122.99.78) and OS (Ubuntu)** but **cannot proceed**: I have no SSH key/password, no sudo, no DB credentials, and no network path to the host from this environment. Per your instruction I am stopping and reporting exactly what is needed.

### What I need from you to deploy
1. **SSH access** — a key (or user+password) for a user on `134.122.99.78`, and the SSH user/port.
2. **sudo** (for `systemctl`/Nginx reload) — or confirmation that the deploy user can run PM2 + reload Nginx without it.
3. **App path on server** — confirm (docs reference `/var/www/mysite/Emenyu/Trump` and `/var/www/emenuy/Trump`; they differ).
4. **DB access** — the `emenyu` Postgres user/password (for `pg_dump` and the account-rotation step), or confirm a DB admin will run those.
5. **Strong replacement passwords** to set in the server `.env`: `TRUMP_OWNER_PASS`, `TRUMP_MANAGER_PASS`, `TRUMP_WAITER_PASS`, `TRUMP_KITCHEN_PASS`, `TRUMP_ADMIN_PASS` (and confirm `TRUMP_SESSION_SECRET` stays the same to preserve sessions, or rotate intentionally).
6. **How code reaches the server** — push this branch to GitHub and `git pull` on the box, or rsync/scp? Confirm the method and whether the server has the GitHub remote.

### Deployment runbook (to run once access is granted — backup-first, no destructive step before backup)
```bash
# 0. Identify
ssh <user>@134.122.99.78
cd <APP_PATH>           # e.g. /var/www/mysite/Emenyu/Trump
git rev-parse HEAD ; git status ; pm2 list

# 1. Application backup (BEFORE any change)
ts=$(date -u +%Y%m%dT%H%M%SZ)
tar -czf ~/emenuy-trump-predeploy-$ts.tar.gz \
  -C <APP_PATH> server client/dist data food orders history tables uploads ecosystem.config.js .env

# 2. Database backup (BEFORE any DB change)
pg_dump -U postgres -h 127.0.0.1 emenyu > ~/emenyu-predeploy-$ts.sql

# 3. Record state
pm2 jlist > ~/pm2-predeploy-$ts.json ; systemctl is-active nginx postgresql

# 4. Pull code + build client
git fetch origin && git checkout chore/phase1-prod-cleanup && git pull
cd client && npm ci && npm run build && cd ..
npm ci --omit=dev
npx prisma generate --schema ../../prisma/schema.prisma

# 5. Set strong passwords in .env (owner/manager/waiter/kitchen/admin), keep TRUMP_SESSION_SECRET

# 6. Rotate the OLD weak account hashes (one-time): delete so they re-seed from env
#    psql -U postgres -h 127.0.0.1 -d emenyu -c "DELETE FROM \"User\" WHERE username IN ('admin','waiter','kitchen');"

# 7. Reload (zero-downtime) AFTER validation intent
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env

# 8. Smoke test
curl -fsS http://127.0.0.1:3012/healthz
curl -fsS http://127.0.0.1:3012/readyz
curl -I    http://127.0.0.1:3012/Trump/table1
# verify login with the NEW admin password; verify a guest can view menu, add to cart, place an order;
# verify waiter screens, QR deep-link (/Trump/<tableId>), kitchen board.
```
**Rollback on server:** `pm2 stop emenuy-trump-api` → restore `~/emenuy-trump-predeploy-$ts.tar.gz` and `psql ... < ~/emenyu-predeploy-$ts.sql` → `git checkout <old HEAD>` → `pm2 start`.

### Post-deploy validation (to fill after deploy)
Application starts ☐ · DB connectivity ☐ · Login ☐ · Menu rendering ☐ · Ordering ☐ · Waiter functions ☐ · QR deep-link ☐ · `/healthz` `/readyz` ☐ · PM2 0 restarts ☐ · error logs clean ☐

---

# Remaining Production Blockers
**Before a pilot restaurant**
- Server-side credential rotation (delete old `123456789` account rows; set strong env passwords) — code is ready, execution needs the server.
- No payments/settlement (guests cannot be charged).
- No automated DB backup schedule / restore drill in place (manual runbook only).
- No automated tests / CI.
- **Static base-dir serving** can expose non-public files (`data/`, `orders/`) — restrict `express.static` to `client/dist` + asset dirs. *(New finding; not yet fixed — out of Phase 1 scope.)*
- Real brand/menu confirmed for the restaurant (brand default is now neutral `Trump`).

**Before 10 restaurants**
- True multi-tenancy: `Restaurant` model, `restaurantId` on `User`, tenant-scoped queries + auth; today it is one process per restaurant.
- Drop dual-write (Postgres-only) or make it transactional/reconciled.
- Centralized logging + error tracking + alerting; CI/CD.

**Before 100 restaurants**
- Horizontal scaling: stateless app + Socket.IO Redis adapter (currently single PM2 fork, in-memory sockets); connection pooling, read replicas, CDN; self-serve onboarding/billing; HA Postgres + DR drills.

---

# Production Readiness Score (post Phase 1, local)
| Area | Score | Note |
|---|---:|---|
| Security | 6/10 | Backdoor/plaintext/reset removed, prod guard added; **server rotation pending**; CSP + static-dir exposure open |
| Reliability | 5/10 | Boots & serves cleanly; deterministic AI; but dual-write + no tests |
| Documentation | 8/10 | Accurate, consolidated, deduped; env/arch/security/AI now correct |
| Operations | 4/10 | PM2 + health + runbook + backups documented; no CI, no automated backups/monitoring |
| Scalability | 2/10 | Single process, in-memory sockets, single-tenant |
| **Overall** | **5/10** | A clean, honest single-restaurant build — pilot-ready after server credential rotation + payments; not yet multi-tenant/scale-ready |

*Up from the pre-cleanup ~3.5/10: backdoor closed, demo/Groq/AI-overclaim removed, docs truthful.*
</content>
