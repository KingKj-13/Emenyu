# Waiter Assistant V2 — Phase 1 Analysis & Migration Plan

**Branch:** `feat/chatbot-reco-rework`
**Date:** 2026-06-23
**Scope:** Trump waiter UI, waiter engine, notifications, smart pairing, guest insights, upsell assistant.

> **Key finding:** ~80% of the V2 redesign is **already built on this branch** (uncommitted). The
> workflow-based UI, bottom nav, floor service, CSV pairing engine, and `WaiterTask` workflow all
> exist. This plan classifies what is **done**, **half-built**, **missing**, and **dead**, so the
> remaining work is targeted rather than a from-scratch rebuild.

---

## A. Current system (as it exists on this branch)

### Frontend — the NEW waiter shell (live)
[client/src/pages/WaiterPage.tsx](client/src/pages/WaiterPage.tsx) is already a complete
workflow-based SPA with the required bottom nav and screens:

| Spec screen | Status | Where |
|---|---|---|
| Bottom nav (Home/Tables/Alerts/Chat/Profile) | ✅ done | `BottomNav`, `NAV` |
| S1 Dashboard (table cards, statuses, next-action) | ✅ done | `HomeScreen`, `TableCard`, `statusForTable` |
| S2 Table details (cart, timeline, insights, AI rec, revenue, quick actions) | ✅ done | `TableDetails` |
| S3 AI recommendation panel | ✅ done | `AiRecommendationPanel` |
| S4 Revenue opportunity panel | ✅ done | `RevenuePanel` |
| S5 Smart pairing engine | ✅ done (backend) | `smartPairingEngine.js` |
| S6 Add items (categories, search, touch grid) | ✅ done | `AddItems` |
| S7 Alerts center (priority queue) | 🟡 partial | `AlertsScreen` — no time escalation |
| S8 / S11 Chat center + analysis | 🟡 partial | `ChatScreen` — manual paste only |
| S9 Table call system | 🟡 partial | socket `incomingWaiterCall` — no escalation |
| S10 Manager → waiter comms | 🔴 missing manager UI | waiter receives; nothing sends |
| S12 Birthday workflow | 🟡 half-built | waiter requests; no manager approve UI |
| S13 Food ready system | ✅ done | `kitchenStatusUpdate` → `ready` alert |
| S14 Split bill | 🟡 equal-only | `SplitBillModal` — no by-item/custom |
| S15 Waiter performance | 🟡 partial | `ProfileScreen` — rating hardcoded |

### Backend (live on branch)
- [server/services/floorService.js](server/services/floorService.js) — deterministic floor snapshot from bulk Postgres queries.
- [server/services/waiterWorkflowService.js](server/services/waiterWorkflowService.js) — `WaiterTask` CRUD, birthday approval, chat-message pattern analysis, chat-center aggregation; emits `waiterTaskCreated` / `managerApprovalRequested`.
- [server/services/smartPairingEngine.js](server/services/smartPairingEngine.js) — CSV-driven pairing (food↔drink, starter→main, main→dessert, dessert→coffee), 60s cache, wired into `aiService.cartRecommendations`.
- [server/controllers/waiterApiController.js](server/controllers/waiterApiController.js) + [routes/waiterApiRoutes.js](server/routes/waiterApiRoutes.js) — full API surface (floor, intel, coach, sommelier, ask, recovery, tasks, chat-center, chat-analysis, birthday, performance, leaderboard, guests, covers).
- **DB:** new `WaiterTask` model + migration `20260622120000_waiter_workflow_tasks` (4 indexes). **Not yet committed or deployed.**
- **Data:** `data/pairings/*.csv` (3 files) — **untracked**.

### Existing notification / order / manager flows
- **Order flow:** waiter builds order → `waiterAddItems` (HTTP) → kitchen feed. Guest cart syncs live via socket (`syncCart`/`syncHistory`).
- **Notifications:** socket rooms — `incomingWaiterCall` (bell), `kitchenStatusUpdate` (food ready), `managerCallWaiter`, `guestEvent`, `waiterTaskCreated/Updated`. Waiter re-joins on reconnect (resilient).
- **Manager comms:** waiter→manager works (Call Manager → `manager_request` task). Manager→waiter has **no Trump sender UI** (only legacy Greek `waiter-app.js` emits `managerCallWaiter`).
- **Chat:** customer chatbot `POST /api/chat` is deterministic/local. Waiter chat-analysis is a **separate manual** paste box — the two are **not connected**.

---

## B. Migration plan

### 1. Components to KEEP (done, no change)
- `WaiterPage.tsx` shell, `BottomNav`, `TopBar`, `HomeScreen`, `TableCard`, `TablesScreen`, `TableDetails`, `AddItems`.
- `AiRecommendationPanel`, `RevenuePanel`, `Timeline`, `InsightTags`.
- `WaiterContext.tsx` (socket wiring, cart build, reconnect).
- `floorService.js`, `waiterWorkflowService.js`, `smartPairingEngine.js`, waiter API controller/routes.
- `WaiterTask` schema + migration; `data/pairings` CSVs.
- `StartShiftScreen`, `pages/waiter/MenuScreen` (used by Add path), socket service.

### 2. Components to MODIFY
| # | Item | Change |
|---|---|---|
| M1 | `SplitBillModal` | Add **by-item** and **custom** split modes (spec S14); replace fake "print" toast with a real receipt summary. |
| M2 | `ChatScreen` / chat pipeline | Auto-run `analyzeMessage` on real guest chatbot messages so waiter notifications are generated **automatically** (S11), not by manual paste. |
| M3 | `AlertsScreen` + alert model | Add **time-based escalation** (overdue → bumped priority + visual) for bell/ready/manager (S7, S9). |
| M4 | `ProfileScreen` | Replace hardcoded 4.8 rating + heuristic "additional revenue" with real `OrderRating` / `UpsellEvent` data (S15). |
| M5 | `aiService.cartRecommendations` | Use per-pairing CSV `reasoning` as the **script/reason** instead of the generic template string; keep dedupe + chef-first ordering. |
| M6 | `WaiterPage.tsx` | Code-split heavy screens via `lazy()` (perf requirement); it's currently one 700-line module. |

### 3. Components to REMOVE (orphaned by the new shell — dead code)
The new `WaiterPage.tsx` only imports `StartShiftScreen` + `SplitBillModal`. These are no longer reachable:
- `pages/waiter/`: `FloorScreen`, `OrderScreen`, `CartRecScreen`, `AICoachScreen`, `LeaderboardScreen`, `ShiftReportScreen`, `TodayScreen` (verify each has no other importer first).
- `components/waiter/`: `ServiceNotesModal`, `ServiceRecoverySheet`, `VoiceAssistant`, `ItemDetailSheet`, `FloorAlerts`.
- Stale `WaiterTab` union members in `types/waiter.ts` (`floor|order|menu|coach|today|cartrec`).
> Removal is optional for function but recommended for clarity; gate on a no-importer grep.

### 4. NEW components required
| # | Component | Purpose | Spec |
|---|---|---|---|
| N1 | **Manager approval surface** (React Admin tab + socket listener on `managerApprovalRequested`) calling `POST /waiter/birthday-approval/:id` | Close the birthday loop — manager approves/rejects, waiter notified silently | S12 |
| N2 | **Manager → waiter dispatch UI** (Admin) → `POST /waiter/tasks` (Visit Table / Handle Complaint / VIP / Special Request / Priority Service) | Manager-initiated comms | S10 |
| N3 | **Split-by-item / custom split** view inside `SplitBillModal` | S14 |
| N4 | **Escalation worker** (client interval or lightweight server sweep) that re-prioritises overdue tasks/alerts | S7, S9 |

### 5. Database changes required
- **Apply** the pending `WaiterTask` migration (`npx prisma migrate deploy`) — local + prod (prod is currently behind).
- Optional `Order.rating` / reuse existing `OrderRating` for the real Guest Rating metric (M4) — **no new table needed**, model already exists.
- No other schema changes required; `RecommendationEvent` / `UpsellEvent` / `Guest` already cover insights + upsell attribution.

---

## C. Risks / sequencing notes
1. **Migration + CSVs are untracked** — commit these first; nothing works in a fresh checkout otherwise.
2. **Prod DB is 3+ migrations behind** (per project memory) — `WaiterTask` deploy must be sequenced with the earlier reco-event/bundle migrations.
3. **Connection-pool sprawl** (PRODUCTION_READINESS §4) — new services correctly use the shared `getPrisma()`; do not add `new PrismaClient()`.
4. Order placement is HTTP POST (no retry) — out of scope for waiter V2 but noted.

## D. Suggested implementation order
1. Commit migration + CSVs (unblock checkout). 2. N1 birthday approval (highest user-visible gap). 3. N2 manager dispatch. 4. M2 auto chat-analysis. 5. M1/N3 split bill. 6. M3/N4 escalation. 7. M4 real performance. 8. M5 script copy. 9. M6 code-split + dead-code removal. 10. Lint, build, test, deploy.
