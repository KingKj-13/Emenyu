function registerPushRoutes(app, controllers, staffAuth) {
  const paths = suffix => [
    `/api/push/${suffix}`,
    `/Trump/api/push/${suffix}`,
    `/trump/api/push/${suffix}`
  ];

  app.get(paths('vapid-key'), controllers.push.getVapidKey);
  app.post(paths('subscribe'), staffAuth, controllers.push.subscribe);
  app.delete(paths('subscribe'), staffAuth, controllers.push.unsubscribe);
}

module.exports = { registerPushRoutes };
