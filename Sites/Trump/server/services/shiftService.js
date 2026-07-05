'use strict';
// Phase 03 — staff shift lifecycle. OPERATIONAL tracking only (no payroll, no
// scheduling). Invariant: at most one ACTIVE shift per username (service-enforced).
// On end, ordersHandled / revenueHandled / responseMetrics are computed from the
// orders + tasks in the shift window and snapshotted onto the row.
const { getPrisma } = require('./prismaClient');

function norm(value) { return String(value || '').trim().toLowerCase(); }

class ShiftService {
  constructor({ config, logger = null, auditService = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.audit = auditService;
    this.restaurantId = config?.restaurantId || 'trump';
  }

  async getActiveShift(username) {
    const u = norm(username);
    if (!u) return null;
    return getPrisma().shift.findFirst({
      where: { restaurantId: this.restaurantId, username: u, status: 'active' },
      orderBy: { startedAt: 'desc' }
    });
  }

  async startShift(username, { role = 'waiter', startedBy = '', assignedTables = [] } = {}) {
    const u = norm(username);
    if (!u) { const e = new Error('username required'); e.statusCode = 400; throw e; }
    if (await this.getActiveShift(u)) {
      const e = new Error('A shift is already active for this user.'); e.statusCode = 409; throw e;
    }
    const shift = await getPrisma().shift.create({
      data: {
        restaurantId: this.restaurantId, username: u, role: String(role || 'waiter'),
        status: 'active', startedBy: norm(startedBy) || u,
        assignedTables: Array.isArray(assignedTables) ? assignedTables : []
      }
    });
    await this.audit?.record({
      actor: norm(startedBy) || u, actorRole: role, action: 'shift.started',
      targetType: 'shift', targetId: String(shift.id), summary: `Shift started for ${u}`
    });
    return shift;
  }

  async endShift(username, { endedBy = '', reason = '' } = {}) {
    const u = norm(username);
    const active = await this.getActiveShift(u);
    if (!active) { const e = new Error('No active shift for this user.'); e.statusCode = 404; throw e; }
    const metrics = await this.computeShiftMetrics(u, active.startedAt, new Date());
    const ended = await getPrisma().shift.update({
      where: { id: active.id },
      data: {
        status: 'ended', endedAt: new Date(), endedBy: norm(endedBy) || u,
        endReason: String(reason || ''), ordersHandled: metrics.ordersHandled,
        revenueHandled: metrics.revenueHandled, responseMetrics: metrics.responseMetrics
      }
    });
    await this.audit?.record({
      actor: norm(endedBy) || u, action: 'shift.ended', targetType: 'shift',
      targetId: String(active.id), summary: `Shift ended for ${u}`, reason
    });
    return ended;
  }

  async listActiveShifts() {
    return getPrisma().shift.findMany({
      where: { restaurantId: this.restaurantId, status: 'active' },
      orderBy: { startedAt: 'asc' }
    });
  }

  async getShiftHistory({ username = null, limit = 50 } = {}) {
    const where = { restaurantId: this.restaurantId };
    if (username) where.username = norm(username);
    return getPrisma().shift.findMany({
      where, orderBy: { startedAt: 'desc' }, take: Math.min(Number(limit) || 50, 200)
    });
  }

  // Live metrics for an active shift (without ending it) — used by /shift/me and owner ops.
  async getShiftStatus(username) {
    const active = await this.getActiveShift(username);
    if (!active) return { active: false };
    const metrics = await this.computeShiftMetrics(norm(username), active.startedAt, new Date());
    return { active: true, shift: active, ...metrics };
  }

  async computeShiftMetrics(username, from, to) {
    try {
      const orders = await getPrisma().order.findMany({
        where: {
          restaurantId: this.restaurantId,
          waiterName: { equals: username, mode: 'insensitive' },
          timestamp: { gte: from, lte: to }
        },
        select: { total: true, tip: true }
      });
      let tasksResolved = 0;
      try {
        tasksResolved = await getPrisma().waiterTask.count({
          where: {
            restaurantId: this.restaurantId,
            waiterName: { equals: username, mode: 'insensitive' },
            resolvedAt: { gte: from, lte: to }
          }
        });
      } catch { /* WaiterTask optional */ }
      // Phase 2 (Waiter Experience) — tips are already on Order.tip, just never
      // surfaced. Folded into the existing responseMetrics Json column (no schema
      // change) so it also survives onto the ended-shift summary, not just the
      // live status.
      const tipsHandled = Math.round(orders.reduce((s, o) => s + (Number(o.tip) || 0), 0) * 100) / 100;
      return {
        ordersHandled: orders.length,
        revenueHandled: Math.round(orders.reduce((s, o) => s + (Number(o.total) || 0), 0) * 100) / 100,
        tipsHandled,
        responseMetrics: { tasksResolved, tipsHandled }
      };
    } catch (error) {
      this.logger?.warn?.('shift_metrics_failed', { error: error?.message });
      return { ordersHandled: 0, revenueHandled: 0, tipsHandled: 0, responseMetrics: {} };
    }
  }
}

module.exports = { ShiftService };
