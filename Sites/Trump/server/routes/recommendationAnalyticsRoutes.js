// Recommendation analytics routes (Phase 4). The event ingest is PUBLIC (guests in
// customer mode have no session), so it is sanitised hard and rate-limited in
// security.js. The read endpoint is owner|manager like the rest of analytics.
function registerRecommendationAnalyticsRoutes(app, controllers, adminAuth) {
  const eventPaths = ['/api/reco/events', '/Trump/api/reco/events', '/trump/api/reco/events'];
  const analyticsPaths = ['/api/analytics/recommendations', '/Trump/api/analytics/recommendations', '/trump/api/analytics/recommendations'];

  app.post(eventPaths, controllers.recommendationAnalytics.recordEvents);
  app.get(analyticsPaths, adminAuth, controllers.recommendationAnalytics.getAnalytics);
}

module.exports = { registerRecommendationAnalyticsRoutes };
