# OWNER-DASHBOARD-UI.md — Phase 03B Step 4

**Date:** 2026-06-25. **Status: ✅ implemented + verified.** Renders the single `operationsService` snapshot; no calculations duplicated in React.

---

## Component
`client/src/components/operations/OwnerOperations.tsx`.

- **Tiles:** Active Waiters · Active Managers · Open Tables · Tables Owned · Orders Today · Revenue Today · Reservations Today · Unread Alerts.
- **Waiter Performance table:** waiter · tables · orders · revenue (sorted by revenue), straight from the snapshot.
- **On-the-floor lists:** active waiters / managers with shift-start times.
- **System health** dot + last-updated time. **Auto-refreshes every 30 s.**

All values come from **one call** to `GET /api/owner/operations`; React does no aggregation (the brief's "no duplicate calculations" rule).

## Where it's wired
Admin console → new **Operations** tab (`AdminPage.tsx`, OPERATIONS nav group). Guarded by `AppShell requireRole={['owner','manager']}` + the route's `requireRoles(['owner','manager'])`.

## Verification
- Build clean; authed probe: `owner/manager GET /owner/operations 200`, `waiter → 403`.
- Snapshot correctness proven in the Phase 03 sim (9 active waiters after 1 end, 50 open tables, 100 orders, revenue > 0, waiter performance populated).

## Boundary
Operational visibility only — `Revenue Today` is a single gross figure; no P&L/accounting (deep financials stay in the existing Reports/analytics).
