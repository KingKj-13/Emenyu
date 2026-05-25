function createDealController({ fileService, socketService }) {
  return {
    async getDeals(req, res) {
      const deals = await fileService.loadDeals();
      res.json(deals);
    },

    async saveDeals(req, res) {
      try {
        await fileService.saveDeals(req.body);
        socketService.emitDealUpdated();
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Deal save failed' });
      }
    }
  };
}

module.exports = {
  createDealController
};
