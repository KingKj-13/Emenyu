# AUDIT-BACKEND.md — Phase 00 Backend Audit

**Scope:** `Sites/Trump/server/` (controllers, routes, services, middleware, utils). **Date:** 2026-06-24.

---

## 1. Summary

The backend is a **dependency-injected modular Express 5 app**. `server/server.js` (433 LOC) constructs a single `config` object (`createConfig`), wires every service, and injects them into thin controllers. There is **no global singleton**, no obvious circular dependency, and a clean controller → service split. The architecture is sound. The main backend risks are **oversized "god" modules** (`aiService.js`, `helpers.js`), a **sprawling recommendation subsystem** (~15 services), and **dual persistence** (Postgres + JSON) that must be kept in sync.

---

## 2. Counts

| Layer | Count | Notes |
|---|---|---|
| Entry | 2 | root `server.js` (shim) → `server/server.js` |
| Controllers | 14 | thin; request parsing + service calls |
| Route files | 12 | `register*Routes(app, controllers, guard)` |
| Services | 33 (+ `nlg/` ×3) | business logic |
| Middleware | 2 | `security.js`, `requestLogger.js` |
| Utils | 3 | `helpers.js`, `logger.js`, `weakPasswords.js` |
| REST endpoints | ~80 (×3 path aliases each: `/x`, `/Trump/x`, `/trump/x`) | see AUDIT-API |

---

## 3. Controllers (14)

`ai`, `analytics`, `recommendationAnalytics`, `recommendationBundle`, `deal`, `kitchen`, `menu` (10.6 KB), `order`, `push`, `rating`, `reservation`, `upload`, `waiter`, `waiterApi` (14 KB).

All follow the factory pattern `createXController({ deps })`. `waiterApiController` (14 KB) and `menuController` (10.6 KB) are the largest — acceptable, but `waiterApiController` aggregates many sub-domains (floor, tasks, coach, guests, chat-analysis, birthday approval, performance) and could be split.

---

## 4. Services (33) — grouped

**Persistence (Postgres primary):** `prismaClient.js`, `prismaAuthService.js` (12 KB), `prismaMenuService.js` (27 KB), `prismaOrderService.js` (23 KB), `accountService.js` (12 KB), `fileService.js` (14 KB, JSON fallback).

**Real-time:** `socketService.js` (22 KB) — handshake auth + rooms + cart sync + waiter notifications.

**AI / Recommendation (large cluster, ~15 modules):**
`aiService.js` (**65 KB — the god object**), `smartPairingEngine.js`, `heroPairings.js`, `marketBasket.js`, `recommendationRules.js`, `rotationService.js`, `reasonComposer.js`, `intentClassifier.js`, `chatbotNlu.js`, `knowledgeService.js`, `categoryClassifier.js`, `recommendationEventService.js`, `recommendationAnalytics.js`, `recommendationHealth.js`, `recommendationInsights.js`, `recommendationBundleService.js`, plus `nlg/` (`nlgService.js`, `nlgProvider.js`, `templateNlgProvider.js`).

**Waiter workflow (V2):** `waiterWorkflowService.js`, `waiterAnalyticsService.js`, `floorService.js`, `guestService.js`, `opportunityService.js`, `serviceRecoveryService.js`, `chatSession.js`.

**Other:** `orderValidationService.js` (server-authoritative pricing), `mediaEnrichmentService.js`, `pushService.js`.

---

## 5. Oversized modules (maintainability risk)

| File | Size | Concern |
|---|---|---|
| `services/aiService.js` | **65 KB** | God object: chat NLU dispatch, recommendation engine, pairing, dietary/wine/deals replies, caching, scoring. Hard to test/reason about as one unit. Highest-priority decomposition target. |
| `utils/helpers.js` | 22 KB | Mixes **three** concerns: `createConfig` (env→config + prod validation), `createRoleAuth` (full auth: cookies, HMAC tokens, login/logout/me, account CRUD handlers), and table/id/category utilities. Auth should be its own module. |
| `services/prismaMenuService.js` | 27 KB | Large but cohesive (menu CRUD + chef-recs + categories). |
| `services/prismaOrderService.js` | 23 KB | Large but cohesive. |
| `services/socketService.js` | 22 KB | Cohesive; acceptable. |

(Client-side parallel: `pages/AdminPage.tsx` 109 KB — see AUDIT-FRONTEND.)

---

## 6. Duplicated business logic

1. **Dual persistence.** Every order/table/menu mutation has a Postgres path (`prisma*Service`) and a JSON path (`fileService` → `orders/`, `history/`, `tables/`). This is an intentional fallback but doubles the logic surface and risks divergence (e.g., totals computed in two places). New work should be Postgres-only; the JSON path is legacy compatibility.
2. **Auth in two forms.** Session cookie (HMAC) **and** HTTP Basic (`readBasicUser` in `helpers.js`) are both accepted on every protected route via `getRequestUser`. Two code paths to the same authorization.
3. **Recommendation engines.** JS `aiService` + the orphaned Python `recommend.py`/`pop_recommend.py` (not wired — see AUDIT-REPOSITORY) are two generations of the same feature.
4. **Pricing/tax math** exists server-side (`orderValidationService`, config `vatRate`/`serviceRate`) and client-side (`client/src/constants/config.ts`) — must be kept identical (noted in `.env.example`).

---

## 7. Circular dependencies

None observed. Wiring is one-directional: `server.js` → services → (config, logger). `aiService` receives `socketService` and registers `onDataChange` to invalidate caches (callback, not a require cycle). `helpers.js` requires `categoryClassifier` (leaf). Clean.

---

## 8. Unused / dead modules

- No dead modules detected **within `server/`** — every service in §4 is imported by `server/server.js` or another service.
- Dead code lives **outside** `server/` (Python recommenders, vanilla `frontend/`) — see AUDIT-REPOSITORY.
- `createAdminAuth` in `helpers.js` (Basic-only legacy guard) is exported but appears unused by the current route wiring (routes use `requireRoles`). Verify and remove.

---

## 9. Special-focus services

- **Recommendation services:** functionally rich but fragmented across 15 files with overlapping concerns (rules, rotation, scoring, market-basket, hero pairings, bundles, analytics, health, insights). Consolidation into a clear `recommendation/` sub-package with one façade would reduce surface area. Validated by `npm run reco:validate` / `reco:health` / `chat:validate` (good — there is test coverage for this subsystem).
- **Waiter workflow services:** new (Waiter V2), cohesive, backed by `WaiterTask` model. Reasonable.
- **Socket service:** handshake attaches authenticated staff identity from the signed cookie; per-event handlers enforce role/table authz (`socketCanControlTable`). Solid design. **In-memory room/table state (`tableMemory`)** is a horizontal-scaling blocker (see AUDIT-PERFORMANCE).
- **AI service:** fully local/deterministic, no external API calls (see AUDIT-AI).

---

## 10. Recommendations

1. **Decompose `aiService.js`** into `recommendation/`, `chat/`, and `pairing/` modules behind a façade.
2. **Split `helpers.js`** → `config.js` + `auth.js` + `tableUtils.js`.
3. **Decide the persistence end-state.** If Postgres is authoritative in production, demote the JSON path to an explicit, narrowly-scoped emergency fallback and stop dual-writing for new features.
4. **Consolidate the recommendation subsystem** under one package with a single entrypoint.
5. **Split `waiterApiController`** by sub-domain.
6. Remove unused `createAdminAuth` if confirmed dead.
