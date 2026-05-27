function registerMenuRoutes(app, controllers, adminAuth) {
  const menuPaths = ['/api/menu', '/Trump/api/menu', '/trump/api/menu'];
  const recommendationPaths = ['/api/recommendations', '/Trump/api/recommendations', '/trump/api/recommendations'];
  const mediaPaths = prefix => [`/api/admin/${prefix}`, `/Trump/api/admin/${prefix}`, `/trump/api/admin/${prefix}`];
  const itemsPaths = ['/api/menu/items', '/Trump/api/menu/items', '/trump/api/menu/items'];
  const itemAvailPaths = ['/api/menu/items/:id/availability', '/Trump/api/menu/items/:id/availability', '/trump/api/menu/items/:id/availability'];
  const itemMediaPaths = ['/api/menu/items/:id/media', '/Trump/api/menu/items/:id/media', '/trump/api/menu/items/:id/media'];
  const itemDeletePaths = ['/api/menu/items/:id', '/Trump/api/menu/items/:id', '/trump/api/menu/items/:id'];
  const itemBulkPaths = ['/api/menu/items/bulk', '/Trump/api/menu/items/bulk', '/trump/api/menu/items/bulk'];

  app.get(menuPaths, controllers.menu.getMenu);
  app.post(menuPaths, adminAuth, controllers.menu.saveMenu);

  app.get(itemsPaths, adminAuth, controllers.menu.getAdminItems);
  app.post(itemBulkPaths, adminAuth, controllers.menu.bulkItemAction);
  app.patch(itemAvailPaths, adminAuth, controllers.menu.toggleAvailability);
  app.patch(itemMediaPaths, adminAuth, controllers.menu.updateItemMedia);
  app.delete(itemDeletePaths, adminAuth, controllers.menu.deleteItem);

  app.get(recommendationPaths, adminAuth, controllers.menu.getRecommendations);
  app.post(recommendationPaths, adminAuth, controllers.menu.saveRecommendations);

  app.get(mediaPaths('media-status'), adminAuth, controllers.menu.getMediaStatus);
  app.post(mediaPaths('media-enrich'), adminAuth, controllers.menu.triggerMediaEnrich);
  app.post(mediaPaths('media-retry'), adminAuth, controllers.menu.retryMediaEnrich);
}

module.exports = {
  registerMenuRoutes
};
