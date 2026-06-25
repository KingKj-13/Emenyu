// Phase 03 — staff operations types (shifts, ownership, notifications, owner ops, audit).

export interface ShiftRow {
  id: number;
  username: string;
  role: string;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt: string | null;
  startedBy: string;
  endedBy: string;
  endReason: string;
  assignedTables?: unknown;
  ordersHandled: number;
  revenueHandled: number;
  responseMetrics?: { tasksResolved?: number } | null;
}

export interface ShiftStatus {
  active: boolean;
  shift?: ShiftRow;
  ordersHandled?: number;
  revenueHandled?: number;
  responseMetrics?: { tasksResolved?: number };
}

export interface OwnershipRow {
  id: number;
  tableId: string;
  waiterName: string;
  status: string;
  assignedAt: string;
  releasedAt: string | null;
  changeType: string;
  assignedBy: string;
  previousWaiter: string;
  reason: string;
}

export interface NotificationRow {
  id: number;
  source: string;
  title: string;
  body: string;
  priority: number;
  recipientRole: string;
  recipientUser: string;
  tableId: string;
  readAt: string | null;
  createdAt: string;
}

export interface WaiterPerf {
  waiter: string;
  orders: number;
  revenue: number;
  tables: number;
}

export interface OpsSnapshot {
  generatedAt: string;
  activeWaiters: { username: string; startedAt: string }[];
  activeManagers: { username: string; startedAt: string }[];
  activeWaiterCount: number;
  activeManagerCount: number;
  openTables: number;
  tablesOwned: number;
  ordersToday: number;
  revenueToday: number;
  reservationsToday: number;
  waiterPerformance: WaiterPerf[];
  notifications: { unread: number };
  systemHealth: { ok: boolean };
}

export interface AuditRow {
  id: number;
  actor: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  reason: string;
  metadata?: unknown;
  createdAt: string;
}
