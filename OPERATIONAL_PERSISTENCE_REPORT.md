# OPERATIONAL PERSISTENCE REPORT
## State Durability Analysis — Trump Site
**Date:** 2026-05-21

---

## 1. PERSISTENCE LAYER OVERVIEW

Trump uses a three-tier persistence stack for operational state:

```
Tier 1: Process memory (tableMemory{})
  └─ Fastest — in-process hash map
  └─ Lost on restart / crash / OOM
  └─ Rebuilt from Tier 2 or Tier 3 on first access

Tier 2: PostgreSQL (via Prisma)
  └─ Primary durable store
  └─ Survives restarts, deploys, crashes
  └─ Tables: ActiveCartState, Order, OrderItem, WaiterAssignment, OrderStatusHistory
  └─ 30-second retry backoff on DB unavailability

Tier 3: JSON files (disk)
  └─ Fallback when Prisma is unavailable or down
  └─ Atomic writes (temp → rename) prevent corrupt state
  └─ Always written even when Prisma succeeds (belt-and-suspenders)
```

---

## 2. STATE INVENTORY — BEFORE vs AFTER HARDENING

### 2.1 Cart State

| Aspect | Before | After |
|--------|--------|-------|
| In-memory | ✅ tableMemory[id].cart | ✅ same |
| Disk (tables/*.json) | ✅ atomic write on every update | ✅ same |
| PostgreSQL (ActiveCartState.cart) | ✅ upsert on every update | ✅ same |
| Recovery on restart | ✅ Prisma → disk fallback | ✅ same |

**Cart state was already fully persistent. No change needed.**

### 2.2 Admin Override State (CRITICAL — was broken)

| Aspect | Before | After |
|--------|--------|-------|
| In-memory | ✅ tableMemory[id].adminOverrides | ✅ same |
| Disk | ❌ NOT persisted | ✅ tables/<id>.overrides.json |
| PostgreSQL | ❌ NOT persisted | ✅ ActiveCartState.adminOverrides |
| Recovery on restart | ❌ Always lost (loaded as []) | ✅ Prisma → disk fallback |
| Cleared on archive | ❌ Memory cleared, disk/DB untouched | ✅ All three tiers cleared |

**Admin override state is now fully durable.**

### 2.3 Order State

| Aspect | Before | After |
|--------|--------|-------|
| File storage (orders/*.json) | ✅ atomic write on submit | ✅ same |
| PostgreSQL (Order + OrderItem) | ✅ transaction on submit | ✅ same |
| Status transitions (complete/incomplete/delete) | ✅ moveOrder/deleteOrder | ✅ same |
| Audit trail (OrderStatusHistory) | ⚠️ actor always 'system' | ✅ actual username recorded |
| Archive (table checkout) | ✅ moves files + updates Prisma | ✅ same + actor recorded |

**Orders were already persistent. Actor tracking improved.**

### 2.4 Waiter Assignment State

| Aspect | Before | After |
|--------|--------|-------|
| In-memory registry (connectedWaiters{}) | ✅ hash by socketId | ✅ same |
| PostgreSQL (WaiterAssignment) | ✅ recorded on join + respond | ✅ same |
| Release on disconnect | ✅ releaseWaiterAssignments() | ✅ same |
| Stale entries on reconnect | ❌ accumulate indefinitely | ✅ old entry cleaned up before re-registration |

**Waiter assignment state improved — no more registry leaks.**

### 2.5 Active Orders Summary (per table)

| Aspect | Before | After |
|--------|--------|-------|
| In-memory | ❌ not cached (file/DB read per request) | ❌ same (acceptable — small data) |
| Disk (orders/*.json prefix scan) | ✅ getTableActiveOrders fallback | ✅ same |
| PostgreSQL | ✅ Order.status='active' query | ✅ same |
| Sent on joinTable (syncHistory) | ✅ | ✅ same |

**No change — already worked correctly.**

---

## 3. WRITE PATH ANALYSIS

### 3.1 Admin Override Write Path (new)
```
Admin emits updateAdminOverrides({ tableId, overrides })
  │
  ├─ handleUpdateAdminOverrides()
  │   └─ setTableAdminOverrides(tableId, overrides)
  │       ├─ 1. tableMemory[cleanId].adminOverrides = overrides  (sync, instant)
  │       ├─ 2. fileService.saveTableAdminOverrides(cleanId, overrides)
  │       │     ├─ a. writeJson(tables/table3.overrides.json, overrides)
  │       │     │     └─ atomic: write .tmp → rename → final  (2-5ms)
  │       │     └─ b. prismaOrder.saveTableAdminOverrides(cleanId, overrides)
  │       │           └─ upsert ActiveCartState.adminOverrides  (5-20ms, async)
  │       └─ 3. emitAdminOverride(tableId, overrides)
  │             └─ io.to([trump:table3, trump:3]).emit('adminOverrideUpdate', ...)
  │
  └─ Client receives adminOverrideUpdate within ~10ms
```

### 3.2 Admin Override Read Path (on server restart / cache miss)
```
Client emits joinTable({ tableId: 'table3' })
  │
  └─ handleJoinTable()
      └─ getTableState('table3')  ← cache miss after restart
          │
          ├─ loadTableCart('table3')
          │   ├─ Prisma: ActiveCartState.cart  (5-20ms)
          │   └─ Fallback: tables/table3.json
          │
          └─ loadTableAdminOverrides('table3')  ← NEW parallel load
              ├─ Prisma: ActiveCartState.adminOverrides  (5-20ms)
              └─ Fallback: tables/table3.overrides.json
          │
          └─ tableMemory['table3'] = { cart: [...], adminOverrides: [...] }
          │
          └─ emitAdminOverrideToSocket(socket, 'table3', adminOverrides)
              └─ Client receives correct overrides ✅
```

Note: cart and override loads run in `Promise.all()` — parallel, not sequential. Total latency ≈ one DB round trip (~20ms) rather than two (~40ms).

### 3.3 Order Write Path (unchanged — documented for reference)
```
Customer submits order → POST /submit_order
  │
  ├─ fileService.saveOrder(order, tableId)
  │   ├─ writeJson(orders/order_table_table3_<ts>.json, order)  (atomic)
  │   └─ prismaOrder.saveOrder(order, tableId, filename, 'orders')
  │       └─ transaction: ensureTable → upsert Order → create OrderItems → append StatusHistory
  │
  ├─ socketService.replaceTableCart(tableId, [], { emit: true })
  │   ├─ tableMemory[table3].cart = []
  │   ├─ writeJson(tables/table3.json, [])
  │   ├─ prismaOrder.saveTableCart(table3, [])
  │   └─ emitTableCart → 'syncCart' { cart: [] } to table rooms
  │
  ├─ socketService.emitTableHistory(tableId) → 'syncHistory' to table rooms
  └─ socketService.emitOrderPlaced(order) → 'orderPlaced' to admin+waiter rooms (NEW: scoped)
```

---

## 4. FAILURE MODE ANALYSIS

### Scenario: PostgreSQL completely down during service

| State type | Behavior | Recovery |
|-----------|----------|----------|
| Admin sets override | Written to disk only (Prisma fails silently, 30s backoff) | On restart: loaded from disk ✅ |
| Customer updates cart | Written to disk only | On restart: loaded from disk ✅ |
| Order submitted | Written to file only | File scan fallback on listOrders ✅ |
| Waiter joins | Not recorded in DB | No assignment history for session — acceptable |
| On Prisma recovery | Retry after 30s, next operation syncs again | Transparent to clients ✅ |

### Scenario: Server hard crash (kill -9) mid-operation

| Operation in progress | Outcome | Why safe |
|-----------------------|---------|----------|
| Writing cart JSON | Temp file remains (`.pid.ts.tmp`); original unchanged | Atomic rename not reached |
| Writing override JSON | Same atomic pattern | Safe |
| Writing order JSON | Same atomic pattern | Safe |
| Prisma transaction commit | Transaction rolled back by PostgreSQL | Consistent |

`writeJson()` always writes to a temp file first, then renames. A crash between write and rename leaves the `.tmp` file but the original file intact. On next boot, the `.tmp` files are orphaned (won't be read) and the last known good data is used.

---

## 5. ORDER AUDIT TRAIL (IMPROVED)

### Before

Every order status transition recorded `actor: 'system'` regardless of who performed it:
```json
{ "orderId": 42, "fromStatus": "active", "toStatus": "history", "actor": "system" }
```

### After

The actual authenticated username is recorded:
```json
{ "orderId": 42, "fromStatus": "active", "toStatus": "history", "actor": "manager1" }
```

Flows now covered:
- `markComplete` → actor = `req.user.username` (manager/owner)
- `markIncomplete` → actor = `req.user.username`
- `deleteOrder` → actor = `req.user.username`
- `archiveTable` → actor = `req.user.username` (waiter/manager/owner)
- `saveOrder` (initial) → actor = `'system'` (customer-submitted, no auth)
- `migrateFromJson` (startup) → actor = `'migration'`

This provides a complete, auditable trail of who touched each order.
