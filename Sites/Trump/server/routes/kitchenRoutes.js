function registerKitchenRoutes(app, controllers, kitchenAuth) {
  const p = prefix => [
    `/api/kitchen/${prefix}`,
    `/Trump/api/kitchen/${prefix}`,
    `/trump/api/kitchen/${prefix}`
  ];

  app.get(p('orders'), kitchenAuth, controllers.kitchen.getOrders);
  app.post(p('orders/:id/status'), kitchenAuth, controllers.kitchen.updateKitchenStatus);
}

module.exports = { registerKitchenRoutes };
