# TIMELINE-UI.md — Phase 03B Step 6

**Date:** 2026-06-25. **Status: ✅ implemented (assembled from existing APIs — NO new backend).**

---

## Decision: assembly, not a new endpoint
The brief: *"First attempt timeline assembly using existing APIs and data. Add backend aggregation only if impossible."* Assembly **is** possible, so **no `GET /api/waiter/table/:id/timeline` endpoint was created** — the component merges existing reads client-side.

## Component
`client/src/components/operations/TableTimeline.tsx` — a vertical, time-ordered service timeline for a table.

- **Ownership stages** from `GET /api/ownership/:tableId/history` → `Assigned` / `Reassigned` (transfer/takeover/reassign) / `Closed` (release), with owner, previous owner, and reason.
- **Request stage** from the existing `GET /api/waiter/tasks`, filtered to the table → guest requests / service-desk items.
- Events merged and sorted by time; each stage colour-coded; refreshable.

## Where it's wired
Waiter app Profile → `WaiterOpsSection` (enter a table id → ownership panel + timeline).

## Stage coverage
| Stage | Source | Status |
|---|---|---|
| Assigned / Reassigned / Closed | `ownership/:id/history` | ✅ live |
| Request | `waiter/tasks` (filtered) | ✅ live |
| Seated / Order / Bill / Upsell | order/guest/upsell endpoints | 🟦 enrichment (assemble from existing `tableIntel`/orders/`upsell-event` — still **no new backend**) |

## Verification
- Build clean; `ownershipHistory` proven in the Phase 03 sim (history ≥ 2 rows after transfers). The tasks read is defensive (optional; ignored if unavailable).

## Notes
The Seated/Order/Bill/Upsell stages can be layered in by reading the existing order/guest/upsell endpoints and mapping their timestamps — a pure client enrichment, no backend aggregation required. Deferred to keep this pass focused; the ownership+request timeline is live and useful now.
