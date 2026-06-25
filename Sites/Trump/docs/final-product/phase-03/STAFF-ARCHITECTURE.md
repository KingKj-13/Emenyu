# STAFF-ARCHITECTURE.md — Phase 03 Step 1

**Date:** 2026-06-24. **Scope:** audit the current staff/role/account architecture against the Phase 03 goals (multiple managers/waiters, shifts, table ownership, accountability, service monitoring, owner visibility). **Method:** read of `prisma/schema.prisma`, `accountService.js`, the route guards, and the waiter API surface. **Verdict: a strong staff substrate already exists; the true gaps are a Shift lifecycle, a general audit log, ownership transfer/takeover semantics, a unified notification center, and an owner operations view.**

---

## 1. Identity & roles (what exists)

- **Roles** are a fixed set in `accountService.js`: `VALID_ROLES = {owner, manager, waiter, kitchen}` (free-text on `User.role`, not a DB enum). Customer is unauthenticated (no account).
- **`User` model:** `id, username (unique), password, role, label, suspended, suspendedAt, sessionInvalidBefore, createdBy, createdAt, updatedAt`. No `restaurantId` (single-tenant — fine for this phase, out of scope per brief).
- **Hierarchy (`canManageRole`):** `owner` → manage manager/waiter/kitchen; `manager` → manage waiter/kitchen; **no one manages `owner`** (owners are peers and immune to the management API — see Phase 02B.1, where disabling `admin` required a low-level path).
- **Account lifecycle:** `createAccount`, `updateAccount` (label, password, status, `assignedTables`), suspend/activate (`status: active|suspended`, enforced at login), `listAccounts` (hides owners from non-owners). Backed by **PostgreSQL + JSON fallback in lockstep**.
- **`assignedTables`:** an array on the account (JSON-only; **not** a column on Prisma `User`). Currently informational; not enforced as ownership.

**Multiple managers / multiple waiters:** ✅ **already supported** — roles are not singletons; any number of `manager`/`waiter`/`kitchen` accounts can be created. No count limit. This Phase 03 goal is met by the existing model.

## 2. Staff-relevant data models (what exists)

| Model | Role in Phase 03 | Status |
|---|---|---|
| `WaiterAssignment` (`tableId, waiterName, socketId, status, assignedAt, releasedAt, metadata`) | **Table ownership** substrate (one active row per table↔waiter) | ✅ exists; needs explicit transfer/takeover/reassign ops + reason/history |
| `WaiterTask` (`type, title, message, priority, status, payload, requestedBy, approvedBy, dueAt, acknowledgedAt, resolvedAt`) | **Notifications / Service Desk** | ✅ exists; needs read/unread "center" semantics + broader sources |
| `OrderStatusHistory` (`fromStatus, toStatus, actor, reason`) | **Audit (orders only)** | ✅ exists for orders; no general audit log |
| `UpsellEvent` (`waiterName, suggestedItem, accepted, value`) | Waiter workflow / upsell tracking | ✅ exists |
| `Reservation` | Reservation events (notification source) | ✅ exists |
| `Guest` (VIP, visitCount, spend) | Seating / waiter workflow | ✅ exists |
| `PushSubscription` (per role/user) | Notification delivery (web-push) | ✅ exists |
| `Table` (`status, covers, waiterAssignments[]`) | Floor / ownership | ✅ exists |
| `Order` (`waiterName, status, covers, totals, statusHistory`) | Revenue/orders handled per waiter | ✅ exists |

## 3. Service & API surface (what exists)

- **`accountService`** — staff CRUD, roles, suspend/activate, assignedTables.
- **`floorService`** — floor/table state + waiter assignment.
- **`waiterWorkflowService`, `waiterApiController`** (Waiter V2) — a rich API: `GET floor`, `table/:id/intel`, `coach/sommelier/ask/recovery`, `upsell-event`, **`waiter/tasks` (list/create/ack/resolve)**, `chat-center`, `chat-analysis`, `birthday-request` + `birthday-approval` (manager/owner), **`waiter/me/performance`**, **`waiter/me/shift-report`**, `waiter/leaderboard`, `guests`, `seat-guest`, `table/:id/covers`.
- **`waiterAnalyticsService`** — per-waiter performance + a **computed** shift *report* (revenue/orders/response over a window).
- **`analyticsController`** — `summary, items, tables, hours, trend, day-of-week` (owner/manager).
- **`socketService`** — real-time: `incomingWaiterCall`, `waiterCallAlert`, `managerCallWaiter`, `newChatLog`, `joinAsWaiter`, `joinAdmin`, cart sync.
- **`pushService`** — web-push to role/user subscriptions.

## 4. Permission enforcement (what exists)

- `auth.requireRoles([...])` (401/403 JSON) and `auth.requirePage([...])` (redirect).
- **`adminAuth = requireRoles(['owner','manager'])`** gates menu, analytics, reservations, ratings, orders-admin, chef-recs, bundles, deals, uploads.
- Waiter API: `requireRoles(['owner','manager','waiter'])`; birthday approval: `['owner','manager']`.
- Pages: admin `['owner','manager']`, waiter `['owner','manager','waiter']`, kitchen `['owner','manager','kitchen']`, owner page `['owner']`.
- Full breakdown in **ROLE-MATRIX.md**.

## 5. Gap analysis — what Phase 03 must add

| Phase 03 goal | Current state | Gap to close |
|---|---|---|
| Multiple managers/waiters | ✅ supported | none |
| **Shift operations** (start/end/status/history) | only a *computed* shift report | **NEW `Shift` model + lifecycle service + API + UI** (Step 3) |
| **Table ownership** (single active owner, transfer/takeover/reassign + reason) | `WaiterAssignment` (assign/release) | **transfer/takeover/manager-reassign operations + reason + ownership history** (Step 4) |
| **Staff accountability / audit** | `OrderStatusHistory` (orders only) | **NEW general `AuditLog` model + write helper + viewer** (Step 8) |
| **Service monitoring / notifications** | `WaiterTask` + sockets + push | **unified read/unread Notification Center across all sources** (Step 5) |
| **Owner visibility** | analytics endpoints (historical) | **real-time Owner Operations view** (active staff/tables/orders/notifications/health) (Step 7) |
| **Waiter workflow** | rich Waiter V2 API | **explicit service timeline (seated→…→closed) with response/timeline tracking** (Step 6) |

## 6. Design principles for this phase

1. **Extend, don't duplicate.** Reuse `WaiterAssignment` (ownership), `WaiterTask` (notifications), `OrderStatusHistory`/`UpsellEvent` (workflow signals); add only `Shift` and `AuditLog` as net-new models, plus an ownership `reason`/history.
2. **Single-tenant, no AI, no mobile/desktop, no loyalty** — per the brief's exclusions.
3. **Everything mutating writes an audit row** (Step 8) — accountability is cross-cutting, implemented once as an `auditService` called by the staff/ownership/shift/notification services.
4. **Real-time via the existing `socketService`** (admin/owner rooms) — no new transport.
5. **Develop against the LOCAL dev DB** (`emenyu_local`) with a Prisma migration; never iterate on prod (per [[project_local_dev_db]] practice).

---

**Conclusion:** Phase 03 is an **extend-and-consolidate** effort on a solid base, not a greenfield build. Two net-new models (`Shift`, `AuditLog`) + ownership-transfer semantics + a notification-center surface + an owner-ops view, all bound together by a cross-cutting audit write. The role/account substrate and most workflow signals already exist.
