const { tenantPaths } = require('../utils/helpers');

/** Content management. Every route is admin-guarded; none is guest-facing. */
function registerContentAdminRoutes(app, config, controllers, adminAuth) {
  const c = controllers.contentAdmin;
  const p = suffix => tenantPaths(config, `/api/admin/content${suffix}`);

  app.get(p('/fields'), adminAuth, c.fields);

  app.get(p('/media'), adminAuth, c.listMedia);
  app.post(p('/media'), adminAuth, c.addMedia);
  app.post(p('/media/reorder'), adminAuth, c.reorderMedia);
  app.patch(p('/media/:id'), adminAuth, c.updateMedia);
  app.delete(p('/media/:id'), adminAuth, c.deleteMedia);

  app.get(p('/translations'), adminAuth, c.listTranslations);
  app.put(p('/translations'), adminAuth, c.saveTranslations);
  app.get(p('/translations/coverage'), adminAuth, c.translationCoverage);

  app.get(p('/cuts'), adminAuth, c.listCuts);
  app.patch(p('/cuts/:id'), adminAuth, c.updateCut);
  app.post(p('/cuts/:id/items'), adminAuth, c.linkCutItem);
  app.delete(p('/cuts/:id/items/:itemId'), adminAuth, c.unlinkCutItem);
}

module.exports = { registerContentAdminRoutes };
