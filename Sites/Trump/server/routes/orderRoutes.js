function registerOrderRoutes(app, controllers, auth) {
  const adminAuth = auth.requireRoles(['owner', 'manager']);
  const waiterAuth = auth.requireRoles(['owner', 'manager', 'waiter']);

  app.get(
    ['/Trump/Admin', '/Trump/admin', '/trump/Admin', '/trump/admin'],
    auth.requirePage(['owner', 'manager']),
    controllers.order.serveAdminPage
  );
  app.get(
    ['/Trump/Waiter', '/Trump/waiter', '/trump/Waiter', '/trump/waiter'],
    auth.requirePage(['owner', 'manager', 'waiter']),
    controllers.waiter.serveWaiterPage
  );
  app.get(
    ['/Trump/Kitchen', '/Trump/kitchen', '/trump/Kitchen', '/trump/kitchen'],
    auth.requirePage(['owner', 'manager', 'kitchen']),
    controllers.order.serveMenuPage
  );

  app.post(['/api/chat', '/Trump/api/chat', '/trump/api/chat'], controllers.ai.chat);
  app.post(['/api/ai-pairing', '/Trump/api/ai-pairing', '/trump/api/ai-pairing'], controllers.ai.aiPairing);
  app.post(['/api/recommend', '/Trump/api/recommend', '/trump/api/recommend'], controllers.ai.recommend);
  app.get(['/api/chat-history', '/Trump/api/chat-history', '/trump/api/chat-history'], adminAuth, controllers.ai.getChatHistory);

  app.post(['/submit_order', '/Trump/submit_order', '/trump/submit_order'], controllers.order.submitOrder);

  app.get(
    ['/api/waiter/table/:tableId/status', '/Trump/api/waiter/table/:tableId/status', '/trump/api/waiter/table/:tableId/status'],
    waiterAuth,
    controllers.waiter.getTableStatus
  );
  app.post(['/api/waiter/add-items', '/Trump/api/waiter/add-items', '/trump/api/waiter/add-items'], waiterAuth, controllers.waiter.addItems);
  app.post(
    ['/api/waiter/archive-table', '/Trump/api/waiter/archive-table', '/trump/api/waiter/archive-table'],
    waiterAuth,
    controllers.waiter.archiveTable
  );

  app.get(
    ['/api/admin/tables/carts', '/Trump/api/admin/tables/carts', '/trump/api/admin/tables/carts'],
    adminAuth,
    controllers.waiter.getTableCarts
  );

  app.get(['/orders', '/Trump/orders', '/trump/orders'], adminAuth, controllers.order.listOrders);
  app.get(['/history', '/Trump/history', '/trump/history'], adminAuth, controllers.order.listHistory);
  app.post(['/complete', '/Trump/complete', '/trump/complete'], adminAuth, controllers.order.markComplete);
  app.post(['/incomplete', '/Trump/incomplete', '/trump/incomplete'], adminAuth, controllers.order.markIncomplete);
  app.delete(['/delete/:type/:file', '/Trump/delete/:type/:file', '/trump/delete/:type/:file'], adminAuth, controllers.order.deleteOrder);

  app.get(['/', '/Trump', '/trump'], controllers.order.redirectRoot);
  app.get(['/Trump/:tableId', '/trump/:tableId', '/:tableId'], controllers.order.serveMenuPage);
}

module.exports = {
  registerOrderRoutes
};
