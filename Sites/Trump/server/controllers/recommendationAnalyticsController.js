'use strict';
// Recommendation analytics endpoints (Phase 4 Task 1/2, Phase 5 Task 3).
//   POST /api/reco/events                          public, clients fire events here
//   GET  /api/analytics/recommendations            owner|manager, dashboard data
//   GET  /api/analytics/recommendations/insights   owner|manager, optimization actions

const health = require('../services/recommendationHealth');
const insights = require('../services/recommendationInsights');

function createRecommendationAnalyticsController({ recommendationEventService, prismaMenuService = null }) {
  return {
    // Fire-and-forget ingest. Accepts a single event or { events: [...] }. Always
    // returns 200 quickly so analytics never blocks or breaks the guest UX.
    async recordEvents(req, res) {
      const body = req.body || {};
      const list = Array.isArray(body) ? body : Array.isArray(body.events) ? body.events : [body];
      // Stamp server-trusted mode hints if the caller is an authenticated staff member.
      const mode = req.user ? 'waiter' : undefined;
      const events = list.slice(0, 100).map(ev => (mode && !ev.mode ? { ...ev, mode } : ev));
      try {
        const result = await recommendationEventService.recordBatch(events);
        res.status(202).json({ ok: true, ...result });
      } catch {
        res.status(202).json({ ok: false });
      }
    },

    async getAnalytics(req, res) {
      const { from, to, category, source, rotationGroup, mode } = req.query;
      try {
        const data = await recommendationEventService.getAnalytics({ from, to, category, source, rotationGroup, mode });
        res.json(data);
      } catch {
        res.json({
          totals: { impressions: 0, clicks: 0, accepted: 0, dismissed: 0, ordered: 0, revenue: 0, clickRate: 0, acceptanceRate: 0, dismissalRate: 0, conversionRate: 0, revenuePerImpression: 0 },
          topShown: [], topClicked: [], topConverting: [], underperforming: [], topRevenue: [], bySource: [], byRotationGroup: [], byBundle: [], items: [], eventCount: 0
        });
      }
    },

    // Optimization insights — combines analytics, data-integrity health, and the
    // chef-rec/menu graph into ranked, actionable recommendations.
    async getInsights(req, res) {
      const { from, to, mode } = req.query;
      try {
        const analytics = await recommendationEventService.getAnalytics({ from, to, mode });
        let chefRecs = [];
        let items = [];
        if (prismaMenuService?.listChefRecommendationsAdmin) chefRecs = (await prismaMenuService.listChefRecommendationsAdmin()) || [];
        if (prismaMenuService?.loadAdminItems) items = (await prismaMenuService.loadAdminItems()) || [];
        const healthReport = health.analyze({
          recommendations: chefRecs,
          items: (items || []).map(i => ({ id: i.dbId, name: i.name, available: i.available, visible: i.visible }))
        });
        res.json(insights.generate({ analytics, health: healthReport, chefRecs, items }));
      } catch {
        res.json({ count: 0, counts: {}, insights: [] });
      }
    }
  };
}

module.exports = { createRecommendationAnalyticsController };
