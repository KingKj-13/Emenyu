// Phase 03 — typed client for the staff-operations API (consumes existing endpoints).
import { ENDPOINTS } from '../constants/api';
import type {
  ShiftStatus, ShiftRow, OwnershipRow, NotificationRow, OpsSnapshot, AuditRow
} from '../types/operations';

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const t = await res.text();
  return (t.trim() ? JSON.parse(t) : null) as T;
}

async function jpost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); if (e?.error) msg = e.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const t = await res.text();
  return (t.trim() ? JSON.parse(t) : null) as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const opsApi = {
  // ---- shifts ----
  getMyShift: () => jget<ShiftStatus>(ENDPOINTS.shiftMe),
  startShift: (assignedTables?: string[]) => jpost<ShiftRow>(ENDPOINTS.shiftStart, { assignedTables: assignedTables || [] }),
  endShift: (reason?: string) => jpost<ShiftRow>(ENDPOINTS.shiftEnd, { reason: reason || '' }),
  listShifts: () => jget<ShiftRow[]>(ENDPOINTS.shifts),
  shiftHistory: (username?: string) => jget<ShiftRow[]>(ENDPOINTS.shiftsHistory + qs({ username })),
  forceEndShift: (username: string, reason?: string) => jpost<ShiftRow>(ENDPOINTS.shiftForceEnd(username), { reason }),

  // ---- table ownership ----
  listOwnership: () => jget<OwnershipRow[]>(ENDPOINTS.ownership),
  tableOwner: (t: string) => jget<OwnershipRow | null>(ENDPOINTS.ownershipTable(t)),
  ownershipHistory: (t: string) => jget<OwnershipRow[]>(ENDPOINTS.ownershipHistory(t)),
  assignTable: (t: string, waiterName: string, reason?: string) => jpost<OwnershipRow>(ENDPOINTS.ownershipAssign(t), { waiterName, reason }),
  transferTable: (t: string, toWaiter: string, reason?: string) => jpost<OwnershipRow>(ENDPOINTS.ownershipTransfer(t), { toWaiter, reason }),
  takeoverTable: (t: string, reason?: string) => jpost<OwnershipRow>(ENDPOINTS.ownershipTakeover(t), { reason }),
  reassignTable: (t: string, toWaiter: string, reason: string) => jpost<OwnershipRow>(ENDPOINTS.ownershipReassign(t), { toWaiter, reason }),

  // ---- notification center ----
  listNotifications: (opts?: { unread?: boolean; scope?: 'all'; limit?: number }) =>
    jget<NotificationRow[]>(ENDPOINTS.notifications + qs({ unread: opts?.unread ? '1' : undefined, scope: opts?.scope, limit: opts?.limit })),
  unreadCount: (scope?: 'all') => jget<{ unread: number }>(ENDPOINTS.notificationsUnread + qs({ scope })),
  ackNotification: (id: number) => jpost<NotificationRow>(ENDPOINTS.notificationAck(id)),
  ackAllNotifications: (scope?: 'all') => jpost<{ marked: number }>(ENDPOINTS.notificationsAckAll, { scope }),

  // ---- owner operations + audit ----
  operations: () => jget<OpsSnapshot>(ENDPOINTS.ownerOperations),
  audit: (filters?: { action?: string; actor?: string; targetType?: string; targetId?: string; limit?: number }) =>
    jget<AuditRow[]>(ENDPOINTS.auditTrail + qs({ ...(filters || {}) })),
};
