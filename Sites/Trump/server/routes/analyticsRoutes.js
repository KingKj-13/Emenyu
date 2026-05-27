function registerAnalyticsRoutes(app, controllers, adminAuth) {
  const paths = suffix => [
    `/api/analytics/${suffix}`,
    `/Trump/api/analytics/${suffix}`,
    `/trump/api/analytics/${suffix}`
  ];

  app.get(paths('summary'), adminAuth, controllers.analytics.getSummary);
  app.get(paths('items'), adminAuth, controllers.analytics.getItems);
  app.get(paths('tables'), adminAuth, controllers.analytics.getTables);
  app.get(paths('hours'), adminAuth, controllers.analytics.getHours);
}

module.exports = { registerAnalyticsRoutes };
