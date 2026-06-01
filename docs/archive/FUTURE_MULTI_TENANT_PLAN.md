# FUTURE MULTI-TENANT PLAN
## Evolution Path: Current Platform → Scalable Restaurant SaaS
**Audit Date:** 2026-05-21  
**Status:** Planning document only — no implementation yet

---

## IMPORTANT: THIS IS AN ANALYSIS DOCUMENT
Do not implement any of the below until Phase 3 CMS is complete and stable.  
This document maps the evolution path from the current state to a commercial SaaS.

---

## 1. CURRENT STATE ASSESSMENT

### What Exists Today
```
4 isolated restaurant sites
  ├─ Trump: Production-grade (Prisma + RBAC + PM2 + structured logging)
  ├─ Greek: Feature-rich (JOSH AI + Python ML + waiter system)
  ├─ Imli: Isolated (11 fixes applied)
  └─ AlPescatore: Merged menus (3-file combination)

Each site is:
  - An independent Node.js process
  - On its own port
  - With its own JSON data files
  - Served by NGINX at a path prefix
```

### What the Target Looks Like
```
One platform
  ├─ Restaurant A: Prime Grillhouse (trump)
  ├─ Restaurant B: Mythos (greek)
  ├─ Restaurant C: Imli Indian (imli)
  ├─ Restaurant D: Al Pescatore (alpescatore)
  └─ Restaurant E: New onboarded customer (any)

Each tenant:
  - Isolated data (restaurantId-scoped rows)
  - Configurable branding (theme, logo, colors)
  - Self-service admin panel
  - Billed per subscription tier
  - No code deployment required to add new tenant
```

---

## 2. MULTI-TENANCY MODELS (ANALYSIS)

Three approaches, each with trade-offs:

### Model A: Shared Schema, Shared DB (Row-Level Isolation)
```
Single PostgreSQL database
All tables have restaurantId column
Queries always filtered: WHERE restaurantId = :tenantId

Pros:
  + Easiest to implement (already partially done in Prisma schema)
  + Single database to maintain
  + Easy cross-tenant analytics for platform owner

Cons:
  - Noisy neighbor: one tenant's heavy query slows others
  - Data breach risk: a bug could leak cross-tenant data
  - Harder to offer per-tenant SLA
  - Complex row-level security in PostgreSQL required
```

**Assessment for Emenyu:** This is the most feasible near-term path. The Prisma schema already has `restaurantId` on all models. The primary gap is removing `@default("trump")` and making restaurantId required.

### Model B: Separate Schema per Tenant (Schema Isolation)
```
One PostgreSQL database
Each tenant gets their own schema: `trump.*`, `greek.*`, etc.
Prisma client pointed at tenant-specific schema at runtime

Pros:
  + Strong isolation (can't accidentally cross schemas)
  + Easy per-tenant backup/restore
  + Per-tenant migrations possible

Cons:
  - Prisma doesn't natively support runtime schema switching
  - Requires custom Prisma client factory
  - More complex migrations
```

**Assessment:** Not feasible without significant Prisma customisation.

### Model C: Separate Database per Tenant (Full Isolation)
```
One PostgreSQL instance
Each tenant gets: CREATE DATABASE trump_db, CREATE DATABASE greek_db
Prisma client with per-tenant DATABASE_URL

Pros:
  + Maximum isolation
  + Independent backups
  + Full SLA guarantees per tenant

Cons:
  - PostgreSQL has connection limits per database
  - More infrastructure to manage
  - Expensive at scale (100 tenants = 100 databases)
```

**Assessment:** Best for enterprise tier later; not needed for current 4-restaurant stage.

### Recommendation: Model A (Shared Schema) for Phase 3-4
Start with row-level isolation (Model A), designed to migrate to Model B if needed for compliance.

---

## 3. REQUIRED PRISMA SCHEMA CHANGES

### 3.1 Remove `@default("trump")` from All Models
Every model currently has `restaurantId String @default("trump")`. This must become required with no default:

```prisma
// BEFORE (current)
model MenuItem {
  restaurantId String @default("trump")
}

// AFTER (multi-tenant)
model MenuItem {
  restaurantId String
}
```

All application code must pass `restaurantId` explicitly on every create. The Prisma schema migration would be:
```sql
-- Make restaurantId required (no default)
-- All existing data remains tagged with 'trump' (correct)
-- New inserts must supply restaurantId explicitly
```

### 3.2 Add Tenant Registry Table
```prisma
model Restaurant {
  id           String   @id                    // e.g. "trump", "greek"
  displayName  String                          // "Prime Grillhouse"
  active       Boolean  @default(true)
  plan         String   @default("standard")  // free/standard/pro/enterprise
  settings     Json?                          // { theme, logo, currency, timezone }
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([active])
}
```

### 3.3 Add Tenant-Scoped Unique Paths
MenuCategory `path @unique` must become `@@unique([restaurantId, path])` — otherwise two restaurants with a category named "Starters" would conflict.

### 3.4 Schema for CMS (Phase 3 specific)
```prisma
model Page {
  id           Int      @id @default(autoincrement())
  restaurantId String
  slug         String
  title        String
  content      Json     // rich content blocks
  published    Boolean  @default(false)
  metadata     Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([restaurantId, slug])
}

model MediaAsset {
  id           Int      @id @default(autoincrement())
  restaurantId String
  filename     String
  originalName String
  mimeType     String
  sizeBytes    Int
  path         String
  metadata     Json?
  uploadedBy   String
  createdAt    DateTime @default(now())

  @@index([restaurantId, createdAt])
}
```

---

## 4. SHARED CORE LIBRARY PLAN

Before adding more sites or scaling, extract shared code into a `packages/core/` or `lib/` directory:

```
d:\Projects\Emenyu\
├── packages/
│   └── core/
│       ├── package.json
│       ├── auth/
│       │   ├── createRoleAuth.js      (from Trump helpers.js)
│       │   ├── accountService.js
│       │   └── prismaAuthService.js
│       ├── socket/
│       │   └── SocketService.js       (from Trump services/)
│       ├── storage/
│       │   ├── FileService.js
│       │   ├── PrismaMenuService.js
│       │   └── PrismaOrderService.js
│       ├── middleware/
│       │   ├── security.js
│       │   └── requestLogger.js
│       └── utils/
│           ├── helpers.js             (normalizeId, normalizeName, etc.)
│           └── logger.js
└── Sites/
    ├── Trump/                         ← depends on packages/core
    ├── Greek/                         ← depends on packages/core
    ├── Imli/                          ← depends on packages/core
    └── AlPescatore/                   ← depends on packages/core
```

This can be done with npm workspaces:
```json
// Root package.json
{
  "workspaces": ["packages/*", "Sites/*"]
}
```

---

## 5. AUTHENTICATION EVOLUTION PATH

### Current State
```
Trump: Cookie sessions (HMAC-SHA256), Prisma users, RBAC
Greek/Imli/AlPescatore: HTTP Basic auth, hardcoded credentials
```

### Phase 3 Target (Unified Auth)
```
All sites use the same auth system:
  - Cookie sessions (same mechanism as Trump)
  - PostgreSQL user store (Prisma)
  - Roles: superadmin (platform) / owner / manager / waiter / customer
  - tenantId attached to every user record
  - Session scoped to tenantId (cannot use Greek session on Trump)
```

```prisma
model User {
  id           Int     @id @default(autoincrement())
  restaurantId String                      // tenant scope
  username     String
  password     String                      // bcrypt
  role         String                      // owner/manager/waiter
  ...
  @@unique([restaurantId, username])       // not globally unique
}
```

### Phase 4 Target (SaaS Auth)
```
Platform-level users (can manage multiple restaurants):
  - SSO or OAuth (Google/GitHub) for platform admins
  - Restaurant-level users remain username/password
  - Billing attached to platform account not restaurant
```

---

## 6. SOCKET.IO SCALING PATH

### Current (Phase 3)
```
Single Node.js process per site
Socket.IO in-process adapter
~10,000 concurrent connections max per process
Adequate for: 4 restaurants × 20 tables × 10 customers = 800 connections
```

### Phase 4 (If Scaling Required)
```
1. Add Socket.IO Redis adapter (socket.io-redis)
   └─ Rooms shared across worker processes
   └─ PM2 cluster mode: instances: 'max' (all CPU cores)
   └─ Requires: Redis instance (Redis Cloud or local)

2. Or: Separate Socket.IO server (socket.io-standalone)
   └─ Dedicated WebSocket process
   └─ Express API remains stateless + horizontally scalable
```

---

## 7. DATABASE SCALING PATH

### Current (Phase 3)
```
Single PostgreSQL on localhost:5432
No connection pool
Prisma default pool: 10 connections per PrismaClient instance
```

### Phase 4 (Multi-Tenant Scale)
```
1. Add PgBouncer (connection pooler)
   └─ 1000 app connections → 20 real DB connections
   └─ Protects PostgreSQL from connection storms

2. Add read replica
   └─ Heavy read queries (menu load, order history) → replica
   └─ Writes (order submit, cart update) → primary

3. Database connection string per tenant (future)
   └─ Allows moving heavy tenants to dedicated DB instance
```

---

## 8. PYTHON SERVICES EVOLUTION

### Current
```
Per-site Python processes:
  Greek: JOSH 11.0 (port 5001) + recommend.py (port 5002)
  Imli: ChatBot.py (port 5002)
  AlPescatore: ChatBot.py (port 5005)
  Trump: GROQ API (no local Python)
```

### Problem
- Each restaurant has its own Python process (high memory overhead at scale)
- JOSH 11.0 loads 30s ML model per restart
- No Python process monitoring/alerting

### Phase 3 Target
```
Consolidate to shared AI service:
  Option A: Replace local Python with GROQ API for all sites (like Trump)
  Option B: Single shared Python service with restaurantId routing
  Option C: Keep per-site but add PM2/supervisor management

Recommended: Option A (GROQ) for simplicity + reliability
  - No local ML processes to manage
  - Sub-second response time (vs 30s JOSH cold start)
  - Consistent across all restaurants
  - GROQ free tier adequate for restaurant chatbot volume
```

---

## 9. FRONTEND EVOLUTION

### Current
```
Greek/Imli/AlPescatore: Monolithic HTML files (500-1500 lines each)
Trump: Modular frontend/ directory (components, pages, styles)
```

### Phase 3 Target (CMS-Driven Frontend)
```
Tenant-configurable frontend:
  - Restaurant branding (logo, colors, font) from DB
  - Menu layout configurable per tenant
  - No HTML edits needed to change restaurant look
  - Components loaded from shared library
```

### Phase 4 Target (Full SaaS Frontend)
```
Option A: SSR framework (Next.js) with per-tenant theming
  + SEO benefits
  + Server-side rendering with Prisma

Option B: Static site builder with config-driven generation
  + No runtime JS required for menu
  + CDN-cached per tenant

Option C: Continue Express + client-side JS with tenant config API
  + Minimal change from current approach
  + GET /api/tenant/config returns { theme, branding, features }
```

**Recommendation for Phase 3:** Option C — minimal disruption, delivers CMS without framework migration.

---

## 10. PHASED ROADMAP (NOT TIMELINE)

### Phase 3 (Current Target: CMS + Operational Platform)
- [ ] Create `packages/core/` shared library
- [ ] Migrate Greek/Imli/AlPescatore to use shared auth (cookie sessions)
- [ ] Add Helmet + CORS + rate limiting to all sites
- [ ] Add PM2 configs to Greek/Imli/AlPescatore
- [ ] CMS: menu editor with visual preview (Trump first, then share)
- [ ] CMS: image/media management (MediaAsset table)
- [ ] CMS: page/content management (Page table)
- [ ] Operational: unified admin dashboard (all restaurants)
- [ ] Operational: order analytics and reporting
- [ ] Persist admin overrides to DB
- [ ] Input validation on all API routes (Zod or Joi)

### Phase 4 (Multi-Tenant Foundation)
- [ ] Remove `@default("trump")` from Prisma schema
- [ ] Add `Restaurant` tenant registry table
- [ ] Remove per-site hard-coded RESTAURANT_IDs
- [ ] Tenant onboarding API (create restaurant, seed defaults)
- [ ] Per-tenant Socket.IO room isolation (already done via restaurantId)
- [ ] Per-tenant auth (restaurantId in User table)
- [ ] Menu file upload: Move food/ JSON outside static serving root
- [ ] Atomic JSON writes for fallback files
- [ ] API versioning (/api/v1/*)

### Phase 5 (SaaS Commercial)
- [ ] Billing system (Stripe or similar)
- [ ] Self-service signup + restaurant provisioning
- [ ] Tenant isolation hardening (Row Level Security in PostgreSQL)
- [ ] Socket.IO Redis adapter for horizontal scale
- [ ] PgBouncer connection pooling
- [ ] CDN for static assets
- [ ] Monitoring + alerting (Sentry, Grafana, or similar)
- [ ] CI/CD pipeline with automated tests
- [ ] Per-tenant custom domains

---

## 11. WHAT MUST NOT BREAK

These production behaviors must be preserved through all phases:

1. **Cart persistence across reconnects** — `syncCart` on `joinTable` must always work
2. **Order file compatibility** — `order_table_<id>_<ts>.json` filename format used in archive logic
3. **Waiter call bell system** — Socket.IO events and room structure
4. **Admin override delivery** — overrides must reach table clients within 1-2 seconds
5. **Menu fallback to JSON** — if Prisma is down, menu still loads
6. **Legacy menu HTML access** — `/Trump/table1` still works with table parameter routing
7. **NGINX path prefix routing** — `/Trump/*`, `/Greek/*` path routing must be maintained
8. **Greek JOSH 11.0 chatbot** — unique customer feature, cannot be silently removed
9. **AlPescatore merged menus** — 3-file merge is core to their menu structure

---

## 12. RISK OF EACH PHASE

| Phase | Risk Level | Primary Risk |
|-------|-----------|-------------|
| Phase 3 CMS | Medium | Breaking existing menu/order flows during CMS integration |
| Phase 4 Multi-tenant | High | Prisma schema changes with live data in production |
| Phase 5 SaaS | Very High | Architectural changes while serving paying customers |

**Key principle:** Each phase must ship with existing restaurants unchanged. Feature flags and parallel deployment are essential when modifying shared paths.
