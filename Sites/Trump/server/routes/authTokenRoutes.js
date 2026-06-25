'use strict';
// Phase 04 — native token auth routes. token issue/refresh/revoke are public (the
// refresh token itself is the credential); device management requires a logged-in
// staff session (cookie or Bearer).
function alias(p) { return [`/api/${p}`, `/Trump/api/${p}`, `/trump/api/${p}`]; }

function registerAuthTokenRoutes(app, controllers, auth) {
  const c = controllers.authToken;
  const staff = auth.requireRoles(['owner', 'manager', 'waiter', 'kitchen']);

  app.post(alias('auth/token'), c.issue);
  app.post(alias('auth/token/refresh'), c.refresh);
  app.post(alias('auth/token/revoke'), c.revoke);
  app.get(alias('auth/devices'), staff, c.listDevices);
  app.delete(alias('auth/devices/:deviceId'), staff, c.revokeDevice);
}

module.exports = { registerAuthTokenRoutes };
