# TRUMP OPERATIONAL HARDENING
## Changes Made — Production Stability Session
**Date:** 2026-05-21

---

## SCOPE

All changes are inside:
- `prisma/schema.prisma` + new migration
- `Sites/Trump/server/services/socketService.js`
- `Sites/Trump/server/services/fileService.js`
- `Sites/Trump/server/services/prismaOrderService.js`
- `Sites/Trump/server/controllers/orderController.js`
- `Sites/Trump/server/controllers/waiterController.js`

No changes to Greek, Imli, AlPescatore, frontend HTML/JS, routing, or auth systems.

---

## CHANGE 1: Admin Override Persistence (CRITICAL fix)

### Problem
`tableMemory[tableId].adminOverrides` was held only in process memory. Any server restart, PM2 reload, or crash would silently clear all admin-set table price overrides mid-service, causing:
- Billing discrepancies (customers charged pre-discount prices)
- Waiters unaware overrides had been applied
- Admin had to manually re-apply overrides for every active table after every deploy

### What changed

**`prisma/schema.prisma`**
```
model ActiveCartState {
  ...
  adminOverrides Json?       ← NEW — persists per-table override state
  ...
}
```

**`prisma/migrations/20260521110000_active_cart_admin_overrides/migration.sql`**
```sql
ALTER TABLE "ActiveCartState" ADD COLUMN "adminOverrides" JSONB;
```
Safe nullable column addition. Zero impact on existing rows (NULL treated as `[]`).

**`prismaOrderService.js` — 2 new methods**
- `loadTableAdminOverrides(tableId)` → reads `adminOverrides` from `ActiveCartState` row
- `saveTableAdminOverrides(tableId, overrides)` → upserts `adminOverrides` column (preserves cart)

**`fileService.js` — 2 new methods + disk fallback**
- `loadTableAdminOverrides(tableId)` → tries Prisma, falls back to `tables/<id>.overrides.json`
- `saveTableAdminOverrides(tableId, overrides)` → writes `tables/<id>.overrides.json` (atomic) AND Prisma

**`socketService.js` — 3 changed methods**
- `getTableState(tableId)` → now loads BOTH cart AND adminOverrides on cache miss
- `setTableAdminOverrides(...)` → now calls `fileService.saveTableAdminOverrides()` before emitting
- `resetTableState(...)` → now calls `fileService.saveTableAdminOverrides(cleanId, [])` when `preserveAdminOverrides: false`

### Recovery path
```
Server restarts
  └─ tableMemory = {} (empty)
  └─ First client joins table3
      └─ getTableState('table3') → cache miss
      └─ loadTableAdminOverrides('table3')
          ├─ Prisma: SELECT adminOverrides FROM ActiveCartState → [{ type: 'discount', value: 10% }]
          └─ Fallback: tables/table3.overrides.json
      └─ Admin override correctly restored and emitted to customer
```

---

## CHANGE 2: Missing `adminResetTable` Socket Event Handler

### Problem
The admin panel's "Reset Table" action (clear cart + clear overrides) had no corresponding server-side Socket.IO handler. Any admin frontend emitting `adminResetTable` was silently ignored.

### What changed

**`socketService.js` — new event registration in `handleConnection`:**
```javascript
socket.on('adminResetTable', async payload => {
  await this.handleAdminResetTable(socket, payload);
});
```

**`socketService.js` — new handler `handleAdminResetTable`:**
- Validates `restaurantId` and `tableId`
- Calls `resetTableState(cleanId, { preserveAdminOverrides: payload.preserveAdminOverrides, emit: true })`
- Logs actor for audit trail
- Supports `preserveAdminOverrides: true` to clear cart without touching overrides

---

## CHANGE 3: Scope `orderPlaced` / `orderUpdated` to Staff Rooms

### Problem
`emitOrderPlaced()` and `emitOrderUpdated()` used `io.emit()` which broadcasts to **every connected socket** — including all customer table clients. This caused:
- Unnecessary traffic to hundreds of customer sockets
- Customer frontends receiving events they don't handle (no-op but wasteful)
- Potential future confusion if customer JS ever added `orderPlaced` listeners

### What changed

**`socketService.js`:**
```javascript
// Before
this.io.emit('orderPlaced', { ... });

// After — targeted to staff rooms only
this.io.to(this.getAdminRoom()).to(this.getWaiterRoom()).emit('orderPlaced', { ... });
```

Same change applied to `emitOrderUpdated()`.

**Backward compatibility:** Customer frontends listen for `syncCart`, `syncHistory`, `adminOverrideUpdate`, `waiterOnTheWay` — none of which are affected. `orderPlaced` and `orderUpdated` were always staff-only concerns.

---

## CHANGE 4: Stale Waiter Socket Cleanup on Re-registration

### Problem
If a waiter refreshed their browser or reconnected, a new socket ID was created. The old socket ID remained in `connectedWaiters{}` and was never cleaned up, leading to:
- Two entries in `connectedWaiters{}` for the same waiter name
- Old socket ID never getting `releaseWaiterAssignments()` called
- Accumulated ghost entries after multiple reconnects

### What changed

**`socketService.js` — `handleJoinAsWaiter`:**
```javascript
// Before joining, detect and release any stale socket for same waiter name
const previousSocketId = this.findWaiterSocketByName(name);
if (previousSocketId && previousSocketId !== socket.id) {
  delete this.connectedWaiters[previousSocketId];
  await this.fileService.releaseWaiterAssignments(previousSocketId);
}
```

**`socketService.js` — new `findWaiterSocketByName(name)` helper:**
```javascript
findWaiterSocketByName(name) {
  for (const [socketId, waiter] of Object.entries(this.connectedWaiters)) {
    if (waiter.name === name) return socketId;
  }
  return null;
}
```

---

## CHANGE 5: Payload Validation on Socket Events

### Problem
Socket event handlers accepted any payload without validation. A `joinTable` with `tableId: null` would store state under `tableMemory['unknown']`. A `callWaiter` with missing tableId would broadcast "UNKNOWN is calling you."

### What changed

**`socketService.js` — new `isValidTableId(tableId)` method:**
```javascript
isValidTableId(tableId) {
  const cleanId = normalizeId(tableId);
  return Boolean(cleanId) && cleanId !== 'unknown';
}
```

Applied as guard in: `handleJoinTable`, `handleCallWaiter`, `handleWaiterResponding`, `handleFetchHistory`, `handleUpdateCart`, `handleUpdateAdminOverrides`, `handleAdminResetTable`.

Also added tableId validation in `orderController.submitOrder`:
```javascript
if (!tableId || tableId === 'unknown') {
  return res.status(400).json({ error: 'Invalid table ID' });
}
```

---

## CHANGE 6: Actor Tracking in Order Audit Trail

### Problem
`orderController.markComplete`, `markIncomplete`, `deleteOrder` and `waiterController.archiveTable` called `fileService.moveOrder/deleteOrder/archiveTable` without passing the authenticated user's username. The `OrderStatusHistory` table always recorded `actor: 'system'`, making it impossible to audit which admin or waiter performed each operation.

### What changed

**`fileService.js` — added `actor` param to:**
- `moveOrder(fromKind, toKind, filename, actor = 'system')`
- `deleteOrder(kind, filename, actor = 'system')`
- `archiveTable(tableId, actor = 'system')`

**`orderController.js`:**
```javascript
const actor = req.user?.username || 'admin';
const filename = await fileService.moveOrder('orders', 'history', req.body.filename, actor);
```

**`waiterController.js`:**
```javascript
const actor = req.user?.username || 'waiter';
await fileService.archiveTable(cleanId, actor);
```

Now `OrderStatusHistory` rows record the actual username (`owner`, `manager`, specific waiter name) for every status transition.

---

## MIGRATION INSTRUCTIONS

Before starting the server after this update, run:

```bash
# From project root
npx prisma migrate deploy
```

This applies the single new migration (`20260521110000_active_cart_admin_overrides`), adding the nullable `adminOverrides` column to `ActiveCartState`. It is a safe, non-destructive ALTER TABLE that takes milliseconds on any table size.

**Rollback:** The column can be dropped with `ALTER TABLE "ActiveCartState" DROP COLUMN "adminOverrides"` — no application code change needed as the field is nullable and the application handles `null` as empty array.

---

## FILES CHANGED SUMMARY

| File | Change type | Lines changed |
|------|-------------|--------------|
| `prisma/schema.prisma` | Modified — added `adminOverrides Json?` | +1 line |
| `prisma/migrations/.../migration.sql` | New file | +3 lines |
| `server/services/prismaOrderService.js` | Added 2 methods | +55 lines |
| `server/services/fileService.js` | Added 2 methods, threaded actor | +30 lines |
| `server/services/socketService.js` | Refactored + hardened | Full rewrite (same API surface) |
| `server/controllers/orderController.js` | Actor threading + tableId validation | +8 lines |
| `server/controllers/waiterController.js` | Actor threading | +4 lines |

**Files NOT changed:** server.js, helpers.js, security.js, requestLogger.js, logger.js, accountService.js, prismaAuthService.js, prismaMenuService.js, all route files, all frontend files, Greek/Imli/AlPescatore.
