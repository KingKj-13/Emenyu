# PUSH-ARCHITECTURE.md — Phase 04 Step 5

**Date:** 2026-06-25. **Status: design only (no implementation).** Builds on the existing `Notification` model + `PushSubscription` + web-push.

---

## Channels
| Client | Transport |
|---|---|
| Android (RN) | **FCM** (Firebase Cloud Messaging) |
| iOS (future) | **APNs via FCM** |
| Desktop (Tauri) | OS notifications + in-app Socket.IO |
| Web | existing **web-push** (VAPID) + Socket.IO |

A device's push token is stored against its `Device` row (extend with `pushToken`, `pushProvider`) — reuses the registry from AUTH-ARCHITECTURE; web keeps `PushSubscription`.

## Flow
```
event (waiter-call / reassignment / reservation / AI warning / system)
  → notificationService.notify(...)  [already exists, Phase 03]
     ├─ writes Notification row (durable, read/unread)
     ├─ Socket.IO emit  → live to connected clients (foreground)
     └─ pushDispatcher  → FCM/APNs/web-push to devices NOT connected (background)
```
`notify()` is the single producer (Phase 03). Phase 04B adds the **`pushDispatcher`** side-effect: look up the recipient's active `Device`s (and `PushSubscription`s), send a **data message** with `{ notificationId, title, priority }`.

## Offline delivery
- FCM/APNs **queue** messages for offline devices and deliver on reconnect (platform-handled).
- Durability is the `Notification` table — **the push is a hint; the unread list is the truth.** On app open/reconnect the client calls `GET /api/notifications?unread=1` and reconciles (no lost notifications even if a push is dropped).

## Reconnect behaviour
- On socket reconnect or app foreground → `GET /notifications/unread-count` + `GET /notifications?unread=1` (delta) → update list + badge.
- Socket handshake carries the Bearer token (the 04B socket-token addition).

## Badge updates
- Unread count = `GET /notifications/unread-count` (authoritative) → app icon badge (FCM/`expo-notifications` `setBadgeCountAsync`) + in-app bell badge.
- Decrement on `ack` (`POST /notifications/:id/ack`) → re-fetch count.

## Delivery acknowledgement
- **Delivered:** FCM delivery receipt (best-effort).
- **Read (the meaningful ack):** `POST /api/notifications/:id/ack` sets `readAt` and writes an **audit** row (`notification.acknowledged`, already implemented). This is the durable ack.

## Fallback polling
- If push tokens are unavailable / FCM blocked: poll `notifications/unread-count` every 20–30 s (foreground) — the web bell already does this. Guarantees delivery without push.

## Priority → presentation
`Notification.priority` (1 urgent … 5 info): 1–2 → heads-up + sound; 3 → standard; 4–5 → silent/badge-only.

## Server additions for 04B (minimal)
- `Device.pushToken` / `pushProvider` columns (+ a `PATCH /api/auth/devices/:id/push-token`).
- `pushDispatcher` invoked inside `notify()` (no new public endpoints; one internal side-effect).
- Socket handshake token support (shared with API-COMPATIBILITY gap).
