# Legacy Restaurant Retirement — Cleanup Report

**Date:** 2026-07-05
**Decision:** Project owner declared Trump the only active restaurant; Greek, Imli, and AlPescatore retired.
**Status:** Complete and verified. Trump fully operational throughout — zero downtime, zero data loss.

---

## Backup (completed and verified before any removal)

Full source, production data, config, and infrastructure definitions for all three sites were backed up to `dont_upload/legacy-retirement-backup-20260705/` (gitignored, local-only — see `MANIFEST.md` in that directory for the complete inventory). Summary:

| Site | Local repo backup | Production backup | Notes |
|---|---|---|---|
| Greek | 3.4GB | 1.8GB | Images (123 files) verified byte-identical between local and production copies |
| Imli | 45MB | 11KB | **Production was already broken** before this project touched it — only `node_modules` remained on disk, `server.js` and all data were already gone; `/Imli/` was already returning 404. The local repo copy is the only complete surviving copy. |
| AlPescatore | 45MB | 9.1MB | Lives at `/root/AlPescatore` on the box (a pre-existing deployment quirk, not standard path) |

Also captured: full PM2 process definitions, the complete active nginx config, and each site's `.env` (redacted from this report — see the backup's `env-files-snapshot.txt`, which is gitignored and treated as sensitive).

**Verification performed:** gzip integrity check on all 6 archives (all pass), full extraction to a scratch directory, `server.js` presence confirmed in every archive, image counts cross-checked (Greek: 123/123 match).

**Investigated finding:** Greek's `.env` contained a `DATABASE_URL` pointing at the same `emenyu` Postgres database Trump uses, plus a live Groq API key. Confirmed via code inspection that no Node code in any of the 3 legacy sites references a database driver (`pg`/`mongoose`) — the reference is dead/vestigial (a shared env-loading boilerplate comment in Greek's `server.js` explains it loads the root `.env` as a side effect without using it). **No real database ever existed for any of the 3 sites** — persistence was JSON files only, and `mongod` is confirmed inactive on the production box.

---

## What was removed

### Production server (134.122.99.78)
- **PM2 processes:** `Greek`, `imli`, `AlPescatore`, `Josh-Greek` (Greek's Python chatbot subprocess) — stopped, deleted, and the process list persisted so they don't reappear on reboot.
- **Files:** `/var/www/mysite/Emenyu/Greek` (freed ~3.4GB), `/var/www/mysite/Emenyu/Imli` (already near-empty), `/root/AlPescatore` (freed ~40MB).
- **nginx routes:** the `/AlPescatore/*`, `/Imli/*`, and root-level `/` (Greek, default handler) location blocks, plus each site's dedicated `/socket.io/` proxy block. Two stale duplicate config files (`mysite.backup`, `mysite.backup2`) sitting in `sites-enabled/` — each containing a full second copy of the same legacy routing — were also moved out.
- **Disk space recovered:** ~3.4GB immediately from file removal; combined with later deploy-snapshot cleanup, final state is **4.0GB free (was 0 bytes free)**.

### Local repository
- `Sites/Greek/`, `Sites/Imli/`, `Sites/AlPescatore/` (256 files including code, HTML, Python NLU modules, vosk speech models, images).
- `scripts/migrate-greek-menu.js`, `scripts/migrate-imli-menu.js`, `scripts/migrate-alpescatore-menu.js` — root scripts that existed only to support these sites.
- Corresponding `package.json` script entries (`menu:migrate:greek/imli/alpescatore`).
- `CLAUDE.md` and `README.md` updated to describe Trump as the only active restaurant, with a pointer to this report.

### Database rows
**None removed** — no real database existed for any of the 3 legacy sites (see Investigated finding, above). Nothing to clean up here.

### APIs / Routes
All API surface for the 3 sites was proxy-based (nginx → each site's own Node process on its own port) — removed entirely with the PM2 process + nginx block removal above. No shared API code, middleware, or routes in Trump's codebase referenced these sites (confirmed by search — the only "Greek"/"Imli"/"AlPescatore" matches remaining anywhere in Trump's own code/data are unrelated menu item names, e.g. Trump sells a "GREEK SALAD").

---

## What was intentionally kept

- `luxury/` — never touched, per standing instruction.
- Historical audit/phase documentation (`docs/archive/`, `PHASE_0_*.md`, `Sites/Trump/docs/final-product/phase-*`, `Sites/Trump/docs/phase2/`) that mentions the legacy sites — these are point-in-time historical records, not live configuration; rewriting them would falsify project history for no operational benefit.
- The full backup archive (`dont_upload/legacy-retirement-backup-20260705/`) — kept indefinitely unless you direct otherwise.

---

## New: EMenu Technologies placeholder page

Since Greek previously owned the bare domain root (`https://emenyu.com/`), removing it required a replacement (your decision, not a default I chose). Built a minimal static page per your exact spec:
- `company-website/index.html` + `style.css` — plain HTML/CSS, no framework, no Node, no dependency on Trump.
- Deployed to its own dedicated directory on the box (`/var/www/mysite/company-website/`), served directly by nginx — completely separate from `/var/www/mysite/Emenyu/Trump`.
- `https://emenyu.com/` now serves this placeholder ("EMenu Technologies — Coming Soon"); `https://emenyu.com/Trump/` is untouched and fully functional.

---

## Verification (post-cleanup)

| Check | Result |
|---|---|
| `https://emenyu.com/` | 200 — company placeholder loads |
| `https://emenyu.com/Trump/` | 200 — unaffected |
| `https://emenyu.com/Trump/api/menu` | 200 — unaffected |
| `https://emenyu.com/Imli/` | 404 — correctly retired |
| `https://emenyu.com/AlPescatore/` | 404 — correctly retired |
| `emenuy-trump-api` PM2 process | Never restarted during the entire legacy-retirement operation (uptime continuous throughout) |
| Disk space | 0 bytes free → 4.0GB free |

## Git commits (branch `feat/chatbot-reco-rework`)
- `302b4ff` — `chore(legacy): retire Greek, Imli, and AlPescatore -- Trump is now the only active restaurant`
