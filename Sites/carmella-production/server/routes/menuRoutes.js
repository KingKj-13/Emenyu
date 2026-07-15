const { tenantPaths } = require('../utils/helpers');

function registerMenuRoutes(app, config, controllers, adminAuth) {
  const menuPaths = tenantPaths(config, '/api/menu');
  const itemsPaths = tenantPaths(config, '/api/menu/items');
  const categoriesPaths = tenantPaths(config, '/api/menu/categories');
  const categoriesReorderPaths = tenantPaths(config, '/api/menu/categories/reorder');
  const itemAvailPaths = tenantPaths(config, '/api/menu/items/:id/availability');
  const itemMediaPaths = tenantPaths(config, '/api/menu/items/:id/media');
  const itemDeletePaths = tenantPaths(config, '/api/menu/items/:id');
  const itemBulkPaths = tenantPaths(config, '/api/menu/items/bulk');

  app.get(menuPaths, controllers.menu.getMenu);
  app.post(menuPaths, adminAuth, controllers.menu.saveMenu);

  app.get(itemsPaths, adminAuth, controllers.menu.getAdminItems);
  app.post(itemsPaths, adminAuth, controllers.menu.createItem);
  app.post(itemBulkPaths, adminAuth, controllers.menu.bulkItemAction);
  app.patch(itemAvailPaths, adminAuth, controllers.menu.toggleAvailability);
  app.patch(itemMediaPaths, adminAuth, controllers.menu.updateItemMedia);
  // Full per-item field edit (name/price/description/calories/allergens/spice/category).
  // Registered after the more specific :id/availability and :id/media PATCH routes.
  app.patch(itemDeletePaths, adminAuth, controllers.menu.updateItem);
  app.delete(itemDeletePaths, adminAuth, controllers.menu.deleteItem);

  app.get(categoriesPaths, adminAuth, controllers.menu.getCategories);
  app.post(categoriesPaths, adminAuth, controllers.menu.createCategory);
  app.patch(categoriesReorderPaths, adminAuth, controllers.menu.reorderCategories);
}

module.exports = {
  registerMenuRoutes
};
