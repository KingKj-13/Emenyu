const { tenantPaths } = require('../utils/helpers');

function registerHappyHourRoutes(app, config, controllers, adminAuth) {
  const publicPath = tenantPaths(config, '/api/happy-hour');
  const adminList = tenantPaths(config, '/api/admin/happy-hour');
  const adminItem = tenantPaths(config, '/api/admin/happy-hour/:id');

  app.get(publicPath, controllers.happyHour.listActive);
  app.get(adminList, adminAuth, controllers.happyHour.listAll);
  app.post(adminList, adminAuth, controllers.happyHour.create);
  app.patch(adminItem, adminAuth, controllers.happyHour.update);
  app.delete(adminItem, adminAuth, controllers.happyHour.remove);
}

module.exports = { registerHappyHourRoutes };
