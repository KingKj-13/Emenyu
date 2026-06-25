# OWNER-OPERATIONS.md — Phase 03 Step 7

**Date:** 2026-06-24. **Status: ✅ backend implemented + validated on local; 🟦 dashboard UI designed (next pass).** Operational visibility only — **no accounting** beyond today's gross revenue figure.

---

## 1. Service (`server/services/operationsService.js`)

`snapshot()` returns a single real-time operational view, aggregating active shifts, table ownership, today's orders/reservations, and the notification backlog:

```jsonc
{
  "generatedAt": "…",
  "activeWaiters": [{ "username", "startedAt" }],   "activeWaiterCount": 9,
  "activeManagers": [{ "username", "startedAt" }],  "activeManagerCount": 3,
  "openTables": 50,            // Table.status='active'
  "tablesOwned": 50,           // active WaiterAssignment rows
  "ordersToday": 100,
  "revenueToday": 6250.00,     // gross only
  "reservationsToday": 0,
  "waiterPerformance": [{ "waiter", "orders", "revenue", "tables" }],  // sorted by revenue
  "notifications": { "unread": 0 },
  "systemHealth": { "ok": true }
}
```

Maps directly to the brief's required tiles: **Active Waiters / Active Managers / Open Tables / Orders Today / Revenue Today / Reservations / Waiter Performance / Notification Summary / System Health.**

## 2. API

| Method + path | Guard |
|---|---|
| `GET /api/owner/operations` | owner/manager |
| `GET /api/audit` (`?action=&actor=&targetType=&limit=`) | owner/manager |

## 3. Validation (Step 9 — evidence)

- `✓ owner ops: 9 active waiters (10 started, 1 ended)`
- `✓ owner ops: >=3 active managers`
- `✓ owner ops: openTables >= 50`
- `✓ owner ops: ordersToday >= 100`
- `✓ owner ops: revenueToday > 0`
- `✓ owner ops: waiterPerformance populated`

## 4. UI design (next pass)

- A live **Owner Operations** panel in `/Trump/Admin` (owner-full, manager-read): a tile grid (the fields above) + a waiter-performance table + a notification summary + a system-health dot, refreshed on the admin socket room.
- An **Audit Trail** viewer (filter by action/actor/target) — the accountability surface.

## 5. Boundaries (per brief)

Operational visibility only. **No** P&L, payroll, tax, or accounting — `revenueToday` is a single gross figure for situational awareness; deep financials remain in the existing analytics endpoints.

**Step 7 backend: COMPLETE & validated. Dashboard UI: specified.**
