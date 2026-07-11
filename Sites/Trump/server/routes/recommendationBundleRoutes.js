// Recommended-order bundle routes (Phase 5). The guest menu reads active bundles
// publicly; management is owner|manager.
const { tenantPaths } = require('../utils/helpers');

function registerRecommendationBundleRoutes(app, config, controllers, adminAuth) {
  const listPaths = tenantPaths(config, '/api/menu/bundles');
  const adminListPaths = tenantPaths(config, '/api/menu/bundles/admin');
  const itemPaths = tenantPaths(config, '/api/menu/bundles/:id');

  app.get(listPaths, controllers.recommendationBundle.getBundles);
  app.get(adminListPaths, adminAuth, controllers.recommendationBundle.getBundlesAdmin);
  app.post(listPaths, adminAuth, controllers.recommendationBundle.createBundle);
  app.patch(itemPaths, adminAuth, controllers.recommendationBundle.updateBundle);
  app.delete(itemPaths, adminAuth, controllers.recommendationBundle.deleteBundle);
}

module.exports = { registerRecommendationBundleRoutes };
