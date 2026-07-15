const { tenantPaths } = require('../utils/helpers');

function registerSpecialRoutes(app, config, controllers, adminAuth) {
  const publicPath = tenantPaths(config, '/api/specials');
  const adminList = tenantPaths(config, '/api/admin/specials');
  const adminItem = tenantPaths(config, '/api/admin/specials/:id');

  app.get(publicPath, controllers.special.listActive);
  app.get(adminList, adminAuth, controllers.special.listAll);
  app.post(adminList, adminAuth, controllers.special.create);
  app.patch(adminItem, adminAuth, controllers.special.update);
  app.delete(adminItem, adminAuth, controllers.special.remove);
}

module.exports = { registerSpecialRoutes };
