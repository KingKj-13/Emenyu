# SCALABILITY RISK REPORT
## Technical Debt, Fragile Flows, and Performance Risks
**Audit Date:** 2026-05-21

---

## SEVERITY LEGEND
- **CRITICAL** — Will break under moderate load or cause data loss
- **HIGH** — Significant risk requiring remediation before scaling
- **MEDIUM** — Manageable now but must be addressed for SaaS
- **LOW** — Quality of life / long-term maintainability

---

## 1. CRITICAL RISKS

### C-1: Non-Atomic JSON File Writes (Greek/Imli/AlPescatore)
**Sites Affected:** Greek, Imli, AlPescatore  
**Risk:** Two concurrent requests writing to the same order or cart file will produce a corrupted file (last writer wins, partial write possible on crash).  
**Scenario:**
```
Request A: writes order_table_table2_12345.json (50% written)
Server crash or signal
→ File is truncated / malformed JSON
→ Next restart: JSON.parse fails → 500 error on all order reads
```
**Mitigation needed:** Atomic writes (write to `.tmp`, then `rename`) or move to PostgreSQL.  
**Trump:** Mitigated — Prisma is the primary store; JSON writes are fallback backup only.

---

### C-2: Admin Overrides Lost on Server Restart
**Sites Affected:** Trump, Greek  
**Risk:** `tableMemory[tableId].adminOverrides` is in-memory only. Any restart (deploy, crash, OOM kill) loses all active table price overrides mid-service.  
**Scenario:**
```
Service in progress at 8 tables
Admin has set 15% wine discount on 3 tables
Server restarts for deploy
→ Customers still at table see original prices
→ Waiter unaware that override was applied
→ Billing discrepancy
```
**Mitigation needed:** Persist overrides to Prisma `ActiveCartState.metadata` or a dedicated table.

---

### C-3: No Automated Tests
**Sites Affected:** All  
**Risk:** Every change to a monolithic 1130-line file (Greek) or the service layer (Trump) can silently break production. No regression detection.  
**Impact on SaaS:** Cannot safely refactor, add features, or onboard contributors without test coverage.

---

### C-4: PostgreSQL Password in Plain .env (Committed Risk)
**Sites Affected:** Root  
**Risk:** `DATABASE_URL` containing `postgres:Junnarkar123@localhost:5432/emenyu` in `.env`. If `.env` is accidentally committed or exposed, full database access is compromised.  
**Mitigation needed:** Use environment secrets manager (Vault, Doppler) or OS-level env injection. Never commit credentials.

---

## 2. HIGH RISKS

### H-1: Greek CORS `origin: "*"` 
**Sites Affected:** Greek  
**Risk:** Any domain on the internet can send Socket.IO connections and HTTP requests with credentials to Greek. A malicious page could silently place orders, scrape menus, or spam the recommendation engine.  
**Mitigation needed:** Restrict `origin` to `https://emenuy.com` same as Trump.

---

### H-2: Greek/Imli/AlPescatore Have No Rate Limiting
**Sites Affected:** Greek, Imli, AlPescatore  
**Risk:** No protection against:
- Brute-force login attempts on admin Basic auth
- Order submission spam (POST /submit_order with no auth)
- Chatbot proxy abuse (each request spawns Python call)
- Menu write spam (POST /api/menu)

**Scenario:**  
```
1000 concurrent POST /api/chat requests
→ 1000 proxy calls to JOSH 11.0 (port 5001)
→ JOSH process starved/OOM
→ Server unresponsive
```

---

### H-3: Greek/Imli/AlPescatore Not PM2-Managed
**Sites Affected:** Greek, Imli, AlPescatore  
**Risk:** If server process crashes (unhandled exception, OOM), it stays down until manually restarted. Greek has a bare `process.on('uncaughtException')` that logs but doesn't restart.  
**Note:** Greek's uncaughtException handler only prevents crash — it doesn't recover the HTTP server state.

---

### H-4: Python Chatbot No Supervision
**Sites Affected:** Greek, Imli  
**Risk:** Spawned Python processes (JOSH 11.0, recommend.py) restart on non-zero exit, but:
- Only 1 restart attempt tracked per session
- If Python crashes repeatedly, no back-off or alert
- JOSH 11.0 has ~30s model load time — during this window, all chat requests fail
- No health endpoint for Python services

---

### H-5: No Horizontal Scaling
**Sites Affected:** Trump (PM2 fork, 1 instance)  
**Risk:** A single Node.js process. Under high load:
- CPU-bound recommendation logic blocks event loop
- Socket.IO cannot be distributed across workers without Redis adapter
- PM2 cluster mode requires Redis adapter for Socket.IO rooms

---

### H-6: `saveMenu()` Is a Full Table Delete+Reinsert
**Sites Affected:** Trump (Prisma)  
**Risk:** Every menu save runs:
```sql
DELETE FROM MenuItem WHERE restaurantId = 'trump';
DELETE FROM MenuCategory WHERE restaurantId = 'trump';
-- then reinsert everything
```
If the transaction fails mid-way (DB timeout, OOM), the menu is empty. The JSON file is the only recovery path.  
**Scale concern:** On a large menu (500+ items), this transaction could take 200-500ms, during which menu reads return empty.

---

### H-7: No Input Validation on API Bodies
**Sites Affected:** All  
**Risk:** No schema validation on `req.body`. Malformed or oversized payloads:
- `POST /submit_order { items: [null, null, ...] }` → written to file, could crash JSON parser on read
- `POST /api/menu` with invalid structure → overwrites valid menu with garbage
- `updateCart` with malformed cart → corrupt state stored in DB and file

---

### H-8: Mongoose Listed as Dependency (Greek) — Never Used
**Sites Affected:** Greek  
**Risk:** `mongoose` in `package.json` adds ~3.5MB of unused code, slows install, and implies MongoDB is used (it isn't). Misleads future developers.

---

## 3. MEDIUM RISKS

### M-1: `restaurantId @default("trump")` in Prisma Schema
**Impact:** When Greek/Imli are connected to Prisma, forgetting to set `restaurantId` explicitly will silently insert data under `trump`. No DB-level constraint prevents cross-restaurant data pollution.

---

### M-2: Menu JSON Publicly Accessible
**Impact:** `food/TrumpMenu.json` is accessible at `https://emenyu.com/Trump/food/TrumpMenu.json` because `express.static` serves the entire site root including `food/`. Competitor scraping is trivial. Price data and inventory is exposed.  
**Mitigation:** Move `food/` outside the static serving root, or add an explicit deny route.

---

### M-3: Prisma Client Resolved via Relative Path (4 Levels Up)
**Impact:** Trump's `prismaMenuService.js` uses:
```javascript
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
```
If Trump is ever moved or the directory structure changes, Prisma client resolution silently fails, and all menu/order operations fall back to JSON without warning.

---

### M-4: Single PostgreSQL Instance, No Pooling
**Impact:** All Trump operations share a direct Prisma connection. Under concurrent load:
- No PgBouncer or connection pool
- Prisma default pool (10 connections for PostgreSQL)
- Multiple PrismaClient instances (PrismaMenuService, PrismaOrderService, AccountService) → 30 connections max default
- PostgreSQL default max_connections = 100; could be exhausted with multiple sites on Prisma

---

### M-5: No Pagination on Order Lists
**Impact:** `GET /orders` and `GET /history` return all records. With a busy restaurant over months, this response could be 100KB+ JSON. Admin panel will slow down.

---

### M-6: No HTTPS Enforcement on Greek/Imli/AlPescatore
**Impact:** Admin Basic auth credentials transmitted in base64 over HTTP → trivially intercepted on same network.

---

### M-7: `quantity` Field Is Float in OrderItem
**Impact:** Allows 0.5 portions which may or may not be intentional for the business. Billing logic must handle float quantities correctly everywhere.

---

### M-8: Port Collision: Greek and Trump Both Default to 3002
**Impact:** If both sites start without explicit PORT env override, second start fails silently. Requires careful process management.

---

## 4. LOW RISKS (TECHNICAL DEBT)

### L-1: Duplicate Code Across 4 Sites
`normalizeId`, `normalizeName`, `getCategoryType`, `getTableActiveOrders`, `adminAuth` — all copied and pasted. Any bug fix must be applied 4 times.

### L-2: Legacy HTML Files in Trump Root
`Menu.html`, `drinks.html`, `buchery.html` (note typo) alongside the new `frontend/pages/menu.html`. Unclear which is active. Dead code or active?

### L-3: Typo in AlPescatore Menu Filename
`Al Pescatore Coctail.json` (missing 'k'). Any code that references this filename must use the typo. Could cause confusion when renamed.

### L-4: Greek `data/menu_embeddings.pkl`
Binary ML file in the repo. Will fail on Windows if Python is not installed with matching scikit-learn version. No version pins documented.

### L-5: No `.gitignore` Confirmed
`node_modules/` directories exist at `Sites/Imli/node_modules`. If `.gitignore` doesn't exclude these, the repo could be gigabytes.

### L-6: Greek Server Comment Block (11 Fixes)
The header lists "✅ ALL 11 ISOLATION FIXES APPLIED" — this type of code commentary belongs in git history, not source files. As the code evolves, the comment becomes misleading.

### L-7: CSP Disabled in Trump Helmet
```javascript
helmet({ contentSecurityPolicy: false })
```
No Content Security Policy means XSS vulnerabilities in the frontend would have no browser-level mitigation. Should be enabled with an appropriate policy.

### L-8: `express` v5.1.0 in Trump
Express 5 is relatively new and some ecosystem middleware may have compatibility issues. Should be tracked for stability.

### L-9: `sessionInvalidBefore` Type BigInt in Prisma
JSON serialization of BigInt is non-standard in JavaScript (`JSON.stringify` throws on BigInt). If this field is ever serialized without explicit handling, it will crash.

---

## 5. PERFORMANCE BOTTLENECKS

| Bottleneck | Location | Severity | Notes |
|-----------|----------|----------|-------|
| Menu saveMenu() full delete+reinsert | Trump Prisma | High | 200-500ms on large menus |
| JOSH 11.0 model load (~30s) | Greek Python | Medium | Cold start only |
| No menu caching on client | All | Low | Menu refetched on 'menuUpdated' |
| `io.emit('orderPlaced')` to ALL sockets | Trump | Low | Should target admin+waiter rooms only |
| Recommendation engine inline in server.js | Greek (1100 lines) | Low | Event loop blocking on large menus |
| No static file CDN | All | Medium | All assets served from Node process |
| AI pairing proxy (sequential retries) | Greek | Low | 5 retries × 500ms = 2.5s max wait |

---

## 6. FUTURE SAAS RISK SUMMARY

For the platform to become a commercial SaaS, the following are blockers:

| Blocker | What Needs to Change |
|---------|---------------------|
| No shared auth system | Need unified tenant auth (JWT or session with tenant_id) |
| restaurantId defaults to 'trump' | All Prisma models need required restaurantId, no default |
| No tenant isolation at DB level | Need row-level security or separate schemas |
| Socket.IO single process | Need Redis adapter for horizontal scaling |
| JSON file storage for 3 sites | All sites need Prisma migration path |
| No API versioning | Breaking changes would affect all tenants simultaneously |
| No billing/tenant management | Need tenant provisioning system |
| Hardcoded restaurant-specific UI | Need configurable themes and branding |
| Python services per-site | Need shared ML service or LLM-only approach |
| No automated tests | Cannot safely deploy new tenants without regression risk |
