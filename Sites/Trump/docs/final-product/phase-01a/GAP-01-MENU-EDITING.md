# GAP-01-MENU-EDITING.md — Menu Item Editing (HIGH) — ✅ CLOSED

**Date:** 2026-06-24. **Status: implemented + verified.**

---

## Problem

Vanilla admin could edit an existing item's **name, description, price, calories, allergens, spice, media**. React `/Admin` could only create, toggle availability, change media, delete, and bulk-act — **no way to edit an existing item's core fields**. Editing a price is a daily task, so this blocked retirement.

## API audit (what already existed)

| Endpoint / method | Purpose | Usable for field edit? |
|---|---|---|
| `POST /api/menu/items` `createItem` | create new item | no (create only) |
| `PATCH /api/menu/items/:id/availability` | availability | partial |
| `PATCH /api/menu/items/:id/media` `updateItemMedia` | media fields | partial |
| `POST /api/menu` `saveMenu` | whole-menu blob | **unsafe — see below** |
| **(none)** | per-item field update | **missing** |

**Why `saveMenu` could not be reused:** `prismaMenuService.saveMenu` runs `deleteMany` on all items + categories then recreates them in a transaction (`prismaMenuService.js:285-352`). Every item receives a **new autoincrement id**, which would dangle `MenuItemRecommendation.sourceItemId/targetItemId` (chef-recs reference item ids). It also operates on the nested `MenuData` shape, not the flat admin item list. Using it for a single-field edit would silently corrupt chef recommendations.

**Conclusion (Rule 1):** the only safe path is a surgical per-item update that preserves the id. This is the one place a thin new endpoint was *required*; it exposes the existing `prisma.menuItem.update` capability (the same primitive `updateItemMedia`/`toggleItemAvailability` already use).

## Source of truth

`MenuItem` rows in PostgreSQL (via `prismaMenuService`) are authoritative. The new edit path writes directly to that row by id. `saveMenu` (whole-blob) remains only for migration/bulk import, unchanged.

## Implementation

### Backend (additive, minimal)
- **`server/services/prismaMenuService.js` → `updateItem(id, patch)`** (new). Maps editable scalars: `name` (+recomputed `normalizedName`), `description`, `price`, `calories`, `allergens`, `spice`, `chefPick`, `popular`, `available`, `visible`; optional category move (resolve/create root category by title, mirroring `createItem`). Tenant-scoped `updateMany({ where: { id, restaurantId } })` (defence-in-depth, matching `deleteItem`/`bulkItemAction`), then returns `dbItemToJson(..., { includeId: true })`. **Item id is preserved → chef-rec FKs intact.**
- **`server/controllers/menuController.js` → `updateItem`** (new): validates non-empty name when present, calls the service, emits `socketService.emitMenuUpdated()`, returns `{ ok, item }`.
- **`server/routes/menuRoutes.js`**: `app.patch(itemDeletePaths, adminAuth, controllers.menu.updateItem)` — `PATCH /api/menu/items/:id`, same `requireRoles(['owner','manager'])` guard as every menu admin route. Registered after the more-specific `:id/availability` and `:id/media` PATCH routes.

### Frontend
- **`client/src/constants/api.ts`**: `menuItemUpdate(id)`.
- **`client/src/services/api.ts`**: `updateMenuItem(id, patch)` (PATCH).
- **`client/src/pages/AdminPage.tsx`**:
  - `AdminMenuItem` extended with `calories`, `allergens`, `spice`, `chefPick` (already returned by `getAdminItems`/`dbItemToJson`).
  - `NewItemModal` generalised to **create + edit** (one form, no duplication): prefilled from `item`; added Calories/Allergens/Spice inputs; title/button switch ("Save changes" vs "Create item").
  - `MenuAvailabilityList` gains a per-row **Edit** (pencil) button → `openEditItem`.
  - `handleSubmitItem` routes to `api.updateMenuItem` (edit) or `api.createMenuItem` (create); `openEditItem`/`closeItemModal`/`loadCategoryNames` helpers.

## Requirements check (from the phase brief)
- ✅ No duplicated forms — one `NewItemModal` for create + edit.
- ✅ No duplicated validation — shared submit/validation in the modal.
- ✅ Create flow preserved — create path unchanged in behaviour.
- ✅ Media workflow preserved — still handled by `MenuItemMediaControls` / `updateItemMedia`.

## Verification
- `tsc --noEmit` → clean (exit 0).
- `vite build` → success (fresh `AdminPage` bundle).
- `node --check` on all 3 changed server files → OK.
- Item id preserved on edit (uses `update`, not delete+recreate) → chef-recs unaffected.

## Result
**Owner/Manager can fully edit an existing menu item in React `/Admin` without the vanilla admin. Gap closed → MATCHED.**
