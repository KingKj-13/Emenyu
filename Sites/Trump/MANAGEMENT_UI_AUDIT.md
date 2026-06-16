# Management UI Audit — Trump (back-of-house / management surfaces)

**Date:** 2026-06-16 · **Scope:** `Sites/Trump/` management surfaces only — Admin, Data/Analytics, Owner, Kitchen. Customer menu excluded. **Read-only audit**; no code changed.

**Headline:** much more exists than a greenfield read would suggest. The React `/Admin` console is a 2,243-LOC, 13-tab app that already does orders, menu CRUD, 86'ing, accounts, deals, chef-pairing editing, bundles, reports, **and a full recommendation funnel with revenue attribution + plain-English action items**. The real gaps are **consolidation, owner-grade framing, a few missing metrics, and one legacy-duplication problem** — not building analytics from scratch.

---

## Surface map (routes)

| Surface | Route / file | Role | Impl |
|---|---|---|---|
| Admin console | `/Admin` → [AdminPage.tsx](client/src/pages/AdminPage.tsx) (App.tsx:49) | owner + manager | React SPA (canonical) |
| Reports (analytics) | `/Admin` → `reports` tab ([AdminPage.tsx:907](client/src/pages/AdminPage.tsx#L907)) | owner + manager | React |
| Reco analytics | `/Admin` → `recoanalytics` tab ([AdminPage.tsx:1650](client/src/pages/AdminPage.tsx#L1650)) | owner + manager | React |
| **Owner dashboard** | `/owner.html` (server.js:266, `requirePage(['owner'])`) → [owner.js](frontend/scripts/owner.js) | owner only | **Vanilla (legacy)** |
| Kitchen | `/Kitchen` → [KitchenPage.tsx](client/src/pages/KitchenPage.tsx) (App.tsx:63) | owner + manager + kitchen | React SPA |
| Admin (legacy) | `/admin.html` → [admin.js](frontend/scripts/admin.js) (1,370 LOC) | owner + manager | **Vanilla (legacy)** |

There are **two parallel admin stacks** (React `/Admin` and vanilla `/admin.html` + `/owner.html`). React is the live one for staff; the vanilla pages are legacy duplicates still served. This is the single biggest structural issue (see Cross-cutting).

---

# STEP 1 — Current state

### Admin — operational control · 🟡 (capable but dense, desktop-shaped)

13 tabs ([AdminPage.tsx:12](client/src/pages/AdminPage.tsx#L12)): `orders, history, accounts, chat, menu, reports, qrcodes, reservations, tables, deals, chefrecs, recoanalytics, bundles`.

- **Orders / History** — `OrderList` ([AdminPage.tsx:505](client/src/pages/AdminPage.tsx#L505)): active-order list with complete/delete. *Not* a time-elapsed live board.
- **Tables** — `TablesPanel` ([AdminPage.tsx:541](client/src/pages/AdminPage.tsx#L541)): live per-table cart grid with admin price overrides, realtime via socket. `liveCovers` = count of occupied tables ([:399](client/src/pages/AdminPage.tsx#L399)).
- **Menu** — `MenuAvailabilityList`: grouped by category, **86 toggle is already optimistic** (local state patch, *no* full refetch — [AdminPage.tsx:224-228](client/src/pages/AdminPage.tsx#L224)). *Correction to the earlier audit: the per-toggle refetch is gone.* Bulk show/hide/delete + per-item media controls (`MenuItemMediaControls`, image/video/YouTube) exist. **No drag-to-reorder.**
- **Chef-recs** — full pairing/journey editor (`chefrecs` tab) ✅ — the primary recommendation engine is editable here.
- **Bundles** — persona meal-bundle CRUD ([AdminPage.tsx:1783](client/src/pages/AdminPage.tsx#L1783)) ✅.
- **Deals** — specials/deal-of-the-day with per-day scheduling ✅.
- **Accounts** — staff list + create (role-gated) ✅.
- **Settings** — ❌ **none.** VAT/service rates, restaurant info, branding, and the assistant name are **`.env`-only**. No UI.

### Data / Analytics — `reports` tab · 🟡→🟢 (solid primitives, not owner-framed)

[ReportsPanel](client/src/pages/AdminPage.tsx#L907) + [analyticsController.js](server/controllers/analyticsController.js) (all on `status: 'history'` = completed orders):
- KPI cards: **Total Revenue, Orders, Avg Order, Top Table** ([:933](client/src/pages/AdminPage.tsx#L933)). Date-range selector present.
- **Top Items** (qty + revenue, top 10) ([analyticsController.js:52](server/controllers/analyticsController.js#L52)).
- **Revenue by Table** (bar list).
- **Peak Hours** (24h bar chart, [analyticsController.js:103](server/controllers/analyticsController.js#L103)).
- **Customer Ratings**: average + stars + count + recent comments ([:1018](client/src/pages/AdminPage.tsx#L1018)).
- Missing: **covers / avg-per-cover** (not captured — see data matrix), **revenue trend over time**, **bottom dishes**, **day-of-week**, **ratings trend / per-dish**.

### Data / Analytics — `recoanalytics` tab · 🟢 (genuinely strong; just buried)

[RecoAnalyticsPanel](client/src/pages/AdminPage.tsx#L1650):
- Full funnel KPIs: **Impressions → Clicks (CTR) → Accepted → Acceptance/Dismissal rate → Orders generated → Revenue attributed (+per impression)** ([:1697](client/src/pages/AdminPage.tsx#L1697)).
- Boards: Most shown / Most clicked / Highest conversion / Underperforming / Revenue attributed / By source / **By bundle (persona)** / By rotation group.
- **Plain-English "Action items"** ([RecoActionItems:1629](client/src/pages/AdminPage.tsx#L1629)) from [recommendationInsights.js](server/services/recommendationInsights.js): dead recommendations, broken references, missing pairings — severity-ranked with a recommended action.
- Filters: mode (customer/waiter), category, source, rotation group.

> **The "Donald added R-X to tickets" hero number already exists as data** — it's `totals.revenue` ("Revenue attributed") — but it's one KPI among seven on a sub-tab, not a hero on an owner home. This is a **framing/surfacing** gap, not a build gap.

### Owner — `/owner.html` (vanilla) · 🔴 (legacy, thin, today-only, disconnected)

[owner.js](frontend/scripts/owner.js): today-only KPIs (revenue/orders/avg/top-table), top items, hourly chart, a 30-table live grid, staff cards, live socket updates. **No date range, no trends, no ratings, no recommendation ROI, no insights.** It duplicates a weaker slice of the React `reports` tab, off the navy/gold design system, on its own CSS. There is **no React Owner route** — owner and manager see the *identical* 13-tab console (`requireRole(['owner','manager'])`, [AdminPage.tsx:446](client/src/pages/AdminPage.tsx#L446)); there is no BI-focused owner experience.

### Kitchen — `/Kitchen` (React) · 🟢 (already a real KDS; one server gap)

[KitchenPage.tsx](client/src/pages/KitchenPage.tsx): 3-column board (New / Preparing / Ready), per-ticket **elapsed timer**, **age colour-coding** at 8/15 min ([:42](client/src/pages/KitchenPage.tsx#L42)), **new-ticket chime** ([:72](client/src/pages/KitchenPage.tsx#L72)), realtime via `orderPlaced` / `kitchenStatusUpdate`, notes per item, table + total. Mobile: stacks to 1 column < 900px (KitchenPage.module.css:30). Client buttons are **forward-only** (single "advance" → next status, [:124](client/src/pages/KitchenPage.tsx#L124)).

- 🔴 **Status flow is NOT enforced server-side.** [kitchenController.js:32-34](server/controllers/kitchenController.js#L32) only checks the status is one of `new|preparing|ready|served` — it accepts **any** of them with no transition guard, so `new → served` (skip/backwards) is accepted via the API. The earlier audit's finding still holds at the API layer; the UI hides it but doesn't enforce it.

---

## Captured-but-unused / under-surfaced data

| Data (schema) | Captured? | Surfaced where | Gap for management |
|---|---|---|---|
| `RecommendationEvent` (funnel + `value` revenue) | ✅ rich | Admin `recoanalytics` tab | Buried on a sub-tab; not on an owner home / not a hero number |
| `UpsellEvent` (waiter upsells, `accepted`, `value`) | ✅ | **Waiter app only** (performance/leaderboard/shift-report) | **Not in owner/admin BI** — waiter-driven upsell revenue invisible to owner |
| `OrderRating` (rating + comment, **per order**) | ✅ | Admin `reports` (overall avg + comments) | No **trend**; **per-dish impossible** (data is per-order, not per-item) |
| `Guest` (vip, loyaltyTier, lifetimeSpend, avgSpend, visitCount, lastVisitAt) | ✅ rich | **Waiter app only** (guest intel/seat) | **No owner CRM/VIP/repeat-guest view** — the richest unused asset |
| `Order` (indexed totals, timestamp, guestId) | ✅ | Admin reports + owner.html | No **revenue trend over time**; **covers/party-size not captured at all** |

**Bottom line:** the data is mostly *collected and shown somewhere*, but **scattered across the 13-tab admin and the waiter app**, with **no consolidated, owner-grade view** and **no hero ROI number**. Two things are genuinely *not captured*: **covers (party size per order)** and **per-dish ratings**.

## Mobile-readiness

- **Admin:** 2 breakpoints (AdminPage.module.css:280 / :715). Sidebar collapses to icons < 720px, but dense panels — multi-column `reportsGrid`, the 24-bar hours chart, and the inline-styled editors with fixed grids (e.g. bundle rows `120px 1fr 90px 36px`, [:1733](client/src/pages/AdminPage.tsx#L1733)) — are **desktop-shaped** and cramped on a phone. Owners checking on mobile get a poor experience.
- **Kitchen:** ✅ stacks cleanly to 1 column (tablet/phone fine).
- **Owner (vanilla):** separate CSS, today-only; not part of the design system.

---

# STEP 2 — Proposals (against the target)

Legend: ✅ exists · ⚠️ partial / needs reframe · ❌ missing (build).

## A. Owner / Data dashboard — **highest priority** (the ROI / sign-the-owner story)

Build a **dedicated, mobile-first React Owner Dashboard** (new role-gated route, e.g. `/Admin` "Overview" as the owner landing, or `/Owner`) that *consolidates* what's already computed and adds the few missing metrics — then **retire the vanilla `owner.html`** (redirect to it).

| Target | Status | Plan |
|---|---|---|
| KPI: today's revenue | ✅ | Reuse `getSummary`. |
| KPI: covers + avg spend/cover | ❌ no data | Short term: use **occupied-table count** (`liveCovers`) and **orders** as proxies, labelled honestly. Proper fix: capture **party size** on order submit (1 schema field) → real covers + avg-per-cover. |
| KPI: **Donald-driven revenue (hero)** | ⚠️ data exists | Promote `recoAnalytics.totals.revenue` (+ `UpsellEvent` value) to a **hero card** — "Donald added R-X to tickets this period." |
| Chart: revenue trend (day/week/month) | ❌ | New endpoint `analytics/trend` (group `Order` by day/week/month over range) + a line/bar. |
| Chart: top **& bottom** dishes | ⚠️ top only | Extend `getItems` with an `asc` board for worst sellers. |
| Chart: recommendation funnel | ✅ | Reuse `RecoAnalyticsPanel`'s funnel; surface a compact version on the home. |
| Ratings: avg + **trend** + recent comments | ⚠️ avg+comments | Add a ratings-over-time series; keep comments. (Per-dish "most/least loved" needs per-item rating capture — flag as a data change, not phase 1.) |
| Peak times: hour **+ day-of-week** | ⚠️ hour only | Add day-of-week aggregation alongside `getHours`. |
| **Plain-English business insights** | ⚠️ reco-only | Extend the insight engine ([recommendationInsights.js](server/services/recommendationInsights.js)) with **business rules** ("Tuesdays are slowest," "Glenfiddich + Tomahawk is your top upsell," "ratings dipped this week") — reuse the existing severity/title/detail/action shape and `RecoActionItems` renderer. |

## B. Admin — operational control (second)

| Target | Status | Plan |
|---|---|---|
| Live order board by table/status + elapsed, realtime | ⚠️ split | Today: active orders in a list + live carts in `TablesPanel`. Build a **unified KDS-style live board** for management (table, status, elapsed colour, realtime). |
| Instant 86 toggle | ✅ already optimistic | No work (correct the old audit). |
| Drag-to-reorder menu | ❌ | Add ordering (schema `sortOrder` already on `OrderItem`; menu items need a sort field + DnD). |
| Image upload/management | ⚠️ exists | `MenuItemMediaControls` already does image/video/YouTube — polish only. |
| Chef-curated pairing editor | ✅ | `chefrecs` tab exists — polish/mobile. |
| Specials / deal-of-the-day | ✅ | `deals` tab exists — polish. |
| **Settings page** (VAT/service, restaurant info, branding, **assistant name**) | ❌ | **Build it.** Removes `.env` editing, and seeds the **per-tenant config** story — and is where the `ASSISTANT_NAME` ("Donald") from the journey work belongs. High value, currently zero UI. |

## C. Kitchen — functional + clean (light pass, third)

| Target | Status | Plan |
|---|---|---|
| KDS ticket view (items, table, notes, time, colour-by-age, alert) | ✅ | Already there — minor polish only. |
| **Enforced status flow (no backward/skip jumps)** | ❌ server-side | **Add a transition guard** in [kitchenController.js](server/controllers/kitchenController.js) (`new→preparing→ready→served`; reject illegal transitions 400). Tiny change, high value — could even be pulled forward as a quick win. |

## Cross-cutting

- **Retire the vanilla duplicates** (`admin.html`/`admin.js` 1,370 LOC, `owner.html`/`owner.js`): redirect to the React equivalents. Eliminates a whole parallel codebase, guarantees the navy/gold theme + mobile, and removes drift risk. (Do this *with* the Owner dashboard so `owner.html` has a real replacement.)
- **Mobile-first** every new/modified panel; the owner dashboard especially must be phone-first.
- **Local only** — every proposal uses existing local Postgres + the deterministic insight engine. No external services.

---

# STEP 3 — Phasing (with "done when")

Your instinct (Owner/Data → Admin → Kitchen) is right; the code refines it slightly because the analytics *primitives already exist*, so Phase 1 is mostly **consolidation + framing + a few endpoints**, not a big build. One tiny exception worth pulling forward.

**Phase 0 — Kitchen flow guard (quick win, ~0.5 day).** Add the server-side transition guard. *Done when:* the API rejects `new→served`/backward jumps (400) and only allows `new→preparing→ready→served`; KDS visually unchanged. *(Small enough to ship before Phase 1 even though Kitchen is otherwise last.)*

**Phase 1 — Owner / BI Dashboard (highest value).** New mobile-first owner home consolidating existing analytics + the Donald-ROI hero + the few new metrics (revenue trend, day-of-week, bottom dishes) + business insights; retire `owner.html`. *Done when:* an owner on a **phone** lands on one screen showing today's revenue / (proxy) covers / avg, a **"Donald added R-X" hero**, a revenue trend, top & bottom dishes, a compact reco funnel, ratings avg + comments, and 3–5 plain-English insights — and `/owner.html` redirects to it.

**Phase 2 — Admin operational polish.** **Settings page** (VAT/service/branding/assistant name — kills `.env` edits, seeds per-tenant config) + **unified live order board** + drag-to-reorder. *Done when:* an owner changes VAT/service/restaurant name/assistant name from the UI (no `.env`), and a single realtime board shows every active table/order with elapsed colour.

**Phase 3 — Kitchen polish + retire vanilla admin.** Minor KDS polish; redirect `/admin.html` → `/Admin`. *Done when:* no vanilla management page is reachable except as a redirect, and Kitchen passes a tablet+phone check.

**Data-capture follow-ups (decide separately):** (1) **party size on order submit** → real covers/avg-per-cover; (2) **per-item ratings** → most/least-loved dishes. Both are 1-field schema changes that unlock target KPIs but aren't required to start Phase 1.

---

*Awaiting go-ahead before any implementation. Prod deploy remains paused; staging + tunnel + scratch DB still up as the fallback.*
