# SHIFT-MANAGEMENT.md — Phase 03 Step 3

**Date:** 2026-06-24. **Status: ✅ backend implemented + validated on local; 🟦 UI designed (next pass).** Operational tracking only — **no payroll, no scheduling.**

---

## 1. Data model (`Shift`) — migrated to local

`prisma/schema.prisma` (migration `20260624204109_phase03_staff_ops`):

| Field | Purpose |
|---|---|
| `username, role` | who the shift belongs to |
| `status` | `active` \| `ended` |
| `startedAt, endedAt` | lifecycle timestamps |
| `startedBy, endedBy, endReason` | accountability (self vs manager force-end) |
| `assignedTables` (Json) | snapshot of owned tables during the shift |
| `ordersHandled, revenueHandled` | computed from orders in the shift window on end |
| `responseMetrics` (Json) | `{ tasksResolved, … }` |

**Invariant:** at most **one active shift per username** — enforced in `shiftService` (a 409 on double-start), not a DB unique (ended shifts share the username).

## 2. Service (`server/services/shiftService.js`)

`startShift(username,{role,startedBy,assignedTables})` · `endShift(username,{endedBy,reason})` · `getActiveShift` · `getShiftStatus` (live metrics without ending) · `listActiveShifts` · `getShiftHistory({username,limit})` · `computeShiftMetrics` (orders + tasks over the window). Every start/end writes an **audit** row.

## 3. API (`server/routes/operationsRoutes.js`)

| Method + path | Guard | Action |
|---|---|---|
| `GET /api/shift/me` | staff | my live shift status + metrics |
| `POST /api/shift/start` | staff (self) | start my shift |
| `POST /api/shift/end` | staff (self) | end my shift (snapshots metrics) |
| `GET /api/shifts` | owner/manager | all active shifts |
| `GET /api/shifts/history` | owner/manager | shift history (optional `?username=`) |
| `POST /api/shifts/:username/end` | owner/manager | **force-end** a shift (audited) |

(Each also under `/Trump/api/...` and `/trump/api/...`.)

## 4. Validation (Step 9 — evidence)

From `scripts/phase3-ops-sim.js` (40/40 PASS, local):
- `✓ 13 active shifts` (10 waiters + 3 managers)
- `✓ double shift blocked (409)`
- `✓ shift end computes ordersHandled` / `✓ ... revenueHandled` (from the 100 simulated orders)
- `✓ audit records: shift.started` / `✓ ... shift.ended`

## 5. UI design (next pass)

- **Waiter app:** a shift banner — "Start shift" / live timer + "End shift"; on end, a summary card (orders handled, revenue, tables, tasks).
- **Admin/Owner:** an "On shift now" list (who, since when, tables, live orders/revenue) with a manager **force-end** action.
- Real-time refresh via the existing socket admin room.

**Step 3 backend: COMPLETE & validated. UI: specified.**
