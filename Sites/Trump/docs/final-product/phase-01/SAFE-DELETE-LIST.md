# SAFE-DELETE-LIST.md — Phase 01 Step 7

**Date:** 2026-06-24. Reference verification performed (grep across `server/`, `client/`, root configs; `git ls-files`; spawn/child_process check). **Per Rule 1, NOTHING here has been deleted — every item awaits explicit approval.** Risk = LOW only where there are **no imports, no runtime refs, no build refs, no deploy refs**.

**Reference-verification evidence:**
- `grep child_process|spawn` in `server/` → **no process spawning** (only regex `.exec()` calls). ⇒ Python scripts are never executed at runtime.
- `git ls-files` → `venv/`, `josh_enterprise/` are untracked; `frontend/`, `trump frontend/`, root `*.py`, root legacy `*.html` are tracked.
- `admin.js` referenced only by `admin.html` (served — see Group A, BLOCKED). `owner.js`/`waiter-app.js` referenced only by their own retired HTML.

---

## 🟢 LOW RISK — verified safe, awaiting approval (Step 8 eligible)

| # | Path(s) | Imports? | Runtime ref? | Build ref? | Deploy ref? | Suggested commit |
|---|---|---|---|---|---|---|
| S1 | `trump frontend/` (entire dir: `index.html`, 30 `assets/*.png`, own `package*.json`, `.vscode/`) | none | none | none (separate project) | excluded by deploy rsync | `chore(cleanup): remove dead trump-frontend static mockup site` |
| S2 | `recommend.py`, `pop_recommend.py`, `action_processor.py`, `create_qr.py` | none | **not spawned** | none | none | `chore(cleanup): remove unused Python recommendation scripts` |
| S3 | `josh_enterprise/` (untracked) | none | not spawned | none | none | working-tree only (not a commit) |
| S4 | `venv/` (untracked) | none | none | none | excluded by deploy | working-tree only |
| S5 | `data/menu_embeddings.pkl`, `data/user_profiles.db`, `data/brain_memory.json`, `data/speech.mp3`, `data/learned_qa.json`, `data/unknown_questions.json` | none in `server/` | none | none | persistent-dir (verify) | `chore(cleanup): remove Python-era data artifacts` |
| S6 | `owner.html`, `frontend/scripts/owner.js`, `frontend/styles/owner.css` | owner.html→owner.js only (self) | `/owner.html` route **redirects**, file not served | none | none | `chore(cleanup): remove retired owner vanilla UI` (keep redirect route) |
| S7 | `validation-*.png` (11), `validation-server.log`, `validation-server.err.log` | none | none | none | gitignored | working-tree cleanup |

> S3/S4 are untracked (gitignored) — remove from the working tree, not via commit. S5 needs a 1-line confirm that `fileService` doesn't read these on boot (Phase 00 found no reference).

---

## 🟡 MEDIUM RISK — verify one more reference before deleting

| # | Path(s) | Why MEDIUM | Required check before approval |
|---|---|---|---|
| M1 | `index.html`, `Menu.html`, `drinks.html`, `buchery.html` (root stubs) | Served by `express.static(base)` if a bookmarked URL hits them | Confirm no inbound links / no route depends on them |
| M2 | `food/Orders.json` | Legacy sample orders | Confirm `fileService` doesn't load it as fallback |
| M3 | `waiter.html`, `frontend/scripts/waiter-app.js`, `frontend/styles/waiter.css` | Reachable only via `serveWaiterPage` **error fallback** | Remove the fallback branch first (LEGACY-MIGRATION-PLAN Step 5), then deletion drops to LOW |

---

## 🔴 BLOCKED — do NOT delete (parity not met / live)

| # | Path(s) | Reason blocked |
|---|---|---|
| B1 | `admin.html`, `frontend/scripts/admin.js`, `frontend/styles/admin.css` | **Served live** at `/admin.html`; React `/Admin` is **missing 4 features** (`MISSING-FEATURES.md`). Delete only after Gaps #1 & #4 closed + route migrated. |
| B2 | Remaining `frontend/` orphans (`ui.js`, `book.js`, `page-flip.browser.js`, `cart.js`, `filters.js`, `login.js`, `api.js`, `deals-data.js`, `pages/*.html`, `components/*.html`, `styles/{base,book,components,layout}.css`) | Bundle with the `frontend/` directory removal **after** B1 is resolved (A1) — deleting `frontend/` piecemeal while `admin.html` still loads `admin.js`+`api.js` would break the live admin. |

> Note: vanilla `admin.html` loads `frontend/scripts/admin.js` **and** `frontend/scripts/api.js`. So `api.js` (and `admin.css`) are transitively LIVE until B1 is migrated. This is why the whole `frontend/` removal is gated on admin parity, not just the admin files.

---

## Recommended execution order (after approval)

1. **S1, S2, S3, S4, S7** — zero-reference dead weight (immediate, safe).
2. **S5, S6, M1, M2** — after the 1-line confirmations.
3. **M3** — after removing the waiter fallback branch.
4. **B1 + B2 (whole `frontend/`)** — only after `MISSING-FEATURES.md` Gaps #1/#4 closed and the admin route migrated.

Each group as its own commit (`chore(cleanup): …`), per Step 8.
