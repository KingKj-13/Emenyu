# SOCKET.IO FLOW ANALYSIS
## Real-Time Event Map and State Management
**Audit Date:** 2026-05-21

---

## 1. SOCKET.IO TOPOLOGY

### Trump (Production)
```
Client ──→ https://emenyu.com/Trump/socket.io
              └─ Socket.IO path: /Trump/socket.io
              └─ Transport: WebSocket (with polling fallback)
              └─ CORS: dynamic origin whitelist
              └─ Credentials: true (cookies sent)

Server rooms:
  trump:table1      ← all clients at table 1 (customer + waiter)
  trump:table2      ← all clients at table 2
  trump:3           ← alias room for "table3" numeric form
  trump:waiters     ← all connected waiters
  trump:admin       ← admin panel connections
```

### Greek (Production)
```
Client ──→ http://emenyu.com:3002/socket.io
              └─ Socket.IO path: default /socket.io
              └─ CORS: origin: "*" (open)

Server rooms:
  greek:table1
  greek:table2
  greek:waiters
  greek:admin
```

### Imli
```
Client ──→ /Imli/socket.io
              └─ Namespaced path like Trump
              └─ CORS: open

Rooms: imli:table1, imli:table2, ...
```

---

## 2. TRUMP — COMPLETE EVENT MAP

### 2.1 Events Received by Server (Client → Server)

| Event | Payload | Handler | Action |
|-------|---------|---------|--------|
| `joinTable` | `{ restaurantId, tableId }` | `handleJoinTable` | Join room, emit cart+history+overrides |
| `joinAsWaiter` | `{ restaurantId, name }` | `handleJoinAsWaiter` | Join waiters room, register in memory + DB |
| `joinAdmin` | `{ restaurantId }` | `handleJoinAdmin` | Join admin room |
| `callWaiter` | `{ restaurantId, tableId }` | `handleCallWaiter` | Broadcast to waiters room + admin room |
| `waiterResponding` | `{ restaurantId, tableId }` | `handleWaiterResponding` | Confirm to admin + table, record in DB |
| `fetchHistory` | `{ restaurantId, tableId }` | `handleFetchHistory` | Emit history to requesting socket only |
| `updateCart` | `{ restaurantId, tableId, cart }` | `handleUpdateCart` | Replace cart in memory+disk+DB, broadcast to room |
| `updateAdminOverrides` | `{ restaurantId, tableId, overrides }` | `handleUpdateAdminOverrides` | Set overrides in memory, broadcast to room |
| `disconnect` | (none) | `handleDisconnect` | Remove from waiter registry, release DB assignments |

### 2.2 Events Emitted by Server (Server → Client)

| Event | Target | Payload | When |
|-------|--------|---------|------|
| `syncCart` | Table room (all aliases) | `{ restaurantId, tableId, cart }` | On join, on cart update |
| `syncHistory` | Table room | `{ restaurantId, tableId, history }` | On join, after order submit/complete |
| `adminOverrideUpdate` | Table room | `{ restaurantId, tableId, overrides }` | On join, after admin sets overrides |
| `incomingWaiterCall` | Waiters room | `{ restaurantId, tableId, displayTable, message, timestamp }` | Customer calls waiter |
| `waiterCallAlert` (incoming) | Admin room | `{ restaurantId, tableId, displayTable, type:'incoming', timestamp }` | Customer calls waiter |
| `waiterCallAlert` (responding) | Admin room | `{ ..., waiterName, type:'responding' }` | Waiter responds |
| `waiterOnTheWay` | Table room | `{ restaurantId, tableId, waiterName, message }` | Waiter responds to call |
| `waiterRegistered` | Connecting waiter socket | `{ restaurantId, name, message }` | Waiter joins |
| `orderPlaced` | All sockets (io.emit) | `{ restaurantId, order }` | Order submitted |
| `orderUpdated` | All sockets | `{ restaurantId }` | Order status changed |
| `menuUpdated` | All sockets | (none) | Menu saved by admin |
| `dealUpdated` | All sockets | (none) | Deal saved by admin |
| `recommendationUpdated` | All sockets | (none) | Recommendations saved |
| `newChatLog` | All sockets | `log` | Chat interaction recorded |

---

## 3. TABLE ROOM ALIAS SYSTEM (TRUMP)

Trump implements multi-alias rooms to handle ID format variations:

```javascript
// helpers.js
function getTableAliases(raw) {
  const cleanId = normalizeId(raw);     // lowercase alphanumeric only
  const aliases = new Set([cleanId]);    // "table3"

  if (/^\d+$/.test(cleanId)) {
    aliases.add(`table${cleanId}`);      // "3" → also "table3"
  }

  const tableNumber = cleanId.match(/^table(\d+)$/);
  if (tableNumber) {
    aliases.add(tableNumber[1]);         // "table3" → also "3"
  }

  return [...aliases];                   // ["table3", "3"]
}

// SocketService
getTableRooms(tableId) {
  return getTableAliases(tableId).map(alias => `trump:${alias}`);
  // → ["trump:table3", "trump:3"]
}
```

This means a customer visiting `/Trump/3` and one at `/Trump/table3` end up in the same rooms and see the same cart state.

---

## 4. TABLE STATE MANAGEMENT

### 4.1 In-Memory State (tableMemory)
```javascript
this.tableMemory = {
  'table1': {
    cart: [{ name: 'Steak', price: 350, qty: 2 }],
    adminOverrides: [{ type: 'discount', value: 10 }]
  },
  'table2': { cart: [], adminOverrides: [] }
}
```

### 4.2 State Load on Join
```
Client joins table3
  └─ getTableState('table3')
      ├─ check tableMemory['table3']
      │   ├─ HIT: return immediately (no disk I/O)
      │   └─ MISS: load from disk
      │       └─ fileService.loadTableCart('table3')
      │           ├─ prismaOrder.loadCartState('table3') → Prisma ActiveCartState
      │           └─ fallback: read tables/table3.json
      └─ cache in tableMemory['table3']
```

### 4.3 Cart Persistence on Update
```
Client emits updateCart({ tableId: 'table3', cart: [...] })
  └─ replaceTableCart('table3', cart)
      ├─ tableMemory['table3'].cart = cart        (1. in-memory, instant)
      ├─ fileService.saveTableCart('table3', cart) (2. async disk write)
      │   ├─ write tables/table3.json
      │   └─ prismaOrder.saveCartState('table3', cart) → Prisma upsert
      └─ emitTableCart('table3', cart)            (3. broadcast to room)
```

### 4.4 State Recovery After Restart
```
Server restarts
  └─ tableMemory = {} (empty)
  └─ Next client joins table3
      └─ MISS in tableMemory
      └─ Load from Prisma ActiveCartState (primary)
      └─ Fallback to tables/table3.json
      └─ Cart restored correctly
```

---

## 5. WAITER CALL FLOW (DETAILED)

```
1. Customer presses bell button
   └─ emit callWaiter({ restaurantId: 'trump', tableId: 'table3' })

2. Server handleCallWaiter()
   └─ Validate restaurantId
   └─ Build displayTable = "TABLE 3"
   └─ Build timestamp = "14:32"
   └─ io.to('trump:waiters').emit('incomingWaiterCall', {
        restaurantId: 'trump',
        tableId: 'table3',
        displayTable: 'TABLE 3',
        message: 'TABLE 3 is calling you.',
        timestamp: '14:32'
      })
   └─ io.to('trump:admin').emit('waiterCallAlert', {
        type: 'incoming',
        ...same payload
      })

3. Waiter device receives 'incomingWaiterCall'
   └─ Bell animation plays
   └─ Sound notification plays
   └─ Alert card shows "TABLE 3 is calling you. 14:32"
   └─ Waiter taps "I'm on my way"

4. Client emit waiterResponding({ restaurantId: 'trump', tableId: 'table3' })

5. Server handleWaiterResponding()
   └─ Lookup waiter name from connectedWaiters[socket.id]
   └─ io.to('trump:admin').emit('waiterCallAlert', {
        type: 'responding',
        waiterName: 'John',
        message: 'Waiter John is responding to TABLE 3.',
        timestamp: '14:33'
      })
   └─ io.to(['trump:table3','trump:3']).emit('waiterOnTheWay', {
        waiterName: 'John',
        message: 'John is on the way.'
      })
   └─ fileService.recordWaiterAssignment('table3', 'John', socket.id, { event: 'waiterResponding' })

6. Customer device receives 'waiterOnTheWay'
   └─ Toast notification: "John is on the way."
```

---

## 6. ADMIN OVERRIDE FLOW (DETAILED)

```
1. Admin opens override panel for table 2
   └─ Admin sets: 10% discount on all drinks

2. Client emit updateAdminOverrides({
     restaurantId: 'trump',
     tableId: 'table2',
     overrides: [{ type: 'discount', category: 'drinks', value: 10 }]
   })

3. Server handleUpdateAdminOverrides()
   └─ setTableAdminOverrides('table2', overrides)
       └─ tableMemory['table2'].adminOverrides = overrides
       └─ emitAdminOverride('table2', overrides)
           └─ io.to(['trump:table2','trump:2']).emit('adminOverrideUpdate', {
                restaurantId: 'trump',
                tableId: 'table2',
                overrides: [{ type: 'discount', category: 'drinks', value: 10 }]
              })

4. Customer at table2 receives 'adminOverrideUpdate'
   └─ Frontend applies override: drink prices shown with 10% reduction
   └─ Override visible to customer immediately

5. Override persists:
   └─ Stored in tableMemory (in-memory)
   └─ NOT persisted to disk or Prisma in current implementation
   └─ Lost on server restart (RISK: admin overrides lost if server restarts mid-service)
```

**Known Risk:** Admin overrides are only in `tableMemory`, never written to disk or Prisma. A server restart during service would clear all active overrides.

---

## 7. GREEK SOCKET IMPLEMENTATION

Greek implements the same event model but inline in `server.js`:

```
Same events, different details:
  - CORS: origin: "*" (Trump: whitelist)
  - Path: /socket.io (Trump: /Trump/socket.io)
  - No class structure — direct io.on() calls
  - connectedWaiters{} is module-level variable (same in Trump but as class property)
  - No table alias system (just normalizeId)
  - No fileService.releaseWaiterAssignments() — just delete from connectedWaiters
  - No Prisma cart persistence — disk only (tables/*.json)
```

---

## 8. SOCKET SECURITY COMPARISON

| Security Aspect | Trump | Greek |
|----------------|-------|-------|
| Origin validation | Whitelist (TRUMP_ALLOWED_ORIGINS) | `origin: "*"` |
| Restaurant ID validation | Every handler checks `isValidRestaurant()` | Every handler checks `restaurantId === RESTAURANT_ID` |
| Table room injection | Not possible (normalizeId strips special chars) | Not possible |
| Waiter impersonation | Not possible (name from server-side connectedWaiters) | Same |
| Admin room access | joinAdmin requires valid restaurantId | Same |
| Cart poisoning | updateCart validates restaurantId | Same |
| Cross-restaurant bleed | Impossible (restaurantId namespacing) | Impossible |

---

## 9. SOCKET PERFORMANCE CHARACTERISTICS

### Cart Update Performance
```
updateCart emit → server handler → async write (disk + Prisma) → room broadcast
  └─ Latency: ~5-20ms (in-memory update immediate, writes async)
  └─ All clients in table room receive update within ~10ms (LAN)
```

### Scale Limitation
```
Single Socket.IO instance (fork mode PM2)
  └─ 1 Node process
  └─ No Socket.IO Redis adapter
  └─ Cannot scale horizontally with multiple processes
  └─ Bottleneck: ~10,000 concurrent connections per process
     (adequate for restaurant scale, problematic for SaaS)
```

### Room Management
```
Each table has 2 rooms (table3 + 3)
Restaurant with 20 tables → 40 rooms + 1 waiter room + 1 admin room = 42 rooms
Memory: minimal (rooms are just sets of socket IDs)
```

---

## 10. SOCKET RISKS SUMMARY

| # | Risk | Severity |
|---|------|----------|
| 1 | Admin overrides not persisted — lost on restart | High |
| 2 | Greek CORS `origin: "*"` — any domain can connect | High |
| 3 | No Socket.IO Redis adapter — cannot scale horizontally | Medium |
| 4 | `orderPlaced` and `orderUpdated` emit to ALL sockets — no room targeting | Low |
| 5 | `menuUpdated`/`dealUpdated` emit to ALL sockets — no room targeting | Low |
| 6 | No socket authentication (any client can join any table room) | Medium |
| 7 | Waiter registry lost on process crash — waiters must rejoin | Low |
| 8 | No reconnection state — client must re-emit joinTable on reconnect | Low |
