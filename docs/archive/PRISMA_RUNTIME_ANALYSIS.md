# PRISMA RUNTIME ANALYSIS
## Database Schema, Migration History, Hybrid Fallback System
**Audit Date:** 2026-05-21

---

## 1. PRISMA CONFIGURATION

### 1.1 Setup
- **Location:** `d:\Projects\Emenyu\prisma/schema.prisma`
- **Generator:** `prisma-client-js`
- **Provider:** `postgresql`
- **Connection:** `env("DATABASE_URL")` from root `.env`
- **Database:** `postgresql://postgres:***@localhost:5432/emenyu`
- **Client installed:** Root `node_modules/@prisma/client` (v6.19.3)
- **Trump resolution:** `prismaMenuService.js` resolves client via relative path to root `node_modules`

### 1.2 Client Resolution (Trump)
```javascript
// prismaMenuService.js
const candidates = [
  path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'), // preferred
  '@prisma/client'                                                 // fallback
];
```
`PROJECT_ROOT` = `Sites/Trump` → `../../../../` (4 levels up to Emenyu root).  
This is a fragile path that would break if Trump is moved.

---

## 2. DATABASE SCHEMA — 12 MODELS

### 2.1 User (Authentication)
```prisma
model User {
  id                   Int       @id @default(autoincrement())
  username             String    @unique
  password             String                    ← bcrypt hash
  role                 String                    ← owner/manager/waiter
  label                String?
  suspended            Boolean   @default(false)
  suspendedAt          DateTime?
  sessionInvalidBefore BigInt?                   ← invalidate tokens issued before this
  createdBy            String    @default("system")
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@index([role])
  @@index([suspended])
}
```
**Notes:**
- `sessionInvalidBefore` is `BigInt` storing Unix milliseconds — allows instant session revocation without deleting tokens
- No email field — username-only auth
- `suspended` + `suspendedAt` allow soft-suspension with timestamp
- `createdBy` tracks which admin created the account

### 2.2 MenuCategory (Hierarchical Menu Structure)
```prisma
model MenuCategory {
  id           Int
  restaurantId String   @default("trump")       ← hard-coded default
  title        String
  slug         String                            ← URL-safe name
  path         String   @unique                 ← full path: trump/001-starters
  parentId     Int?                             ← self-referential (null = root)
  parent       MenuCategory?  @relation(...)
  children     MenuCategory[] @relation(...)
  sortOrder    Int      @default(0)
  visible      Boolean  @default(true)
  metadata     Json?                            ← stores storage format + extra fields

  @@index([restaurantId, parentId, sortOrder])
  @@index([restaurantId, slug])
  @@index([visible])
}
```
**Notes:**
- Self-referential tree: supports root categories and one level of sub-categories
- `path` field stores full hierarchical path: `trump/001-starters/001-cold-meze`
- `metadata.storage` records original JSON format: 'array' or 'object' — needed for lossless round-trip
- `@default("trump")` means all menu records default to the Trump restaurant — must be set explicitly for other restaurants

### 2.3 MenuItem (Menu Items)
```prisma
model MenuItem {
  id             Int
  restaurantId   String    @default("trump")
  categoryId     Int                           ← FK to MenuCategory (cascade delete)
  name           String
  normalizedName String                        ← lowercase alphanumeric for fuzzy search
  description    String    @default("")
  price          Float     @default(0)
  calories       String    @default("")
  allergens      String    @default("")
  spice          String    @default("")
  imagePath      String    @default("")
  videoPath      String    @default("")
  imageVisible   Boolean   @default(true)
  videoVisible   Boolean   @default(true)
  visible        Boolean   @default(true)
  chefPick       Boolean   @default(false)
  popular        Boolean   @default(false)
  sourceTitle    String    @default("")        ← original JSON category name
  sortOrder      Int       @default(0)
  metadata       Json?                        ← extra JSON fields not in base schema

  @@index([restaurantId, normalizedName])     ← fuzzy search index
  @@index([restaurantId, categoryId, sortOrder])
  @@index([visible])
  @@index([chefPick])
  @@index([popular])
}
```
**Notes:**
- `normalizedName` enables fast fuzzy matching without LIKE queries
- `metadata` preserves arbitrary JSON fields from the original menu file (extensible)
- `sortOrder` = `categoryIndex * 10000 + itemIndex` — ensures stable global sort

### 2.4 FeaturedItem (Popular/Chef Pick Lists)
```prisma
model FeaturedItem {
  id           Int
  restaurantId String    @default("trump")
  group        String                          ← "popular" or "chef_pick"
  itemId       Int?                            ← optional FK to MenuItem (by name lookup)
  itemName     String                          ← denormalized name for safety
  reason       String    @default("")
  active       Boolean   @default(true)
  sortOrder    Int       @default(0)
  metadata     Json?

  @@index([restaurantId, group, sortOrder])
  @@index([itemId])
  @@index([active])
}
```

### 2.5 Recommendation (Admin-Curated Pairings)
```prisma
model Recommendation {
  id           Int
  restaurantId String   @default("trump")
  description  String   @default("")
  items        Json                           ← array: [{ name, reason }]
  active       Boolean  @default(true)
  sortOrder    Int      @default(0)
  metadata     Json?

  @@index([restaurantId, active, sortOrder])
}
```
**Notes:** `items` stored as JSONB — flexible, allows varying item structure without schema changes.

### 2.6 RestaurantMenuSettings (Hybrid Mode Config)
```prisma
model RestaurantMenuSettings {
  id           Int
  restaurantId String   @unique @default("trump")
  settings     Json?                          ← { migratedAt, mode, ... }
  source       String   @default("json-hybrid")
}
```
**Notes:** One row per restaurant. Currently only Trump has a row. Tracks migration timestamp and mode.

### 2.7 Table (Physical Table Registry)
```prisma
model Table {
  id           Int
  restaurantId String   @default("trump")
  tableId      String                         ← "table1", "table2", etc.
  displayName  String   @default("")
  status       String   @default("active")    ← active/closed
  metadata     Json?
  orders       Order[]
  cartState    ActiveCartState?
  waiterAssignments WaiterAssignment[]

  @@unique([restaurantId, tableId])
  @@index([restaurantId, status])
}
```

### 2.8 Order (Order Lifecycle)
```prisma
model Order {
  id           Int
  restaurantId String    @default("trump")
  filename     String                         ← legacy JSON filename (for compatibility)
  tableId      String                         ← FK to Table via restaurantId+tableId
  status       String    @default("active")  ← active/complete/history
  waiterName   String    @default("")
  notes        String    @default("")
  subtotal     Float     @default(0)
  vat          Float     @default(0)
  service      Float     @default(0)
  tip          Float     @default(0)
  total        Float     @default(0)
  timestamp    DateTime  @default(now())
  sourceKind   String    @default("orders")  ← "orders" or "history"
  raw          Json?                         ← full original order payload
  items        OrderItem[]
  statusHistory OrderStatusHistory[]

  @@unique([restaurantId, sourceKind, filename])  ← allows same filename in orders + history
  @@index([restaurantId, status, timestamp])
  @@index([restaurantId, tableId, status])
  @@index([timestamp])
}
```
**Notes:**
- `filename` preserves legacy JSON filename for backward compatibility
- `sourceKind` ('orders' vs 'history') maps to the filesystem directory
- The composite unique `(restaurantId, sourceKind, filename)` allows the same order file to appear in both active and historical records — critical for the archive workflow
- `raw` stores the original order JSON for full fidelity

### 2.9 OrderItem (Line Items)
```prisma
model OrderItem {
  id          Int
  orderId     Int                            ← FK to Order (cascade delete)
  name        String
  price       Float     @default(0)
  quantity    Float     @default(1)          ← Float allows 0.5 portions
  note        String    @default("")
  imagePath   String    @default("")
  description String    @default("")
  metadata    Json?
  sortOrder   Int       @default(0)
}
```

### 2.10 OrderStatusHistory (Audit Trail)
```prisma
model OrderStatusHistory {
  id          Int
  orderId     Int                            ← FK to Order (cascade delete)
  fromStatus  String    @default("")
  toStatus    String
  actor       String    @default("system")  ← username who made the change
  reason      String    @default("")
  metadata    Json?
  createdAt   DateTime  @default(now())

  @@index([orderId, createdAt])
  @@index([toStatus])
}
```

### 2.11 ActiveCartState (Real-Time Cart)
```prisma
model ActiveCartState {
  id           Int
  restaurantId String   @default("trump")
  tableId      String                        ← FK to Table
  cart         Json                          ← current cart array
  updatedBy    String   @default("system")

  @@unique([restaurantId, tableId])
  @@index([restaurantId, updatedAt])
}
```
**Notes:** Acts as a persistent mirror of the in-memory `tableMemory` cart. Enables cart recovery after server restart.

### 2.12 WaiterAssignment (Waiter-Table Tracking)
```prisma
model WaiterAssignment {
  id           Int
  restaurantId String    @default("trump")
  tableId      String                        ← FK to Table
  waiterName   String
  socketId     String    @default("")        ← current socket connection ID
  status       String    @default("active")  ← active/released
  assignedAt   DateTime  @default(now())
  releasedAt   DateTime?
  metadata     Json?

  @@index([restaurantId, tableId, status])
  @@index([restaurantId, waiterName])
  @@index([socketId])
}
```

---

## 3. MIGRATION HISTORY

### Migration 1: `20260521092747_init`
**Creates:** `User` table  
**Purpose:** Bootstrap authentication  
**Fields added:** id, username, password, role, suspended, createdAt  

### Migration 2: `20260521094500_auth_user_metadata`
**Alters:** `User` table  
**Adds:** label, suspendedAt, sessionInvalidBefore, createdBy, updatedAt  
**Adds indexes:** role, suspended  
**Purpose:** Session revocation + account management metadata

### Migration 3: `20260521101500_menu_system`
**Creates:** MenuCategory, MenuItem, FeaturedItem, Recommendation, RestaurantMenuSettings  
**Purpose:** Full menu storage in PostgreSQL  
**Key design:** Hierarchical category tree, normalizedName for search, metadata for JSON round-trip

### Migration 4: `20260521103000_order_table_system`
**Creates:** Table, Order, OrderItem, OrderStatusHistory, ActiveCartState, WaiterAssignment  
**Purpose:** Complete order management and real-time state in PostgreSQL

### Migration 5: `20260521104000_order_filename_scope`
**Alters:** `Order` table  
**Changes:** `@@unique([filename])` → `@@unique([restaurantId, sourceKind, filename])`  
**Purpose:** Allows same filename in both 'orders' and 'history' sourceKind  
**Why:** JSON archive workflow moves files without renaming; DB must allow same filename in both states

**All 5 migrations applied sequentially. No rollbacks. No squashes.**

---

## 4. HYBRID FALLBACK SYSTEM

### 4.1 Design Pattern (FileService + PrismaMenuService + PrismaOrderService)

The hybrid system is transparent — callers use `fileService.loadMenu()` and get data regardless of whether Prisma is available:

```
fileService.loadMenu()
  ├─ prismaMenuService.loadMenu()
  │   ├─ ensureReady() → $connect() + SELECT 1
  │   │   ├─ success: ready = true
  │   │   └─ failure: disabledUntil = now + 30s, return null
  │   ├─ if ready: SELECT from PostgreSQL
  │   └─ if unavailable: return null (fallback triggered)
  └─ if null returned: loadMenuJson() → read food/TrumpMenu.json
```

### 4.2 Retry Backoff
- On Prisma failure: `disabledUntil = Date.now() + 30000` (30 seconds)
- During backoff: all Prisma calls return null/false (skip DB, use JSON)
- After backoff: next call re-attempts `$connect()` + health check
- This prevents repeated DB connection storms on failure

### 4.3 Startup Auto-Migration
When Trump server starts:
```javascript
// fileService.ensureBaseFiles()
const hasPostgresMenu = await this.prismaMenu.hasMenuData();
if (!hasPostgresMenu && Object.keys(menuData).length > 0) {
  await this.prismaMenu.migrateFromJson({ menuData, recommendations, popular });
}

const hasOperationalData = await this.prismaOrder.hasOperationalData();
if (!hasOperationalData) {
  await this.prismaOrder.migrateFromJson({ activeOrders, historyOrders, tableCarts });
}
```
**This means:** On first run (or after database wipe), Trump automatically migrates all JSON data into PostgreSQL. No manual migration step required for normal operation.

### 4.4 Dual-Write Strategy (Menu Save)
```javascript
fileService.saveMenu(menuData)
  ├─ Write food/TrumpMenu.json (always)           ← JSON always updated
  └─ prismaMenuService.saveMenu(menuData)          ← Prisma updated if available
```
JSON file is always the source of truth backup. If Prisma is down during a write, the JSON is updated and will be re-synced on next startup.

### 4.5 Fallback Limitations
| Operation | Prisma Available | Prisma Down |
|-----------|-----------------|-------------|
| Load menu | PostgreSQL (full) | TrumpMenu.json |
| Save menu | Both updated | JSON only (re-synced on restart) |
| Load orders | PostgreSQL | Scan orders/*.json |
| Save order | Both | JSON file only |
| Load cart | PostgreSQL ActiveCartState | tables/*.json |
| Auth verify | PostgreSQL User | Config-based user list |
| Waiter assignments | PostgreSQL | In-memory only (lost on restart) |

---

## 5. REPOSITORY / SERVICE PATTERNS

### 5.1 PrismaMenuService
- Wraps all Prisma menu operations
- `withPrisma(event, operation, fallback)` — retry/fallback wrapper
- `migrateFromJson()` — full JSON→DB migration in a single transaction
- `saveMenu()` — deletes all menu data and re-inserts (full replace, not patch)
- `flattenMenu()` — utility to traverse nested JSON menu structure

### 5.2 PrismaOrderService
- Wraps order/table/cart Prisma operations
- Same `withPrisma()` pattern for resilience
- `makeOrderFilename()` — generates `order_table_<id>_<timestamp>.json`

### 5.3 AccountService (wraps PrismaAuthService)
- `ensureReady()` — connects to Prisma, seeds default accounts if none exist
- `verifyCredentials(username, password)` — bcrypt.compare
- `findActiveUser(username, issuedAt)` — validates session not invalidated
- `createAccount(actor, data)` — role-restricted creation
- `updateAccount(actor, username, data)` — suspend/unsuspend + label update
- `invalidateSessions(username)` — sets `sessionInvalidBefore = Date.now()`
- `listForActor(actor)` — owner sees all, manager sees waiters only

### 5.4 FileService
- Top-level orchestrator — calls Prisma services with JSON fallbacks
- Exposes clean interface to controllers (no Prisma knowledge above FileService)
- `recordWaiterAssignment()` — writes to both in-memory and Prisma
- `releaseWaiterAssignments(socketId)` — cleanup on socket disconnect

---

## 6. KNOWN RISKS AND LIMITATIONS

| # | Risk | Impact |
|---|------|--------|
| 1 | `restaurantId @default("trump")` on all models | Adding Greek/Imli requires explicit restaurantId on every insert; existing data is all tagged 'trump' |
| 2 | `path @unique` on MenuCategory | Two restaurants cannot have categories with identical slugs at same hierarchy level; must include restaurantId in path (currently it does via `trump/001-starters`) |
| 3 | Prisma client resolved via 4-level relative path | Breaks if Trump site moves; no `package.json` Prisma dependency resolution |
| 4 | `saveMenu()` is a full delete+reinsert transaction | No incremental updates; on large menus this is expensive; any failure leaves DB empty |
| 5 | `sessionInvalidBefore` is `BigInt` | Prisma serialises BigInt differently across versions; may cause JSON serialisation issues |
| 6 | No database backup strategy documented | PostgreSQL data could be lost; JSON files are the only safety net |
| 7 | `DATABASE_URL` with password in plain `.env` | If `.env` is committed or leaked, full DB access is exposed |
| 8 | Single PostgreSQL instance | No read replica, no connection pooling (PgBouncer) |
| 9 | Prisma `$connect()` called per PrismaMenuService/PrismaOrderService instance | Multiple Prisma client instances per server boot — should be a singleton |
| 10 | No migration runner in deployment | `PRISMA_RUN_MIGRATIONS=false` in root `.env` — migrations must be run manually |
