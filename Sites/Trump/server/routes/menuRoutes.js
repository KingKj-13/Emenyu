function registerMenuRoutes(app, controllers, adminAuth) {
  const menuPaths = ['/api/menu', '/Trump/api/menu', '/trump/api/menu'];
  const recommendationPaths = ['/api/recommendations', '/Trump/api/recommendations', '/trump/api/recommendations'];
  const mediaPaths = prefix => [`/api/admin/${prefix}`, `/Trump/api/admin/${prefix}`, `/trump/api/admin/${prefix}`];

  app.get(menuPaths, controllers.menu.getMenu);
  app.post(menuPaths, adminAuth, controllers.menu.saveMenu);

  app.get(recommendationPaths, adminAuth, controllers.menu.getRecommendations);
  app.post(recommendationPaths, adminAuth, controllers.menu.saveRecommendations);

  app.get(mediaPaths('media-status'), adminAuth, controllers.menu.getMediaStatus);
  app.post(mediaPaths('media-enrich'), adminAuth, controllers.menu.triggerMediaEnrich);
  app.post(mediaPaths('media-retry'), adminAuth, controllers.menu.retryMediaEnrich);
}

module.exports = {
  registerMenuRoutes
};
