'use strict';
// Phase 03 — staff operations API: shifts, table ownership, notification center,
// owner operations snapshot, and the audit trail. Thin controller; all logic lives
// in the services. The authenticated actor is req.user ({ username, role }).

function isAdmin(user) { return user && (user.role === 'owner' || user.role === 'manager'); }

function createOperationsController({
  shiftService, tableOwnershipService, notificationService, operationsService, auditService
}) {
  const handle = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out);
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error?.message || 'Operation failed.' });
    }
  };

  return {
    // ---- shifts ----
    getMyShift: handle((req) => shiftService.getShiftStatus(req.user.username)),
    startMyShift: handle((req) => shiftService.startShift(req.user.username, {
      role: req.user.role, startedBy: req.user.username, assignedTables: req.body?.assignedTables || []
    })),
    endMyShift: handle((req) => shiftService.endShift(req.user.username, {
      endedBy: req.user.username, reason: req.body?.reason || ''
    })),
    listActiveShifts: handle(() => shiftService.listActiveShifts()),
    shiftHistory: handle((req) => shiftService.getShiftHistory({
      username: req.query.username || null, limit: Number(req.query.limit) || 50
    })),
    forceEndShift: handle((req) => shiftService.endShift(req.params.username, {
      endedBy: req.user.username, reason: req.body?.reason || 'force-ended by ' + req.user.username
    })),

    // ---- table ownership ----
    listOwnership: handle(() => tableOwnershipService.listOwnership()),
    getTableOwner: handle((req) => tableOwnershipService.getOwner(req.params.tableId)),
    getTableHistory: handle((req) => tableOwnershipService.getHistory(req.params.tableId, Number(req.query.limit) || 50)),
    assignTable: handle((req) => tableOwnershipService.assign(req.params.tableId, req.body?.waiterName, {
      assignedBy: req.user.username, reason: req.body?.reason || ''
    })),
    transferTable: handle((req) => tableOwnershipService.transfer(req.params.tableId, req.user.username, req.body?.toWaiter, {
      reason: req.body?.reason || ''
    })),
    takeoverTable: handle((req) => tableOwnershipService.takeOver(req.params.tableId, req.user.username, {
      reason: req.body?.reason || ''
    })),
    reassignTable: handle((req) => tableOwnershipService.reassign(req.params.tableId, req.body?.toWaiter, {
      actor: req.user.username, reason: req.body?.reason || ''
    })),

    // ---- notification center ----
    listNotifications: handle((req) => notificationService.list({
      role: req.user.role, username: req.user.username, all: isAdmin(req.user) && req.query.scope === 'all',
      unreadOnly: req.query.unread === '1', limit: Number(req.query.limit) || 50
    })),
    notificationUnreadCount: handle(async (req) => ({
      unread: await notificationService.unreadCount({
        role: req.user.role, username: req.user.username, all: isAdmin(req.user) && req.query.scope === 'all'
      })
    })),
    ackNotification: handle((req) => notificationService.markRead(req.params.id, { actor: req.user.username })),
    ackAllNotifications: handle((req) => notificationService.markAllRead({
      role: req.user.role, username: req.user.username, all: isAdmin(req.user) && req.body?.scope === 'all', actor: req.user.username
    })),
    createNotification: handle((req) => notificationService.notify({
      source: req.body?.source || 'system', title: req.body?.title, body: req.body?.body || '',
      priority: req.body?.priority || 3, recipientRole: req.body?.recipientRole || '',
      recipientUser: req.body?.recipientUser || '', tableId: req.body?.tableId || ''
    })),

    // ---- owner operations + audit ----
    getOperations: handle(() => operationsService.snapshot()),
    getAuditTrail: handle((req) => auditService.list({
      limit: Number(req.query.limit) || 100, action: req.query.action || null,
      actor: req.query.actor || null, targetType: req.query.targetType || null, targetId: req.query.targetId || null
    }))
  };
}

module.exports = { createOperationsController };
