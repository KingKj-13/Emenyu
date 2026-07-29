const { tenantPaths } = require('../utils/helpers');

function registerSettingsRoutes(app, config, controllers, adminAuth) {
  const settingsPaths = tenantPaths(config, '/api/settings');

  app.get(settingsPaths, controllers.settings.getSettings);
  app.post(settingsPaths, adminAuth, controllers.settings.saveSettings);
}

module.exports = {
  registerSettingsRoutes
};
