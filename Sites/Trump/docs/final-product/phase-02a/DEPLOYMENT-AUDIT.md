# DEPLOYMENT-AUDIT.md — Phase 02A Step 7

**Date:** 2026-06-24. **Method:** read-only inspection of the deployed tree, process args, backup/snapshot trail, and comparison with the repo runbook. **Answer: deployment is fully manual rsync-from-Windows with no version provenance, no script, and no automated rollback; the live code predates Phase 01. Blocker H5 remains OPEN.**

---

## 1. Actual deployment mechanism — manual rsync, no git

```
$ git -C /var/www/mysite/Emenyu/Trump rev-parse HEAD   → fatal: not a git repository
$ ls -la .../Trump/server.js                            → owner UID 197609 (Windows numeric UID)
$ readlink /proc/<trump-pid>/cwd                        → /var/www/mysite/Emenyu/Trump
```
**Conclusions:**
- The app is deployed by **rsync from a Windows workstation** (`.git` excluded → numeric Windows UID 197609 on files). The box holds a **working copy, not a checkout.**
- **No deployed commit SHA is recoverable** — version provenance relies on file mtimes and ad-hoc backup folder names. You cannot answer "what exactly is running?" precisely.
- The documented path (`/var/www/emenuy/Trump`) is **wrong**; the real path is `/var/www/mysite/Emenyu/Trump` (shared with the other restaurants under `/var/www/mysite`).

## 2. The deployed code is pre-Phase-01

```
$ ls -d .../Trump/frontend          → exists (vanilla UI not yet removed)
$ pm2 list | grep Recommend-Trump   → online: ./venv/bin/python recommend.py
$ ls .../Trump/client/dist/index.html → built 2026-06-23 19:24 (SPA present)
```
**Conclusion:** Production still has the **vanilla `frontend/`** and a **running `recommend.py`** — both removed in the Phase 01B branch. **The Phase 01 consolidation is built locally but NOT deployed.** The SPA *is* built and live (Phase 01A/earlier work shipped), but the legacy retirement has not reached prod. Repo (`feat/chatbot-reco-rework`, unpushed) is **ahead of** production.

## 3. The documented procedure vs reality

Repo runbook (`deployment/deployment trump.md`) describes: `rsync → npm ci --omit=dev → prisma generate → prisma migrate deploy → cd client && npm run build → pm2 reload → curl /readyz → smoke`. In practice the **backup trail confirms the manual cadence**:
```
/root/backups/…predeploy-20260621T163040Z.{tar.gz,dump}   ← hand-taken before a deploy
/var/www/mysite/Emenyu/Trump/backups/emenyu_predeploy2_20260622_135402.dump
/var/www/mysite/Emenyu/deploy-backups/dist-2026053{0}-*    ← multiple dated dist snapshots
/root/trump-deploy-backups/pre-*-20260531-*.tgz
```
**Conclusion:** Deploys are careful (operator takes DB + app + dist snapshots each time) **but entirely manual and improvised** — the snapshots are taken by hand with inconsistent names/locations, not by a script. Good instinct, no automation.

## 4. Failure points

| Step | Manual? | Failure point |
|---|---|---|
| rsync upload | ✅ | `--delete` can wipe persistent dirs if excludes are missed; Windows line-endings/UIDs |
| `npm ci` | ✅ | network/registry flake; no lockfile-pinned CI gate |
| **`cd client && npm run build`** | ✅ | **most common footgun** — `client/dist/` is gitignored; if the build is skipped/forgotten, a **stale or broken SPA** is served. (Here it was built — 06-23 19:24.) |
| `prisma migrate deploy` | ✅ | run by hand; easy to forget when schema changes (DB-ahead/behind-code risk) |
| `pm2 reload` | ✅ | fine (zero-downtime) but no post-reload automated smoke gate |
| smoke test | ⚠️ | `npm run smoke:test` exists but is run manually, if at all |

## 5. Rollback capability

- **Code rollback:** manual — restore a `predeploy` tarball or re-rsync an older tree, rebuild client, `pm2 reload`. No one-command rollback; depends on the right snapshot existing.
- **DB rollback:** manual `pg_restore` of a `predeploy` dump (feasible — see RESTORE-READINESS — but undocumented). Forward-only migrations mean additive changes need none; a destructive migration would require hand-written SQL.
- **No automated/scripted rollback, no health-gated auto-revert.**

## 6. Co-tenancy risk (deployment-adjacent)

The Trump deploy shares the droplet with imli/Greek/AlPescatore/Josh/Recommend/staging (PRODUCTION-STATE §4). A Trump deploy that exhausts memory or disk can **destabilize the other live restaurants** (and vice-versa). There is no resource isolation (no containers/cgroups per app).

---

## Verdict

| Check | Result |
|---|---|
| Repeatable deploy script | ❌ manual, multi-step |
| Version provenance (SHA) | ❌ rsync, no git on box |
| Client build safeguard | ❌ gitignored dist, easy to skip |
| Migration gating | ⚠️ manual |
| Automated smoke gate | ❌ |
| One-command rollback | ❌ manual snapshot restore |
| Live code = repo | ❌ prod is **pre-Phase-01** |
| Resource isolation from co-tenants | ❌ shared 1 GB box |

**HIGH H5 (deployment) status: 🔴 OPEN.** Phase 02B should add a **single idempotent deploy script** (fetch → `npm ci` → `prisma generate` → `migrate deploy` → **build client (fail hard if missing)** → `pm2 reload` → **`/readyz` smoke gate**, with a pre-deploy DB+app snapshot and a documented rollback), and **deploy the Phase 01 branch** so prod matches the repo.
