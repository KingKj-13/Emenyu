# DEPLOYMENT-AUTOMATION.md — Phase 02B.2 P5 + Step 8

**Date:** 2026-06-24. **Goal:** replace the manual SSH deploy with a fail-hard, snapshot-and-rollback script; then deploy the Phase 01 branch to production. **Status: ✅ `deploy-trump.sh` written; ✅ Phase 01 branch deployed live + verified.**

---

## 1. `deploy-trump.sh`

`Sites/Trump/scripts/deploy-trump.sh` — runs on the box **after** code is synced into `$APP_DIR`. Fail-hard (`set -euo pipefail`); each step exits non-zero with a rollback hint.

Steps: **1** pre-deploy snapshot (DB dump + app tar + `.env`/`ecosystem`) → **2** `npm ci --omit=dev` → **3** `prisma generate` → **4** `prisma migrate deploy` → **5** client build (or `SKIP_CLIENT_BUILD=1`) → **6** `pm2 reload` → **7** `/readyz` gate (20× retry) + `/healthz` + `/Trump/api/menu` smoke. Plus a **`rollback <snapshot-dir>`** subcommand (restores code, optionally the DB, reloads).

**Box-specific env (this droplet's layout differs from the repo):**
```bash
TRUMP_PRISMA_SCHEMA=/var/www/mysite/Emenyu/prisma/schema.prisma \
SKIP_CLIENT_BUILD=1 \
/usr/local/sbin/deploy-trump.sh
```
- The schema is at `../prisma` (`/var/www/mysite/Emenyu/prisma`), **not** the repo's `../../prisma` (the box has `Emenyu/Trump`, the repo has `Emenyu/Sites/Trump`). The default in the script will be wrong here — set `TRUMP_PRISMA_SCHEMA`.
- `SKIP_CLIENT_BUILD=1` is recommended: the **1 GB box can OOM** building Vite; build on the workstation and sync `client/dist` instead (see §2). Watch the local-`prisma`-stub gotcha if you do run `prisma generate` on the box.

## 2. Step 8 — Phase 01 branch deployed to production

`feat/chatbot-reco-rework` was deployed live. Because **rsync is absent on the Windows workstation**, code was shipped via **tar-over-ssh**, and because **deps + migrations were identical** to prod (verified below), this was a safe **code-only** deploy (no `npm ci`/`generate`/`migrate` needed):

```
repo deps == box deps          ✅ identical (10 deps + ws override)
repo migrations == box         ✅ both 15; "Database schema is up to date!"
```

Procedure executed (with auto-rollback gate):
1. Built client locally (`vite build` → `client/dist`, exit 0).
2. Pre-deploy snapshot: `/root/trump-deploy-snapshots/pre-phase01-20260624T193204Z/` (DB dump + app code tar).
3. `tar -czf - server client/dist scripts server.js package.json package-lock.json ecosystem.config.js | ssh … | tar -xzf` into `$APP_DIR`.
4. Retired legacy: `rm -rf frontend; rm -f admin.html waiter.html owner.html recommend.py pop_recommend.py action_processor.py create_qr.py`.
5. `pm2 stop Recommend-Trump` → **readyz gate** (auto-rollback if unhealthy) → `pm2 delete Recommend-Trump` → `pm2 save`.

## 3. Step 8 — verification (evidence)

| Check | Result |
|---|---|
| `/readyz` after reload | ✅ ready (gate passed; no rollback) |
| **Authenticated `/Trump/Admin` = React SPA** | ✅ 2199 bytes, `<div id="root">`, 9× `/Trump/assets/`, **0** vanilla `admin.js` |
| `/Trump/table1`, `/Trump/api/menu` (TLS) | ✅ 200 |
| SPA asset (`/Trump/assets/index-*.js`) | ✅ 200, `text/javascript` |
| `/Trump/admin.html`, `/Trump/waiter.html` | ✅ 302 → login (bookmarks redirect, not 404) |
| `frontend/` on box / `/Trump/frontend/*` | ✅ removed / 404 |
| `recommend.py` process + `:5002` | ✅ gone (`Recommend-Trump` deleted, `pm2 save`) |
| `:3012` bind | ✅ still `127.0.0.1` (02B.1 lockdown intact) |
| Co-tenants (`emenyu.com/`) | ✅ 200 (unaffected) |
| Disk | ✅ 85% |

**Result:** production now runs the consolidated **React-only** UI; the vanilla `frontend/` and the orphaned Python `recommend.py` are retired. Prod == repo branch.

## 4. Remaining manual element (honest note)

Code **sync** is still manual (tar-over-ssh; no rsync on Windows, no CI). `deploy-trump.sh` automates everything **on the box** (snapshot→deps→prisma→build→reload→smoke→rollback). A future improvement (Phase 03): a workstation-side wrapper that builds, syncs (`scp`/`rsync`), and invokes `deploy-trump.sh` — or a CI pipeline — to remove the last manual step. The branch is **deployed but still unpushed/unmerged**; pushing/merging is a separate action.

---

## Verdict

| Requirement | Status |
|---|---|
| Deploy script (snapshot→…→readyz, fail-hard) | ✅ |
| Rollback path | ✅ `deploy-trump.sh rollback <snap>` + auto-rollback gate |
| Phase 01 branch deployed | ✅ live + verified |
| React-only UI, legacy removed | ✅ |

**H5 (deployment): substantially CLOSED** (on-box automated, rollback-safe; workstation sync + CI is the remaining Phase 03 polish).
