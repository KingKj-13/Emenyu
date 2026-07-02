function createAiController({ aiService, config = {}, waiterWorkflowService = null }) {
  return {
    // Public client config (Phase 3B): lets the SPA render the assistant's name
    // (Donald) from server config instead of hardcoding "Trump AI".
    getConfig(req, res) {
      res.json({
        assistantName: config.assistantName || 'Donald',
        brandName: config.brandName || 'Trump',
        waiterApkUrl: config.waiterApkUrl || '',
      });
    },

    async chat(req, res) {
      const data = await aiService.chat(req.body);
      res.json(data);
      // S11: run guest messages through the deterministic event detector so the
      // waiter gets birthday/allergy/complaint/VIP notifications automatically —
      // fire-and-forget so it never delays or breaks the guest reply.
      const tableId = req.body?.tableId;
      const message = req.body?.message;
      if (waiterWorkflowService && tableId && message) {
        waiterWorkflowService.analyzeMessage({ tableId, message, waiterName: '' }).catch(() => {});
      }
    },

    async aiPairing(req, res) {
      const data = await aiService.aiPairing(req.body);
      res.json(data);
    },

    async recommend(req, res) {
      const data = await aiService.recommend(req.body);
      res.json(data);
    },

    async cartRecommendations(req, res) {
      const data = await aiService.cartRecommendations(req.body);
      res.json(data);
    },

    // Phase 3C: waiter-only "ordered together" (counted co-occurrence). The route
    // is waiter-auth gated; this is never surfaced to customers.
    async orderedTogether(req, res) {
      const data = await aiService.orderedTogether(req.body);
      res.json(data);
    },

    async getChatHistory(req, res) {
      const history = await aiService.getChatHistory();
      res.json(history);
    }
  };
}

module.exports = {
  createAiController
};
