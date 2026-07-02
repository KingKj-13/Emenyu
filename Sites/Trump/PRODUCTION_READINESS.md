# Trump — Production Readiness Audit

**Restaurant:** Trumps Prime Grillhouse, Nelson Mandela Square, Sandton
**Audit date:** 2026-06-15
**Branch audited:** `feat/phase3-reco-implementation`
**Scope:** `Sites/Trump/` (server + React client + vanilla admin/waiter/owner panels) and the shared `prisma/` schema it consumes.
**Method:** Static read of the live source tree. No server was running, so Lighthouse and live load behaviour are noted as *not measured* where that is the case — everything else is backed by `file:line` evidence.

---

## Verdict

**Overall: 🟡 7/10 — close, but not yet.** This is materially above "works in a demo." The security spine is real: orders are re-priced server-side from the live menu, sessions are HMAC-signed and revocable, sockets are authenticated and table-scoped, the prod config refuses to boot with weak/missing secrets, and recommendations genuinely rotate. The gaps that remain are a small, fixable set — but two of them (table-token auth, silent order loss on a DB hiccup) are exactly the kind of thing that bites during a Friday rush in front of a paying client. **Do not put this in front of the Sandton client until Phase 1 below is done.**

The single most important finding is the one your brief predicted: **there is no per-table QR token.** Anyone can POST a valid order to any table, and any guest socket can join and manipulate any table's live cart.

---

## Scorecard

### 1. Security & access control — 🟡

**Table / QR authentication — 🔴 (the #1 blocker).**
`/submit_order` is a fully public POST with no token ([server/routes/orderRoutes.js:27](server/routes/orderRoutes.js#L27)). The only table check is `resolveTableId`, which merely confirms the number is in `1..tableCount` ([server/services/orderValidationService.js:60-73](server/services/orderValidationService.js#L60-L73)). The same hole exists on the socket: `handleJoinTable` lets any guest join *any* table room with no proof of presence ([server/services/socketService.js:414-433](server/services/socketService.js#L414-L433)), after which they can `updateCart`, `callWaiter`, and `fetchHistory` for that table. A prankster at Table 1 can order to Table 9, run up a stranger's bill, or flood the kitchen with fake tickets. Rate limiting caps volume but does not stop spoofing. **Fix:** sign the table id into the QR URL (HMAC), require + verify the token on `submit_order` and `joinTable`.

**Admin / Waiter / Kitchen route auth — 🟢.**
Every privileged route is gated by `requireRoles` / `requirePage` with a sane role hierarchy ([server/server.js:255-310](server/server.js#L255-L310), [server/routes/orderRoutes.js:1-19](server/routes/orderRoutes.js#L1-L19)). Sessions are stateless HMAC-SHA256 tokens validated per-request against the live user record with a `sessionInvalidBefore` cutoff for server-side logout ([server/utils/helpers.js:416-448](server/utils/helpers.js#L416-L448)). `timingSafeEqual` is used on the signature ([helpers.js:434](server/utils/helpers.js#L434)). The `admin/123456789` backdoor from earlier audits is gone.

**SQL injection — 🟢.**
All persistence goes through Prisma (parameterised). The only raw query in the tree is the constant health probe `SELECT 1` ([server/services/prismaOrderService.js:227](server/services/prismaOrderService.js#L227)). No string-built SQL anywhere.

**Input validation / sanitisation — 🟢.**
Orders are rebuilt from the authoritative menu — unknown/unavailable items rejected, quantities clamped, prices and totals recomputed, tip bounded, client pricing never trusted ([orderValidationService.js:77-216](server/services/orderValidationService.js#L77-L216)). Chef-rec and menu-CRUD payloads are validated/coerced ([server/controllers/menuController.js:5-40](server/controllers/menuController.js#L5-L40)).

**CORS / secrets / rate limiting — 🟢.**
CORS is an allow-list with credentialled requests ([server/middleware/security.js:77-104](server/middleware/security.js#L77-L104)). Secrets are env-driven and the server *refuses to start* in production with weak/missing secrets, demo passwords, or insecure origins ([helpers.js:62-175](server/utils/helpers.js#L62-L175)). Rate limits exist for general, auth (skip-on-success), public writes, and chat ([security.js:163-226](server/middleware/security.js#L163-L226)). CSP is hash-based with no `unsafe-inline` for scripts ([security.js:47-71](server/middleware/security.js#L47-L71)).
*Minor:* no CSRF token, but `SameSite=Lax` cookies + CORS allow-list make cross-site POST CSRF impractical. Acceptable; note it.

### 2. Data integrity & concurrency — 🟡

**Order state machine — 🟡.**
Status lives on `Order.status` (active/history/deleted) and `Order.kitchenStatus` with an `OrderStatusHistory` audit trail ([prisma/schema.prisma:170-237](../../prisma/schema.prisma#L170)). Kitchen status is a validated enum, but transitions are **not ordered** — `new → served` or `served → new` are both accepted ([server/controllers/kitchenController.js:32-33](server/controllers/kitchenController.js#L32-L33)). There is no `paid` state at all. Good audit trail; weak enforcement.

**Silent order loss on a DB hiccup — 🔴.**
`saveOrder` writes the JSON file first, then the DB via `withPrisma`, which **swallows any Prisma error and returns null** ([server/services/fileService.js:246-253](server/services/fileService.js#L246-L253), [prismaOrderService.js:244-255](server/services/prismaOrderService.js#L244-L255)). The controller returns `{ok:true}` to the guest as long as the JSON write succeeded ([server/controllers/orderController.js:37-45](server/controllers/orderController.js#L37-L45)). But `listOrders` and the kitchen feed read **Postgres-first** ([fileService.js:255-263](server/services/fileService.js#L255-L263), [kitchenController.js:11-27](server/controllers/kitchenController.js#L11-L27)). So if Postgres is *up but the one transaction fails* (deadlock, timeout, pool exhaustion — see 4 below), the order is saved to JSON, the guest is told "placed," and it **never appears** on the kitchen/admin screen. A lost ticket at dinner service. (Full DB *outage* is handled — `listOrders` falls back to JSON — but partial failure is the dangerous, more likely case.)

**Concurrent carts — 🟡.**
Cart sync is last-write-wins on a full-cart replace ([client/src/hooks/useCart.ts:50-60](client/src/hooks/useCart.ts#L50-L60)). Two phones sharing one table's QR can clobber each other's additions. By design the cart is shared, but a simultaneous add from each device silently drops one. JSON writes are atomic per file (temp+rename, [fileService.js:89-104](server/services/fileService.js#L89-L104)) and DB writes use `$transaction` ([prismaOrderService.js:299-334](server/services/prismaOrderService.js#L299-L334)), so no torn writes — the risk is lost *updates*, not corruption.

**Migrations — 🟢.**
Schema is reproducible from scratch: 14 ordered migrations from `init` through phase5 ([prisma/migrations/](../../prisma/migrations/)). FK constraints, composite uniques (`@@unique([restaurantId, sourceKind, filename])`), and rich indexes are present.

### 3. Realtime resilience (Socket.IO) — 🟢

Reconnection is handled: the client re-emits `joinTable` on every `connect` so cart/history recover after a drop or server restart ([client/src/hooks/useCart.ts:25-34](client/src/hooks/useCart.ts#L25-L34)); the waiter app does the same ([client/src/context/WaiterContext.tsx:258-267](client/src/context/WaiterContext.tsx#L258-L267)). Server is the source of truth and re-broadcasts state on join ([socketService.js:425-432](server/services/socketService.js#L425-L432)). An echo-suppression signature prevents sync loops ([useCart.ts:14-16,51-52](client/src/hooks/useCart.ts#L14-L16)). `updateCart` failures are caught so a bad payload can't crash the process ([socketService.js:613-618](server/services/socketService.js#L613-L618)).
*Watch-item:* orders themselves are placed over **HTTP POST**, not the socket — so order delivery is independent of socket health (good), but it inherits the no-retry gap in §5.

### 4. Reliability & ops — 🟡

**Connection-pool sprawl — 🔴.**
There are **8+ independent `new PrismaClient()` instances** — `kitchenController`, `analyticsController`, `ratingController`, `reservationController`, `waiterController`, `pushService`, `mediaEnrichmentService`, plus `prismaClient.js` (a shared singleton that those controllers ignore) and the separate clients inside `prismaOrderService`/`prismaMenuService` ([grep evidence: kitchenController.js:5, analyticsController.js:5, ratingController.js:5, reservationController.js:5, waiterController.js:8, pushService.js:5, mediaEnrichmentService.js:40](server/controllers/kitchenController.js#L5)). Each opens its own pool — ~10 pools against one Postgres on a disk-constrained box. This risks exhausting `max_connections` under load, which in turn *causes* the partial-failure order loss in §2. Several also `require('@prisma/client')` directly, re-triggering the local-stub-shadow gotcha. **Fix:** one shared client (`services/prismaClient.js`) injected everywhere.

**PM2 — 🟡.**
Fork mode, single instance, `autorestart`, memory cap, graceful `wait_ready`/`kill_timeout` ([ecosystem.config.js:1-37](ecosystem.config.js#L1-L37)). Two gaps: `max_restarts: 10` means a flapping process **gives up and stays down**; and there is **no log rotation** configured (`pm2-logrotate` not installed) — logs grow unbounded. Single instance is actually correct here, because `tableMemory`/`connectedWaiters` are in-process ([socketService.js:19-20](server/services/socketService.js#L19-L20)); scaling to cluster later would need a Redis Socket.IO adapter.

**Logging / health / shutdown — 🟢.** Structured JSON logs with request-id correlation, `/healthz` + `/readyz` (readiness checks storage + menu), and full signal/`uncaughtException`/`unhandledRejection` handling with graceful drain ([server/server.js:100-185](server/server.js#L100-L185)).

**HTTPS — 🟡 (ops dependency).** App-level `forceHttps` defaults off ([helpers.js:280](server/utils/helpers.js#L280)); TLS + http→https redirect are assumed to live in nginx. HSTS and `Secure` cookies are on in production. This is fine *if* nginx is configured correctly — but that config is not in the repo, so it must be verified on the box.

**Backups — 🔴.** There is **no backup script in the codebase** — `pg_dump`/backup appear only in `docs/phase7/*` planning text, not as runnable automation ([grep: no script under scripts/](scripts/)). A restaurant's order/menu/account data with no proven, restorable backup is a launch blocker.

### 5. Performance (mobile-first) — 🟡 (not fully measured)

Structurally sound: route/code-splitting via `lazy()` ([client/src/pages/MenuPage.tsx:28](client/src/pages/MenuPage.tsx#L28)), `loading="lazy"` on images ([CartDrawer.tsx:215](client/src/components/cart/CartDrawer.tsx#L215)), 7-day static-asset caching in prod ([server/server.js:79-80](server/server.js#L79-L80)), gzip compression ([security.js:160](server/middleware/security.js#L160)). DB reads are indexed and not obviously N+1. **Not measured:** no Lighthouse run was possible without a live server — this must be run on `/Trump/table1` before launch and the scores recorded here. **Flag:** the `Video/` directory ships full dish videos; total weight and whether they're served optimised/poster-first on mobile needs a real check on restaurant Wi-Fi.

### 6. Customer Menu UI — 🟡

Cart correctness is solid (add/remove/qty/notes/totals, [CartContext.tsx:49-97](client/src/context/CartContext.tsx#L49-L97)); VAT/service/tip math matches the server. Dietary filters, deal-of-day, and a consistent `RecommendationCard` across menu + chat + cart are all present and the **rotation engine genuinely works** — seeded, weighted, deterministic ([server/services/rotationService.js](server/services/rotationService.js)). The Umi chatbot is **fully local** and degrades gracefully on error ([client/src/components/chat/ChatPanel.tsx:58-79](client/src/components/chat/ChatPanel.tsx#L58-L79)).
**Gaps:** (a) the cart lives in React state with **no localStorage** ([CartContext.tsx](client/src/context/CartContext.tsx)) — reload-persistence depends entirely on the socket round-trip, so a reload on flaky Wi-Fi shows an empty cart until the socket reconnects; (b) `fetchJson` has **no timeout and no retry** ([client/src/services/api.ts:7-13](client/src/services/api.ts#L7-L13)) and a failed order just `alert()`s "try again" ([CartDrawer.tsx:90-92](client/src/components/cart/CartDrawer.tsx#L90-L92)); (c) the chatbot is branded **"Trump AI"** in the UI, not "Umi" ([ChatPanel.tsx:113](client/src/components/chat/ChatPanel.tsx#L113)) — confirm intended branding.

### 7. Waiter (Vita) UI — 🟢 (with one caveat)

Live order alerts fan out to the waiter/admin/kitchen rooms on placement ([socketService.js:287-302](server/services/socketService.js#L287-L302)) with push fallback. Waiter identity is taken from the **authenticated session, not the client payload**, so a waiter can't register under a spoofed name ([socketService.js:444-447](server/services/socketService.js#L444-L447)). Stale sockets are reclaimed on reconnect ([socketService.js:449-455](server/services/socketService.js#L449-L455)). Multi-waiter is safe — staff act on any table, guests are room-scoped, all enforced per event. Dish stories, upsell prompts, and cart-recommendations are wired through the same local engine. **Caveat:** the waiter "served" action and kitchen status both move orders, but because reads are Postgres-first, the §2 lost-order case also hides tickets from waiters.

### 8. Admin UI — 🟢

Table-wise carts, live dish enable/disable, and menu CRUD all broadcast `menuUpdated`, and the client refetches on it ([menuController.js:114-145](server/controllers/menuController.js#L114-L145), [client/src/hooks/useMenu.ts:7](client/src/hooks/useMenu.ts#L7)) — so an 86'd dish disappears for seated guests in real time. User management (create/update/suspend, role-scoped) is present ([helpers.js:568-592](server/utils/helpers.js#L568-L592)). The analytics data model is **ready** — `RecommendationEvent`, `OrderRating`, `UpsellEvent`, `Guest`, indexed `Order` totals ([schema.prisma:239-354](../../prisma/schema.prisma#L239)) — and analytics endpoints exist. *Minor:* full-menu refetch on every toggle (fine at one-venue scale).

### 9. Multi-tenant readiness — 🔴 (for the SaaS pitch specifically)

The *data model* is multi-tenant-ready (`restaurantId` on every model, env-driven `TRUMP_RESTAURANT_ID`). But the running system is **single-tenant-per-deploy**, not config-only: the client hardcodes `BASE_PATH='/Trump'` and `RESTAURANT_ID='trump'` ([client/src/constants/api.ts:1-4](client/src/constants/api.ts#L1-L4)), and `'trump'` is hardcoded server-side in the cron and media paths ([server.js:345](server/server.js#L345), [menuController.js:164,174,184](server/controllers/menuController.js#L164)). Onboarding restaurant #2 today means: a separate client build with a different base path, a separate server process with its own `TRUMP_*` env, and cleaning up hardcoded `'trump'` strings. That's a viable "one container per tenant" model, but it is **not** "add a row and it appears" — the SaaS pitch needs the isolation made explicit and the hardcodes removed (Phase 3).

### 10. Code quality — 🟢

Clean DI throughout (`createConfig` injected, no global singletons), thin controllers / fat services as documented, structured errors, and broad validation scripts (`reco:validate` 41/41, `reco:health:test` 17/17, `smoke:test`). **Gaps:** the duplicated `new PrismaClient()` pattern (§4) is the main smell; there is **no automated test suite** for the order/auth/socket core (only the reco validators and a smoke test); and the live `orders/order_table_table1_*.json` file in the tree suggests JSON artefacts are still being written alongside Postgres (the dual-write of §2).

---

## Top 10 launch blockers (ranked)

1. **No per-table QR token** — anyone can order to / control any table. → Sign the table id into the QR (HMAC), verify on `submit_order` + socket `joinTable`. *(security 🔴)*
2. **Silent order loss when a single DB write fails** — guest told "placed," ticket never reaches the kitchen. → Make order placement DB-authoritative (fail the request if the order isn't durably persisted) or add a JSON→DB reconciliation sweep; stop reading Postgres-first while writing JSON-first. *(data 🔴)*
3. **No database backups** — no runnable `pg_dump` automation anywhere. → Nightly `pg_dump` to off-box storage + a tested restore runbook. *(ops 🔴)*
4. **~10 Prisma connection pools** — exhausts Postgres under load and *causes* blocker #2. → One shared `PrismaClient` injected everywhere. *(ops 🔴)*
5. **HTTPS depends on un-versioned nginx config** — verify TLS, http→https redirect, and the `/Trump/socket.io` upgrade on the box. → Check + document the nginx server block; enable app `forceHttps` as belt-and-braces. *(ops 🟡)*
6. **PM2 gives up after 10 restarts + no log rotation** — a flap takes the venue offline; disks fill. → Raise/relax `max_restarts`, install `pm2-logrotate`. *(ops 🟡)*
7. **Order submit has no timeout/retry/offline queue** — flaky Wi-Fi = a dropped order with only an `alert()`. → Add fetch timeout + bounded retry; queue-and-resend the order if offline. *(customer 🟡)*
8. **Cart not persisted locally** — reload on bad signal shows an empty cart until the socket reconnects. → Mirror the cart to `localStorage`, hydrate on load, reconcile with `syncCart`. *(customer 🟡)*
9. **Kitchen status transitions unordered + no `paid` state** — status can jump backwards; billing lifecycle implicit. → Enforce a transition table; add `paid`/settlement. *(data 🟡)*
10. **Tenant identity hardcoded in client + a few server paths** — blocks the "config-only second restaurant" story. → Drive base-path/restaurantId from build/env; remove literal `'trump'`. *(multi-tenant 🔴 for the pitch, not for Trump's own launch)*

---

## Phased plan

> Each phase lists its goal, the files/areas it touches, and explicit "done when" acceptance criteria. **No code is written until you approve this report** (Step 3 of the brief). Phase 1 is the only must-fix-before-any-client-sees-it set.

### Phase 1 — Critical hardening *(must-fix before the Sandton client sees it)*

**Goal:** close the table-spoofing hole, guarantee no order is ever silently lost, and make the box operationally safe (backups, restart, HTTPS).

**Files / areas:**
- Table tokens: `server/utils/helpers.js` (HMAC sign/verify helper), `server/routes/orderRoutes.js`, `server/controllers/orderController.js`, `server/services/orderValidationService.js`, `server/services/socketService.js` (`handleJoinTable`), QR-generation path, and client (`constants/api.ts`, `hooks/useCart.ts`, order submit) to carry the token.
- Order durability: `server/services/fileService.js`, `server/services/prismaOrderService.js`, `server/controllers/orderController.js`, `server/controllers/kitchenController.js` (read/write ordering + a reconciliation sweep).
- Connection pool: new shared `server/services/prismaClient.js` usage across `kitchen/analytics/rating/reservation/waiter` controllers, `pushService`, `mediaEnrichmentService`.
- Kitchen state machine: `server/controllers/kitchenController.js` (ordered transitions; add `paid`).
- Ops: `ecosystem.config.js` (restart policy), `pm2-logrotate`, a `scripts/backup-db.js` (or documented cron), nginx config verification.

**Done when:**
- A `submit_order` or socket `joinTable` for a table whose token is missing/invalid is rejected (HTTP 401/403 / socket `authError`), and the legitimate QR flow still works end-to-end.
- A simulated single failed DB transaction during order placement results in **either** the request failing visibly **or** the order still showing up on the kitchen/admin feed — never "placed but invisible." A reconciliation run imports any orphaned JSON orders into Postgres.
- Exactly one `PrismaClient` is instantiated process-wide (verified by grep + a connection-count check under a small load test).
- Kitchen status rejects out-of-order transitions; `paid` exists and is reachable from `served`.
- `pg_dump` runs on a schedule to off-box storage **and a restore has been performed successfully at least once**; PM2 no longer permanently stops on a flap; logs rotate; nginx serves HTTPS and upgrades the socket.
- Existing checks still green: `npm run reco:validate`, `npm run reco:health:test`, `npm run smoke:test`, client `npm run build` + `npm run lint`.

### Phase 2 — The three UIs to client-demo quality

**Goal:** every surface the owner would click through in a pitch is solid on real restaurant Wi-Fi.

**Files / areas:** `client/src/services/api.ts` (timeout + retry), `client/src/components/cart/*` and `context/CartContext.tsx` (localStorage persistence, better failure UX than `alert()`), `client/src/components/chat/ChatPanel.tsx` (confirm Umi branding), recommendation-card empty/loading/error states across menu/chat/cart, waiter alert reliability under reconnect, admin live-toggle and orders polish.

**Done when:** an order survives a 5-second network blackout via retry/queue; a mid-session reload restores the cart from localStorage; every list (menu, recs, orders, alerts) has explicit loading/empty/error states; two waiters and two guest phones on one table can operate for 10 minutes with no collisions or lost items; chatbot answers every suggested prompt fully locally.

### Phase 3 — Multi-tenant + analytics

**Goal:** make onboarding restaurant #2 a config/data exercise, and ship owner analytics on the now-clean model.

**Files / areas:** `client/src/constants/api.ts` (base-path/restaurantId from build/env), the hardcoded `'trump'` server strings (`server.js`, `menuController.js`, media/cron), a per-tenant branding/config source, and the analytics dashboard on `RecommendationEvent`/`OrderRating`/`Order`.

**Done when:** a second tenant can be stood up by env + data only (no source edits to business logic); no literal `'trump'` remains in request-handling code; the admin shows covers, top dishes, and revenue for an arbitrary date range, with tenant data provably isolated.

### Phase 4 — Launch polish & checklist

**Goal:** measured performance, accessibility, monitoring, and a written go-live runbook.

**Files / areas:** image/video optimisation under `Images/` `Video/`, accessibility pass on the dark-navy theme (tap targets, contrast, focus order), monitoring/alerting (uptime + error-rate on `/healthz`/`/readyz`), and a `RUNBOOK.md`.

**Done when:** Lighthouse mobile on `/Trump/table1` is recorded (target ≥90 performance / ≥95 accessibility) with the numbers written back into this file; alerting fires on a downed health check; the runbook covers deploy, rollback, backup-restore, and "DB is down / socket is down" behaviour.

---

## Notes for the reader

- Prior internal reports exist (`GO_NO_GO_REPORT.md`, `docs/phase6/*`, `docs/phase7/*`). This audit is independent and code-grounded; where those docs *plan* something not yet in code (notably DB backups), it's listed as still-open above.
- Several recalled "phase" notes describe recommendation work (Phases 0–5) on this branch; that work is real and largely solid (rotation, chef-first recs, analytics). The phases in *this* document are the **production-hardening** track and are numbered separately.
- Nothing in this report has changed any code. Awaiting your go-ahead to begin **Phase 1 only**, one logical commit at a time.
