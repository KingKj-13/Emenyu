# ADMIN-PARITY-CHECKLIST.md — Phase 01 Step 1

**Compared:** `admin.html` + `frontend/scripts/admin.js` (61 KB) + `frontend/styles/admin.css` **vs** `client/src/pages/AdminPage.tsx` (109 KB) and its sub-components. **Date:** 2026-06-24.

**Result: PARITY NOT MET.** React's admin is a *superset in most areas* (it adds Service Desk, Tables, Reservations, Bundles, QR Codes, Reco Analytics) but is **missing four capabilities that exist only in the vanilla admin**. Per Phase 01 Step 3, this **blocks** retiring `admin.html`. The gaps are detailed in `MISSING-FEATURES.md`.

---

## 1. Tab/feature inventory

| Vanilla tab (`admin.html`) | Vanilla capability | React tab | React capability | Parity |
|---|---|---|---|---|
| Menu Editor | List items; **create**; **edit ALL fields** (name, price, description, calories, allergens, spice); media upload; image/video visibility; availability; delete; **add category / subcategory** | Menu | List items; **create** (NewItemModal); availability toggle; media (upload/visibility/youtube); bulk hide/show/delete; delete | ⚠️ **PARTIAL — see Gap #1** |
| Current Orders | List active orders; complete; incomplete; delete | Orders | List active; complete; delete | ✅ (incomplete action minor — see note) |
| Order History | List settled orders | History | List settled; **export CSV** | ✅ (React superset) |
| Deal of the Day | List/create/edit/hide/delete deals | Deals | List/create/edit/delete deals (NewDealModal) | ✅ |
| Recommendations (`/api/recommendations`) | Manage legacy Recommendation sets | *(none)* | API exists in `api.ts` but **no UI** | ❌ **Gap #2** |
| Chef Recs | List/create/delete chef recs | Chef Recs | List/create/update/delete chef recs | ✅ (React superset: inline update) |
| Current Chat | **Live** socket feed: `newChatLog` + `waiterCallAlert`; desktop notifications | *(none in admin)* | Chat Logs = **history only** | ❌ **Gap #3** |
| Chat History | Search/refresh chat logs | Chat Logs | View chat logs (`/api/chat-history`) | ✅ |
| Accounts | List; **create**; **suspend/activate**; **assign tables** | Accounts | List (read-only); **create** | ❌ **Gap #4 (manage actions missing)** |
| Analytics | Summary/items/tables/hours; Load / Today | Reports | Summary/items/tables/hours + **trend + day-of-week + ratings + date presets** | ✅ (React superset) |
| — | — | Service Desk | Waiter task queue, birthday approvals, live socket | ➕ React-only |
| — | — | Tables | Live cart monitoring + admin overrides (socket) | ➕ React-only |
| — | — | Reservations | Full booking management | ➕ React-only |
| — | — | Bundles | Phase 5 recommended-order bundles CRUD | ➕ React-only |
| — | — | QR Codes | QR generation panel | ➕ React-only |
| — | — | Reco Analytics | Phase 4 recommendation lifecycle dashboard | ➕ React-only |

---

## 2. Confirmed gaps (features ONLY in vanilla)

> Full detail, evidence, and remediation in `MISSING-FEATURES.md`. Summary:

| # | Gap | Vanilla evidence | React state | Severity |
|---|---|---|---|---|
| 1 | **Edit existing menu item core fields** (name/price/description/calories/allergens/spice) | `admin.js` item edit form (`editIndex`, `saveItemBtn`, `itemForm` submit → `saveMenu`) | `MenuAvailabilityList` only toggles availability/media/delete/bulk; create-only via `NewItemModal`; `api.saveMenu` exists but is **never called** by AdminPage | **HIGH** (editing prices is a daily task) |
| 2 | **Legacy Recommendations management** (`/api/recommendations`) | `admin.js` `loadAllRecommendations`/`saveRecommendationsData` + Recommendations tab | `api.getRecommendationsAdmin`/`saveRecommendations` exist but **no UI tab** | LOW (superseded by Chef Recs + Bundles — likely deprecate) |
| 3 | **Live Chat monitor** (real-time customer chat + waiter-call feed) | `admin.js` `socket.on('newChatLog')` + `socket.on('waiterCallAlert')` → live `currentChatContainer` | React admin shows **history only**; Service Desk covers waiter *tasks* but not the live chat-log stream | MEDIUM (partial overlap with Service Desk) |
| 4 | **Account management actions** — suspend/activate + assign tables | `admin.js` `updateAccountStatus()` + `saveAssignedTables()` (PATCH `assignedTables`) | `AccountsList` is **read-only** (renders status as text, no actions); React can create but not manage | **HIGH** (cannot suspend a staff account from React) |

---

## 3. Areas where React is at parity or ahead

- Orders, History (+CSV), Deals, Chef Recs (+inline edit), Chat History, Analytics (+trend/DOW/ratings/presets), menu create, media management, availability, bulk actions.
- React adds six surfaces vanilla never had (Service Desk, Tables, Reservations, Bundles, QR Codes, Reco Analytics).
- Both UIs hit the **same server API** (`/api/menu`, `/api/menu/items`, `/api/menu/chef-recs`, `/api/deals`, `/orders`, `/history`, `/api/auth/accounts`, `/api/analytics/*`) — confirmed against `server/routes/menuRoutes.js` and `server/server.js`. No endpoint drift; the gaps are **UI-only** (React simply doesn't surface some existing endpoints).

---

## 4. Minor notes (not blockers)

- **Incomplete action:** vanilla has an explicit "mark incomplete"; React `api.incompleteOrder` exists but the Orders panel may not surface it. Low impact.
- **Category management:** vanilla has "+ Add Category / + Add Subcategory". React creates items into existing categories via `getMenuCategories`; creating a brand-new category from the UI needs verification (likely PARTIAL). Flagged for the remediation scope, not independently blocking.
- **CSS:** `admin.css` is purely presentational; no functional parity concern. Safe to delete with the rest of vanilla admin once Gaps 1–4 are closed.

---

## 5. Conclusion

`admin.html` **cannot be retired yet.** Closing Gaps #1 and #4 is mandatory (core daily operations); #3 should be ported or consciously dropped; #2 should be deprecated formally. Until then, Phase 01 Steps 4 (route migration) and 8 (deletion of `frontend/` admin assets) are **on hold pending approval** — see `MISSING-FEATURES.md` and `CONTINUE-PHASE-01.md`.
