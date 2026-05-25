function registerDealRoutes(app, controllers, adminAuth) {
  const dealPaths = ['/api/deals', '/Trump/api/deals', '/trump/api/deals'];

  app.get(dealPaths, controllers.deal.getDeals);
  app.post(dealPaths, adminAuth, controllers.deal.saveDeals);
}

module.exports = {
  registerDealRoutes
};
