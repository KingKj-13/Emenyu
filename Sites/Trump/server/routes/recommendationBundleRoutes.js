// Recommended-order bundle routes (Phase 5). The guest menu reads active bundles
// publicly; management is owner|manager.
function registerRecommendationBundleRoutes(app, controllers, adminAuth) {
  const listPaths = ['/api/menu/bundles', '/Trump/api/menu/bundles', '/trump/api/menu/bundles'];
  const adminListPaths = ['/api/menu/bundles/admin', '/Trump/api/menu/bundles/admin', '/trump/api/menu/bundles/admin'];
  const itemPaths = ['/api/menu/bundles/:id', '/Trump/api/menu/bundles/:id', '/trump/api/menu/bundles/:id'];

  app.get(listPaths, controllers.recommendationBundle.getBundles);
  app.get(adminListPaths, adminAuth, controllers.recommendationBundle.getBundlesAdmin);
  app.post(listPaths, adminAuth, controllers.recommendationBundle.createBundle);
  app.patch(itemPaths, adminAuth, controllers.recommendationBundle.updateBundle);
  app.delete(itemPaths, adminAuth, controllers.recommendationBundle.deleteBundle);
}

module.exports = { registerRecommendationBundleRoutes };
