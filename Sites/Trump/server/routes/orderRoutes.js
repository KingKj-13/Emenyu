const { tenantPaths } = require('../utils/helpers');

function registerOrderRoutes(app, config, controllers, auth) {
  const adminAuth = auth.requireRoles(['owner', 'manager']);
  const waiterAuth = auth.requireRoles(['owner', 'manager', 'waiter']);
  const api = p => tenantPaths(config, `/api${p}`);
  const bare = p => tenantPaths(config, p);
  // These three accept both Capitalized and lower-case suffixes regardless of
  // prefix casing (a page-name convention, distinct from the prefix aliasing
  // tenantPaths already handles) — union the two suffix variants.
  const pageAliases = suffix => [
    ...tenantPaths(config, `/${suffix}`),
    ...tenantPaths(config, `/${suffix.toLowerCase()}`)
  ];

  app.get(pageAliases('Admin'), auth.requirePage(['owner', 'manager']), controllers.order.serveAdminPage);
  app.get(pageAliases('Waiter'), auth.requirePage(['owner', 'manager', 'waiter']), controllers.waiter.serveWaiterPage);
  app.get(pageAliases('Kitchen'), auth.requirePage(['owner', 'manager', 'kitchen']), controllers.order.serveMenuPage);

  app.get(api('/config'), controllers.ai.getConfig);
  app.post(api('/chat'), controllers.ai.chat);
  app.post(api('/ai-pairing'), controllers.ai.aiPairing);
  app.post(api('/recommend'), controllers.ai.recommend);
  app.post(api('/waiter/cart-recommendations'), waiterAuth, controllers.ai.cartRecommendations);
  app.post(api('/waiter/ordered-together'), waiterAuth, controllers.ai.orderedTogether);
  app.get(api('/chat-history'), adminAuth, controllers.ai.getChatHistory);

  app.post(bare('/submit_order'), controllers.order.submitOrder);

  app.get(api('/waiter/table/:tableId/status'), waiterAuth, controllers.waiter.getTableStatus);
  app.post(api('/waiter/add-items'), waiterAuth, controllers.waiter.addItems);
  app.post(api('/waiter/archive-table'), waiterAuth, controllers.waiter.archiveTable);

  app.get(api('/admin/tables/carts'), adminAuth, controllers.waiter.getTableCarts);

  app.get(bare('/orders'), adminAuth, controllers.order.listOrders);
  app.get(bare('/history'), adminAuth, controllers.order.listHistory);
  app.post(bare('/complete'), adminAuth, controllers.order.markComplete);
  app.post(bare('/incomplete'), adminAuth, controllers.order.markIncomplete);
  app.delete(bare('/delete/:type/:file'), adminAuth, controllers.order.deleteOrder);

  app.get(tenantPaths(config, '/'), controllers.order.redirectRoot);
  app.get(bare('/:tableId'), controllers.order.serveMenuPage);
}

module.exports = {
  registerOrderRoutes
};
