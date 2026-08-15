// Live-flippable restaurant settings (Curated Demo Mode and future flags),
// same shape as dealController.js's Deal-of-Day pattern: GET is public/cached
// client-side, POST is admin-gated and broadcasts the change to every
// connected client so it takes effect immediately, no server restart.
function createSettingsController({ fileService, socketService }) {
  return {
    async getSettings(req, res) {
      const settings = await fileService.loadSettings();
      res.json(settings);
    },

    async saveSettings(req, res) {
      try {
        const next = await fileService.saveSettings(req.body || {});
        socketService.emitSettingsUpdated(next);
        res.json({ ok: true, settings: next });
      } catch {
        res.status(500).json({ error: 'Settings save failed' });
      }
    }
  };
}

module.exports = { createSettingsController };
