function registerMenuRoutes(app, controllers, adminAuth) {
  const menuPaths = ['/api/menu', '/Trump/api/menu', '/trump/api/menu'];
  const recommendationPaths = ['/api/recommendations', '/Trump/api/recommendations', '/trump/api/recommendations'];
  const mediaPaths = prefix => [`/api/admin/${prefix}`, `/Trump/api/admin/${prefix}`, `/trump/api/admin/${prefix}`];
  const itemsPaths = ['/api/menu/items', '/Trump/api/menu/items', '/trump/api/menu/items'];
  const categoriesPaths = ['/api/menu/categories', '/Trump/api/menu/categories', '/trump/api/menu/categories'];
  const itemAvailPaths = ['/api/menu/items/:id/availability', '/Trump/api/menu/items/:id/availability', '/trump/api/menu/items/:id/availability'];
  const itemMediaPaths = ['/api/menu/items/:id/media', '/Trump/api/menu/items/:id/media', '/trump/api/menu/items/:id/media'];
  const itemDeletePaths = ['/api/menu/items/:id', '/Trump/api/menu/items/:id', '/trump/api/menu/items/:id'];
  const itemBulkPaths = ['/api/menu/items/bulk', '/Trump/api/menu/items/bulk', '/trump/api/menu/items/bulk'];

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
  const chefRecPaths = ['/api/menu/chef-recs', '/Trump/api/menu/chef-recs', '/trump/api/menu/chef-recs'];
  const chefRecItemPaths = ['/api/menu/chef-recs/:id', '/Trump/api/menu/chef-recs/:id', '/trump/api/menu/chef-recs/:id'];
  app.get(chefRecPaths, adminAuth, controllers.menu.getChefRecommendations);
  app.post(chefRecPaths, adminAuth, controllers.menu.createChefRecommendation);
  app.patch(chefRecItemPaths, adminAuth, controllers.menu.updateChefRecommendation);
  app.delete(chefRecItemPaths, adminAuth, controllers.menu.deleteChefRecommendation);
}

module.exports = {
  registerMenuRoutes
};
