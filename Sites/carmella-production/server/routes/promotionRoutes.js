const { tenantPaths } = require('../utils/helpers');

function registerPromotionRoutes(app, config, controllers, adminAuth) {
  const publicPath = tenantPaths(config, '/api/promotions');
  const adminList = tenantPaths(config, '/api/admin/promotions');
  const adminItem = tenantPaths(config, '/api/admin/promotions/:id');

  app.get(publicPath, controllers.promotion.listActive);
  app.get(adminList, adminAuth, controllers.promotion.listAll);
  app.post(adminList, adminAuth, controllers.promotion.create);
  app.patch(adminItem, adminAuth, controllers.promotion.update);
  app.delete(adminItem, adminAuth, controllers.promotion.remove);
}

module.exports = { registerPromotionRoutes };
