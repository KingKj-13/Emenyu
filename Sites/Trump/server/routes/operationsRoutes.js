'use strict';
// Phase 03 — staff operations routes (shifts, table ownership, notifications, owner
// ops, audit). Multi-alias path convention (/api, /Trump/api, /trump/api).
function alias(p) { return [`/api/${p}`, `/Trump/api/${p}`, `/trump/api/${p}`]; }

function registerOperationsRoutes(app, controllers, auth) {
  const staff = auth.requireRoles(['owner', 'manager', 'waiter']);
  const admin = auth.requireRoles(['owner', 'manager']);
  const c = controllers.operations;

  // Shifts — staff manage their own; admins see/force all
  app.get(alias('shift/me'), staff, c.getMyShift);
  app.post(alias('shift/start'), staff, c.startMyShift);
  app.post(alias('shift/end'), staff, c.endMyShift);
  app.get(alias('shifts'), admin, c.listActiveShifts);
  app.get(alias('shifts/history'), admin, c.shiftHistory);
  app.post(alias('shifts/:username/end'), admin, c.forceEndShift);

  // Table ownership
  app.get(alias('ownership'), staff, c.listOwnership);
  app.get(alias('ownership/:tableId'), staff, c.getTableOwner);
  app.get(alias('ownership/:tableId/history'), staff, c.getTableHistory);
  app.post(alias('ownership/:tableId/assign'), staff, c.assignTable);
  app.post(alias('ownership/:tableId/transfer'), staff, c.transferTable);
  app.post(alias('ownership/:tableId/takeover'), staff, c.takeoverTable);
  app.post(alias('ownership/:tableId/reassign'), admin, c.reassignTable);

  // Notification center
  app.get(alias('notifications'), staff, c.listNotifications);
  app.get(alias('notifications/unread-count'), staff, c.notificationUnreadCount);
  app.post(alias('notifications/:id/ack'), staff, c.ackNotification);
  app.post(alias('notifications/ack-all'), staff, c.ackAllNotifications);
  app.post(alias('notifications'), admin, c.createNotification);

  // Owner operations + audit trail (admin)
  app.get(alias('owner/operations'), admin, c.getOperations);
  app.get(alias('audit'), admin, c.getAuditTrail);
}

module.exports = { registerOperationsRoutes };
