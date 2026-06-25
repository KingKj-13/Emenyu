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
  menu: '/api/menu'
} as const;

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
