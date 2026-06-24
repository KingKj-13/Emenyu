# DELETION-REPORT.md — Phase 01B Step 4

**Date:** 2026-06-24. Each cleanup is its own commit. Tracked deletions are git-recoverable; untracked items were removed from the working tree only.

---

## Commit series

| Commit | Scope |
|---|---|
| `c48a0e6` | feat: React admin parity (Phase 01A) — *not a deletion; precedes cleanup* |
| `d3f88e4` | refactor: migrate /admin to React SPA + redirect admin.html |
| `9e47029` | chore(cleanup): remove dead **trump frontend/** static mockup (index.html + 30 PNGs + own package.json) |
| `bcc38d4` | chore(cleanup): remove unused **Python** scripts (recommend.py, pop_recommend.py, action_processor.py, create_qr.py) |
| `c416e2d` | chore(cleanup): retire **vanilla owner** UI (owner.html, owner.js, owner.css; redirect route kept) |
| `c78884c` | chore(cleanup): retire **vanilla waiter** UI + fallback (waiter.html, waiter-app.js, waiter.css; /waiter.html → redirect) |
| `3711f55` | chore(cleanup): retire **vanilla admin** UI + fallback (admin.html, admin.js, admin.css; SPA-only) |
| `bc8721e` | chore(cleanup): remove **remaining frontend/** assets + drop `directories.frontend` |
| `b9f0ee1` | chore(cleanup): remove **Python-era data artifacts** (learned_qa.json, speech.mp3, unknown_questions.json) |
| `b21b484` | chore(cleanup): remove **dead Butchery links** from React UI |

## Tracked files deleted (git-recoverable)

- **`trump frontend/`** — `index.html`, `.vscode/launch.json`, 30 `assets/*.png`, `package.json`, `package-lock.json`.
- **Python** — `recommend.py`, `pop_recommend.py`, `action_processor.py`, `create_qr.py`.
- **`frontend/`** (entire dir, 35 files) — scripts: `admin.js`, `waiter-app.js`, `owner.js`, `ui.js`, `book.js`, `page-flip.browser.js`, `cart.js`, `filters.js`, `login.js`, `api.js`, `deals-data.js`; pages: `butchery.html`, `drinks.html`, `login.html`, `menu.html`; components: 7 `*.html`; styles: `admin.css`, `owner.css`, `waiter.css`, `base.css`, `book.css`, `components.css`, `layout.css`.
- **Vanilla pages** (root) — `admin.html`, `waiter.html`, `owner.html`.
- **Data artifacts** — `data/learned_qa.json`, `data/speech.mp3`, `data/unknown_questions.json`.

**~74 tracked files removed.**

## Untracked items removed (working tree only — gitignored, not recoverable via git)

- `venv/` (Python virtualenv — regenerable), `josh_enterprise/` (dead Python package).
- `data/menu_embeddings.pkl`, `data/user_profiles.db`, `data/brain_memory.json` (Python-era).
- `validation-*.png` (11), `validation-server.log`, `validation-server.err.log`.

**Live `data/` files kept:** `accounts.json`, `chat_logs.json`, `knowledge.json`, `recommendation-bundles.json`, `deals.json`, `enrich-report.json`, `pairings/`.

## Code edits accompanying deletions

- `serveWaiterPage` / `serveAdminPage` — dropped `.html` fallbacks (SPA-only).
- `/waiter.html` route → redirect (was serving SPA shell at a `.html` URL).
- `fileService.ensureBaseFiles` — removed `directories.frontend` (no longer recreates an empty `frontend/`).
- `helpers.js` — removed the `frontend` directory definition.
- `SideDrawer.tsx` / `LandingPage.tsx` — removed Butchery links + now-unused `Beef` / `BASE_PATH` imports.

## ⚠️ Notable decision — the "Butchery" page

`frontend/pages/butchery.html` was **live-linked** from the React Landing page and SideDrawer (my Phase 00 audit wrongly called it orphaned). Investigation showed:
- It depended on the vanilla `ui.js → api.js/cart.js/filters.js` stack.
- Its collection data file **`Buchery.json` never existed** in the repo (current or git history) — the page only ever rendered an empty product grid.

⇒ It was an **abandoned stub**, not a working feature. The dead links were removed (no working functionality lost). **If a Butchery menu section is actually wanted, it must be built as a proper React feature** — flagged for a later phase. *(This is the one product decision in Phase 01B; raised explicitly for review.)*

## Verification after deletions

Server boots with `frontend/` gone; `tsc`/`vite build` clean; **16/16** runtime checks pass; no `/frontend/` references remain in `server/` or `client/src` (only intentional `.html`→React redirect routes). See `REGRESSION-REPORT.md`.

## Residual low-risk leftovers (not in Phase 01B scope; optional follow-up)

- Root legacy stubs `index.html`, `Menu.html`, `drinks.html`, `buchery.html` (tiny, not route-served; reachable only via direct static URL). Safe to delete in a follow-up.
- Unused `.butchery` CSS class + `I.butchery` icon entry in `LandingPage` (inert, cosmetic).
- Loose root `*.md` planning docs — consolidate under `docs/` later.
- `nginx` config has a `/frontend/` static-cache `location` block that is now moot (no error; can be trimmed on next nginx edit).
