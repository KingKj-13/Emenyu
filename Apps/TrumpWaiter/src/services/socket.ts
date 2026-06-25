// Real-time client. Connects to the Trump Socket.IO server using the Phase 04B
// BEARER handshake (no cookie on native): the access token is passed in
// `handshake.auth.token`, validated server-side by the same HMAC + active-user
// check as REST. Cookie auth (web) is unaffected.
//
// Live notifications arrive on the `notification` event; the unread badge and lists
// reconcile against REST on reconnect/foreground (push/socket are hints, the
// Notification table is truth). A polling fallback covers socket-blocked networks.
import { io, Socket } from 'socket.io-client';
import { SOCKET_ORIGIN, SOCKET_PATH, RESTAURANT_ID } from '../config';
import { getValidAccessToken } from '../auth/tokenStore';
import type { NotificationRow } from '../types/operations';

type NotificationListener = (n: NotificationRow) => void;
type StatusListener = (connected: boolean) => void;

let socket: Socket | null = null;
const notificationListeners = new Set<NotificationListener>();
const statusListeners = new Set<StatusListener>();

function emitStatus(connected: boolean) {
  statusListeners.forEach((l) => l(connected));
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

  socket.on('connect', () => {
    emitStatus(true);
    // Register presence so waiter-targeted realtime (calls, transfers) reach us.
    socket?.emit('joinAsWaiter', { restaurantId: RESTAURANT_ID });
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
