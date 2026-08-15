# Phase 6 — Restaurant Intelligence / Demo Mode / Sales Readiness

**Date:** 2026-07-09
**Branch:** feat/chatbot-reco-rework
**Scope:** demo data + reporting/presentation layer. Recommendation Engine V2 (Phase 4) and the AI Concierge (Phase 5) were **not modified** in behavior. Two hardcoded `'Donald'` fallback strings were fixed (wording only, per the phase's explicit copy-review exception) and verified against `chat-validate` (56/56) and `phase3-validate`/`reco:validate` (77/77) before and after.

## 1. What this phase built

Trump production (the sales-demo environment — there are no real paying customers yet) needed to look and feel like a busy, successful restaurant to a prospective owner walking through it live. Three things were missing to make that true: (1) the floor was almost empty (only one stale test order), (2) the Owner Dashboard couldn't answer several of the executive questions a real owner would ask, and (3) there was no AI-performance, chef-intelligence, or customer-journey view anywhere in the product.

### 1a. Live demo data (`Sites/Trump/scripts/seed-demo-live.js`)

A new, purge-safe seed script (dry-run by default, `--apply`/`--purge --apply` to act) layered on top of the existing historical seed (`seed-demo-orders.js`, 18 orders, untouched):

- **6 currently-occupied tables**, every basket built from real menu items/prices looked up live against production, no invented numbers:
  - **Table 2 — birthday** (Thabo, 4 covers, R2,409.60): 2× L'Ormarins Brut Classique, Springbok Carpaccio, Tomahawk, Cape Malva Pudding, Death by Chocolate Cake. `kitchenStatus: preparing`.
  - **Table 5 — business dinner** (Lerato, 3 covers, R3,220.80): 2× Wagyu Ribeye, Wagyu Fillet, Le Riche Cabernet, 3× Americano — steaks/premium wine/coffee only, no starter or dessert. `preparing`.
  - **Table 8 — family with kids** (James, 5 covers, R1,758.00): shared starters, 2× Cheese Burger, Chicken Pasta, a peri-peri burger, 3× soft drinks, 2× ice cream. `new`.
  - **Table 3** (couple, seafood, Thabo) — `ready`. **Table 11** (Tomahawk + Cabernet regulars, James) — `new`. **Table 6** (casual wings + Castle, Lerato) — `served`.
  - Spread across all 4 kitchen statuses on purpose, for the Kitchen Display and waiter "current tables" views.
- **Matching `WaiterAssignment` rows** (real `TableOwnershipService.assign()`, not raw writes) and **3 active `Shift` rows** for Thabo/Lerato/James (real `ShiftService.startShift()`).
- **A live birthday celebration flag** — a `type: 'birthday'`, already-approved `WaiterTask` on table 2 (same shape `waiterWorkflowService.approveBirthday()` produces).
- **2 `Guest` records** (a birthday regular, a monthly business-dinner VIP) seated via the real `seatGuest()` mechanism (`Table.metadata.guestId`).
- **10 new `OrderRating`s** against 10 of the 18 *existing* historical orders — matched by exact item-set, not guessed, with short comments tied to what was actually ordered (4.5★ average, one 3★ so it isn't suspiciously perfect).
- **16 new `RecommendationEvent` rows** (8 impression/outcome pairs, tagged `sessionId: demo-<table>-<n>`) tied to specific items in the new baskets — deliberately *not* bulk-generated, since **3,776 real recommendation events already existed** in production from real usage across every prior phase.
- **Stale test debris retired, never deleted**: a month-old R150 active order on table 2 with no waiter → moved to `status: history`; a stale `birthday` task on table 5 (conflicted with the new business-dinner story) and a stale `vegetarian` task on table 3 → marked `resolved`; my own `smoketest2` debris from Phase 5 verification → `resolved`. Found during validation: **4 abandoned `ActiveCartState` rows** (one literally `{"name":"X","price":1}`) were inflating "tables occupied" on tables the story never touched — cleared (an abandoned cart is not an order; nothing was lost).

Applied directly to production with a full `backup-trump.sh` run first. `node scripts/seed-demo-live.js --purge --apply` reverses everything it added.

### 1b. Owner Dashboard — new executive metrics

`client/src/pages/OwnerDashboard.tsx` gained a **"right now"** strip (tables occupied + revenue currently on the floor, celebrations today, top waiter) sitting *above* the existing completed-orders KPIs — those KPIs only ever counted paid orders and would have shown the restaurant looking idle even with 6 tables actively being served. New panels: **Top drinks / Top desserts** (category-filtered), a full **highest-spending-tables ranking** (the endpoint already existed, was just never rendered), **Popular pairings**, and a **waiter leaderboard**. The hero card's recommendation-ROI line gained an uplift figure — recommendation-attributed revenue as a % of the rest of the period's revenue, derived from two real totals the server already computes, not a fabricated counterfactual baseline.

### 1c. Three new backend analytics additions

All in `server/controllers/analyticsController.js` (+routes), reusing the existing query/response patterns:
- `GET /api/analytics/items` gained an optional `category`/`limit` filter and now stamps `categoryType` per row.
- `GET /api/analytics/pairings` — co-occurring item pairs by count + combined revenue, computed fresh from completed orders.
- `GET /api/analytics/journey?tableId=` — a single table's most recent order, bucketed into course steps (drink → starter → main → dessert → coffee → recommendation-accepted → bill-settled), built from Order/OrderItem via the shared `categoryClassifier` — does **not** import `mealStateService` or `recommendationMemory`.

### 1d. Three new Admin Console tabs (`client/src/components/analytics/`)

Self-contained (own data fetching, no prop-drilling — same pattern as the existing `OwnerOperations`/`AuditViewer` tabs):
- **AI Performance** — recommendations made/accepted/%, revenue generated, an honest recType-based split ("additional items suggested" vs. "item upgrades" — there is no stored upsell-vs-replacement boolean, so this groups by the real `recType` the engine already tags each event with rather than inventing one), top recommendation, best-converting recommendation, guest satisfaction (real rating average). Explicitly states in-UI that **average confidence isn't shown** — no confidence value is persisted per event, so acceptance rate and revenue/impression serve as the honest observable proxies.
- **Chef Intelligence** — most/least ordered, best wine pairings (by real recommendation acceptance/revenue), a **premium price-tier** list explicitly labeled as a margin *proxy* (no cost data is tracked), **"trending up this week"** as a real order-velocity comparison (this week's quantity vs. the prior week's, for items that were already selling) rather than a fabricated seasonal calendar, and the active chef-recs list.
- **Customer Journey** — a table picker + the course-by-course timeline described above.

### 1e. Reports tab expansion

`ReportsPanel` (inside `AdminPage.tsx`) gained a bucketed revenue trend chart (day/week/month, matching the range picker), the waiter leaderboard, a live kitchen-board snapshot (counts only — explicitly captioned "no per-order prep-time history is tracked yet," since `kitchenController.js` overwrites `kitchenStatus` in place and never writes an `OrderStatusHistory` row, so no real timing data exists to report), and a CSV export button (top items + revenue-by-table).

## 2. Files changed

**New:**
- `Sites/Trump/scripts/seed-demo-live.js`
- `client/src/components/analytics/AIPerformancePanel.tsx`
- `client/src/components/analytics/ChefIntelligencePanel.tsx`
- `client/src/components/analytics/CustomerJourneyPanel.tsx`

**Server:**
- `server/controllers/analyticsController.js` — `getPairings`, `getJourney`, category filter on `getItems`, the `getCategoryMap`/`classifyByName` helper (see bug #1 below).
- `server/routes/analyticsRoutes.js` — 2 new routes.
- `server/controllers/aiController.js`, `server/services/aiService.js` — 2 wording-only fixes (see §4).

**Client:**
- `client/src/pages/OwnerDashboard.tsx` (+ `.module.css`) — right-now strip, new panels, uplift figure.
- `client/src/pages/AdminPage.tsx` (+ `.module.css`) — 3 new tabs wired in; also carried forward pre-existing, already-complete polish that was sitting uncommitted in this file before this session (emoji→lucide icon migration, `formatTableLabel`/`Badge` usage, a restaurant-name typo fix) — noted, not something this phase did, but included per the standing "current working tree is baseline" policy since I was already touching the file.
- `client/src/constants/api.ts`, `client/src/services/api.ts` — endpoint wiring.

## 3. Real bugs found and fixed during this phase

All found via **live validation against production**, not assumed — curl against the freshly-deployed endpoints and Playwright screenshots of the actual rendered pages caught each one before this report was written:

1. **Category misclassification** (`categoryController.js`'s `getItems`/`getPairings`/`getJourney`). `categoryType()`/`beverageKind()` were called with a bare item name (`"CASTLE LITE"`, `"TOKARA"`, `"NEDERBURG"`) — but the shared classifier needs *category* context (e.g. "Beer", "Cabernet Sauvignon") to disambiguate a wine/beer brand from a food dish, and silently fell through to its `MAIN` default. **This was not a defect in `categoryClassifier.js` itself** — it classifies correctly when given `{name, category}` (verified directly) — the gap was that historical `OrderItem` rows only ever stored the bare name. Fixed by building a `name → category title` map from `MenuItem` (same pattern as `waiterAnalyticsService`'s `getCourseMap`) before classifying. Confirmed live: Top Drinks/Top Wine panels went from showing almost nothing to showing Castle Lite, Tokara, Nederburg, Lanzerac, etc. correctly.
2. **"Tables occupied now" showed 0** while "R9,843 on the floor" showed correctly, in the same tile. `floor.tableCount` (standard tables only) was compared against `floor.counts.empty` (computed over standard **+ luxury** tables combined) — an off-by-luxury-count bug that only became visible once real occupied tables existed to expose the inconsistency. Fixed to `(tableCount + luxuryTableCount) − empty`.
3. **"Top waiter" showed a bare dash** on the "Today" range even with 6 tables actively being served, because the waiter leaderboard only counts *completed* (paid) orders and nothing had been paid out yet that day. Added an honest fallback: when the completed leaderboard is empty, rank by value currently on the floor, labeled `"in progress"` so it's never mistaken for a closed sale.
4. **Customer Journey's recommendation step said "AI recommendation accepted"** — a leftover unused query-param fallback literally defaulting to the word `"AI"`, which is the one word the brand-naming rule (config.ts, §Standing) explicitly forbids. Fixed to read the server's own configured assistant name.

A fifth, smaller efficiency fix (not a correctness bug): the pairings endpoint's nested-loop revenue lookup used `.find()` per pair (effectively cubic in item count per order); replaced with an O(1) map built once per order.

## 4. AI copy review

Grepped the whole server + client for "Donald", generic-AI phrasing ("as an AI", "virtual assistant", robotic error strings) beyond what Phase 5 already fixed. Found and fixed two remaining hardcoded `'Donald'` fallback defaults that would have surfaced if `TRUMP_ASSISTANT_NAME` were ever unset (relevant precisely because Phase 6's premise is "get this ready to show a *new* prospective restaurant," where that env var wouldn't yet be configured):
- `aiController.js`'s `/api/config` default.
- `aiService.js`'s off-topic-decline reply default.

`chat-validate.js` (56/56) and `phase3-validate.js` (77/77) re-ran clean before and after both fixes. One internal-only "Donald" reference remains in `trump_hero_pairings.json`'s `meta` block (an authoring-voice note, never rendered to a guest) — left untouched as out of scope (not customer-facing, and editing knowledge-file internals carries more risk than the zero-benefit fix is worth).

## 5. Honest gaps — reported, not fabricated

Per the phase's explicit "do not fabricate, report instead" instruction:
- **No confidence value is persisted per recommendation event** — "average AI confidence" is not shown anywhere; acceptance rate and revenue/impression are the real, observable proxies used instead.
- **No upsell-vs-replacement boolean exists** in the event schema — the AI Performance "additional items vs. upgrades" split is an honest grouping by the real `recType` the engine tags (an `UPGRADE` bucket vs. everything else), not a fabricated flag.
- **No cost/COGS data is tracked anywhere in the schema** — "highest margin dishes" is shown as a clearly-labeled **premium price-tier proxy**, not a real margin figure.
- **No per-order kitchen timing history exists** — `kitchenController.js` overwrites `kitchenStatus` in place with no `OrderStatusHistory` write, so "kitchen performance" in Reports is a live board-count snapshot only, explicitly captioned as such rather than showing an invented average prep time.
- **"Seasonal opportunities" is shown as "trending up this week"** — a real week-over-week order-velocity comparison, since no true seasonal/calendar field exists in the menu schema.
- **Recommendation acceptance rate in the live event pool is low** (~0.5% over the last 7–30 days across 1,000+ real impressions) — this is real, organic data from actual testing/usage across every prior phase, not something this phase changed or could honestly inflate; it's presented as-is.
- **Customer Journey's "recommendation accepted" step only lights up when the event's `sessionId` happens to be table-tagged** — real customer-chat sessions use a random per-browser UUID with no table linkage in the schema, so this step will only ever populate reliably for the demo-seeded tables (by design) or for waiter-mode events, not for organic guest chat sessions. Noted for anyone extending this feature later.

## 6. Validation

| Check | Result |
|---|---|
| `client && npx tsc --noEmit` | clean, every round (initial + after each fix) |
| `client && npx vite build` | clean, 3 rebuilds (initial, occupied-tables fix, top-waiter fix) |
| `node scripts/chat-validate.js` | 56/56, before and after the wording fixes |
| `node scripts/phase3-validate.js` (reco:validate) | 77/77, before and after |
| `node scripts/seed-demo-live.js` dry run → review → `--apply` | reviewed basket-by-basket before writing |
| Live curl (authenticated owner session) against every new/changed endpoint | summary, items (+category), pairings, journey, floor, waiter leaderboard, waiter tasks, recommendation analytics, config, chat — all correct |
| Live Playwright screenshots (real login, real production) | Owner Dashboard, AI Performance, Chef Intelligence, Customer Journey, Reports, Kitchen Display all rendered correctly with the seeded story data |
| Production health after every deploy (4 total: main deploy + 3 hotfixes) | `/healthz` ok, `/readyz` ready, PM2 stable (113 restarts, all expected reloads, 0 crashes), memory bounded (~127MB) |

## 7. Production deploy log

1. Baseline health check → clean.
2. `backup-trump.sh` → DB dump + data tar, local-only (off-box upload still unconfigured — pre-existing, not this phase's gap).
3. Code synced via tar+scp (no `rsync` binary available on this Windows workstation — used tar, excluding `.env`/`ecosystem.config.js`/`node_modules`/`.git`/`Images`/`Video`/persistent data dirs, same exclusion set `rsync` would have used).
4. `deploy-trump.sh` — required `TRUMP_PRISMA_SCHEMA` explicitly (the script's default `../../prisma/schema.prisma` doesn't match this box's actual layout, `../prisma/schema.prisma`) and needed the env vars `export`ed rather than prefixed on the `sed | bash` pipeline (a var prefixed on a piped command only scopes to the first command in the pipe). Both are shell/box gotchas, not code defects — noted here for the next deploy. No pending Prisma migrations (no schema changes this phase).
5. 3 follow-up hotfixes deployed after live validation caught the bugs in §3 (2 client-only rebuild+resync, 1 server file + PM2 reload each).
6. Final state verified healthy, stable, and correct end-to-end.

## 8. What this phase deliberately did not touch

- Recommendation Engine V2 candidate generation/scoring/filtering — unchanged.
- AI Concierge presentation timing/rules (Phase 5) — unchanged.
- `luxury/` — untouched.
- No Prisma schema/migration changes.

---

**STOP. Phase 7 not started — awaiting approval.**
