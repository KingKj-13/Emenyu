# FULL ARCHITECTURE AUDIT
## Emenyu Restaurant Management Platform
**Audit Date:** 2026-05-21  
**Status:** Pre-Phase-3 CMS audit — read-only, no modifications made

---

## 1. REPOSITORY ROOT STRUCTURE

```
d:\Projects\Emenyu\
├── .env                          # Root DATABASE_URL for Prisma/PostgreSQL
├── .env.example
├── package.json                  # Root: Prisma client, migration scripts
├── prisma/
│   ├── schema.prisma             # 12-model PostgreSQL schema
│   ├── migration_lock.toml
│   └── migrations/
│       ├── 20260521092747_init/
│       ├── 20260521094500_auth_user_metadata/
│       ├── 20260521101500_menu_system/
│       ├── 20260521103000_order_table_system/
│       └── 20260521104000_order_filename_scope/
├── scripts/
│   ├── check-postgres.js
│   ├── prisma-safe-start.js
│   └── validate-prisma-env.js
├── Sites/
│   ├── Trump/                    # Production-grade. Prisma-backed. RBAC auth.
│   ├── Greek/                    # Feature-rich. JSON-only. JOSH 11.0 chatbot.
│   ├── Imli/                     # JSON-only. Python chatbot. 11-isolation fixes.
│   └── AlPescatore/              # JSON-only. Merged menus (food/wine/cocktail).
└── Documentation/
    ├── HYBRID_AUTH_COMPATIBILITY.md
    └── MENU_MIGRATION_STATUS.md
```

---

## 2. SITE INVENTORY

| Site | Restaurant | Port | Base Path | Server Type | Database | PM2 |
|------|-----------|------|-----------|-------------|----------|-----|
| Trump | Prime Grillhouse | 3012 (prod) / 3002 (dev) | /Trump | Modular Express | Prisma + JSON fallback | Yes |
| Greek | Mythos | 3002 | /Greek | Monolithic Express (1130 lines) | JSON only | No |
| Imli | Imli Indian | 3001 | /Imli | Monolithic Express | JSON only | No |
| AlPescatore | Al Pescatore | 3005 | / (root) | Monolithic Express | JSON only | No |

---

## 3. TRUMP SITE — DETAILED ARCHITECTURE

**Base:** `Sites/Trump/`

### 3.1 Entry Points
```
server.js              → thin wrapper: require('./server/server.js')
server/server.js       → full application bootstrap (267 lines)
ecosystem.config.js    → PM2 configuration (fork, 512M, 10 restarts)
```

### 3.2 Server Startup Sequence (`server/server.js`)
1. `loadEnvironment()` — loads `.env` from site dir, then `../../.env` (root)
2. `createConfig(baseDir)` — builds validated config object from env vars
3. `new FileService(config)` + `ensureBaseFiles()` — creates dirs, migrates JSON→Prisma
4. `new AccountService(config)` + `ensureReady()` — connects Prisma auth
5. `express()` + `http.createServer(app)`
6. `new SocketService(config, fileService, logger)` + `initialize(server)`
7. `new AiService(config, fileService, socketService)`
8. `createRoleAuth(config, accountService, logger)` — auth middleware factory
9. Controller instantiation (ai, deal, menu, order, waiter, upload)
10. Middleware chain assembly
11. Route registration
12. `server.listen(config.port, config.host)`
13. `registerProcessHandlers(...)` — SIGTERM/SIGINT/uncaughtException/unhandledRejection

### 3.3 Directory Layout
```
Sites/Trump/
├── server.js                         # Entry point stub
├── package.json                      # Express 5, Socket.IO 4, Prisma 6, Helmet 8
├── ecosystem.config.js               # PM2 config
├── .env                              # Trump-specific secrets
├── server/
│   ├── server.js                     # Full bootstrap
│   ├── controllers/
│   │   ├── aiController.js           # Chat, pairing, recommendations
│   │   ├── dealController.js         # Deal of the day
│   │   ├── menuController.js         # Menu CRUD
│   │   ├── orderController.js        # Order lifecycle + admin page serve
│   │   ├── uploadController.js       # Multer file upload
│   │   └── waiterController.js       # Waiter features + page serve
│   ├── routes/
│   │   ├── dealRoutes.js
│   │   ├── menuRoutes.js
│   │   ├── orderRoutes.js            # POST /submit_order, GET /orders, /history
│   │   └── uploadRoutes.js
│   ├── services/
│   │   ├── socketService.js          # Socket.IO class (420 lines)
│   │   ├── fileService.js            # JSON + Prisma hybrid read/write
│   │   ├── prismaMenuService.js      # Menu sync: JSON ↔ PostgreSQL
│   │   ├── prismaOrderService.js     # Order CRUD via Prisma
│   │   ├── prismaAuthService.js      # User auth via Prisma
│   │   ├── accountService.js         # Account management layer
│   │   └── aiService.js              # GROQ API + recommendation engine
│   ├── middleware/
│   │   ├── security.js               # helmet, CORS, rate-limit, compression
│   │   └── requestLogger.js          # Structured JSON request logging
│   └── utils/
│       ├── helpers.js                # Config factory, auth, ID normalisation
│       └── logger.js                 # Structured JSON logger
├── scripts/
│   ├── bootstrap-env.js
│   ├── validate-env.js
│   ├── healthcheck.js
│   ├── migrate-auth-to-postgres.js
│   ├── migrate-menu-to-postgres.js
│   └── migrate-orders-to-postgres.js
├── frontend/
│   ├── pages/
│   │   ├── menu.html
│   │   └── login.html
│   ├── components/
│   │   ├── cart.html, menu-card.html, filter-bar.html, header.html, bottom-cart.html
│   ├── scripts/
│   │   └── ui.js
│   └── styles/
│       ├── base.css, layout.css, components.css
├── index.html                        # Customer-facing menu (root)
├── admin.html                        # Admin dashboard
├── waiter.html                       # Waiter UI
├── Menu.html, drinks.html, buchery.html  # Legacy menu variants
├── food/                             # JSON menus (TrumpMenu.json, DealOfDay.json, etc.)
├── orders/                           # Active order JSON files
├── history/                          # Completed order JSON files
├── tables/                           # Per-table cart state JSON files
├── data/                             # Chat logs, accounts.json
└── uploads/                          # Uploaded images/videos
```

### 3.4 Middleware Stack (in order)
1. `RequestLogger` — assigns `req.id`, logs method/path/status/duration as JSON
2. `x-powered-by` disabled
3. `trust proxy` (configurable, true in production)
4. HTTPS redirect (configurable `TRUMP_FORCE_HTTPS`)
5. `helmet` — security headers (CSP disabled, HSTS 180d in prod, sameorigin frames)
6. `compression` — 1KB threshold
7. `cors` — dynamic origin check; localhost allowed in dev; TRUMP_ALLOWED_ORIGINS in prod
8. `rateLimit` general — 600 req/15min; skips static assets and health endpoints
9. `rateLimit` auth — 20 req/15min on login path only, skips successful requests
10. `express.json` — 2MB body limit
11. `express.urlencoded` — 1MB limit
12. Health routes (`/healthz`, `/readyz`)
13. Static file serving with 7-day cache for assets, no-cache for HTML
14. Role-based auth routes
15. Feature routes (menu, deal, upload, order)
16. Error handler — JSON responses with `requestId`

### 3.5 Authentication Architecture
- **Session tokens:** HMAC-SHA256 signed, base64url-encoded, `{username, issuedAt, expiresAt}`
- **Cookie:** `trump_session`, HttpOnly, SameSite=Lax, Secure in production, 12h TTL
- **Roles:** `owner` > `manager` > `waiter` > (anonymous customer)
- **Prisma-backed:** Users stored in PostgreSQL `User` table with bcrypt passwords
- **Fallback:** Config-based static user list if Prisma unavailable
- **Session invalidation:** `sessionInvalidBefore` field — suspending a user invalidates all live tokens
- **`requireRoles([])`** — middleware factory; unauthorized page requests redirect to login

### 3.6 Configuration System (`helpers.js:createConfig`)
All configuration read from environment variables with validated defaults:
- `TRUMP_*` prefix for all Trump-specific vars
- Production validation: fails fast if SESSION_SECRET < 32 chars, missing passwords, insecure origins
- Directories and file paths computed from `baseDir` at startup
- Config object passed as dependency to all services (no global process.env access after boot)

---

## 4. GREEK SITE — ARCHITECTURE

**Base:** `Sites/Greek/`  
**Architecture:** Single monolithic `server.js` (~1130 lines)

### 4.1 Structure
```
Sites/Greek/
├── server.js                   # All-in-one: config, routes, socket, Python spawn
├── package.json                # axios, express, socket.io, mongoose
├── .env                        # PORT, GROQ_API_KEY
├── index.html                  # Customer menu + Socket.IO client
├── admin.html                  # Admin dashboard
├── waiter.html                 # Waiter call UI
├── food/
│   ├── MythosMenu.json         # Full menu data
│   ├── DealOfDay.json
│   ├── Orders.json             # (legacy, not primary storage)
│   ├── popular.json
│   └── recommendations.json
├── orders/                     # Active order JSON files
├── history/                    # Completed orders
├── tables/                     # Per-table cart state
├── data/
│   ├── brain_memory.json       # JOSH chatbot memory
│   ├── chat_logs.json
│   ├── deals.json
│   ├── learned_qa.json
│   ├── menu_embeddings.pkl     # ML vector embeddings
│   ├── user_profiles.db
│   └── Voice.html
├── josh_enterprise/            # JOSH 11.0 chatbot (Python Flask)
│   └── api/app.py              # Flask API on port 5001
├── recommend.py                # AI pairing (port 5002)
├── ChatBot.py, action_processor.py, stt.py, tts.py, pop_recommend.py
├── Images/                     # 100+ dish images
└── dont_upload/                # Deployment notes
```

### 4.2 Greek Startup Sequence
1. `dotenv.config()`
2. Express + Socket.IO inline setup (CORS `origin: "*"`)
3. Spawn `josh_enterprise/api/app.py` (port 5001) with crash restart
4. Spawn `recommend.py` (port 5002) with crash restart
5. `server.listen(PORT, '0.0.0.0')`

### 4.3 API Routes (Greek)
```
GET  /Greek/               → index.html
GET  /Greek/Admin          → admin.html (adminAuth middleware)
GET  /Greek/Waiter         → waiter.html
GET  /api/menu             → MythosMenu.json
POST /api/menu             → update menu (adminAuth)
GET  /api/deals            → DealOfDay.json
POST /api/deals            → update deals (adminAuth)
GET  /api/recommendations  → recommendations.json
POST /api/recommendations  → update recommendations (adminAuth)
POST /api/chat             → proxy to JOSH 11.0 (port 5001, 5 retries)
POST /api/ai-pairing       → proxy to recommend.py (port 5002)
POST /api/recommend        → server-side recommendation engine
POST /submit_order         → write order_table_<id>_<ts>.json
GET  /orders               → list active orders (adminAuth)
GET  /history              → list history orders (adminAuth)
POST /complete             → move order from orders/ to history/
POST /api/waiter/add-items → waiter-initiated order
POST /api/waiter/archive-table → move all orders to history
POST /api/upload           → multer file upload
```

---

## 5. IMLI SITE — ARCHITECTURE

**Base:** `Sites/Imli/`  
Structurally identical to Greek with these differences:
- `RESTAURANT_ID = "imli"`
- Port 3001
- Socket path: `/Imli/socket.io`
- Menu file: `imliMenuData.json`
- Chatbot: `ChatBot.py` (native Python, not JOSH Enterprise), port 5002
- 11 isolation fixes applied (namespaced rooms: `imli:table1`)

---

## 6. AL PESCATORE SITE — ARCHITECTURE

**Base:** `Sites/AlPescatore/`  
Structurally similar to Greek with these differences:
- `RESTAURANT_ID = "al_pescatore"`
- Port 3005
- Base path: `/` (NGINX strips prefix)
- Socket path: `/socket.io` (default, not prefixed)
- Three merged menus: `Al Pescatore Food.json` + `Al Pescatore Wine.json` + `Al Pescatore Coctail.json`
- Python chatbot on port 5005
- No AI pairing service

---

## 7. SHARED INFRASTRUCTURE

### 7.1 Prisma / PostgreSQL (root-level, Trump-only currently)
- Schema: `prisma/schema.prisma`
- Database: `postgresql://postgres:...@localhost:5432/emenyu`
- Client generated at root `node_modules`, referenced by Trump via relative path resolution
- Greek, Imli, AlPescatore do NOT use Prisma

### 7.2 Root Scripts
```
npm run env:check       → validate-prisma-env.js
npm run db:check        → check-postgres.js
npm run prisma:startup  → prisma-safe-start.js
npm run auth:migrate    → Sites/Trump/scripts/migrate-auth-to-postgres.js
npm run menu:migrate    → Sites/Trump/scripts/migrate-menu-to-postgres.js
npm run orders:migrate  → Sites/Trump/scripts/migrate-orders-to-postgres.js
```

### 7.3 No Shared Service Layer
There is **no shared code directory** between sites. Each site copies:
- `normalizeId()` — identical in Greek, Imli, Trump helpers
- `normalizeName()` — identical across sites
- `getCategoryType()` — identical in Greek server.js and Trump helpers.js
- `getTableActiveOrders()` — reimplemented inline in each site's server.js
- `adminAuth()` — basic HTTP auth pattern duplicated in Greek, Imli, AlPescatore

---

## 8. DEPLOYMENT & RUNTIME

### 8.1 PM2 (Trump only)
```javascript
// ecosystem.config.js
{
  name: 'emenuy-trump-api',
  script: './server.js',
  exec_mode: 'fork',       // single instance
  instances: 1,
  max_memory_restart: '512M',
  kill_timeout: 10000,
  min_uptime: '10s',
  max_restarts: 10,
  env: { NODE_ENV: 'production', TRUMP_HOST: '0.0.0.0', TRUMP_PORT: 3012 }
}
```

### 8.2 Greek/Imli/AlPescatore
No PM2 configs. Presumably started with `node server.js` directly or via shell scripts. No documented restart policy.

### 8.3 Network Topology (assumed)
```
Internet → NGINX → /Trump/* → localhost:3012 (Trump)
                → /Greek/* → localhost:3002 (Greek)
                → /Imli/*  → localhost:3001 (Imli)
                → /*       → localhost:3005 (AlPescatore)
```

### 8.4 Python Services (Greek/Imli)
- Spawned as child processes from Node.js `server.js`
- Restart on non-zero exit code with 3s delay
- No PM2 supervision for Python processes
- Ports: Greek chatbot 5001, Greek pairing 5002; Imli chatbot 5002; AlPescatore chatbot 5005

---

## 9. MEDIA & UPLOADS

- **Trump:** `/uploads/` directory, Multer (25MB max, image/video MIME whitelist)
- **Greek:** `/uploads/` directory, Multer; `Images/` contains 100+ pre-loaded dish images
- **Imli/AlPescatore:** Similar upload directories

Static serving: `express.static` with 7-day cache headers on assets (Trump); no explicit cache headers on Greek/Imli.

---

## 10. HEALTH & OBSERVABILITY

### Trump (production-grade)
- `GET /healthz` — liveness: uptime, env, restaurantId
- `GET /readyz` — readiness: storage check + menu load
- Structured JSON logs via `logger.js` (levels: debug/info/warn/error/fatal)
- Per-request logging: method, path, status, duration, requestId
- PM2 log files: `logs/pm2/emenyu-trump-api-{error,out,combined}.log`

### Greek/Imli/AlPescatore
- `console.log` / `console.error` only
- No health endpoints
- No structured logging
- No PM2 log routing

---

## 11. IDENTIFIED ARCHITECTURAL CONCERNS

| # | Concern | Sites Affected | Severity |
|---|---------|---------------|----------|
| 1 | No shared code library — duplicated helpers in every site | All | Medium |
| 2 | Greek/Imli/AlPescatore have no PM2 supervision | Greek, Imli, AlPescatore | High |
| 3 | CSP disabled in Trump Helmet config | Trump | Medium |
| 4 | Greek CORS allows all origins (`origin: "*"`) | Greek | High |
| 5 | Admin password hardcoded in Greek (falls back to "Kshitij") | Greek | High |
| 6 | Root `.env` contains plain-text PostgreSQL password | Root | High |
| 7 | Greek/Imli/AlPescatore have no rate limiting | Greek, Imli, AlPescatore | High |
| 8 | Port collision: Greek and Trump both default to 3002 | Greek, Trump | Medium |
| 9 | Python chatbot: ~30s model load → slow first chat | Greek | Low |
| 10 | Trump: single PM2 instance — no horizontal scaling | Trump | Medium |
| 11 | No cross-site admin dashboard or unified order view | All | Medium |
| 12 | JSON file storage for orders: no atomic writes, race risk | Greek, Imli, AlPescatore | High |
| 13 | Mongoose listed in Greek package.json but not used | Greek | Low |
| 14 | AlPescatore menu has typo: "Coctail.json" | AlPescatore | Low |
| 15 | No automated tests in any site | All | High |
