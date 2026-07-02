# PHASE-01A-PLAN.md — Admin Parity Restoration

**Date:** 2026-06-24. **Goal:** close the 4 parity gaps that block retiring vanilla `admin.html`, by exposing **existing backend capabilities** through React Admin. No schema/auth/AI/business-logic changes.

---

## Investigation summary (grounding for every decision)

| Area | Finding | Implication |
|---|---|---|
| Per-item edit endpoint | **Does not exist.** Backend has `createItem`, `toggleItemAvailability`, `updateItemMedia`, and whole-blob `saveMenu`. | A per-item update path is needed. |
| `saveMenu` (whole blob) | **Destructive:** `deleteMany` all items + categories, then recreates → **every item gets a new id**, which would dangle `MenuItemRecommendation` FKs (chef-recs). | Reusing `saveMenu` for an edit is unsafe. A surgical `PATCH /api/menu/items/:id` (reusing the existing `prisma.menuItem.update` capability, like `updateItemMedia`) is the correct minimal addition. **This is the one place a thin new endpoint is "absolutely required" per Rule 1.** |
| `newChatLog` socket event | Emitted **globally** (`io.emit`) on every customer chat (`aiService.appendChatLog → socketService.emitNewChatLog`). | Gap 03 needs **no backend change** — React just subscribes. |
| `waiterCallAlert` socket event | Emitted to the **admin room** on waiter calls/responses. React Service Desk does NOT currently surface it. | Gap 03 can also surface it (no backend change). |
| Account update endpoint | `PATCH /api/auth/accounts/:username` + `accountService.updateAccount` already support `status` (suspend/activate), `label`, `password`, `assignedTables`. `api.updateAccount` already exists in React. | Gap 04 (suspend/activate) is **pure frontend wiring** — no backend change. |
| `assignedTables` | Stored + returned, but **NOT enforced** anywhere (socket `TABLE_CONTROL_ROLES` lets any staff control any table). Effectively dead. | Per phase rule: **document + propose retirement, do NOT port the UI**. |
| Legacy `Recommendation` model | **Still consumed** by the engine (`aiService` line ~1106, "mid-tier fallback below chef"). Not dead. | Status = **SUPERSEDED** by Chef Recs (+Bundles), not DEPRECATED. Do not port a new authoring UI; preserve existing data + engine read; recommend formal removal in a later phase. |

---

## Work plan

### Gap 01 — Menu item editing (HIGH) — backend + frontend
- **Backend (minimal, required):**
  - `prismaMenuService.updateItem(id, patch)` — updates scalar fields (`name`+`normalizedName`, `description`, `price`, `calories`, `allergens`, `spice`, `chefPick`, `available`, `visible`) + optional category move (resolve/create by title, like `createItem`). Tenant-scoped `updateMany` (defence-in-depth, matching `deleteItem`/`bulkItemAction`). Returns `dbItemToJson(..., { includeId: true })`. **Preserves the item id → chef-rec FKs stay intact.**
  - `menuController.updateItem` — validates, emits `emitMenuUpdated()`.
  - Route `PATCH /api/menu/items/:id` (adminAuth) — same auth/roles as all other menu admin routes.
- **Frontend:**
  - `api.updateMenuItem(id, patch)` + `ENDPOINTS.menuItemUpdate`.
  - Generalise `NewItemModal` to create **and** edit (prefill from item; add `calories`/`allergens`/`spice` fields). No duplicate form.
  - Add an **Edit** button per item in `MenuAvailabilityList`.
  - `handleSubmitItem` routes to create vs update; `openEditItem` opens the modal prefilled.
- **Outcome:** Owner/Manager edit any item field in React. → `GAP-01-MENU-EDITING.md`.

### Gap 04 — Account management (HIGH) — frontend only
- Add **Suspend / Activate** controls to `AccountsList`, calling existing `api.updateAccount(username, { status })`; guard against self/owner where appropriate.
- **Assign tables:** NOT ported — documented as non-enforced/dead with a retirement proposal.
- **Outcome:** Owner/Manager suspend/reactivate staff in React. → `GAP-04-ACCOUNT-MANAGEMENT.md`.

### Gap 03 — Live chat monitor (MEDIUM) — frontend only
- `LiveChatMonitor` component: joins the admin socket room, subscribes to `newChatLog` (live customer Q&A) + `waiterCallAlert` (call/response). Rendered above the existing history list in the Chat tab. Reuses existing Socket.IO infra; no polling; no new events; no DB.
- **Outcome:** live customer chat + waiter-call visibility in React Admin. → `GAP-03-LIVE-CHAT.md`.

### Legacy Recommendations — decision
- Mark **SUPERSEDED** (engine still reads existing data; Chef Recs + Bundles are the supported, higher-priority curation path already in React). No new UI. Recommend a later phase to remove endpoint + engine fallback + model together. → recorded in `PARITY-VERIFICATION.md`.

---

## Constraints honored
No schema/migration/Prisma change · no auth/JWT/Google/role change · no business-logic change. The single backend addition (`PATCH /api/menu/items/:id`) exposes an existing Prisma update capability and is required because the only alternative (`saveMenu`) is destructive to item ids/chef-rec FKs.

## Verification (Step 9)
`tsc --noEmit` + `vite build`; `node --check` changed server files; `reco:validate` / `chat:validate` / `reco:health` self-tests; manual route checks. Recorded in `PARITY-VERIFICATION.md` + `PHASE-01A-COMPLETION-REPORT.md`.
