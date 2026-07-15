const { tenantPaths } = require('../utils/helpers');

function registerAnalyticsRoutes(app, config, controllers, adminAuth) {
  const eventPath = tenantPaths(config, '/api/analytics/event');
  const dashboardPath = tenantPaths(config, '/api/admin/analytics/dashboard');

  app.post(eventPath, controllers.analytics.recordEvent);
  app.get(dashboardPath, adminAuth, controllers.analytics.getDashboard);
}

module.exports = { registerAnalyticsRoutes };
