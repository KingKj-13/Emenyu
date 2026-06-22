# Task 1 — Socket.IO Authorization: Threat Analysis, Before/After, Validation

**Branch:** `feat/phase1-security-hardening` · **Scope:** `Sites/Trump` · **File:** `server/services/socketService.js` (+ `server/utils/helpers.js`, `server/server.js`)

## 1. Problem

Before this change the Socket.IO layer performed **no authentication**. The only
gate on every event was `isValidRestaurant(payload.restaurantId)` — a check
against the public constant `"trump"` — plus a table-id format check. Any client
that could reach an allowed origin (i.e. any visitor to the site) could emit
privileged events.

## 2. Threat model (before)

| STRIDE | Threat | Privileged event abused | Impact |
|---|---|---|---|
| Spoofing | Register as staff under any name | `joinAsWaiter` | Fake waiter presence, hijack call routing |
| Elevation | Join staff broadcast rooms | `joinAdmin`, `joinKitchen` | Guest receives all order/table/kitchen events |
| Information disclosure | Receive `orderPlaced`, `waiterCallAlert`, `kitchenStatusUpdate` | (via room join) | Live revenue/order data leak |
| Tampering | Overwrite any table's cart | `updateCart` (any `tableId`) | Cart manipulation / denial |
| Tampering | Wipe any table | `adminResetTable` | Operational disruption |
| Tampering | Force admin overrides | `updateAdminOverrides` | Price/availability override abuse |

**Assets:** live order stream, per-table carts, waiter-call routing, kitchen queue.
**Attacker:** any unauthenticated browser on the restaurant's origin (a seated guest,
or anyone who loads the public menu URL).

## 3. Fix

1. **Handshake authentication** (`io.use`, [socketService.js](../../server/services/socketService.js)). The signed
   `trump_session` cookie rides the same-origin handshake automatically; it is
   verified with the *same* HMAC + active-user logic as the REST layer via the new
   `auth.authenticateCookieHeader()` ([helpers.js](../../server/utils/helpers.js)). The result is attached as
   `socket.data.user` (or `null` for guests). **The connection is never rejected** —
   guests must still use the menu — identity is simply established.
2. **Per-event authorization** on every privileged handler:

| Event | Required | Rule |
|---|---|---|
| `joinTable` | anyone | records the table in `socket.data.tables` |
| `updateCart` | guest *of that table* **or** staff | `socketCanControlTable()` |
| `fetchHistory` | guest *of that table* **or** staff | `socketCanControlTable()` |
| `callWaiter` | guest *of that table* **or** staff | `socketCanControlTable()` |
| `joinAsWaiter` | `owner`/`manager`/`waiter` | identity taken from session, **not** payload |
| `waiterResponding` | `owner`/`manager`/`waiter` | `socketHasRole()` |
| `joinKitchen` | `owner`/`manager`/`kitchen` | `socketHasRole()` |
| `joinAdmin` | `owner`/`manager` | `socketHasRole()` |
| `updateAdminOverrides` | `owner`/`manager` | `socketHasRole()` |
| `adminResetTable` | `owner`/`manager` | actor taken from session |

Denied events are logged (`socket_event_denied`) and answered with an `authError`
emit. A guest may act **only** on a table it has explicitly `joinTable`d this
session; staff may act on any table.

## 4. Before / after flow

```
BEFORE (guest, no login)
  socket.connect ──▶ accepted
  emit joinAdmin {restaurantId:'trump'} ──▶ joins admin room ──▶ receives ALL order events
  emit adminResetTable {tableId:'table5'} ──▶ table 5 wiped

AFTER (guest, no login)
  socket.connect ──▶ io.use: no cookie ──▶ socket.data.user = null (still connected)
  emit joinAdmin ──▶ socketHasRole(['owner','manager']) = false ──▶ denySocket → authError
  emit adminResetTable ──▶ denied → authError
  emit joinTable table7 ──▶ allowed, tables={table7}
  emit updateCart table7 ──▶ socketCanControlTable = true ──▶ cart synced  ✅ (own table only)
  emit updateCart table5 ──▶ not joined, not staff ──▶ denied → authError

AFTER (owner, session cookie on handshake)
  socket.connect ──▶ io.use: cookie verified ──▶ socket.data.user = {role:'owner'}
  emit joinAdmin ──▶ allowed
  emit joinAsWaiter ──▶ allowed → waiterRegistered
```

## 5. Validation (live, against running server)

Probe script connected a real `socket.io-client` to the running server as a guest
(no cookie) and as an authenticated owner (session cookie on the handshake).

**Guest (no cookie):**
```json
{ "deniedEvents": ["joinAdmin", "joinAsWaiter", "updateCart"],
  "receivedEvents": ["syncCart", "syncCart"],
  "joinedTableWriteAllowed": true }
```
- `joinAdmin`, `joinAsWaiter` (spoofed name "Spoofed McHacker"), and cross-table
  `updateCart` (table5, not joined) were **all denied**.
- The legitimate guest flow — `joinTable table7` then `updateCart table7` — **was
  allowed** and synced (`syncCart`). Customer ordering is unbroken.

**Owner (session cookie):**
```json
{ "deniedEvents": [],
  "receivedEvents": ["syncCart", "waiterRegistered", "syncCart"] }
```
- `joinAdmin` and `joinAsWaiter` **succeeded** (no `authError`); `waiterRegistered`
  confirmation received.

## 6. Residual risk / notes

- **Same-origin assumption.** Auth relies on the browser sending the `HttpOnly`
  cookie on the same-origin handshake (the SPA is served from the same origin as
  `/Trump/socket.io`). Cross-origin embedding is already blocked by the CORS
  allow-list and `frame-ancestors 'self'`.
- **Reconnect resets joined tables.** `socket.data.tables` is per-connection; the
  client re-emits `joinTable` on (re)connect, so a brief race could deny the first
  `updateCart` after a reconnect — it succeeds on the next emit. We intentionally do
  **not** auto-join on `updateCart` (doing so would reopen the hole).
- **Waiter identity** is now derived from the authenticated account
  (`label`/`username`), so a waiter can no longer register under an arbitrary name.
- Kitchen role can join the kitchen room but cannot control carts (by design).
