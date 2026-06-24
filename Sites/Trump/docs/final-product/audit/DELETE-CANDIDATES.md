# DELETE-CANDIDATES.md — Phase 00 Deletion Candidates

**Scope:** `Sites/Trump` only. **Date:** 2026-06-24.

> ⚠️ **Per Phase 00 Rule 2, NOTHING in this list has been deleted.** Every entry is documented for review. **Deletion requires explicit approval.** Risk levels: **LOW** = safe to remove after a build/smoke check; **MEDIUM** = needs a verification step first; **HIGH** = remove only after a migration/parity task.

---

## Group A — Legacy vanilla frontend (`frontend/`)

### A1. `Sites/Trump/admin.html`  +  `Sites/Trump/frontend/scripts/admin.js`  +  `frontend/styles/admin.css`
- **Reason:** Vanilla admin panel, superseded by React `/Admin` (`AdminPage.tsx`).
- **Imports found:** `admin.html` loads `frontend/scripts/admin.js`, `frontend/styles/admin.css`, `api.js`.
- **References found:** **STILL SERVED LIVE** — `server/server.js:270` → `orderController.serveAdminPage` → `res.sendFile('admin.html')`.
- **Risk:** **HIGH** — live route. Do **not** delete until React `/Admin` has confirmed feature parity AND `serveAdminPage` is switched to serve the SPA `index.html` (mirror `serveWaiterPage`).
- **Recommendation:** Parity-check → repoint route → then delete.

### A2. `Sites/Trump/waiter.html`  +  `frontend/scripts/waiter-app.js`  +  `frontend/styles/waiter.css`
- **Reason:** Vanilla waiter panel, superseded by React `/Waiter`.
- **References found:** `serveWaiterPage` serves the SPA; `waiter.html` only used as an **error fallback** (`waiterController.js:26`).
- **Risk:** **MEDIUM** — only reachable if SPA `sendFile` errors. Remove the fallback line, then delete.
- **Recommendation:** Drop the fallback branch in `serveWaiterPage`, then delete files.

### A3. `Sites/Trump/owner.html`  +  `frontend/scripts/owner.js`  +  `frontend/styles/owner.css`
- **Reason:** Vanilla owner panel, superseded by React `/Owner`.
- **References found:** `server/server.js:281` → `owner.html` route only **302-redirects** to `/Trump/Owner`; the HTML file itself is not served.
- **Risk:** **LOW** — file unused; keep the redirect *route* (or repoint it) but the HTML/JS/CSS can go.
- **Recommendation:** Delete the three files; keep/adjust the redirect route.

### A4. Remaining `frontend/` orphans (not routed at all)
`frontend/scripts/`: `ui.js`, `book.js`, `page-flip.browser.js`, `cart.js`, `filters.js`, `login.js`, `api.js`, `deals-data.js`
`frontend/pages/`: `menu.html`, `drinks.html`, `butchery.html`, `login.html`
`frontend/components/`: `bottom-cart.html`, `cart.html`, `category-section.html`, `chat.html`, `filter-bar.html`, `header.html`, `menu-card.html`
`frontend/styles/`: `base.css`, `book.css`, `components.css`, `layout.css`
- **Reason:** Superseded by React; not referenced by the server or the React build.
- **References found:** None in `server/` routes or `client/`.
- **Risk:** **LOW** (after A1–A3 resolved, the whole `frontend/` dir can go).
- **Recommendation:** Delete with the rest of `frontend/` once A1 is migrated.

---

## Group B — Separate dead static site

### B1. `Sites/Trump/trump frontend/` (entire directory)
- **Contents:** `index.html` (26 KB), 30 `assets/trumps*-page-*.png`, own `package.json`/`package-lock.json`, `.vscode/`, `node_modules/`.
- **Reason:** Earlier flip-book mockup site, replaced by React `BookViewer`. Completely unreferenced.
- **References found:** None.
- **Risk:** **LOW**.
- **Recommendation:** Delete the directory (largest single cleanup by size).

---

## Group C — Orphaned Python (recommender era)

### C1. Root Python scripts: `recommend.py`, `pop_recommend.py`, `action_processor.py`, `create_qr.py`
- **Reason:** The recommendation engine is now 100% JS (`aiService.js`). No Node process spawns these.
- **References found:** None in `server/` (no `child_process`/`spawn` of python).
- **Risk:** **LOW** (verify no ops script/cron references them).
- **Recommendation:** Delete after a `grep` for `spawn`/`python` in scripts confirms zero callers.

### C2. `Sites/Trump/josh_enterprise/` (untracked)
- **Reason:** Python chatbot package, not used by Trump's Node runtime. Contains a malformed dir literally named `{nlu,dialogue,...}`.
- **Risk:** **LOW** (gitignored; working-tree only).
- **Recommendation:** Delete from working tree.

### C3. `Sites/Trump/venv/` (untracked)
- **Reason:** Python virtualenv (scikit-learn/scipy/etc.) for the dead Python code. Hundreds of MB.
- **Risk:** **LOW** (gitignored).
- **Recommendation:** Delete from working tree.

### C4. Python-era data artifacts in `data/`
`menu_embeddings.pkl` (200 KB), `user_profiles.db` (SQLite), `brain_memory.json`, `speech.mp3`, `learned_qa.json`, `unknown_questions.json`
- **Reason:** Produced/consumed by the Python recommender; unused by the JS runtime.
- **References found:** None in `server/`.
- **Risk:** **MEDIUM** — confirm no JS service reads them before deleting (grep `data/` filenames).
- **Recommendation:** Verify, then delete.

---

## Group D — Root legacy HTML stubs

### D1. `Sites/Trump/index.html`, `Menu.html`, `drinks.html`, `buchery.html`
- **Reason:** Tiny (≤1 KB) legacy stub/redirect pages; the server serves the SPA for `/`, `/:tableId`, etc.
- **References found:** Not routed by `server/server.js` (root + `:tableId` → SPA/controllers).
- **Risk:** **MEDIUM** — confirm static middleware (`express.static(base)`) isn't relied on to serve any of these directly via a bookmarked URL.
- **Recommendation:** Verify no inbound links, then delete.

---

## Group E — Loose docs & artifacts (housekeeping)

### E1. Root markdown reports
`CHATBOT_RECO_AUDIT.md`, `MANAGEMENT_UI_AUDIT.md`, `MENU_CONTAMINATION.md`, `MENU_ENRICHMENT_PLAN.md`, `PHASE3_ENGINE_PLAN.md`, `PRODUCTION_PHASE_CHECK.md`, `PRODUCTION_READINESS.md`, `GO_NO_GO_REPORT.md`, `WAITER_V2_MIGRATION_PLAN.md`
- **Reason:** Historical planning docs scattered at root.
- **Risk:** **LOW** — **move, don't delete** (move under `docs/`).
- **Recommendation:** Consolidate into `docs/`; keep for history.

### E2. `validation-*.png` (11 files), `validation-server.log`, `validation-server.err.log`
- **Reason:** Old validation screenshots/logs at root (gitignored).
- **Risk:** **LOW**.
- **Recommendation:** Delete from working tree.

### E3. `food/Orders.json`
- **Reason:** Legacy sample orders; orders now in Postgres.
- **Risk:** **MEDIUM** — confirm `fileService` fallback doesn't read it on boot.
- **Recommendation:** Verify, then delete.

---

## DO NOT DELETE (explicitly in use)

- `Images/`, `Video/` — served and referenced by `imageResolver.ts`.
- `client/`, `server/`, `scripts/`, `prisma` (root), `ecosystem.config.js`, `deploy/`, `.env.example`.
- `data/accounts.json`, `data/chat_logs.json`, `data/knowledge.json`, `data/recommendation-bundles.json`, `data/deals.json`, `data/pairings/`, `trump_hero_pairings.json` — runtime data/fallbacks.
- `food/DealOfDay.json` — read by `fileService.loadDeals`.
- Persistent dirs `orders/`, `history/`, `tables/`, `uploads/`.

---

## Suggested deletion order (after approval)

1. **E2, B1, C2, C3** (LOW, zero references) — immediate space win.
2. **C1, C4, D1, E3** (LOW/MEDIUM, after grep verification).
3. **A3** then **A2** (retire fallbacks).
4. **A1 + A4 (whole `frontend/`)** — only after React `/Admin` parity + route repoint. **HIGH.**
5. **E1** — move to `docs/` (housekeeping, anytime).
