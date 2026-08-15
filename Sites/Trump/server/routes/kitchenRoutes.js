const { tenantPaths } = require('../utils/helpers');

function registerKitchenRoutes(app, config, controllers, kitchenAuth) {
  const p = prefix => tenantPaths(config, `/api/kitchen/${prefix}`);

  app.get(p('orders'), kitchenAuth, controllers.kitchen.getOrders);
  app.post(p('orders/:id/status'), kitchenAuth, controllers.kitchen.updateKitchenStatus);
}

module.exports = { registerKitchenRoutes };
