// Data Verification Tool routes — owner/manager only, mirrors the project's
// multi-alias path convention (see waiterApiRoutes.js).
const { tenantPaths } = require('../utils/helpers');

function registerDebugRoutes(app, config, controllers, auth) {
  const alias = path => tenantPaths(config, `/api/${path}`);
  const adminAuth = auth.requireRoles(['owner', 'manager']);
  const c = controllers.debug;

  app.get(alias('admin/verify/:tableId'), adminAuth, c.verifyTable);
}

module.exports = { registerDebugRoutes };
