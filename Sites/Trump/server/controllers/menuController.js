function createMenuController({ fileService, socketService, mediaEnrichmentService }) {
  return {
    async getMenu(req, res) {
      const menu = await fileService.loadMenu();
      res.json(menu);
    },

    async saveMenu(req, res) {
      try {
        await fileService.saveMenu(req.body);
        socketService.emitMenuUpdated();
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Menu save failed' });
      }
    },

    async getRecommendations(req, res) {
      const recommendations = await fileService.loadRecommendations();
      res.json(recommendations);
    },

    async saveRecommendations(req, res) {
      try {
        await fileService.saveRecommendations(req.body);
        socketService.emitRecommendationUpdated();
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Recommendation save failed' });
      }
    },

    async getMediaStatus(req, res) {
      try {
        const status = await mediaEnrichmentService.getStatus('trump');
        res.json(status);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },

    async triggerMediaEnrich(req, res) {
      try {
        const { limit = 20 } = req.body || {};
        const result = await mediaEnrichmentService.enrichBatch({ limit, restaurantId: 'trump', retry: false });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },

    async retryMediaEnrich(req, res) {
      try {
        const { limit = 20 } = req.body || {};
        const result = await mediaEnrichmentService.enrichBatch({ limit, restaurantId: 'trump', retry: true });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },
  };
}

module.exports = {
  createMenuController
};
