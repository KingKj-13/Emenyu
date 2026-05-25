# TRUMP ↔ GREEK COMPARISON
## Architecture, Feature, and Risk Analysis
**Audit Date:** 2026-05-21

---

## 1. SIDE-BY-SIDE FEATURE MATRIX

| Feature | Trump | Greek | Imli | AlPescatore |
|---------|-------|-------|------|-------------|
| **Server architecture** | Modular (MVC) | Monolithic 1130-line file | Monolithic | Monolithic |
| **Port** | 3012 (prod) / 3002 (dev) | 3002 | 3001 | 3005 |
| **Base path** | /Trump | /Greek | /Imli | / (root) |
| **Database** | PostgreSQL (Prisma) + JSON fallback | JSON only | JSON only | JSON only |
| **Authentication** | Cookie session (HMAC-SHA256) + RBAC | HTTP Basic (hardcoded) | HTTP Basic | HTTP Basic |
| **Roles** | owner, manager, waiter | admin only | admin only | admin only |
| **Account management** | Full CRUD via API (Prisma) | None | None | None |
| **Session invalidation** | Yes (sessionInvalidBefore) | No | No | No |
| **Rate limiting** | Yes (600/15min general, 20/15min auth) | No | No | No |
| **CORS** | Strict (origin whitelist) | `origin: "*"` (open) | `origin: "*"` | `origin: "*"` |
| **Security headers** | Helmet (HSTS, frames, referrer) | None | None | None |
| **Compression** | Yes (1KB threshold) | No | No | No |
| **Request logging** | Structured JSON (level+event+duration) | console.log only | console.log only | console.log only |
| **Health endpoints** | /healthz + /readyz | None | None | None |
| **PM2 managed** | Yes (ecosystem.config.js) | No | No | No |
| **Graceful shutdown** | Yes (SIGTERM handler, 10s timeout) | Crash kill | Crash kill | Crash kill |
| **Error handling** | JSON error handler middleware | Inline try/catch | Inline try/catch | Inline try/catch |
| **Frontend structure** | Modular (components/, pages/, scripts/, styles/) | Monolithic index.html | Monolithic index.html | Monolithic index.html |
| **Login page** | Dedicated /Trump/Login | None | None | None |
| **Menu storage** | PostgreSQL + JSON fallback | JSON only | JSON only | JSON only |
| **Menu hierarchy** | Categories + sub-categories (Prisma tree) | Flat JSON object | Flat JSON object | Flat JSON object |
| **Menu sections** | Split file support (menu_sections/) | Single file | Single file | Single file |
| **Order storage** | PostgreSQL + JSON fallback | JSON files only | JSON files only | JSON files only |
| **Order status history** | Full audit trail (OrderStatusHistory) | None | None | None |
| **Cart persistence** | In-memory + disk (tables/*.json) + Prisma | In-memory + disk | In-memory + disk | In-memory + disk |
| **Waiter call system** | Yes (Socket.IO bell → room broadcast) | Yes (Socket.IO bell) | No | No |
| **Waiter assignment tracking** | Yes (WaiterAssignment table, Prisma) | connectedWaiters{} in-memory | None | None |
| **Admin override** | Yes (price/menu per-table) | Yes | No | No |
| **Chatbot** | GROQ cloud API | JOSH 11.0 (local ML, ~30s load) | Python ChatBot.py | Python ChatBot.py |
| **AI pairing** | Yes (aiService.js) | Yes (recommend.py port 5002) | Yes (recommend.py) | No |
| **Speech (STT/TTS)** | No | Yes (stt.py, tts.py) | Yes | Yes |
| **QR code generation** | No | Yes (create_qr.py) | Yes | No |
| **Popular items tracking** | Yes (FeaturedItem Prisma table) | popular.json | popular.json | No |
| **Deal of the day** | Yes (DealOfDay.json + Socket broadcast) | Yes (DealOfDay.json) | Yes | No |
| **Recommendations** | Yes (Prisma Recommendation table + smart engine) | Yes (JSON + smart engine) | Yes (JSON) | No |
| **File uploads** | Yes (Multer, 25MB, MIME whitelist) | Yes (Multer) | No | No |
| **Images folder** | uploads/ (dynamic) | Images/ (100+ pre-loaded) | None | None |
| **Merged menus** | No | No | No | Yes (3 files merged) |
| **Socket.IO path** | /Trump/socket.io (namespaced) | relative /socket.io | /Imli/socket.io (namespaced) | /socket.io (default) |
| **Room namespace** | trump:table1 | greek:table1 | imli:table1 | al_pescatore:table1 |
| **Multi-table isolation** | Yes (getTableAliases + canonical ID) | Yes (normalizeId) | Yes (11 isolation fixes) | Assumed |
| **Express version** | 5.1.0 | ~4.x | ~4.x | ~4.x |
| **Config system** | `createConfig()` factory, env-validated | Direct process.env reads | Direct process.env reads | Direct process.env reads |

---

## 2. ARCHITECTURE COMPARISON

### 2.1 Server File Structure

**Trump — MVC/Service Pattern:**
```
server/
  server.js           ← bootstrap only
  controllers/        ← request handlers
  routes/             ← route registration
  services/           ← business logic
  middleware/         ← cross-cutting concerns
  utils/              ← config, helpers
```

**Greek — Inline Monolith:**
```
server.js (1130 lines)
  ← configuration
  ← socket setup
  ← all helper functions
  ← all route handlers
  ← all socket event handlers
  ← Python process spawning
  ← everything else
```

**Assessment:** Trump's architecture is maintainable and testable. Greek's monolith makes isolated testing impossible and is approaching the size where changes become risky.

---

### 2.2 Authentication Comparison

| Aspect | Trump | Greek |
|--------|-------|-------|
| Mechanism | HMAC-SHA256 signed cookie | HTTP Basic (base64) |
| Storage | PostgreSQL users table | Hardcoded in env or code |
| Password hashing | bcrypt (via AccountService) | Plaintext comparison |
| Session TTL | 12 hours (configurable) | None (per-request) |
| Session invalidation | Yes (sessionInvalidBefore) | Not applicable |
| Role granularity | owner/manager/waiter | admin only |
| Multi-user support | Yes (create/suspend via API) | No (single admin) |
| Brute force protection | Rate limit: 20 attempts/15min | No |

**Risk:** Greek's Basic auth with `admin:Kshitij` hardcoded fallback is a significant security exposure in a production environment.

---

### 2.3 Data Storage Comparison

| Layer | Trump | Greek |
|-------|-------|-------|
| Menu | PostgreSQL (primary) + TrumpMenu.json (fallback) | MythosMenu.json (only) |
| Orders | PostgreSQL (primary) + orders/*.json (fallback) | orders/*.json (only) |
| Cart state | In-memory tableMemory{} + tables/*.json + Prisma ActiveCartState | In-memory + tables/*.json |
| History | PostgreSQL (sourceKind='history') + history/*.json | history/*.json (only) |
| Accounts | PostgreSQL User table | Hardcoded / .env vars |
| Recommendations | PostgreSQL Recommendation table + JSON fallback | recommendations.json |
| Popular | PostgreSQL FeaturedItem table + JSON fallback | popular.json |
| Order audit | PostgreSQL OrderStatusHistory | None |
| Waiter assignments | PostgreSQL WaiterAssignment | connectedWaiters{} (lost on restart) |

---

### 2.4 Socket.IO Comparison

| Aspect | Trump | Greek |
|--------|-------|-------|
| Implementation | Class (SocketService.js, 420 lines) | Inline in server.js (~300 lines) |
| Path | /Trump/socket.io | /socket.io (relative) |
| CORS | Dynamic origin check (whitelist) | `origin: "*"` (open) |
| Room naming | trump:table1, trump:waiters, trump:admin | greek:table1, greek:waiters |
| Table alias support | Yes (table3 = trump:table3, trump:3) | Basic normalizeId only |
| State persistence on reconnect | Yes (tableMemory + disk) | Yes (tableMemory + disk) |
| Waiter registry | this.connectedWaiters{} (class property) | connectedWaiters{} (module-level) |
| Disconnect cleanup | fileService.releaseWaiterAssignments() | delete from connectedWaiters |

---

## 3. DUPLICATE CODE (CANDIDATES FOR EXTRACTION)

The following logic is copy-pasted across sites:

| Function | Trump Location | Greek Location | Imli Location |
|----------|---------------|----------------|---------------|
| `normalizeId()` | helpers.js:530 | server.js:163 | server.js |
| `normalizeName()` | helpers.js:564 | server.js:169 | server.js |
| `getCategoryType()` | helpers.js:572 | server.js:175 | server.js |
| `getTableActiveOrders()` | fileService.js | server.js:195 | server.js |
| `adminAuth()` (HTTP Basic) | helpers.js (as `createAdminAuth`) | server.js:127 | server.js |
| Order filename pattern | `order_table_<id>_<ts>.json` | same | same |
| JSON ensure/read/write | fileService.js | inline helpers | inline helpers |
| Recommendation engine | aiService.js | inline in server.js | inline |
| Python spawn with restart | Not in Trump | server.js:~50 | server.js |

---

## 4. WHAT SHOULD BECOME SHARED

Candidates for a `shared/` or `packages/` library:

| Component | Priority | Reason |
|-----------|----------|--------|
| `normalizeId`, `normalizeName`, `getCategoryType` | High | 4 copies, identical |
| `adminAuth` / `createRoleAuth` | High | Security-critical, must not diverge |
| `getTableActiveOrders` + order file helpers | High | Business logic, currently diverging |
| `PrismaMenuService` | Medium | When Greek/Imli migrate to Prisma |
| `PrismaOrderService` | Medium | Same |
| Request logger middleware | Medium | Greek/Imli have none |
| Rate limiting middleware | High | Greek/Imli have none |
| Helmet security middleware | High | Greek/Imli have none |
| Python spawn manager | Low | Greek/Imli specific |
| Recommendation engine | Medium | Business logic should be consistent |

---

## 5. WHAT SHOULD REMAIN SITE-SPECIFIC

| Component | Reason |
|-----------|--------|
| Menu JSON files (TrumpMenu.json, MythosMenu.json, etc.) | Restaurant content |
| Chatbot integration (GROQ vs JOSH 11.0 vs Python) | Different AI backends |
| Images/ folder | Restaurant-specific media |
| Frontend HTML/CSS/JS | Brand-specific UI |
| Socket.IO room prefix (trump vs greek) | Restaurant isolation |
| Python pairing scripts | Restaurant-specific recommendations |
| .env credentials | Per-restaurant secrets |
| Menu category structure | Menu design is per-restaurant |

---

## 6. LEGACY SYSTEMS (PRESENT BUT UNUSED/REDUNDANT)

| Item | Location | Notes |
|------|----------|-------|
| `mongoose` dependency | Greek package.json | Listed but not used in server.js |
| `Menu.html, drinks.html, buchery.html` | Trump root | Legacy pages alongside new frontend/ structure |
| `Orders.json` | Greek food/ | Legacy; orders stored in orders/*.json files, not this |
| `menu-data.json` | Imli | Possible duplicate of imliMenuData.json |
| `action_processor.py` | Greek, Imli | Not clear if actively wired |
| `pop_recommend.py` | Greek, Imli | Separate from recommend.py; unclear active use |

---

## 7. MISSING IN GREEK (COMPARED TO TRUMP)

| Feature | Impact |
|---------|--------|
| No PM2 supervision | Greek crashes permanently if unhandled error |
| No health endpoints | Cannot monitor readiness in production |
| No structured logging | Debugging production issues is hard |
| No rate limiting | Vulnerable to brute force and DoS |
| No CORS restriction | Any domain can send credentialed requests |
| No Helmet headers | Missing CSP/HSTS/frame protection |
| No session invalidation | Cannot log out a specific user |
| No account management | Cannot create/suspend waiter accounts |
| No order status history | Cannot audit what happened to an order |
| No Prisma | All data loss risk on disk corruption |
| No config validation | Starts with invalid config, silent failures |

---

## 8. MISSING IN TRUMP (COMPARED TO GREEK)

| Feature | Impact |
|---------|--------|
| No local chatbot | Depends on GROQ cloud (latency, cost, downtime risk) |
| No STT/TTS | No voice interaction feature |
| No QR code generation | Manual QR distribution |
| No pre-loaded Images/ folder | Images managed via uploads only |

---

## 9. REUSABLE PATTERNS (TRUMP → ALL SITES)

These Trump patterns are worth propagating to other sites:

1. **`createConfig()` factory** — centralise all env var reading with validation
2. **`createRoleAuth()`** — cookie session auth with role hierarchy
3. **`SocketService` class** — testable, isolated, clean socket handling
4. **`FileService` hybrid pattern** — try Prisma, fall back to JSON transparently
5. **`configureSecurity()`** — helmet + cors + rate-limit as single call
6. **`createRequestLogger()`** — structured JSON logs per request
7. **`registerProcessHandlers()`** — SIGTERM/SIGINT graceful shutdown
8. **`createConfig()` production validation** — refuse to start with insecure config

---

## 10. PHASE 3 IMPLICATIONS

Based on this comparison, before Phase 3 CMS development:

1. **Greek/Imli/AlPescatore need security hardening** — rate limiting, CORS restriction, Helmet
2. **Greek needs PM2 config** — production stability
3. **A shared `lib/` or `packages/core/` is needed** — prevent further divergence
4. **Prisma schema needs restaurantId expansion** — currently defaults to 'trump'
5. **Admin dashboard should be unified** — all restaurants from one panel
6. **Auth model should be unified** — cookie sessions + RBAC for all sites
7. **Greek/Imli JSON order storage needs Prisma migration path** — data safety
