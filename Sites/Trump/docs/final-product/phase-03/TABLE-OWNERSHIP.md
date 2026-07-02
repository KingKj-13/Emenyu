# TABLE-OWNERSHIP.md — Phase 03 Step 4

**Date:** 2026-06-24. **Status: ✅ backend implemented + validated on local; 🟦 UI designed (next pass).**

---

## 1. Approach — extend `WaiterAssignment`, don't replace it

The legacy `assignedTables` array on accounts was **informational only** (not enforced). Phase 03 makes **`WaiterAssignment`** the single source of truth for *who owns a table now*, and adds an explicit change trail.

**Model (migrated):** added to `WaiterAssignment` — `changeType` (`assign|transfer|takeover|reassign|release`), `assignedBy`, `previousWaiter`, `reason`, plus an index on `(restaurantId, tableId, assignedAt)`.

**Invariant:** **one ACTIVE row per table.** Every ownership change **releases** the current active row (`status='released'`, `releasedAt`) and **inserts** a new active row. The rows for a `tableId` ordered by `assignedAt` **are the ownership history** — no separate history table needed.

> **Legacy `assignedTables`:** retained on the account object (back-compat) but **superseded** for ownership by `WaiterAssignment`. Recommend retiring it from the UI in the next pass (documented, not silently removed — per the Phase 01A rule).

## 2. Service (`server/services/tableOwnershipService.js`)

| Operation | Rule |
|---|---|
| `assign(table, waiter)` | sets owner (no-op if already owner) |
| `transfer(table, fromWaiter, toWaiter, {reason})` | **only the current owner** can transfer (else 403) |
| `takeOver(table, byWaiter, {reason})` | a waiter claims a table (owner unavailable) |
| `reassign(table, toWaiter, {actor, reason})` | manager/owner; **reason required** (else 400) |
| `release(table)` | clears ownership |
| `getOwner / getHistory / listOwnership` | reads |

Every change writes an **audit** row (`table.assign|transfer|takeover|reassign|release`) and, when the owner actually changes, raises a **notification** to the previous owner.

## 3. API

| Method + path | Guard |
|---|---|
| `GET /api/ownership` | staff (all active owners) |
| `GET /api/ownership/:tableId` | staff (current owner) |
| `GET /api/ownership/:tableId/history` | staff (change trail) |
| `POST /api/ownership/:tableId/assign` | staff |
| `POST /api/ownership/:tableId/transfer` | staff (owner only, enforced in service) |
| `POST /api/ownership/:tableId/takeover` | staff |
| `POST /api/ownership/:tableId/reassign` | owner/manager (reason required) |

## 4. Validation (Step 9 — evidence)

- `✓ 50 tables owned` (assigned across 10 waiters)
- `✓ transfer changed owner -> sim_w2` · `✓ ownership history >= 2 rows`
- `✓ non-owner transfer -> 403`
- `✓ takeover changed owner -> sim_w5`
- `✓ reassign changed owner -> sim_w7` · `✓ reassign without reason -> 400`
- `✓ audit records: table.transfer / table.takeover / table.reassign`

## 5. UI design (next pass)

- **Waiter app floor view:** each table shows its owner; "Transfer" (pick a waiter) and "Take over" actions on tables.
- **Manager floor view:** "Reassign" (reason required), "Emergency reassign", and a per-table **ownership history** drawer.
- Live updates via socket; a notification toast to the previous owner on change.

**Step 4 backend: COMPLETE & validated. UI: specified.**
