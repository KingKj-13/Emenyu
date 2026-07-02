# NOTIFICATION-SYSTEM.md — Phase 03 Step 5

**Date:** 2026-06-24. **Status: ✅ backend implemented + validated on local; 🟦 UI designed (next pass).**

---

## 1. Model (`Notification`) — migrated to local

A dedicated, lightweight center (distinct from `WaiterTask`, which is the actionable Service-Desk queue):

| Field | Purpose |
|---|---|
| `source` | `waiter_call \| reservation \| reassignment \| table_transfer \| ai_warning \| system` |
| `title, body` | content |
| `priority` | `1` (urgent) .. `5` (low) |
| `recipientRole` | `""` = all staff, or `owner/manager/waiter/kitchen` |
| `recipientUser` | `""` = role-wide, or a specific username |
| `tableId` | optional context |
| `readAt` | **null = unread**; set = read (acknowledged) |
| `createdAt` | timestamp |

## 2. Service (`server/services/notificationService.js`)

`notify({source,title,body,priority,recipientRole,recipientUser,tableId})` · `list({role,username,all,unreadOnly,limit})` · `unreadCount(...)` · `markRead(id,{actor})` · `markAllRead(...)`.

- **Recipient scoping:** a staff member sees **broadcasts + their role + their user**; `all:true` is the **owner/manager** view (everything).
- **Read/unread** driven by `readAt`; ordered by `priority` then recency.
- `markRead` / `markAllRead` write an **audit** row (`notification.acknowledged`).
- On create it best-effort emits a socket event (`socketService.emitNotification`) so live UIs refresh.

**Producers wired now:** table transfer/takeover/reassign (→ previous owner). **Producers to wire in the UI pass:** customer waiter-call (`socketService.waiterCallAlert`), reservation create/seat, AI service warnings, system/health alerts — each becomes a one-line `notificationService.notify(...)` at the existing event site.

## 3. API

| Method + path | Guard |
|---|---|
| `GET /api/notifications` (`?unread=1&scope=all&limit=`) | staff |
| `GET /api/notifications/unread-count` | staff |
| `POST /api/notifications/:id/ack` | staff |
| `POST /api/notifications/ack-all` | staff |
| `POST /api/notifications` | owner/manager (raise a system alert) |

## 4. Validation (Step 9 — evidence)

- `✓ notifications raised on ownership change (unread>0)`
- `✓ notification carries priority + timestamp`
- `✓ markRead reduces unread by 1`
- `✓ markAllRead -> 0 unread`
- `✓ audit records: notification.acknowledged`

## 5. UI design (next pass)

- A **bell** in the waiter/admin headers with an unread badge (`unread-count` polled or socket-pushed).
- A dropdown/center: grouped by priority, unread highlighted, per-item **acknowledge** + **mark all read**, click-through to the table/reservation.
- Owner/admin uses `scope=all` to see the whole floor's notifications.

**Step 5 backend: COMPLETE & validated. UI + remaining producers: specified.**
