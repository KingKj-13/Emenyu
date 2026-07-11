// Recommendation analytics routes (Phase 4). The event ingest is PUBLIC (guests in
// customer mode have no session), so it is sanitised hard and rate-limited in
// security.js. The read endpoint is owner|manager like the rest of analytics.
const { tenantPaths } = require('../utils/helpers');

function registerRecommendationAnalyticsRoutes(app, config, controllers, adminAuth) {
  const eventPaths = tenantPaths(config, '/api/reco/events');
  const analyticsPaths = tenantPaths(config, '/api/analytics/recommendations');
  const insightPaths = tenantPaths(config, '/api/analytics/recommendations/insights');

  app.post(eventPaths, controllers.recommendationAnalytics.recordEvents);
  // Register the more specific /insights path before the base analytics path.
  app.get(insightPaths, adminAuth, controllers.recommendationAnalytics.getInsights);
  app.get(analyticsPaths, adminAuth, controllers.recommendationAnalytics.getAnalytics);
}

module.exports = { registerRecommendationAnalyticsRoutes };
