const { tenantPaths } = require('../utils/helpers');

function registerOrderImportRoutes(app, config, orderImportController, adminAuth) {
  const importPath = tenantPaths(config, '/api/admin/orders/import');
  app.post(importPath, adminAuth, orderImportController.middleware, orderImportController.importOrders);
}

module.exports = { registerOrderImportRoutes };
