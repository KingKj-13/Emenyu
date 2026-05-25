# REALTIME STABILITY REPORT
## Socket.IO Hardening Analysis — Trump Site
**Date:** 2026-05-21

---

## 1. PROBLEMS FOUND AND FIXED

### 1.1 Admin Overrides Not Surviving Reconnects or Restarts

**Before:**
```javascript
async getTableState(tableId) {
  if (!this.tableMemory[cleanId]) {
    const cart = await this.fileService.loadTableCart(tableId);
    this.tableMemory[cleanId] = {
      cart,
      adminOverrides: []   // ← ALWAYS EMPTY after any cache miss
    };
  }
  return this.tableMemory[cleanId];
}
```

Every cache miss (restart, first client after server cold start) returned `adminOverrides: []`. Admin overrides were never loaded from disk or DB. **This made admin overrides completely non-persistent.**

**After:**
```javascript
async getTableState(tableId) {
  if (!this.tableMemory[cleanId]) {
    const [cart, adminOverrides] = await Promise.all([
      this.fileService.loadTableCart(tableId),
      this.fileService.loadTableAdminOverrides(tableId)   // ← loads from Prisma or disk
    ]);
    this.tableMemory[cleanId] = {
      cart: Array.isArray(cart) ? cart : [],
      adminOverrides: Array.isArray(adminOverrides) ? adminOverrides : []
    };
  }
  return this.tableMemory[cleanId];
}
```

Both cart and overrides now load together on cache miss. A `joinTable` event on a freshly-started server correctly restores admin overrides to every reconnecting client.

---

### 1.2 `setTableAdminOverrides` Didn't Persist

**Before:**
```javascript
async setTableAdminOverrides(tableId, overrides, options = {}) {
  const state = await this.getTableState(tableId);
  state.adminOverrides = Array.isArray(overrides) ? overrides : [];
  // ← nothing persisted to disk or DB
  if (options.emit !== false) {
    this.emitAdminOverride(tableId, state.adminOverrides);
  }
  return state;
}
```

Admin sets a price override → stored in memory → broadcast to current clients → **gone on restart**.

**After:**
```javascript
async setTableAdminOverrides(tableId, overrides, options = {}) {
  const cleanId = getCanonicalTableId(tableId);
  const state = await this.getTableState(tableId);
  state.adminOverrides = Array.isArray(overrides) ? overrides : [];

  await this.fileService.saveTableAdminOverrides(cleanId, state.adminOverrides);  // ← persists

  if (options.emit !== false) {
    this.emitAdminOverride(tableId, state.adminOverrides);
  }
  return state;
}
```

Override immediately written to:
1. `tables/<id>.overrides.json` (atomic rename, safe against crash mid-write)
2. `ActiveCartState.adminOverrides` in PostgreSQL

---

### 1.3 `resetTableState` Didn't Clear Persisted Overrides

**Before:**
```javascript
async resetTableState(tableId, options = {}) {
  state.cart = [];
  state.adminOverrides = preserveAdminOverrides ? state.adminOverrides : [];
  await this.fileService.saveTableCart(cleanId, []);
  // ← if preserveAdminOverrides=false, in-memory cleared but disk/DB NOT cleared
}
```

After a waiter archives a table (which calls `resetTableState({ preserveAdminOverrides: false })`), the override was cleared in memory but the `tables/table3.overrides.json` and Prisma row still held the old value. The next restart would restore overrides that were supposed to have been cleared.

**After:**
```javascript
async resetTableState(tableId, options = {}) {
  state.cart = [];
  state.adminOverrides = preserveAdminOverrides ? state.adminOverrides : [];
  await this.fileService.saveTableCart(cleanId, []);

  if (!preserveAdminOverrides) {
    await this.fileService.saveTableAdminOverrides(cleanId, []);  // ← clears persisted overrides
  }
}
```

---

### 1.4 `emitOrderPlaced` and `emitOrderUpdated` Broadcast to All Sockets

**Before:**
```javascript
emitOrderPlaced(order) {
  if (this.io) {
    this.io.emit('orderPlaced', { ... });  // ALL connected sockets
  }
}
```

With 20 tables × 5 customers = 100 customer sockets, every order placed sent 100+ pointless messages to customer devices.

**After:**
```javascript
emitOrderPlaced(order) {
  if (this.io) {
    this.io.to(this.getAdminRoom()).to(this.getWaiterRoom()).emit('orderPlaced', { ... });
  }
}
```

Now targets only:
- `trump:admin` room (admin panel connections)
- `trump:waiters` room (waiter device connections)

Customers learn about their orders via `syncHistory`, which is already table-specific.

---

### 1.5 Missing `adminResetTable` Socket Event

**Before:** No handler. Any admin frontend emitting `adminResetTable` was silently dropped.

**After:**
```javascript
socket.on('adminResetTable', async payload => {
  await this.handleAdminResetTable(socket, payload);
});

async handleAdminResetTable(socket, payload) {
  if (!this.isValidRestaurant(payload.restaurantId) || !this.io) return;
  if (!this.isValidTableId(payload.tableId)) return;

  const cleanId = normalizeId(payload.tableId);
  await this.resetTableState(cleanId, {
    preserveAdminOverrides: payload.preserveAdminOverrides !== false,
    emit: true
  });
  this.logger?.info('socket_admin_reset_table', { tableId: cleanId, ... });
}
```

Supports two modes via `preserveAdminOverrides`:
- `true` (default): clear cart only, keep overrides active
- `false`: full reset — clear cart AND overrides (used on table checkout)

---

### 1.6 Stale Waiter Sockets on Reconnect

**Before:**
```javascript
async handleJoinAsWaiter(socket, payload) {
  socket.join(this.getWaiterRoom());
  this.connectedWaiters[socket.id] = { name, socketId: socket.id };
  // ← old socket entries for same waiter never cleaned up
}
```

After 3 reconnects: `connectedWaiters` had 3 entries for the same waiter.
- Old socket IDs never had `releaseWaiterAssignments()` called
- Waiter response lookup could match stale socket
- Registry grows indefinitely if waiter keeps reconnecting

**After:**
```javascript
async handleJoinAsWaiter(socket, payload) {
  const name = String(payload.name || 'Unnamed Waiter').trim();

  // Clean up stale socket for same waiter name before registering new one.
  const previousSocketId = this.findWaiterSocketByName(name);
  if (previousSocketId && previousSocketId !== socket.id) {
    delete this.connectedWaiters[previousSocketId];
    await this.fileService.releaseWaiterAssignments(previousSocketId);
  }

  socket.join(this.getWaiterRoom());
  this.connectedWaiters[socket.id] = { name, socketId: socket.id };
  // ...
}
```

One entry per waiter name at all times.

---

### 1.7 No Payload Validation on Table-Scoped Events

**Before:** All socket handlers trusted `payload.tableId` blindly. `normalizeId(null)` → `'unknown'` → state stored at `tableMemory['unknown']`.

**After:** New `isValidTableId(tableId)` guard applied to all table-scoped handlers:
```javascript
isValidTableId(tableId) {
  const cleanId = normalizeId(tableId);
  return Boolean(cleanId) && cleanId !== 'unknown';
}
```

Applied in: `handleJoinTable`, `handleCallWaiter`, `handleWaiterResponding`, `handleFetchHistory`, `handleUpdateCart`, `handleUpdateAdminOverrides`, `handleAdminResetTable`.

---

## 2. REMAINING KNOWN RISKS (NOT FIXED IN THIS SESSION)

| Risk | Reason not fixed | Future action |
|------|-----------------|---------------|
| No Socket.IO Redis adapter | Requires horizontal scale decision | Phase 5 |
| `adminResetTable` has no server-side auth check | Socket auth not implemented | Phase 3 |
| `orderPlaced`/`orderUpdated` still reach all admin panel tabs | Multiple admin sessions = duplicate notifications | Low priority |
| No reconnect auto-sync for admin panel | Admin must manually refresh after reconnect | Phase 3 |

---

## 3. REALTIME STATE GUARANTEES (POST-HARDENING)

| Scenario | Behavior after hardening |
|----------|--------------------------|
| Admin sets 10% drink override on table3 | Persisted to Prisma + disk immediately |
| Server restart 30s later | Override loaded from Prisma/disk on first client join |
| Customer refreshes page | `joinTable` → `syncCart` + `syncHistory` + `adminOverrideUpdate` all sent correctly |
| Waiter disconnects and reconnects | Old socket entry cleaned up, new entry registered, no ghost state |
| Waiter archives table | Cart + overrides both cleared in memory + disk + Prisma |
| Admin resets table (socket) | `adminResetTable` event now handled; cart cleared, override optionally preserved |
| Malformed `joinTable({ tableId: null })` | Rejected by `isValidTableId()`, no `tableMemory['unknown']` entry created |
| Order submitted | `orderPlaced` only sent to admin+waiter rooms, not all customers |
