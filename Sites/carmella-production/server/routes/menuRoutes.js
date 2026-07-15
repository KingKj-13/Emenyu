const { tenantPaths } = require('../utils/helpers');

function registerMenuRoutes(app, config, controllers, adminAuth) {
  const menuPaths = tenantPaths(config, '/api/menu');
  const recommendationPaths = tenantPaths(config, '/api/recommendations');
  const mediaPaths = prefix => tenantPaths(config, `/api/admin/${prefix}`);
  const itemsPaths = tenantPaths(config, '/api/menu/items');
  const categoriesPaths = tenantPaths(config, '/api/menu/categories');
  const itemAvailPaths = tenantPaths(config, '/api/menu/items/:id/availability');
  const itemMediaPaths = tenantPaths(config, '/api/menu/items/:id/media');
  const itemDeletePaths = tenantPaths(config, '/api/menu/items/:id');
  const itemBulkPaths = tenantPaths(config, '/api/menu/items/bulk');

  app.get(menuPaths, controllers.menu.getMenu);
  app.post(menuPaths, adminAuth, controllers.menu.saveMenu);

  app.get(itemsPaths, adminAuth, controllers.menu.getAdminItems);
  app.post(itemsPaths, adminAuth, controllers.menu.createItem);
  app.get(categoriesPaths, adminAuth, controllers.menu.getCategories);
  app.post(itemBulkPaths, adminAuth, controllers.menu.bulkItemAction);
  app.patch(itemAvailPaths, adminAuth, controllers.menu.toggleAvailability);
  app.patch(itemMediaPaths, adminAuth, controllers.menu.updateItemMedia);
  // Full per-item field edit (name/price/description/calories/allergens/spice/category).
  // Registered after the more specific :id/availability and :id/media PATCH routes.
  app.patch(itemDeletePaths, adminAuth, controllers.menu.updateItem);
  app.delete(itemDeletePaths, adminAuth, controllers.menu.deleteItem);

  app.get(recommendationPaths, adminAuth, controllers.menu.getRecommendations);
  app.post(recommendationPaths, adminAuth, controllers.menu.saveRecommendations);

  app.get(mediaPaths('media-status'), adminAuth, controllers.menu.getMediaStatus);
  app.post(mediaPaths('media-enrich'), adminAuth, controllers.menu.triggerMediaEnrich);
  app.post(mediaPaths('media-retry'), adminAuth, controllers.menu.retryMediaEnrich);

  // Chef recommendation management (owner controls — Phase 3, Task 8)
  const chefRecPaths = tenantPaths(config, '/api/menu/chef-recs');
  const chefRecItemPaths = tenantPaths(config, '/api/menu/chef-recs/:id');
  app.get(chefRecPaths, adminAuth, controllers.menu.getChefRecommendations);
  app.post(chefRecPaths, adminAuth, controllers.menu.createChefRecommendation);
  app.patch(chefRecItemPaths, adminAuth, controllers.menu.updateChefRecommendation);
  app.delete(chefRecItemPaths, adminAuth, controllers.menu.deleteChefRecommendation);
}

module.exports = {
  registerMenuRoutes
};
