const { tenantPaths } = require('../utils/helpers');

function registerThemeRoutes(app, config, controllers, adminAuth) {
  const publicPath = tenantPaths(config, '/api/theme');
  const adminPath = tenantPaths(config, '/api/admin/theme');

  app.get(publicPath, controllers.theme.getTheme);
  app.patch(adminPath, adminAuth, controllers.theme.updateTheme);
}

module.exports = { registerThemeRoutes };
