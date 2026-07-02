# MISSING-FEATURES.md — Phase 01 Step 3 Gate

**Status: 🛑 GATE FIRED — features exist only in the vanilla admin. Per Phase 01 Step 3, work has STOPPED and awaits approval before any route migration or deletion.**

**Date:** 2026-06-24. **Trigger:** Step 1 parity audit (`ADMIN-PARITY-CHECKLIST.md`) found 4 capabilities present only in `admin.html` / `frontend/scripts/admin.js`, absent from `client/src/pages/AdminPage.tsx`.

Retiring `admin.html` in this state would **lose functionality** — explicitly forbidden by Phase 01 ("No functionality loss allowed"). These gaps must be resolved (ported to React) or formally deprecated **with approval** before Steps 4 and 8 proceed.

---

## Gap #1 — Edit an existing menu item's core fields  ·  Severity: HIGH

**What vanilla does:** The Menu Editor loads an existing item into `itemForm` (`editIndex`, `saveItemBtn` flips to edit mode) and lets the admin change **name, price, description, calories, allergens, spice level, image/video paths & visibility**, then persists via `POST /api/menu` (`saveMenu`).

**What React does:** The Menu tab (`MenuAvailabilityList`) supports only:
- availability toggle (`PATCH /api/menu/items/:id/availability`)
- media changes (`PATCH /api/menu/items/:id/media`)
- delete / bulk hide-show-delete
- **create new** item (`NewItemModal` → `POST /api/menu/items`)

There is **no UI to edit an existing item's name / price / description**. `api.saveMenu()` exists in `client/src/services/api.ts` but is **never called** by `AdminPage.tsx`.

**Why it blocks:** Editing a price or description is a routine, daily owner/manager task. Losing it on retirement is unacceptable.

**Remediation:** Add an "Edit item" flow in the React Menu tab (reuse `NewItemModal` in edit mode, or add `api.updateMenuItem`). Server already supports it via `POST /api/menu` / item endpoints — **no backend change needed** (stays within Phase 01 rules).

---

## Gap #2 — Legacy Recommendations management (`/api/recommendations`)  ·  Severity: LOW

**What vanilla does:** A "Recommendations" tab manages the legacy `Recommendation` model via `GET/POST /api/recommendations` (`loadAllRecommendations`, `saveRecommendationsData`, delete).

**What React does:** `api.getRecommendationsAdmin()` / `api.saveRecommendations()` exist in `api.ts` but **no tab/UI** uses them. React instead offers **Chef Recs** (Phase 3) and **Bundles** (Phase 5), which supersede this model functionally.

**Why it's low:** This is a deprecated pre-Phase-3 feature. The likely-correct outcome is to **formally retire the legacy `Recommendation` model + endpoint + vanilla tab together**, not to port it.

**Remediation (decision required):** Either (a) confirm deprecation and retire endpoint+tab in a later phase, or (b) port a thin editor to React. Recommend (a) pending confirmation that the engine no longer reads the legacy model.

---

## Gap #3 — Live Chat / waiter-call monitor  ·  Severity: MEDIUM

**What vanilla does:** Subscribes to Socket.IO and renders a **live feed** into `currentChatContainer`:
- `socket.on('newChatLog', …)` — live customer chatbot Q&A as it happens
- `socket.on('waiterCallAlert', …)` — live waiter-call alerts
- desktop notifications opt-in

**What React does:** The admin "Chat Logs" tab is **history only** (`GET /api/chat-history`). React's **Service Desk** does consume live socket events (`waiterTaskCreated`, `managerApprovalRequested`, `waiterTaskUpdated`) — overlapping the *waiter-call* portion — but there is **no live customer-chat stream** in the React admin. (A live Chat Center exists in the *Waiter* app, not admin.)

**Why it's medium:** Partial overlap (Service Desk covers alerts/tasks). The unique loss is the real-time customer-chat monitor for managers.

**Remediation (decision required):** Either port a live chat-log feed into the React admin (subscribe to `newChatLog`), or accept Service Desk + Chat Logs as sufficient and consciously drop the live customer-chat monitor.

---

## Gap #4 — Account management actions (suspend/activate + assign tables)  ·  Severity: HIGH

**What vanilla does:**
- `updateAccountStatus(username, status)` — **suspend / re-activate** a staff account (`PATCH /api/auth/accounts/:username` `{ status }`).
- `saveAssignedTables()` — **assign tables** to a waiter (`PATCH …/:username` `{ assignedTables }`), via the Assign Tables modal.

**What React does:** `AccountsList` is **read-only** — it renders username/role/label/status as text with **no action buttons**. React can **create** accounts (`handleCreateAccount`) but cannot **suspend, re-activate, or assign tables** from the UI. `api.updateAccount()` exists but is **not wired to any control**.

**Why it blocks:** Suspending a departed/compromised staff account is a security-critical operation. Losing it on retirement is unacceptable.

**Remediation:** Add suspend/activate (and, if kept, assign-tables) controls to the React `AccountsList`, calling the existing `api.updateAccount()`. **No backend change needed.** (Note: `assignedTables` is stored but not enforced by authorization per Phase 00 AUDIT-DATABASE — confirm whether to keep or drop that sub-feature.)

---

## Summary & required decision

| Gap | Severity | Recommended action | Backend change? |
|---|---|---|---|
| #1 Edit menu item fields | HIGH | Port to React (edit mode) | No |
| #2 Legacy Recommendations | LOW | Deprecate endpoint+tab (confirm) | No (removal later) |
| #3 Live chat monitor | MEDIUM | Port feed OR accept Service Desk | No |
| #4 Account suspend/assign | HIGH | Port to React | No |

**All remediations stay within Phase 01 rules** (no schema/AI/auth/business changes — only surfacing endpoints that already exist).

**⏸️ Awaiting your decision (see `CONTINUE-PHASE-01.md` for options):**
1. **Approve porting** Gaps #1, #4 (mandatory) + #3 (recommended) into React, then resume retirement — **this adds React UI, which borders on "no new features"; needs your explicit OK** since it is parity-restoration, not net-new functionality.
2. **Defer admin retirement** to a dedicated sub-phase; proceed only with the non-admin safe cleanup (see `SAFE-DELETE-LIST.md`).
3. **Accept the losses** and retire anyway (NOT recommended — violates "no functionality loss").
