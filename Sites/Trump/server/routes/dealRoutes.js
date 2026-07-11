const { tenantPaths } = require('../utils/helpers');

function registerDealRoutes(app, config, controllers, adminAuth) {
  const dealPaths = tenantPaths(config, '/api/deals');

  app.get(dealPaths, controllers.deal.getDeals);
  app.post(dealPaths, adminAuth, controllers.deal.saveDeals);
}

module.exports = {
  registerDealRoutes
};
