'use strict';
// Phase 03 — table ownership. Single ACTIVE owner per table. Operations: assign,
// transfer (owner hands off), takeover (a waiter claims), reassign (manager/owner,
// reason required). Each change inserts a new WaiterAssignment row and releases the
// prior active one; the rows for a tableId ordered by assignedAt ARE the history.
// Every change is audited and (on owner change) raises a notification.
const { getPrisma } = require('./prismaClient');

function norm(value) { return String(value || '').trim(); }

class TableOwnershipService {
  constructor({ config, logger = null, auditService = null, notificationService = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.audit = auditService;
    this.notifications = notificationService;
    this.restaurantId = config?.restaurantId || 'trump';
  }

  async getOwner(tableId) {
    const t = norm(tableId);
    if (!t) return null;
    return getPrisma().waiterAssignment.findFirst({
      where: { restaurantId: this.restaurantId, tableId: t, status: 'active' },
      orderBy: { assignedAt: 'desc' }
    });
  }

  async getHistory(tableId, limit = 50) {
    return getPrisma().waiterAssignment.findMany({
      where: { restaurantId: this.restaurantId, tableId: norm(tableId) },
      orderBy: { assignedAt: 'desc' }, take: Math.min(Number(limit) || 50, 200)
    });
  }

  async listOwnership() {
    return getPrisma().waiterAssignment.findMany({
      where: { restaurantId: this.restaurantId, status: 'active' },
      orderBy: { tableId: 'asc' }
    });
  }

  // Core mutation: make `waiterName` the active owner of `tableId`.
  async assign(tableId, waiterName, { assignedBy = '', changeType = 'assign', reason = '', socketId = '' } = {}) {
    const t = norm(tableId);
    const w = norm(waiterName);
    if (!t || !w) { const e = new Error('tableId and waiterName are required'); e.statusCode = 400; throw e; }

    const current = await this.getOwner(t);
    const previousWaiter = current?.waiterName || '';
    if (current && previousWaiter.toLowerCase() === w.toLowerCase()) return current; // no-op: already owner

    await getPrisma().waiterAssignment.updateMany({
      where: { restaurantId: this.restaurantId, tableId: t, status: 'active' },
      data: { status: 'released', releasedAt: new Date() }
    });

    const row = await getPrisma().waiterAssignment.create({
      data: {
        restaurantId: this.restaurantId, tableId: t, waiterName: w, socketId: norm(socketId),
        status: 'active', changeType, assignedBy: norm(assignedBy) || w,
        previousWaiter, reason: norm(reason)
      }
    });

    await this.audit?.record({
      actor: norm(assignedBy) || w, action: `table.${changeType}`, targetType: 'table',
      targetId: t, reason,
      summary: `${t} → ${w}${previousWaiter ? ` (from ${previousWaiter})` : ''}`
    });

    if (previousWaiter && previousWaiter.toLowerCase() !== w.toLowerCase()) {
      await this.notifications?.notify({
        source: changeType === 'transfer' ? 'table_transfer' : 'reassignment',
        title: `Table ${t} ${changeType}`,
        body: `${t}: ${previousWaiter} → ${w}${reason ? ` (${reason})` : ''}`,
        priority: 2, recipientUser: previousWaiter, tableId: t
      });
    }
    return row;
  }

  async transfer(tableId, fromWaiter, toWaiter, { reason = '' } = {}) {
    const current = await this.getOwner(tableId);
    if (!current) { const e = new Error('Table has no active owner to transfer.'); e.statusCode = 409; throw e; }
    if (current.waiterName.toLowerCase() !== norm(fromWaiter).toLowerCase()) {
      const e = new Error('Only the current owner can transfer this table.'); e.statusCode = 403; throw e;
    }
    return this.assign(tableId, toWaiter, { assignedBy: fromWaiter, changeType: 'transfer', reason });
  }

  async takeOver(tableId, byWaiter, { reason = '' } = {}) {
    return this.assign(tableId, byWaiter, { assignedBy: byWaiter, changeType: 'takeover', reason });
  }

  // Manager/owner forced reassignment (reason required for accountability).
  async reassign(tableId, toWaiter, { actor = '', reason = '' } = {}) {
    if (!norm(reason)) { const e = new Error('A reason is required for manager reassignment.'); e.statusCode = 400; throw e; }
    return this.assign(tableId, toWaiter, { assignedBy: actor, changeType: 'reassign', reason });
  }

  async release(tableId, { actor = '', reason = '' } = {}) {
    const t = norm(tableId);
    const current = await this.getOwner(t);
    if (!current) return { released: false };
    await getPrisma().waiterAssignment.update({
      where: { id: current.id }, data: { status: 'released', releasedAt: new Date() }
    });
    await this.audit?.record({
      actor: norm(actor) || current.waiterName, action: 'table.release', targetType: 'table',
      targetId: t, reason, summary: `${t} released (was ${current.waiterName})`
    });
    return { released: true };
  }
}

module.exports = { TableOwnershipService };
