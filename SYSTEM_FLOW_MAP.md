# SYSTEM FLOW MAP
## Emenyu Restaurant Management Platform
**Audit Date:** 2026-05-21

---

## 1. CUSTOMER FLOW

### 1.1 Page Load
```
Browser → https://emenyu.com/Trump/table3
  └─ NGINX reverse proxy
      └─ localhost:3012 (Trump Express)
          └─ express.static(baseDir) → serves index.html
```

### 1.2 Socket Connection
```
index.html loads Socket.IO client
  └─ io('/Trump/socket.io', { credentials: true })
      └─ SocketService.initialize() — origin checked against TRUMP_ALLOWED_ORIGINS
          └─ socket.on('connection')
              └─ handleConnection(socket)
```

### 1.3 Table Join
```
Client emits: joinTable({ restaurantId: 'trump', tableId: 'table3' })
  └─ handleJoinTable(socket, payload)
      └─ isValidRestaurant('trump') → true
      └─ normalizeId('table3') → 'table3'
      └─ socket.join(['trump:table3', 'trump:3'])   ← alias rooms
      └─ getTableState('table3')
          ├─ check tableMemory['table3']
          └─ if miss: fileService.loadTableCart('table3') → tables/table3.json
      └─ emitCartToSocket(socket, 'table3', cart)   → 'syncCart' event
      └─ emitHistoryToSocket(socket, 'table3')      → 'syncHistory' event
      └─ emitAdminOverrideToSocket(socket, overrides) → 'adminOverrideUpdate'
```

### 1.4 Menu Load
```
Client: fetch('/Trump/api/menu')
  └─ menuController.getMenu()
      └─ fileService.loadMenu()
          ├─ prismaMenuService.loadMenu() → PostgreSQL query
          │   └─ menuCategory.findMany({ include: items, orderBy: sortOrder })
          │   └─ Reconstruct JSON from DB rows
          └─ if Prisma unavailable/empty: loadMenuJson() → food/TrumpMenu.json
```

### 1.5 Add Item to Cart
```
Customer clicks item → JS updates local cart array
  └─ Client emits: updateCart({ restaurantId: 'trump', tableId: 'table3', cart: [...] })
      └─ handleUpdateCart(payload)
          └─ replaceTableCart('table3', cart)
              └─ tableMemory['table3'].cart = cart
              └─ fileService.saveTableCart('table3', cart) → tables/table3.json
              └─ emitTableCart('table3', cart)
                  └─ io.to(['trump:table3','trump:3']).emit('syncCart', { restaurantId, tableId, cart })
                  └─ ALL clients in that table room receive updated cart
```

### 1.6 Call Waiter
```
Customer presses bell
  └─ Client emits: callWaiter({ restaurantId: 'trump', tableId: 'table3' })
      └─ handleCallWaiter(payload)
          └─ io.to('trump:waiters').emit('incomingWaiterCall', { tableId, displayTable, message, timestamp })
          └─ io.to('trump:admin').emit('waiterCallAlert', { type: 'incoming', ... })
```

### 1.7 Submit Order
```
Customer clicks "Place Order"
  └─ Client: POST /Trump/submit_order { table_number, cart, waiterName, notes }
      └─ orderController.submitOrder()
          └─ fileService.saveOrder(tableId, orderData)
              ├─ Write JSON → orders/order_table_<id>_<timestamp>.json
              └─ prismaOrderService.saveOrder() → PostgreSQL Order + OrderItems
          └─ socketService.resetTableState(tableId)  ← clear cart
          └─ socketService.emitOrderPlaced(order)    ← notify admin/waiters
          └─ return { ok: true, filename }
```

---

## 2. WAITER FLOW

### 2.1 Login
```
Waiter visits /Trump/Login
  └─ POST /Trump/api/auth/login { username: 'waiter', password: '...' }
      └─ accountService.verifyCredentials()
      └─ issueSession() → Set-Cookie: trump_session=<HMAC token>
      └─ return { ok: true, user: { role: 'waiter' }, defaultPath: '/Trump/Waiter' }
  └─ Browser redirects to /Trump/Waiter
```

### 2.2 Page Load & Registration
```
waiter.html loads
  └─ auth.requirePage(['owner','manager','waiter']) middleware
      └─ getRequestUser() → reads trump_session cookie → verifyToken() → DB lookup
      └─ role check passes → serveWaiterPage() → waiter.html
  └─ Socket connects + emits: joinAsWaiter({ restaurantId: 'trump', name: 'John' })
      └─ handleJoinAsWaiter()
          └─ socket.join('trump:waiters')
          └─ connectedWaiters[socket.id] = { name: 'John', socketId }
          └─ fileService.recordWaiterAssignment('waiter', 'John', socketId)
          └─ socket.emit('waiterRegistered', { name, message })
```

### 2.3 Receive Waiter Call
```
Server emits 'incomingWaiterCall' to 'trump:waiters' room
  └─ waiter.html JS receives event
  └─ Bell animation + sound plays
  └─ Waiter taps "I'm on my way"
      └─ Client emits: waiterResponding({ restaurantId, tableId: 'table3' })
          └─ handleWaiterResponding()
              └─ io.to('trump:admin').emit('waiterCallAlert', { type: 'responding', waiterName })
              └─ io.to(['trump:table3','trump:3']).emit('waiterOnTheWay', { waiterName, message })
              └─ fileService.recordWaiterAssignment('table3', 'John', socketId)
```

### 2.4 Add Items at Table
```
POST /Trump/api/waiter/add-items { tableId, items }
  └─ auth.requireRoles(['owner','manager','waiter'])
  └─ waiterController.addItems()
      └─ fileService.saveOrder(tableId, { items, waiterName, isWaiterInitiated: true })
      └─ socketService.emitTableHistory(tableId) → push updated history to table clients
```

### 2.5 Archive Table (Checkout)
```
POST /Trump/api/waiter/archive-table { tableId }
  └─ waiterController.archiveTable()
      └─ fileService.archiveTableOrders(tableId)
          └─ Move all order_table_<id>_*.json from orders/ to history/
          └─ prismaOrderService.archiveOrders(tableId) → UPDATE status='history'
      └─ socketService.resetTableState(tableId)
      └─ return { ok: true, archivedCount }
```

---

## 3. ADMIN FLOW

### 3.1 Login
```
Same as waiter login, role = 'owner' or 'manager'
  └─ defaultPath: '/Trump/Admin'
```

### 3.2 Admin Page Load
```
GET /Trump/admin.html
  └─ auth.requirePage(['owner','manager'])
  └─ orderController.serveAdminPage() → admin.html
  └─ Socket connects + emits: joinAdmin({ restaurantId: 'trump' })
      └─ socket.join('trump:admin')
```

### 3.3 Monitor Orders
```
Admin page polls or listens for:
  - 'orderPlaced' event → new order arrived
  - 'orderUpdated' event → order status changed
  - 'waiterCallAlert' event → table called for waiter

GET /Trump/api/orders → fileService.getActiveOrders()
    ├─ prismaOrderService.getActiveOrders() → PostgreSQL query
    └─ fallback: scan orders/*.json files

GET /Trump/api/history → fileService.getHistoryOrders()
    ├─ prismaOrderService.getHistoryOrders()
    └─ fallback: scan history/*.json files
```

### 3.4 Complete / Archive Order
```
POST /Trump/api/orders/complete { filename, tableId }
  └─ orderController.completeOrder()
      └─ fileService.archiveOrder(filename, tableId)
          └─ Move orders/<file> → history/<file>
          └─ prismaOrderService.setOrderStatus(filename, 'history')
      └─ socketService.emitOrderUpdated()
      └─ socketService.emitTableHistory(tableId) → push to table clients
```

### 3.5 Admin Override (Price/Menu Adjustments)
```
Admin sets table override in UI
  └─ Client emits: updateAdminOverrides({ restaurantId, tableId, overrides: [...] })
      └─ handleUpdateAdminOverrides()
          └─ setTableAdminOverrides(tableId, overrides)
              └─ tableMemory[tableId].adminOverrides = overrides
              └─ emitAdminOverride(tableId, overrides)
                  └─ io.to(tableRooms).emit('adminOverrideUpdate', { overrides })
                  └─ Customer table UI receives override, adjusts displayed prices
```

### 3.6 Manage Menu
```
POST /Trump/api/menu
  └─ auth.requireRoles(['owner','manager'])
  └─ menuController.saveMenu()
      └─ fileService.saveMenu(menuData)
          ├─ Write food/TrumpMenu.json (always)
          └─ prismaMenuService.saveMenu(menuData) → full replace in PostgreSQL transaction
      └─ socketService.emitMenuUpdated() → all clients receive 'menuUpdated', refetch
```

### 3.7 Manage Accounts
```
GET  /Trump/api/auth/accounts          → accountService.listForActor()
POST /Trump/api/auth/accounts          → accountService.createAccount()
PATCH /Trump/api/auth/accounts/:username → accountService.updateAccount()
  └─ Can suspend users → sets User.suspended=true, User.sessionInvalidBefore=now()
     → Future token reads will fail: token.issuedAt < sessionInvalidBefore
```

---

## 4. OWNER FLOW

Owner has full access to all admin flows plus:

### 4.1 Account Management
```
Owner can:
  - Create new manager/waiter accounts
  - Suspend/unsuspend any non-owner account
  - View all accounts

Manager can:
  - Create waiter accounts
  - Suspend waiters only
```

### 4.2 Deals of the Day Management
```
POST /Trump/api/deals
  └─ auth.requireRoles(['owner','manager'])
  └─ dealController.saveDeals()
      └─ fileService.saveDeal(dealData) → food/DealOfDay.json
      └─ socketService.emitDealUpdated() → 'dealUpdated' event broadcast
```

---

## 5. LOGIN / SESSION FLOW

### 5.1 Token Lifecycle
```
POST /api/auth/login
  ├─ accountService.findAccount(username) → check if suspended
  ├─ accountService.verifyCredentials(username, password) → bcrypt verify
  ├─ issueSession(req, res, user)
  │   └─ payload = base64url({ username, issuedAt: Date.now(), expiresAt: now+TTL })
  │   └─ token = payload + "." + HMAC-SHA256(payload, SESSION_SECRET)
  │   └─ Set-Cookie: trump_session=<encodeURIComponent(token)>; HttpOnly; SameSite=Lax; Max-Age=43200
  └─ return { ok: true, user: { username, role, label }, defaultPath }
```

### 5.2 Per-Request Auth
```
Every protected request:
  └─ getRequestUser(req)
      ├─ getSessionUser(req)
      │   └─ parseCookies(req) → extract trump_session
      │   └─ readToken(token)
      │       └─ verify HMAC signature (timing-safe)
      │       └─ check expiry
      │       └─ accountService.findActiveUser(username, issuedAt)
      │           └─ User.suspended must be false
      │           └─ issuedAt must be >= User.sessionInvalidBefore
      └─ if no cookie: readBasicUser(req) → Authorization: Basic header fallback
```

### 5.3 Logout
```
POST /api/auth/logout
  └─ accountService.invalidateSessions(username)
      └─ UPDATE User SET sessionInvalidBefore = Date.now()
  └─ clearSession(res) → Set-Cookie: trump_session=; Max-Age=0
```

---

## 6. MENU RENDERING FLOW

### 6.1 Trump Menu Rendering
```
Client fetches GET /Trump/api/menu
  └─ fileService.loadMenu()
      └─ prismaMenuService.loadMenu()
          └─ SELECT categories + items FROM PostgreSQL ORDER BY sortOrder
          └─ Reconstruct menu object:
              { "Starters": { visible: true, items: [...] }, "Mains": [...], ... }
      └─ if Prisma unavailable or empty: read food/TrumpMenu.json
  └─ Client renders menu categories → items grid
  └─ Category visibility: hidden categories not rendered
  └─ Item visibility: hidden items not rendered
  └─ ChefPick/Popular flags: render badges
  └─ imageVisible/videoVisible: show/hide media
```

### 6.2 Greek Menu Rendering
```
Client fetches GET /api/menu
  └─ fs.readFileSync(MENU_FILE) → MythosMenu.json
  └─ return JSON directly (no transformation)
  └─ Client renders categories and items
```

---

## 7. RECOMMENDATION FLOW

### 7.1 Trump Recommendation Flow
```
Client: POST /Trump/api/ai/recommend { cart, context }
  └─ aiController.getRecommendations()
      └─ aiService.getRecommendations(cart)
          └─ fileService.loadRecommendations()  ← admin-curated groups
          └─ fileService.loadPopular()          ← popular items
          └─ aiService.buildSmartRecommendation(cart, recommendations, popular)
              └─ Analyze cart: what categories are present?
              └─ Priority 1: chef pairings matching current items (score 100)
              └─ Priority 2: category gap fill (starter/drink/dessert missing → score 60-80)
              └─ Priority 3: random popular items (score 10)
              └─ Return top 3-5 recommendations
```

### 7.2 Greek Recommendation Flow
```
Client: POST /api/recommend { cart }
  └─ Inline handler in server.js
      └─ Read recommendations.json → admin-curated groups
      └─ fuzzyMatch cart items → recommendation groups
      └─ Fill category gaps (STARTER, DRINK, DESSERT detection)
      └─ Return 3-5 items
```

### 7.3 AI Pairing Flow (Greek)
```
Client: POST /api/ai-pairing { item_name }
  └─ Proxy to recommend.py (port 5002)
      └─ Python Flask: ML-based wine/cocktail pairing
      └─ return { pairing: "Assyrtiko White Wine", reason: "..." }
```

---

## 8. CHATBOT FLOW

### 8.1 Greek Chatbot (JOSH 11.0)
```
Client: POST /api/chat { message, context }
  └─ Proxy handler with 5 retry attempts (500ms delay between)
      └─ axios.post('http://127.0.0.1:5001/chat', payload)
          └─ JOSH 11.0 Flask API (auto-spawned child process)
              └─ NLU processing → intent detection
              └─ Dialogue manager → response generation
              └─ Memory: brain_memory.json (learned Q&A)
              └─ return { response: "...", confidence: 0.95 }
```

### 8.2 Trump Chatbot (GROQ API)
```
Client: POST /Trump/api/ai/chat { message, history }
  └─ aiController.chat()
      └─ aiService.chat(message, history)
          └─ POST to GROQ API (cloud LLM) with menu context
          └─ return { response: "...", model: "llama3-..." }
```

---

## 9. REALTIME SOCKET.IO FLOW

```
Full Socket.IO event map — see SOCKET_FLOW_ANALYSIS.md for detail.

Events emitted BY client:
  joinTable            → server: join room, sync state
  joinAsWaiter         → server: register waiter
  joinAdmin            → server: register admin
  callWaiter           → server: broadcast to waiters + admin
  waiterResponding     → server: confirm response to admin + table
  updateCart           → server: replace cart state + broadcast
  updateAdminOverrides → server: update override state + broadcast
  fetchHistory         → server: emit history to this socket

Events emitted BY server:
  syncCart             → table clients: current cart array
  syncHistory          → table clients: active orders for this table
  adminOverrideUpdate  → table clients: price/menu overrides
  incomingWaiterCall   → waiter room: table X calling
  waiterCallAlert      → admin room: waiter call events (incoming/responding)
  waiterOnTheWay       → table clients: waiter name + confirmation
  waiterRegistered     → waiter socket: registration confirmation
  orderPlaced          → all: new order submitted
  orderUpdated         → all: order status changed
  menuUpdated          → all: menu was changed
  dealUpdated          → all: deal was changed
  recommendationUpdated → all: recommendations changed
  newChatLog           → all: new chat interaction
```

---

## 10. ORDER LIFECYCLE FLOW

```
CREATED
  └─ Customer submits order via POST /submit_order
  └─ Written to: orders/order_table_<id>_<timestamp>.json
  └─ Written to: PostgreSQL Order (status='active', sourceKind='orders')
  └─ OrderItems written: PostgreSQL OrderItem rows
  └─ OrderStatusHistory: { toStatus: 'active', actor: 'customer' }
  └─ Cart cleared: tables/<id>.json = [], Prisma ActiveCartState.cart = []
  └─ Socket: emitOrderPlaced() → admin + waiter notified

IN PROGRESS
  └─ Admin views orders list
  └─ Admin can update order notes/waiterName (PATCH /api/orders/:filename)
  └─ OrderStatusHistory appended on each change

COMPLETED
  └─ Admin or waiter marks complete via POST /api/orders/complete
  └─ orders/order_table_<id>_<ts>.json moved to history/
  └─ PostgreSQL Order: sourceKind='history', status='history'
  └─ OrderStatusHistory: { toStatus: 'history', actor: username }
  └─ Socket: emitTableHistory(tableId) → table client list refreshes
  └─ Socket: emitOrderUpdated() → admin panel refreshes

ARCHIVED (table checkout)
  └─ POST /api/waiter/archive-table { tableId }
  └─ ALL active orders for table moved to history
  └─ Cart reset
  └─ Table status updated
```

---

## 11. STARTUP FLOW (TRUMP DETAILED)

```
node server.js
  └─ require('./server/server.js') → startServer()
      1. loadEnvironment()       → dotenv from .env, ../../../.env
      2. createConfig()          → validate env, build config object
      3. new FileService()
      4. fileService.ensureBaseFiles()
          a. mkdir food, orders, history, tables, data, uploads, frontend
          b. ensure deals.json, recommendations.json, popular.json, chat_logs.json
          c. loadMenuJson() from TrumpMenu.json
          d. prismaMenu.hasMenuData() → if empty, migrateFromJson(menu,recs,popular)
          e. prismaOrder.hasOperationalData() → if empty, migrateFromJson(orders,history,carts)
      5. new AccountService() + ensureReady()
          └─ Prisma $connect() + SELECT 1 health check
      6. express() + http.createServer(app)
      7. new SocketService() + initialize(server)
          └─ socketIO(server, { path: '/Trump/socket.io', cors: ... })
      8. new AiService()
      9. createRoleAuth() — builds auth middleware closures
     10. Controllers instantiated
     11. Middleware applied (requestLogger → security → json/urlencoded parsers)
     12. Health routes registered (/healthz, /readyz)
     13. Static serving registered
     14. Auth routes registered
     15. Feature routes registered (menu, deal, upload, order)
     16. Error handler registered
     17. server.listen(port, host) → logs 'server_started'
     18. registerProcessHandlers() → SIGTERM/SIGINT/uncaughtException handlers

Ready to serve requests.
```
