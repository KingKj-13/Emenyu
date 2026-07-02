# ROLE-MATRIX.md — Phase 03 Step 2

**Date:** 2026-06-24. Complete permission matrix for Trump's four authenticated roles, **grounded in the actual route guards** (`adminAuth = requireRoles(['owner','manager'])`, the waiter API guard `['owner','manager','waiter']`, `canManageRole`, and the page guards). Customer is shown for completeness (unauthenticated public surface).

Legend: ✅ full · 🟨 scoped (own tables/shift only) · ⛔ none.

---

## Matrix

| Feature | Owner | Manager | Waiter | Kitchen | Source of truth |
|---|:---:|:---:|:---:|:---:|---|
| **View Sales** (revenue totals) | ✅ | ✅ | ⛔ | ⛔ | `analytics/*` → `adminAuth` |
| **Manage Menu** (items, media, chef-recs, bundles, deals) | ✅ | ✅ | ⛔ | ⛔ | `menu/*`, `chef-recommendations`, `bundles`, `deals` → `adminAuth` |
| **Manage Staff** (create/edit accounts) | ✅ mgr/waiter/kitchen | 🟨 waiter/kitchen | ⛔ | ⛔ | `accountService.canManageRole` (no one manages `owner`) |
| **Manage Tables** (floor, covers, seat guest) | ✅ | ✅ | 🟨 own tables | ⛔ | `waiter/*`, `floor` → `['owner,manager,waiter]` |
| **View Analytics** (items/tables/hours/trend) | ✅ | ✅ | 🟨 own perf only | ⛔ | `analytics/*` → `adminAuth`; `waiter/me/performance` |
| **Manage Reservations** | ✅ | ✅ | 🟨 view/seat | ⛔ | `reservations` → `adminAuth` (waiter seats via floor) |
| **View Orders** | ✅ | ✅ | 🟨 own tables | 🟨 kitchen queue | `orders/history` → `adminAuth`; kitchen page `['…,kitchen]` |
| **Assign Tables** (ownership) | ✅ any | ✅ any (reassign) | 🟨 claim/transfer own | ⛔ | `WaiterAssignment` + Phase 03 ownership ops |
| **Suspend Accounts** | ✅ mgr/waiter/kitchen | 🟨 waiter/kitchen | ⛔ | ⛔ | `updateAccount` status + `canManageRole` |
| **Export Data** | ✅ | ✅ | ⛔ | ⛔ | analytics export (owner/manager) |
| **Modify AI Settings** (chef-recs, bundles, knowledge, rotation) | ✅ | ✅ | ⛔ | ⛔ | `chef-recommendations`, `bundles`, reco-analytics → `adminAuth` |

> **Note on Owner vs Manager:** the route layer treats them **identically** (`adminAuth`) for almost everything. The *only* code-enforced differences today are: (a) **account hierarchy** — a manager cannot create/suspend a `manager` or `owner` (`canManageRole`); and (b) the **owner-only page** guard (`requirePage(['owner'])`). Phase 03 preserves this; new owner-only surfaces (e.g. the Owner Operations dashboard) use `requireRoles(['owner'])` / `requirePage(['owner'])`.

## Phase 03 additions — proposed guards

| New capability | Owner | Manager | Waiter | Kitchen | Guard |
|---|:---:|:---:|:---:|:---:|---|
| **Start/End own shift** | ✅ | ✅ | ✅ | 🟨 (optional) | `requireRoles(['owner','manager','waiter'])`, self only |
| **View all active shifts** | ✅ | ✅ | ⛔ | ⛔ | `adminAuth` |
| **Force-end a shift** | ✅ | ✅ | ⛔ | ⛔ | `adminAuth` (audited) |
| **Transfer own table** | ✅ | ✅ | 🟨 own → other | ⛔ | waiter guard, ownership check |
| **Take over a table** | ✅ | ✅ | 🟨 (claims it, audited) | ⛔ | waiter guard |
| **Manager/emergency reassign** | ✅ | ✅ | ⛔ | ⛔ | `adminAuth` (audited, reason required) |
| **Notification Center (own)** | ✅ | ✅ | ✅ | 🟨 | role-scoped feed |
| **Owner Operations dashboard** | ✅ | 🟨 read | ⛔ | ⛔ | `requireRoles(['owner','manager'])`, owner-full |
| **View Audit Trail** | ✅ | 🟨 scoped | ⛔ | ⛔ | `adminAuth` (owner sees all; manager sees non-owner actions) |

---

## Enforcement model (unchanged)

- **API:** `auth.requireRoles([...])` → `403` JSON on mismatch.
- **Pages:** `auth.requirePage([...])` → redirect to `/Trump/login`.
- **Sub-role scoping** (e.g. "own tables", "self shift", "manager can't touch owner") is enforced **in the service layer** (`canManageRole`, ownership checks), not just at the route — Phase 03 keeps this pattern and adds an **audit write** on every privileged mutation (Step 8).

**This matrix is the contract** the Phase 03 services and UI implement and that the Step 9 validation verifies (permission checks for each role).
