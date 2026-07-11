const { tenantPaths } = require('../utils/helpers');

function registerAnalyticsRoutes(app, config, controllers, adminAuth) {
  const paths = suffix => tenantPaths(config, `/api/analytics/${suffix}`);

  app.get(paths('summary'), adminAuth, controllers.analytics.getSummary);
  app.get(paths('items'), adminAuth, controllers.analytics.getItems);
  app.get(paths('tables'), adminAuth, controllers.analytics.getTables);
  app.get(paths('hours'), adminAuth, controllers.analytics.getHours);
  app.get(paths('trend'), adminAuth, controllers.analytics.getTrend);
  app.get(paths('day-of-week'), adminAuth, controllers.analytics.getDayOfWeek);
  app.get(paths('pairings'), adminAuth, controllers.analytics.getPairings);
  app.get(paths('journey'), adminAuth, controllers.analytics.getJourney);
}

module.exports = { registerAnalyticsRoutes };
