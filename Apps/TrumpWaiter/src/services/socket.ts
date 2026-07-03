// Real-time client. Connects to the Trump Socket.IO server using the Phase 04B
// BEARER handshake (no cookie on native): the access token is passed in
// `handshake.auth.token`, validated server-side by the same HMAC + active-user
// check as REST. Cookie auth (web) is unaffected.
//
// Two realtime surfaces ride this one connection:
//   1. Notifications — `notification` event; the bell reconciles against REST.
//   2. Waiter order-taking (PARITY with the web waiter) — the waiter joins a table
//      room and receives the guest's LIVE cart (`syncCart`) and sent-to-kitchen
//      history (`syncHistory`), plus floor signals (`guestEvent`, `orderPlaced`,
//      `kitchenStatusUpdate`, `incomingWaiterCall`, `managerCallWaiter`). Staff may
//      also emit `joinTable` / `fetchHistory` / `waiterResponding` for any table.
// Generic listeners are re-bound on every (re)connect and the active table is
// re-joined, so a server restart / network drop transparently resumes cart sync.
import { io, Socket } from 'socket.io-client';
import { SOCKET_ORIGIN, SOCKET_PATH, RESTAURANT_ID } from '../config';
import { getValidAccessToken } from '../auth/tokenStore';
import type { NotificationRow } from '../types/operations';

type NotificationListener = (n: NotificationRow) => void;
type StatusListener = (connected: boolean) => void;
type EventListener = (payload: any) => void;

let socket: Socket | null = null;
const notificationListeners = new Set<NotificationListener>();
const statusListeners = new Set<StatusListener>();
// Generic waiter-realtime registry: event name -> listeners. Persists across
// reconnects; every fresh socket re-binds each registered event exactly once.
const eventListeners = new Map<string, Set<EventListener>>();
let boundEvents = new Set<string>();
// The table room the waiter currently has open — re-joined automatically on connect.
let activeTableId: string | null = null;

function emitStatus(connected: boolean) {
  statusListeners.forEach((l) => l(connected));
}

// Bind `event` on the live socket once, fanning out to all registered listeners.
function ensureBound(event: string) {
  if (!socket || boundEvents.has(event)) return;
  boundEvents.add(event);
  socket.on(event, (payload: unknown) => {
    eventListeners.get(event)?.forEach((l) => l(payload));
  });
}

export async function connectSocket(): Promise<void> {
  if (socket?.connected) return;
  const token = await getValidAccessToken();
  if (!token) return; // not logged in — nothing to connect

  socket = io(SOCKET_ORIGIN, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    auth: { token }, // ← Phase 04B Bearer handshake
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 10000
  });

  // Fresh socket → nothing bound yet; re-bind every registered waiter event.
  boundEvents = new Set<string>();
  for (const event of eventListeners.keys()) ensureBound(event);

  socket.on('connect', () => {
    emitStatus(true);
    // Register presence so waiter-targeted realtime (calls, transfers, orders) reach
    // us. The server derives identity from the authenticated session, not this payload.
    socket?.emit('joinAsWaiter', { restaurantId: RESTAURANT_ID });
    // Re-join the open table so cart sync resumes after a reconnect.
    if (activeTableId) {
      socket?.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: activeTableId });
      socket?.emit('fetchHistory', { restaurantId: RESTAURANT_ID, tableId: activeTableId });
    }
  });

  socket.on('disconnect', () => emitStatus(false));

  // On reconnect the access token may have rotated — refresh the handshake auth so
  // the next attempt carries a valid token.
  socket.io.on('reconnect_attempt', async () => {
    const fresh = await getValidAccessToken();
    if (socket && fresh) {
      (socket.auth as { token?: string }).token = fresh;
    }
  });

  socket.on('notification', (payload: { notification?: NotificationRow }) => {
    if (payload?.notification) {
      notificationListeners.forEach((l) => l(payload.notification as NotificationRow));
    }
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  boundEvents = new Set<string>();
  activeTableId = null;
  emitStatus(false);
}

export function isSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

export function onNotification(listener: NotificationListener): () => void {
  notificationListeners.add(listener);
  return () => notificationListeners.delete(listener);
}

export function onSocketStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(isSocketConnected());
  return () => statusListeners.delete(listener);
}

// ─── Waiter realtime: generic event subscription + table emitters ──────────────

// Subscribe to any server-pushed waiter event (syncCart, syncHistory, guestEvent,
// orderPlaced, kitchenStatusUpdate, incomingWaiterCall, managerCallWaiter, …).
// Returns an unsubscribe. Safe to call before the socket connects — it binds on
// connect and re-binds across reconnects.
export function onSocketEvent(event: string, listener: EventListener): () => void {
  let set = eventListeners.get(event);
  if (!set) {
    set = new Set<EventListener>();
    eventListeners.set(event, set);
  }
  set.add(listener);
  ensureBound(event);
  return () => {
    set?.delete(listener);
  };
}

// Open a table room: the waiter starts receiving that table's live cart + history.
export function joinTable(tableId: string): void {
  activeTableId = tableId;
  socket?.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId });
  socket?.emit('fetchHistory', { restaurantId: RESTAURANT_ID, tableId });
}

// Stop tracking the active table (leaving the detail screen). Does not leave the
// socket room (harmless), just stops auto-rejoin.
export function clearActiveTable(tableId?: string): void {
  if (!tableId || activeTableId === tableId) activeTableId = null;
}

export function requestHistory(tableId: string): void {
  socket?.emit('fetchHistory', { restaurantId: RESTAURANT_ID, tableId });
}

// Tell the floor a waiter is responding to a table's service call.
export function waiterResponding(tableId: string): void {
  socket?.emit('waiterResponding', { restaurantId: RESTAURANT_ID, tableId });
}
