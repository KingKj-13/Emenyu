const { tenantPaths } = require('../utils/helpers');

function registerComboRoutes(app, config, controllers, adminAuth) {
  const publicPath = tenantPaths(config, '/api/combos');
  const adminList = tenantPaths(config, '/api/admin/combos');
  const adminItem = tenantPaths(config, '/api/admin/combos/:id');

  app.get(publicPath, controllers.combo.listActive);
  app.get(adminList, adminAuth, controllers.combo.listAll);
  app.post(adminList, adminAuth, controllers.combo.create);
  app.patch(adminItem, adminAuth, controllers.combo.update);
  app.delete(adminItem, adminAuth, controllers.combo.remove);
}

module.exports = { registerComboRoutes };
