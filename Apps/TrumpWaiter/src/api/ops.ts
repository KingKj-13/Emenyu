// Typed client for the Phase 03 staff-operations API — the SAME endpoints the web
// admin/waiter UI uses (opsApi.ts). No business logic here; the server owns it.
import { api } from './apiClient';
import { EP, qs } from './endpoints';
import type { ShiftStatus, ShiftRow, OwnershipRow, NotificationRow } from '../types/operations';

export const opsApi = {
  // ---- shifts ----
  getMyShift: () => api.get<ShiftStatus>(EP.shiftMe),
  startShift: (assignedTables: string[] = []) => api.post<ShiftRow>(EP.shiftStart, { assignedTables }),
  endShift: (reason = '') => api.post<ShiftRow>(EP.shiftEnd, { reason }),

  // ---- table ownership ----
  listOwnership: () => api.get<OwnershipRow[]>(EP.ownership),
  tableOwner: (t: string) => api.get<OwnershipRow | null>(EP.ownershipTable(t)),
  ownershipHistory: (t: string) => api.get<OwnershipRow[]>(EP.ownershipHistory(t)),
  transferTable: (t: string, toWaiter: string, reason = '') =>
    api.post<OwnershipRow>(EP.ownershipTransfer(t), { toWaiter, reason }),
  takeoverTable: (t: string, reason = '') => api.post<OwnershipRow>(EP.ownershipTakeover(t), { reason }),

  // ---- notification center ----
  listNotifications: (opts?: { unread?: boolean; limit?: number }) =>
    api.get<NotificationRow[]>(EP.notifications + qs({ unread: opts?.unread ? '1' : undefined, limit: opts?.limit })),
  unreadCount: () => api.get<{ unread: number }>(EP.notificationsUnread),
  ackNotification: (id: number) => api.post<NotificationRow>(EP.notificationAck(id)),
  ackAll: () => api.post<{ marked: number }>(EP.notificationsAckAll, {})
};
