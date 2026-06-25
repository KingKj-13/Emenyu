# WAITER-WORKFLOW.md — Phase 03 Step 6

**Date:** 2026-06-24. **Status: ✅ signals exist + ownership/shift backend added; 🟦 timeline assembly + UI designed (next pass).**

---

## 1. The service flow

```
Customer seated → Table assigned → Orders placed → Upsell opportunities
   → Customer requests → Bill requested → Table closed
```

Each stage already has a backing signal in the system — Phase 03 adds the **ownership** and **shift** context that ties them to a specific waiter and a measurable timeline.

| Stage | Signal (existing unless noted) |
|---|---|
| Customer seated | `waiter/table/:id/seat-guest`, `Guest`, `Table.covers` |
| Table assigned | **`WaiterAssignment` (Phase 03 ownership)** — owner + `assignedAt` |
| Orders placed | `Order` (`waiterName`, `timestamp`, `total`) + `OrderStatusHistory` |
| Upsell opportunities | `UpsellEvent`, `waiter/coach`, `opportunityService` |
| Customer requests | `WaiterTask` (Service Desk) + `socketService` waiter-call |
| Bill requested | `Order.status` transitions + `OrderStatusHistory` |
| Table closed | ownership `release` (Phase 03) + order completion |

## 2. What Phase 03 adds to the workflow

- **Ownership timeline:** `WaiterAssignment` rows (assignedAt → releasedAt) give the **service window** per table per waiter, including transfers/takeovers.
- **Shift metrics:** `shiftService.computeShiftMetrics` aggregates **orders handled + revenue + tasks resolved** over a shift — the per-waiter "revenue handled / order count" the brief asks for.
- **Response timing:** `WaiterTask` (`createdAt → acknowledgedAt → resolvedAt`) yields response/resolution times; surfaced via `waiter/me/performance` and the new shift metrics.

## 3. Timeline assembly (next pass)

A read model `GET /api/waiter/table/:id/timeline` that merges, ordered by time:
- ownership events (`WaiterAssignment`), order events (`OrderStatusHistory`), tasks (`WaiterTask`), upsells (`UpsellEvent`).
Returns `{ stage, at, actor, detail }[]` plus rollups: `serviceDurationMin`, `orderCount`, `revenueHandled`, `avgResponseSec`. (All inputs already persisted; this is a pure aggregation — no new model.)

## 4. Tracking available now

| Metric | Source |
|---|---|
| Service timeline (per table) | `WaiterAssignment` + `OrderStatusHistory` + `WaiterTask` |
| Response times | `WaiterTask.createdAt→acknowledgedAt/resolvedAt` |
| Order count / revenue handled | `shiftService.computeShiftMetrics` (validated: `ordersHandled`, `revenueHandled`) |

## 5. UI design (next pass)

- Waiter table card → a **timeline drawer** (seated → assigned → orders → requests → bill → closed) with elapsed time per stage and live response timers.
- Coach prompts (existing `waiter/coach`) surface at the "upsell opportunities" stage.

**Step 6: the workflow's data substrate is complete (ownership/shift added, signals already present); the timeline read model + UI are specified.**
