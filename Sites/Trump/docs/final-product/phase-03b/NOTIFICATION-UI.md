# NOTIFICATION-UI.md — Phase 03B Step 3

**Date:** 2026-06-25. **Status: ✅ implemented + verified.** Consumes existing notification APIs.

---

## Component
`client/src/components/operations/NotificationBell.tsx` — header bell + drawer.

- **Unread badge** on a 🔔 button (count from `GET /notifications/unread-count`).
- **Drawer** (on open) lists notifications from `GET /notifications`: title, body, **priority** dot (urgent/high = red, else gold), **relative timestamp**, and source.
- **Mark read** (per item → `POST /notifications/:id/ack`) and **Mark all read** (`POST /notifications/ack-all`); unread items are highlighted.
- `scope="all"` prop = the **owner/manager** view (every staff notification); omitted = the staff member's own + broadcasts.

## Where it's wired
- **Admin** top chrome (`AdminPage.tsx`, `scope="all"`).
- **Waiter** app top bar (`WaiterPage.tsx` `wv-top-actions`, scoped to the waiter).

## Endpoints consumed
`GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/ack` · `POST /notifications/ack-all`.

## Verification
- Build clean; authed probe: `owner GET /notifications?scope=all 200`.
- Producers proven in the Phase 03 sim (ownership transfer/takeover/reassign raise notifications; unread/read/priority all verified).

## Notes — polling vs socket
The unread count **polls every 20 s**. The brief prefers socket push "if socket data already exists" — it does **not** yet for notifications: `notificationService` calls `socketService.emitNotification?.(...)`, which is currently a no-op (the method isn't defined on `socketService`). Wiring `emitNotification` (server) + a `socket.on('notification')` listener (client) to drop the poll is a small, **backend-touching** enhancement deliberately deferred (Phase 03B is UI-only). Polling at 20 s is correct and low-cost meanwhile.
