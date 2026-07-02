# GAP-03-LIVE-CHAT.md — Live Chat Monitor (MEDIUM) — ✅ CLOSED

**Date:** 2026-06-24. **Status: implemented + verified. Frontend-only — no backend change.**

---

## Problem

Vanilla admin's "Current Chat" tab showed a **live** feed of customer chatbot Q&A and waiter-call alerts. React `/Admin` had only the **historical** Chat Logs tab.

## Socket-event audit

| Event | Publisher | Scope | Payload |
|---|---|---|---|
| `newChatLog` | `aiService.appendChatLog()` → `socketService.emitNewChatLog()` (`socketService.js:360`) on **every** customer chat | **Global** (`io.emit`) | `{ tableId, date, timestamp, message, reply, is_special }` |
| `waiterCallAlert` | `socketService` on waiter call (`:554`) and waiter responding (`:586`) | **Admin room** | `{ tableId, displayTable, message, type: 'incoming'\|'responding', timestamp }` |

Both events already exist and already reach an admin client. **No new backend events, no polling, no DB tables required** — the React admin only needed to subscribe (Rule: reuse existing Socket.IO infra).

## Does Service Desk already cover this?

- React **Service Desk** subscribes to `managerApprovalRequested`, `waiterTaskCreated`, `waiterTaskUpdated` — the **task/approval** workflow. It does **not** surface `newChatLog` (live customer chat) or `waiterCallAlert` (call/response).
- So there is **no duplication**: Service Desk = task queue; Live Chat Monitor = live customer-chat + waiter-call visibility. We added only the missing visibility.

## Implementation (frontend only)

- **`client/src/pages/AdminPage.tsx` → `LiveChatMonitor`** (new component):
  - Lazily imports `getSocket`, emits `joinAdmin { restaurantId: 'trump' }` (same pattern as Service Desk).
  - Subscribes to `newChatLog` (keeps the latest 30) and `waiterCallAlert` (latest 15); cleans up listeners on unmount.
  - Renders a "Live activity" header, a waiter-call alert strip, and a live Q/A feed (reusing the existing `chatLog*` styles). Empty state: "Waiting for live customer chat…".
  - Rendered in the existing **Chat** tab above the historical `ChatLogList` — no new tab, no redesign.

## Requirements check
- ✅ Reuses existing Socket.IO infrastructure.
- ✅ No duplicate backend events.
- ✅ No polling.
- ✅ No new database tables.
- ✅ No duplication of Service Desk (distinct concerns).

## Verification
- `tsc --noEmit` clean; `vite build` success.
- Event names/payloads matched to the live publishers (`socketService.js:360/554/586`, `aiService.js:1569`).

## Result
**New customer chat and waiter-call alerts appear live in React `/Admin` (Chat tab). Gap closed → MATCHED** (live visibility restored; superset of vanilla since waiter-call alerts are included alongside chat).
