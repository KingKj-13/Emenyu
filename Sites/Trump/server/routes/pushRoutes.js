const { tenantPaths } = require('../utils/helpers');

function registerPushRoutes(app, config, controllers, staffAuth) {
  const paths = suffix => tenantPaths(config, `/api/push/${suffix}`);

  app.get(paths('vapid-key'), controllers.push.getVapidKey);
  app.post(paths('subscribe'), staffAuth, controllers.push.subscribe);
  app.delete(paths('subscribe'), staffAuth, controllers.push.unsubscribe);
}

module.exports = { registerPushRoutes };
