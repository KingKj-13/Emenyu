# FRONTEND ↔ BACKEND RELATIONS
## API Endpoints, Data Consumption, and WebSocket Bindings
**Audit Date:** 2026-05-21

---

## 1. TRUMP API SURFACE

### 1.1 Authentication Routes
| Method | Path (all aliases registered) | Auth | Handler | Returns |
|--------|-------------------------------|------|---------|---------|
| `POST` | `/api/auth/login` | None | `auth.login` | `{ ok, user, defaultPath }` |
| `POST` | `/api/auth/logout` | None | `auth.logout` | `{ ok }` |
| `GET`  | `/api/auth/me` | None | `auth.me` | `{ user, defaultPath }` |
| `GET`  | `/api/auth/accounts` | owner, manager | `auth.listAccounts` | `[User]` |
| `POST` | `/api/auth/accounts` | owner, manager | `auth.createAccount` | `User` (201) |
| `PATCH`| `/api/auth/accounts/:username` | owner, manager | `auth.updateAccount` | `User` |

All auth paths registered with 3 alias prefixes: no prefix, `/Trump`, `/trump`.

### 1.2 Menu Routes
| Method | Path | Auth | Action |
|--------|------|------|--------|
| `GET` | `/api/menu` | None | Load full menu (Prisma → JSON fallback) |
| `POST` | `/api/menu` | owner, manager | Replace entire menu + broadcast `menuUpdated` |
| `GET` | `/api/deals` | None | Load deals |
| `POST` | `/api/deals` | owner, manager | Save deals + broadcast `dealUpdated` |
| `GET` | `/api/recommendations` | None | Load recommendations |
| `POST` | `/api/recommendations` | owner, manager | Save recommendations + broadcast `recommendationUpdated` |
| `GET` | `/api/popular` | None | Load popular items |

### 1.3 Order Routes
| Method | Path | Auth | Action |
|--------|------|------|--------|
| `POST` | `/submit_order` | None | Submit order → file + Prisma + clear cart |
| `GET` | `/orders` | owner, manager | List active orders |
| `GET` | `/history` | owner, manager | List history orders |
| `POST` | `/api/orders/complete` | owner, manager | Move order to history |
| `POST` | `/api/waiter/add-items` | waiter+ | Waiter-initiated order |
| `POST` | `/api/waiter/archive-table` | waiter+ | Archive all table orders |

### 1.4 AI Routes
| Method | Path | Auth | Action |
|--------|------|------|--------|
| `POST` | `/api/ai/chat` | None | GROQ LLM chat response |
| `POST` | `/api/ai/recommend` | None | Smart recommendation engine |
| `POST` | `/api/ai/pairing` | None | AI drink/wine pairing |

### 1.5 Upload Routes
| Method | Path | Auth | Action |
|--------|------|------|--------|
| `POST` | `/api/upload` | owner, manager | Multer file upload → /uploads/ |

### 1.6 Static Routes
| Pattern | Handler | Cache |
|---------|---------|-------|
| `/*.html` | express.static | no-store |
| `/Trump/*.html` | express.static | no-store |
| `/**/*.{css,js,png,...}` | express.static | 7 days |
| `/Trump/Login` | Send login.html | no-store |
| `/admin.html` | Serve with role check | no-store |
| `/waiter.html` | Serve with role check | no-store |
| `/healthz` | Health handler | no-cache |
| `/readyz` | Readiness handler | no-cache |

---

## 2. GREEK API SURFACE

### 2.1 HTTP Routes
| Method | Path | Auth | Action |
|--------|------|------|--------|
| `GET` | `/Greek/` | None | Serve index.html |
| `GET` | `/Greek/Admin` | adminAuth | Serve admin.html |
| `GET` | `/Greek/Waiter` | None | Serve waiter.html |
| `GET` | `/api/menu` | None | Read MythosMenu.json → JSON |
| `POST` | `/api/menu` | adminAuth | Write MythosMenu.json |
| `GET` | `/api/deals` | None | Read DealOfDay.json |
| `POST` | `/api/deals` | adminAuth | Write DealOfDay.json |
| `GET` | `/api/recommendations` | None | Read recommendations.json |
| `POST` | `/api/recommendations` | adminAuth | Write recommendations.json |
| `POST` | `/api/chat` | None | Proxy to JOSH 11.0 (port 5001) |
| `POST` | `/api/ai-pairing` | None | Proxy to recommend.py (port 5002) |
| `POST` | `/api/recommend` | None | Smart recommendation engine (inline) |
| `POST` | `/submit_order` | None | Write order JSON file |
| `GET` | `/orders` | adminAuth | List orders/*.json |
| `GET` | `/history` | adminAuth | List history/*.json |
| `POST` | `/complete` | adminAuth | Move order to history |
| `POST` | `/api/waiter/add-items` | None | Waiter-initiated order file |
| `POST` | `/api/waiter/archive-table` | None | Move all table orders to history |
| `POST` | `/api/upload` | adminAuth | Multer upload |

---

## 3. FRONTEND DATA CONSUMPTION (TRUMP)

### 3.1 Customer Menu Page (index.html / menu.html)
```
On load:
  1. fetch GET /Trump/api/menu → render category tabs + item grid
  2. fetch GET /Trump/api/deals → show deal banner
  3. socket.emit joinTable({ restaurantId, tableId })
     → receive syncCart (restore cart state)
     → receive syncHistory (show past orders)
     → receive adminOverrideUpdate (apply price overrides)

On interaction:
  - Add item to cart → update local array → emit updateCart
  - Remove item → same flow
  - Call waiter → emit callWaiter
  - Submit order → POST /Trump/submit_order

Real-time updates:
  - 'menuUpdated' → refetch GET /api/menu
  - 'dealUpdated' → refetch GET /api/deals
  - 'syncCart' → replace cart UI
  - 'syncHistory' → update order history UI
  - 'adminOverrideUpdate' → apply overrides to displayed prices
  - 'waiterOnTheWay' → show toast notification
```

### 3.2 Admin Page (admin.html)
```
On load:
  1. fetch GET /Trump/api/auth/me → verify session, redirect if not owner/manager
  2. fetch GET /Trump/orders → render active orders
  3. fetch GET /Trump/history → render history
  4. fetch GET /Trump/api/menu → render menu editor
  5. socket.emit joinAdmin({ restaurantId })

Real-time updates:
  - 'orderPlaced' → refresh orders list
  - 'orderUpdated' → refresh orders + history
  - 'waiterCallAlert' → show alert notification
  - 'menuUpdated' → refresh menu editor

Actions:
  - Complete order → POST /Trump/api/orders/complete
  - Save menu → POST /Trump/api/menu
  - Save deals → POST /Trump/api/deals
  - Upload image → POST /Trump/api/upload
  - Manage accounts → GET/POST/PATCH /Trump/api/auth/accounts
  - Set table override → emit updateAdminOverrides
  - Reset table → emit adminResetTable (?)
```

### 3.3 Waiter Page (waiter.html)
```
On load:
  1. fetch GET /Trump/api/auth/me → verify role is waiter+
  2. socket.emit joinAsWaiter({ restaurantId, name })
     → receive waiterRegistered

Real-time events:
  - 'incomingWaiterCall' → bell alert + notification card
  - 'orderPlaced' → optional notification

Actions:
  - Respond to call → emit waiterResponding({ restaurantId, tableId })
  - Add items → POST /Trump/api/waiter/add-items
  - Archive table → POST /Trump/api/waiter/archive-table
```

### 3.4 Login Page (login.html)
```
Submit form:
  POST /Trump/api/auth/login { username, password }
  → if ok: redirect to defaultPath (/Trump/Admin or /Trump/Waiter)
  → if error: show error message
```

---

## 4. FRONTEND DATA CONSUMPTION (GREEK)

### 4.1 index.html (Customer)
```
On load:
  1. fetch GET /api/menu → render menu
  2. fetch GET /api/deals → show deal banner
  3. socket connect, emit joinTable({ restaurantId: 'greek', tableId })
     → receive syncCart
     → receive syncHistory
     → receive adminOverrideUpdate

On interaction:
  - Cart changes → emit updateCart
  - Submit → POST /submit_order
  - Chatbot → POST /api/chat
  - AI pairing → POST /api/ai-pairing
  - Recommendation → POST /api/recommend
  - Call waiter → emit callWaiter
```

### 4.2 admin.html (Greek)
```
Browser basic auth prompt (admin:Kshitij)
  → GET /Greek/Admin with Authorization header

Loads:
  - GET /orders (with auth header)
  - GET /history
  - GET /api/menu
  - socket.emit joinAdmin

Actions same as Trump admin but via different route structure.
```

---

## 5. CART PERSISTENCE STRATEGY

### 5.1 Cart Data Flow
```
User adds item
  │
  ├─ Frontend: update local JS array (immediate UI update)
  │
  └─ emit updateCart({ restaurantId, tableId, cart })
       │
       ├─ Server in-memory tableMemory['table3'].cart = cart
       │   (synchronous, instant)
       │
       ├─ Async: write tables/table3.json
       │   (disk write, ~1-5ms)
       │
       ├─ Async: Prisma upsert ActiveCartState
       │   (DB write, ~5-20ms)
       │
       └─ io.to(tableRooms).emit('syncCart', { cart })
           (broadcast, all clients in room update)
```

### 5.2 Cart Recovery Scenarios

| Scenario | Recovery |
|----------|----------|
| Customer refreshes page | `joinTable` → server emits `syncCart` from tableMemory |
| Server restarts | tableMemory empty → load from Prisma → load from disk |
| PostgreSQL down | tableMemory miss → disk fallback (tables/*.json) |
| Complete disk failure | Cart lost (no tertiary backup) |
| Multiple devices at same table | All receive `syncCart` → all synchronized |

---

## 6. WEBSOCKET ↔ HTTP BOUNDARY

Some operations exist as both HTTP and Socket.IO paths:

| Operation | HTTP Path | Socket Event | Notes |
|-----------|-----------|-------------|-------|
| Submit order | POST /submit_order | (none, HTTP only) | Order submission is HTTP |
| Update cart | (none, socket only) | updateCart | Cart is socket-only |
| Complete order | POST /api/orders/complete | (none) | HTTP only |
| Archive table | POST /api/waiter/archive-table | (none) | HTTP only |
| Admin override | (none) | updateAdminOverrides | Socket only |
| Waiter call | (none) | callWaiter | Socket only |
| Menu update | POST /api/menu | (triggers menuUpdated) | HTTP write, socket notify |
| Load history | GET /history | fetchHistory | Both paths exist |

---

## 7. MENU DATA FORMAT

### 7.1 JSON Format (all sites)
```json
{
  "Starters": {
    "visible": true,
    "Cold Meze": {
      "visible": true,
      "items": [
        {
          "name": "Hummus",
          "description": "...",
          "price": 85,
          "calories": "150kcal",
          "allergens": "sesame",
          "spice": "",
          "img": "/Images/hummus.jpg",
          "video": "",
          "imageVisible": true,
          "videoVisible": false,
          "visible": true,
          "chefPick": false,
          "popular": true,
          "source_title": "Starters"
        }
      ]
    }
  },
  "Mains": [
    { "name": "Moussaka", "price": 250, ... }
  ]
}
```

Note: Two structures — object with `items` array (nested categories) and direct array (flat category). Both supported by `PrismaMenuService.flattenMenu()` and `dbItemToJson()`.

### 7.2 PostgreSQL Format
Stored as normalised rows:
```
MenuCategory: id=1, restaurantId='trump', title='Starters', path='trump/001-starters', parentId=null
MenuCategory: id=2, restaurantId='trump', title='Cold Meze', path='trump/001-starters/001-cold-meze', parentId=1
MenuItem: id=1, categoryId=2, name='Hummus', price=85, normalizedName='hummus', ...
```

Round-trip fidelity maintained via `metadata.storage` ('array' vs 'object') on categories.

---

## 8. ORDER DATA FORMAT

### 8.1 JSON Order File
```json
{
  "table_number": "table3",
  "waiterName": "John",
  "notes": "No spice on the lamb",
  "items": [
    { "name": "Moussaka", "price": 250, "quantity": 2, "note": "Extra sauce" },
    { "name": "Assyrtiko", "price": 120, "quantity": 1, "note": "" }
  ],
  "timestamp": "2026-05-21T14:30:00.000Z",
  "restaurantId": "trump"
}
```

### 8.2 Filename Pattern
`order_table_<normalizedTableId>_<unixTimestampMs>.json`  
Example: `order_table_table3_1748777400000.json`

### 8.3 PostgreSQL Order Record
```
Order:     id, restaurantId='trump', filename='order_table_table3_...json', tableId='table3',
           status='active', sourceKind='orders', subtotal=620, vat=..., total=...,
           raw={ original JSON }, timestamp=2026-05-21T14:30:00Z
OrderItem: orderId=1, name='Moussaka', price=250, quantity=2, note='Extra sauce'
OrderItem: orderId=1, name='Assyrtiko', price=120, quantity=1
```

---

## 9. KEY FRONTEND/BACKEND DESIGN OBSERVATIONS

1. **No API versioning** — all routes at `/api/*` without `/v1/`. Breaking changes would affect all clients simultaneously.

2. **No request body validation** — controllers receive raw `req.body` without schema validation. Malformed data would be written to files/DB.

3. **No pagination** — `GET /orders` and `GET /history` return all records. With high volume, this becomes slow.

4. **Static files served from site root** — `express.static(config.directories.base)` serves everything including `food/*.json`. Menu files are publicly accessible at `/Trump/food/TrumpMenu.json`.

5. **No API authentication on customer routes** — `/api/menu`, `/submit_order`, `/api/recommend` have no auth. This is intentional for customer UX but means anyone can submit orders.

6. **Socket.IO and HTTP share the same server** — `http.createServer(app)` used by both. No separate WebSocket port.

7. **Greek frontend routes return HTML without auth guard** — `/Greek/Waiter` serves waiter.html to anyone; the auth is done in JS after load.
