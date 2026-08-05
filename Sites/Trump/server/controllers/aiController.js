const { resolveDayPart } = require('../utils/dayPartResolver');

function createAiController({ aiService, config = {}, waiterWorkflowService = null, fileService = null, aiEventService = null }) {
  return {
    // Public client config (Phase 3B): lets the SPA render the assistant's name
    // from server config instead of hardcoding it.
    async getConfig(req, res) {
      // Day-part engine (Carmella): [] for tenants with no DayPart rows (Trump,
      // Demo), so currentDayPart is simply omitted for them — no behavior change.
      const dayParts = fileService ? await fileService.loadDayParts() : [];
      const currentDayPart = dayParts.length > 0 ? resolveDayPart(dayParts) : null;

      res.json({
        assistantName: config.assistantName || '🍷 Your Sommelier',
        assistantPersona: config.assistantPersona || 'template',
        brandName: config.brandName || 'Trump',
        waiterApkUrl: config.waiterApkUrl || '',
        waiterLatestVersion: config.waiterLatestVersion || '',
        ...(currentDayPart ? { currentDayPart } : {}),
        // Full list (not just the currently-resolved one) — the Day/Night menu
        // toggle needs every day-part's leadChapters to compute its two
        // chapter sets, not only whichever one the server clock resolves to.
        ...(dayParts.length > 0 ? { dayParts } : {})
      });
    },

    async chat(req, res) {
      const data = await aiService.chat(req.body);
      res.json(data);
      // S11: run guest messages through the deterministic event detectors so the
      // waiter gets complaint/refund tasks (waiterWorkflowService) and shared AI
      // events — birthday/allergy/VIP/etc. (aiEventService) — automatically.
      // Fire-and-forget so it never delays or breaks the guest reply.
      const tableId = req.body?.tableId;
      const message = req.body?.message;
      if (waiterWorkflowService && tableId && message) {
        waiterWorkflowService.analyzeMessage({ tableId, message, waiterName: '' }).catch(() => {});
      }
      if (aiEventService && tableId && message) {
        aiEventService.analyzeMessage({ tableId, message, waiterName: '' }).catch(() => {});
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
