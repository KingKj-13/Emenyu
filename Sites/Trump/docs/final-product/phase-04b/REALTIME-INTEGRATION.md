# REALTIME-INTEGRATION.md — Phase 04B Step 6

**Date:** 2026-06-25. **Status: ✅ implemented + validated (5/5 socket live, incl. live notification delivery).**

The **two approved backend additions** (Rule 2) — and nothing else. Cookie auth keeps working; native authenticates with tokens; polling remains a fallback.

---

## Addition 1 — Socket.IO Bearer handshake
**File:** `server/services/socketService.js` (handshake middleware).
The handshake now resolves identity from **two** sources, in order:
1. **Web cookie** (unchanged) — rides the same-origin handshake automatically.
2. **Bearer access token** — `socket.handshake.auth.token` (or `?token=`), validated by `auth.getUserFromToken` (same HMAC + active-user check as REST).

Additive: a guest still connects without auth; per-event handlers still enforce role/table authorization. Browsers are completely unaffected.

```js
if (!user && this.auth?.getUserFromToken) {
  const token = socket.handshake?.auth?.token || socket.handshake?.query?.token || '';
  if (token) user = await this.auth.getUserFromToken(String(token));
}
```

### Targeted delivery (the socket-push gap, now closed)
Previously `notificationService.notify()` called `socket.emitNotification()` which **did not exist** — notifications never reached clients live. 04B adds it:
- Authenticated staff auto-join a per-user room `trump:user:<username>` on connect.
- `emitNotification(row)` routes by recipient: **user** → user room; **role** → role room; **broadcast** → all staff rooms.
- Clients receive a `notification` event and **reconcile against REST** (the table is truth).

## Addition 2 — `Device.pushToken` registration
- Schema: `Device.pushToken` + `Device.pushProvider` (migration `20260625120000_phase04b_push_token`, applied local).
- Endpoint: **`PATCH /api/auth/devices/:deviceId/push-token`** (`authTokenController.setPushToken` → `tokenService.setPushToken`, scoped to the caller's own device).
- `tokenService.pushTargetsForUsernames()` returns active devices with a token, for the dispatcher.

## Push fan-out (`server/services/pushDispatcher.js`)
A **side-effect** of `notify()` (fire-and-forget, non-fatal): resolve recipients → their devices → send an Expo push (Expo routes Android via FCM, iOS via APNs). The Notification row stays the source of truth; a dropped push is reconciled on next foreground. See PUSH-IMPLEMENTATION in OFFLINE/PUSH design.

## Client (`src/services/socket.ts`)
- Connects with `auth: { token }` (Bearer handshake); on reconnect, refreshes the token in the handshake auth.
- Emits `joinAsWaiter` on connect (presence); subscribes to `notification`.
- `useNotifications` bumps + reconciles on each event; **polling fallback** every 25 s when the socket is blocked.

## "Cookie auth continues working"
Re-verified: web cookie login returns 200 + `trump_session` cookie unchanged (REST probe #18). The handshake cookie branch is untouched; the Bearer branch only runs when there is **no** cookie user.

## Live validation (socket probe, 5/5)
| # | Check | Result |
|---|---|---|
| A1 | Socket connects with Bearer token | ✅ |
| A2 | `joinAsWaiter` accepted (Bearer identity recognised) → `waiterRegistered` | ✅ |
| B1 | Manager `POST /notifications` (Bearer) → 200 | ✅ |
| B2 | **Waiter's Bearer-authed socket receives the live `notification`** | ✅ |
| C1 | Bad-token socket **denied** staff action (`authError`, no registration) | ✅ |

See `scratchpad/probe-04b-socket.js`.
