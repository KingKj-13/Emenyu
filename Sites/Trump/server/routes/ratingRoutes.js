const { tenantPaths } = require('../utils/helpers');

function registerRatingRoutes(app, config, controllers, adminAuth) {
  const basePaths = tenantPaths(config, '/api/ratings');

  app.post(basePaths, controllers.rating.submitRating);
  app.get(basePaths, adminAuth, controllers.rating.getRatings);
}

module.exports = { registerRatingRoutes };
