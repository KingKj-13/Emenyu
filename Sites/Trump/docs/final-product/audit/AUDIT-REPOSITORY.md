# AUDIT-REPOSITORY.md — Phase 00 Repository Audit

**Scope:** `Sites/Trump` only. **Date:** 2026-06-24. **Mode:** read-only audit, no deletions performed.

---

## 1. Summary

Trump's runtime is the **React SPA (`client/`) + modular Node/Express server (`server/`)**. Surrounding that core is a large amount of **superseded legacy material that is still committed to git**: an entire vanilla-JS frontend (`frontend/`), a separate static page-flip site (`trump frontend/`), root-level legacy HTML pages, and four orphaned Python scripts. Most of it is dead weight; one piece (`admin.html` + `frontend/scripts/admin.js`) is **still served live** and is the single most important duplication to resolve.

Counts (tracked files, excluding `node_modules`/`venv`):
- Active server modules: 14 controllers, 12 route files, ~33 services, 2 middleware, 3 utils.
- Active client: React 19 SPA (~90 `.tsx`/`.ts`/`.css` source files under `client/src`).
- Legacy vanilla frontend: 29 tracked files under `frontend/` (~330 KB of JS).
- Separate dead static site: `trump frontend/` (30 PNG page scans + index.html, tracked).
- Orphaned Python: 4 root scripts + `josh_enterprise/` (untracked) + `venv/` (untracked).

---

## 2. Active runtime tree (the part that ships)

```
Sites/Trump/
  server.js                     ← thin shim → server/server.js
  server/
    server.js                   ← Express app, mounts everything (433 LOC)
    controllers/  (14)          ← thin request handlers
    routes/       (12)          ← route registration
    services/     (33 + nlg/)   ← all business logic
    middleware/   security.js, requestLogger.js
    utils/        helpers.js, logger.js, weakPasswords.js
  client/
    src/                        ← React 19 + TS SPA (active customer + staff UI)
    dist/                       ← build output (gitignored, must be built on deploy)
  prisma → ../../prisma/schema.prisma   (root schema, 20 models)
  scripts/      (20)            ← migrations, seeds, validators, health/bench
  deploy/nginx/emenuy-trump.conf
  ecosystem.config.js           ← PM2
  Images/, Video/               ← static media (served at /Trump/Images, /Trump/Video)
  food/         DealOfDay.json, Orders.json  (legacy JSON, mostly migrated to PG)
  data/         accounts.json (fallback), chat_logs.json, knowledge.json, bundles…
  orders/ history/ tables/      ← JSON fallback persistence (gitignored)
```

This is healthy and well-structured. Findings below concern everything **outside** this set.

---

## 3. Duplicate systems (the core finding)

There are **two complete UI stacks** in the repo: the React SPA and the legacy vanilla frontend. The server has already retired most of the vanilla side, but not all.

| Surface | React (active) | Vanilla (legacy) | Server behaviour today | Status |
|---|---|---|---|---|
| Admin | `/Admin` `AdminPage.tsx` (109 KB) | `admin.html` + `frontend/scripts/admin.js` (61 KB) | `/admin.html` → **serves vanilla admin.html** (`orderController.serveAdminPage`) | **LIVE DUPLICATE** |
| Waiter | `/Waiter` `WaiterPage.tsx` + `pages/waiter/*` | `waiter.html` + `frontend/scripts/waiter-app.js` (65 KB) | `/waiter.html` → serves SPA index; `waiter.html` only as error fallback | Vanilla retired (fallback only) |
| Owner | `/Owner` `OwnerDashboard.tsx` | `owner.html` + `frontend/scripts/owner.js` | `/owner.html` → **302 redirect to `/Owner`** | Vanilla retired |
| Customer menu | `/:tableId/menu` `MenuPage.tsx` | `frontend/pages/menu.html` + `ui.js` (42 KB) + `book.js` (49 KB) | SPA fallback serves React; vanilla pages not routed | Vanilla orphaned |
| Kitchen | `/Kitchen` `KitchenPage.tsx` | *(none)* | React only | No duplicate |

**Key risk:** the live `admin.html` vanilla panel and React `/Admin` are two divergent admin UIs against the same API. Owners/managers can reach both; they drift in features and validation. This is the top repository-level cleanup item.

Other duplications:
- **Persistence is dual-pathed** — `prisma*Service.js` (Postgres, primary) **and** `fileService.js` JSON files (`orders/`, `history/`, `tables/`). Kept intentionally as a fallback, but it is duplicate logic that must stay in sync. (See AUDIT-BACKEND / AUDIT-DATABASE.)
- **Recommendation logic** is spread across ~15 services plus the legacy Python `recommend.py`/`pop_recommend.py`. Only the JS path is wired into the runtime.

---

## 4. Dead code / orphan files (tracked in git, not in the runtime path)

### 4a. Legacy vanilla frontend — `frontend/` (29 files, ~330 KB JS)
Not imported by the React build. Only `admin.js` (via `admin.html`) and `waiter-app.js`/`owner.js` (via retired routes) are reachable. The rest are orphaned:
- `frontend/scripts/`: `ui.js` (42 KB), `book.js` (49 KB), `page-flip.browser.js` (44 KB), `cart.js`, `filters.js`, `login.js`, `api.js`, `deals-data.js` — superseded by React equivalents.
- `frontend/pages/`: `menu.html`, `drinks.html`, `butchery.html`, `login.html` — not routed.
- `frontend/components/*.html`: 7 partials — not routed.
- `frontend/styles/`: 7 CSS files — only `admin.css` reachable via `admin.html`.

### 4b. Separate dead static site — `trump frontend/`
A whole second project directory (own `package.json`, `.vscode/`, `node_modules/`) containing **30 PNG page-scan images** + a 26 KB `index.html` — an earlier "flip-book" mockup. Entirely unreferenced by the server. ~Several MB of committed images.

### 4c. Root-level legacy HTML stubs
`index.html`, `Menu.html`, `drinks.html`, `buchery.html` — tiny (≤1 KB) legacy redirect/stub pages, not routed by the server (the root `/` and `/:tableId` routes serve the SPA). `admin.html`/`waiter.html`/`owner.html` covered in §3.

### 4d. Orphaned Python (tracked, **not used at runtime**)
- `recommend.py` (13 KB), `pop_recommend.py` (7.5 KB), `action_processor.py`, `create_qr.py` — the recommendation engine is now 100% JavaScript (`aiService.js`). These are remnants of an earlier Python recommender. No Node process spawns them.
- `data/menu_embeddings.pkl` (200 KB), `data/user_profiles.db` (SQLite), `data/brain_memory.json`, `data/speech.mp3`, `data/learned_qa.json`, `data/unknown_questions.json` — Python-era data artifacts, unused by the JS runtime.

### 4e. Untracked but present in working tree
- `venv/` — Python virtualenv (gitignored, ~hundreds of MB; scikit-learn, scipy, werkzeug visible). Not used by Node.
- `josh_enterprise/` — Python chatbot package (gitignored; note the malformed directory literally named `{nlu,dialogue,memory,...}` — a brace-expansion mkdir that failed on Windows). Not spawned by Trump's server.

### 4f. Scattered audit/planning docs at repo root
9 markdown reports live loose in `Sites/Trump/` (`CHATBOT_RECO_AUDIT.md`, `MANAGEMENT_UI_AUDIT.md`, `MENU_CONTAMINATION.md`, `MENU_ENRICHMENT_PLAN.md`, `PHASE3_ENGINE_PLAN.md`, `PRODUCTION_PHASE_CHECK.md`, `PRODUCTION_READINESS.md`, `GO_NO_GO_REPORT.md`, `WAITER_V2_MIGRATION_PLAN.md`) plus `docs/phase1..phase7/`. Harmless but should be consolidated under `docs/`.

### 4g. Validation artifacts
`validation-*.png` (11 screenshots, ~5 MB) + `validation-server.log` at root — gitignored, but present in the working tree and clutter the directory.

---

## 5. Unused assets

- `trump frontend/assets/*.png` (30 files) — dead.
- `data/*.pkl`, `data/*.db`, `data/speech.mp3` — Python-era, unused.
- `food/Orders.json` — legacy sample orders (orders now in Postgres / `orders/`).

`Images/` and `Video/` are **in use** (served and referenced by `imageResolver.ts`) — do **not** treat as unused.

---

## 6. Abandoned experiments

- Python recommender (`recommend.py`, `pop_recommend.py`, `josh_enterprise/`, embeddings `.pkl`) — replaced by deterministic JS engine.
- `trump frontend/` flip-book static site — replaced by React `BookViewer`.
- Vanilla SPA (`frontend/`) — replaced by React, except live `admin.html`.

---

## 7. Recommendations (for DELETE-CANDIDATES.md — approval required)

1. **Migrate the admin panel fully to React `/Admin`, then retire `admin.html` + `frontend/`** (the one live duplicate). Highest value.
2. Remove `trump frontend/` (dead static site, large).
3. Remove orphaned Python (`*.py`, `josh_enterprise/`, `venv/`, `data/*.pkl|*.db|*.mp3`).
4. Remove root HTML stubs (`index.html`, `Menu.html`, `drinks.html`, `buchery.html`).
5. Consolidate loose root `*.md` into `docs/`.

All deletions are itemised with risk levels in **DELETE-CANDIDATES.md**. No file was deleted in this phase.
