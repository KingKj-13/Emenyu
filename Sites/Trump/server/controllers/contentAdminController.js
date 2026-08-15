/**
 * Admin content management: media galleries, translations, butchery cuts.
 * Every route that reaches this controller is already behind the owner/manager
 * guard (see routes/contentAdminRoutes.js) — nothing here is guest-facing.
 */
function createContentAdminController({ contentAdminService, logger = null }) {
  // The service returns {value} | {error}; this turns that into HTTP once,
  // instead of in a dozen near-identical handlers.
  const send = (res, result, okStatus = 200) => {
    if (result && result.error) return res.status(400).json({ error: result.error });
    return res.status(okStatus).json({ ok: true, data: result ? result.value : null });
  };

  return {
    async listMedia(req, res) {
      const { entityType, entityId } = req.query;
      res.json({ media: await contentAdminService.listMedia(String(entityType || ''), entityId) });
    },

    async addMedia(req, res) {
      send(res, await contentAdminService.addMedia(req.body), 201);
    },

    async updateMedia(req, res) {
      send(res, await contentAdminService.updateMedia(req.params.id, req.body));
    },

    async reorderMedia(req, res) {
      const { entityType, entityId, ids } = req.body || {};
      send(res, await contentAdminService.reorderMedia(String(entityType || ''), entityId, ids));
    },

    async deleteMedia(req, res) {
      send(res, await contentAdminService.deleteMedia(req.params.id));
    },

    async listTranslations(req, res) {
      const { entityType, entityId } = req.query;
      res.json({ translations: await contentAdminService.listTranslations(String(entityType || ''), entityId) });
    },

    async saveTranslations(req, res) {
      send(res, await contentAdminService.saveTranslations(req.body || {}));
    },

    async translationCoverage(req, res) {
      const data = await contentAdminService.translationCoverage();
      if (!data) return res.status(503).json({ error: 'Unavailable' });
      res.json(data);
    },

    async listCuts(req, res) {
      res.json({ cuts: await contentAdminService.listCuts() });
    },

    async updateCut(req, res) {
      send(res, await contentAdminService.updateCut(req.params.id, req.body));
    },

    async linkCutItem(req, res) {
      send(res, await contentAdminService.linkCutItem(req.params.id, req.body), 201);
    },

    async unlinkCutItem(req, res) {
      send(res, await contentAdminService.unlinkCutItem(req.params.id, req.params.itemId));
    },

    async fields(_req, res) {
      // The editor renders whatever the server says is translatable, so the two
      // can never drift apart.
      const out = {};
      for (const [entity, set] of Object.entries(contentAdminService.TRANSLATABLE_FIELDS)) {
        out[entity] = [...set];
      }
      res.json({ translatable: out });
    },
  };
}

module.exports = { createContentAdminController };
