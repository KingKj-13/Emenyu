// Endpoint paths, RELATIVE to API_BASE_URL (which already includes `/Trump`). The
// server also accepts the bare `/api/...` alias, so `/Trump` + `/api/...` resolves
// to the registered `/Trump/api/...` route. Single source so paths don't drift.

export const EP = {
  // --- token auth (Phase 04) ---
  tokenIssue: '/api/auth/token',
  tokenRefresh: '/api/auth/token/refresh',
  tokenRevoke: '/api/auth/token/revoke',
  devices: '/api/auth/devices',
  device: (id: string) => `/api/auth/devices/${encodeURIComponent(id)}`,
  devicePushToken: (id: string) => `/api/auth/devices/${encodeURIComponent(id)}/push-token`,

  // --- shifts ---
  shiftMe: '/api/shift/me',
  shiftStart: '/api/shift/start',
  shiftEnd: '/api/shift/end',

  // --- table ownership ---
  ownership: '/api/ownership',
  ownershipTable: (t: string) => `/api/ownership/${encodeURIComponent(t)}`,
  ownershipHistory: (t: string) => `/api/ownership/${encodeURIComponent(t)}/history`,
  ownershipTransfer: (t: string) => `/api/ownership/${encodeURIComponent(t)}/transfer`,
  ownershipTakeover: (t: string) => `/api/ownership/${encodeURIComponent(t)}/takeover`,

  // --- notification center ---
  notifications: '/api/notifications',
  notificationsUnread: '/api/notifications/unread-count',
  notificationAck: (id: number) => `/api/notifications/${id}/ack`,
  notificationsAckAll: '/api/notifications/ack-all',

  // --- menu (read) ---
  menu: '/api/menu',

  // --- waiter floor + order taking (Bearer-accepted `waiterAuth` on the server) ---
  floor: '/api/floor',
  tableStatus: (t: string) => `/api/waiter/table/${encodeURIComponent(t)}/status`,
  tableIntel: (t: string) => `/api/waiter/table/${encodeURIComponent(t)}/intel`,
  addItems: '/api/waiter/add-items',
  archiveTable: '/api/waiter/archive-table',
  cartRecommendations: '/api/waiter/cart-recommendations',
  upsellEvent: '/api/upsell-event',
  myPerformance: '/api/waiter/me/performance',

  // --- workflow tasks / alerts / chat / birthday approval ---
  tasks: '/api/waiter/tasks',
  taskAck: (id: number | string) => `/api/waiter/tasks/${id}/ack`,
  taskResolve: (id: number | string) => `/api/waiter/tasks/${id}/resolve`,
  chatCenter: '/api/waiter/chat-center',
  chatAnalysis: '/api/waiter/chat-analysis',
  birthdayRequest: '/api/waiter/birthday-request'
} as const;

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
