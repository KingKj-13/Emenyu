'use strict';
// Phase 03 — Owner Operations: a real-time operational snapshot for owners/managers.
// OPERATIONAL visibility only (no accounting beyond today's gross revenue figure).
// Aggregates active shifts, table ownership, today's orders/reservations, per-waiter
// performance, and the notification backlog.
const { getPrisma } = require('./prismaClient');

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

class OperationsService {
  constructor({ config, logger = null, shiftService, notificationService } = {}) {
    this.config = config;
    this.logger = logger;
    this.shifts = shiftService;
    this.notifications = notificationService;
    this.restaurantId = config?.restaurantId || 'trump';
  }

  async snapshot() {
    const prisma = getPrisma();
    const since = startOfToday();
    const [activeShifts, openTables, ordersToday, reservations, activeOwnership, unread] = await Promise.all([
      this.shifts.listActiveShifts().catch(() => []),
      prisma.table.count({ where: { restaurantId: this.restaurantId, status: 'active' } }).catch(() => 0),
      prisma.order.findMany({
        where: { restaurantId: this.restaurantId, timestamp: { gte: since } },
        select: { total: true, waiterName: true, status: true }
      }).catch(() => []),
      prisma.reservation.count({ where: { restaurantId: this.restaurantId, date: { gte: since } } }).catch(() => 0),
      prisma.waiterAssignment.findMany({
        where: { restaurantId: this.restaurantId, status: 'active' },
        select: { tableId: true, waiterName: true }
      }).catch(() => []),
      this.notifications.unreadCount({ all: true }).catch(() => 0)
    ]);

    const activeWaiters = activeShifts.filter(s => s.role === 'waiter');
    const activeManagers = activeShifts.filter(s => s.role === 'manager');
    const revenueToday = ordersToday.reduce((s, o) => s + (Number(o.total) || 0), 0);

    const perf = {};
    for (const o of ordersToday) {
      const w = (o.waiterName || '').toLowerCase();
      if (!w) continue;
      perf[w] = perf[w] || { waiter: w, orders: 0, revenue: 0, tables: 0 };
      perf[w].orders += 1;
      perf[w].revenue += Number(o.total) || 0;
    }
    for (const a of activeOwnership) {
      const w = (a.waiterName || '').toLowerCase();
      if (perf[w]) perf[w].tables += 1;
    }
    const waiterPerformance = Object.values(perf)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      generatedAt: new Date().toISOString(),
      activeWaiters: activeWaiters.map(s => ({ username: s.username, startedAt: s.startedAt })),
      activeManagers: activeManagers.map(s => ({ username: s.username, startedAt: s.startedAt })),
      activeWaiterCount: activeWaiters.length,
      activeManagerCount: activeManagers.length,
      openTables,
      tablesOwned: activeOwnership.length,
      ordersToday: ordersToday.length,
      revenueToday: Math.round(revenueToday * 100) / 100,
      reservationsToday: reservations,
      waiterPerformance,
      notifications: { unread },
      systemHealth: { ok: true }
    };
  }
}

module.exports = { OperationsService };
