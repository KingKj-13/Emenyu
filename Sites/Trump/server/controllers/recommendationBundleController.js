'use strict';
// Recommended-order bundle endpoints (Phase 5, Task 1).
//   GET    /api/menu/bundles          public  — active bundles for the guest menu
//   GET    /api/menu/bundles/admin    owner|manager — all bundles for management
//   POST   /api/menu/bundles          owner|manager — create
//   PATCH  /api/menu/bundles/:id      owner|manager — update (fields and/or items)
//   DELETE /api/menu/bundles/:id      owner|manager — delete

const { sanitizeBundleInput } = require('../services/recommendationBundleService');

function createRecommendationBundleController({ recommendationBundleService, socketService }) {
  const notify = () => { try { socketService?.emitRecommendationUpdated?.(); } catch { /* ignore */ } };

  return {
    async getBundles(req, res) {
      try {
        res.json(await recommendationBundleService.listActive());
      } catch {
        res.json([]);
      }
    },

    async getBundlesAdmin(req, res) {
      try {
        res.json(await recommendationBundleService.listAdmin());
      } catch {
        res.status(503).json({ error: 'Bundles unavailable' });
      }
    },

    async createBundle(req, res) {
      const parsed = sanitizeBundleInput(req.body || {}, { partial: false });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      if (req.user?.username) parsed.value.createdBy = req.user.username;
      const created = await recommendationBundleService.create(parsed.value);
      if (!created) return res.status(503).json({ error: 'Create failed (database unavailable)' });
      notify();
      res.status(201).json({ ok: true, bundle: created });
    },

    async updateBundle(req, res) {
      const parsed = sanitizeBundleInput(req.body || {}, { partial: true });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const updated = await recommendationBundleService.update(req.params.id, parsed.value);
      if (!updated) return res.status(503).json({ error: 'Update failed (database unavailable)' });
      notify();
      res.json({ ok: true, bundle: updated });
    },

    async deleteBundle(req, res) {
      const ok = await recommendationBundleService.remove(req.params.id);
      if (!ok) return res.status(503).json({ error: 'Delete failed (database unavailable)' });
      notify();
      res.json({ ok: true });
    }
  };
}

module.exports = { createRecommendationBundleController };
