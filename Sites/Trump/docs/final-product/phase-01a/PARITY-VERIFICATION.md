# PARITY-VERIFICATION.md — Phase 01A Final Parity Matrix

**Date:** 2026-06-24. **Rule:** every admin feature must be **MATCHED**, **SUPERSEDED**, or **DEPRECATED** — none may remain **MISSING**.

**Result: ✅ NO MISSING ITEMS.** React `/Admin` can fully replace vanilla `admin.html`.

---

## Parity matrix

| Feature | Vanilla (`admin.html` / `admin.js`) | React (`AdminPage.tsx`) | Status |
|---|---|---|---|
| Menu — list items | ✓ | ✓ | MATCHED |
| Menu — create item | ✓ | ✓ | MATCHED |
| **Menu — edit item fields** (name/desc/price/calories/allergens/spice/category) | ✓ | ✓ **(Phase 01A — `NewItemModal` edit mode + `PATCH /api/menu/items/:id`)** | **MATCHED** |
| Menu — availability toggle | ✓ | ✓ | MATCHED |
| Menu — media (upload/visibility/YouTube) | ✓ | ✓ | MATCHED |
| Menu — delete / bulk hide-show-delete | ✓ (delete) | ✓ (+bulk) | SUPERSEDED |
| Current Orders (complete/incomplete/delete) | ✓ | ✓ | MATCHED |
| Order History | ✓ | ✓ (+CSV export) | SUPERSEDED |
| Deal of the Day (CRUD) | ✓ | ✓ | MATCHED |
| Chef Recs | ✓ (create/delete) | ✓ (+inline update) | SUPERSEDED |
| **Legacy Recommendations** (`/api/recommendations`) | ✓ (authoring UI) | curation via Chef Recs + Bundles | **SUPERSEDED** (see below) |
| **Live customer-chat monitor** | ✓ (`newChatLog`) | ✓ **(Phase 01A — `LiveChatMonitor`)** | **MATCHED** |
| **Waiter-call live alerts** | ✓ (`waiterCallAlert`) | ✓ **(Phase 01A — `LiveChatMonitor`)** | **MATCHED** |
| Chat History | ✓ | ✓ | MATCHED |
| Accounts — list / create | ✓ | ✓ | MATCHED |
| **Accounts — suspend / activate** | ✓ | ✓ **(Phase 01A — `AccountRow` → `api.updateAccount`)** | **MATCHED** |
| **Accounts — assign tables** | ✓ (no effect) | not ported | **DEPRECATED** (dead field; see GAP-04) |
| Analytics | ✓ | ✓ (+trend/day-of-week/ratings/date presets) | SUPERSEDED |
| Service Desk (waiter tasks / approvals) | — | ✓ | React-only |
| Tables (live cart monitor + overrides) | — | ✓ | React-only |
| Reservations | — | ✓ | React-only |
| Bundles (Phase 5) | — | ✓ | React-only |
| QR Codes | — | ✓ | React-only |
| Reco Analytics (Phase 4) | — | ✓ | React-only |

**No row is MISSING.** ✅

---

## Legacy Recommendations — formal resolution

**Question (phase brief):** does the recommendation engine still consume the legacy `Recommendation` model?

**Answer: YES.** `aiService.generateRecommendations()` loads `getCachedRecommendations()` (= `fileService.loadRecommendations()` = the legacy `Recommendation` rows) and uses them at the **"Legacy admin recommendation groups (kept as a mid-tier fallback below chef)"** branch (`aiService.js:~1106`). So it is **NOT deprecated/dead** — it is **active-but-superseded**.

**Decision: STATUS = SUPERSEDED.**
- **Why safe to not port an authoring UI:** Chef Recs (per-item, higher-priority, with reasons) and Bundles fully cover the recommendation-curation need and are already in React. The legacy model is a lower-priority fallback; existing legacy data continues to be read by the engine unchanged (no behaviour change, no functionality loss for guests).
- **What replaced it:** `MenuItemRecommendation` (Chef Recs, Phase 3) + `RecommendationBundle` (Bundles, Phase 5).
- **Future deletion plan (separate phase, NOT Phase 01A):** once confirmed that no owner authors legacy recommendation groups, remove together: the vanilla authoring UI, the `/api/recommendations` GET/POST endpoints, the engine's mid-tier fallback branch, and the `Recommendation` model + its data. This is a coordinated backend+schema change and is explicitly out of Phase 01/01A scope.

---

## Regression results

| Check | Result |
|---|---|
| `tsc --noEmit` (client) | ✅ clean (exit 0) |
| `vite build` (client) | ✅ success — fresh `AdminPage` bundle emitted (the `npm`-wrapper exit 1 is the known sandbox pipe gotcha; `vite build` direct = exit 0) |
| `node --check` — `prismaMenuService.js`, `menuController.js`, `menuRoutes.js` | ✅ OK |
| `node scripts/reco-health.js --selftest` | ✅ 17/17 passed |
| Backend changes touch reco engine? | No — additive `updateItem` path only |
| Auth/roles changed? | No — new route uses existing `requireRoles(['owner','manager'])`; account perms unchanged |
| Schema/migration changed? | No |

> Runtime/manual checks (login flows, clicking Edit/Suspend, live chat with a real socket) require a running server + DB and are listed in `PHASE-01A-COMPLETION-REPORT.md` for the deploy environment; the static/type/build/self-test gates above all pass.

---

## Success criteria (phase brief)
- ✅ Gap 01 closed (menu editing)
- ✅ Gap 03 closed (live chat visibility)
- ✅ Gap 04 closed (account suspend/activate; assign-tables resolved as DEPRECATED)
- ✅ Legacy Recommendations formally resolved (SUPERSEDED)
- ✅ No functionality loss
- ✅ No backend regressions
- ✅ Matrix has no MISSING items → **React Admin can fully replace vanilla Admin**
