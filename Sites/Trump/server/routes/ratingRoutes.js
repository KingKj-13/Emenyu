function registerRatingRoutes(app, controllers, adminAuth) {
  const basePaths = ['/api/ratings', '/Trump/api/ratings', '/trump/api/ratings'];

  app.post(basePaths, controllers.rating.submitRating);
  app.get(basePaths, adminAuth, controllers.rating.getRatings);
}

module.exports = { registerRatingRoutes };
