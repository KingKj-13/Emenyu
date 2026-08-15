/**
 * The QR menu's own endpoints: the butchery chart's data, per-item media
 * galleries, anonymous engagement capture, and the admin-facing reports built
 * from it.
 *
 * Guest endpoints are unauthenticated by design — a guest scans a QR code and
 * reads a menu; there is no account to authenticate. Admin endpoints are
 * mounted behind the existing role guard in the route file, not here.
 */

function createQrMenuController({ butcheryService, viewAnalyticsService, localizationService, logger = null }) {
  return {
    /* ── guest ─────────────────────────────────────────────────────────── */

    async getCuts(req, res) {
      try {
        const locale = localizationService.normalizeLocale(req.query.locale);
        const cuts = await butcheryService.getCuts({ locale });
        res.set('Cache-Control', 'public, max-age=60');
        res.set('Vary', 'Accept-Encoding, Origin');
        return res.json({ locale, cuts });
      } catch (err) {
        logger?.error?.({ err }, 'butchery cuts failed');
        // The client has a built-in catalogue to fall back on, so an empty list
        // degrades to the static chart rather than to a broken screen.
        return res.json({ locale: 'en', cuts: [] });
      }
    },

    async getItemMedia(req, res) {
      try {
        const media = await butcheryService.getItemMedia(req.params.id);
        res.set('Cache-Control', 'public, max-age=60');
        return res.json({ media });
      } catch (err) {
        logger?.error?.({ err }, 'item media failed');
        return res.json({ media: [] });
      }
    },

    /**
     * Engagement capture.
     *
     * Always answers 202 with an empty body, even on a malformed payload:
     * analytics must never be able to break, slow or error a guest's menu, and
     * a beacon sent during page unload cannot read a response anyway.
     */
    async recordEvents(req, res) {
      res.status(202).end();
      try {
        const body = req.body || {};
        const events = Array.isArray(body.events) ? body.events : (body.event ? [body.event] : []);
        if (events.length === 0) return;
        const locale = localizationService.normalizeLocale(body.locale);
        const result = await viewAnalyticsService.record(events, { locale });
        if (result.rejected > 0) {
          logger?.debug?.({ ...result }, 'view events partially rejected');
        }
      } catch (err) {
        logger?.warn?.({ err }, 'view event capture failed');
      }
    },

    /* ── admin (guarded at the route) ──────────────────────────────────── */

    async engagementSummary(req, res) {
      const data = await viewAnalyticsService.summary(req.query);
      if (!data) return res.status(503).json({ error: 'Analytics unavailable' });
      return res.json(data);
    },

    async engagementTimeline(req, res) {
      const data = await viewAnalyticsService.timeline(req.query);
      if (!data) return res.status(503).json({ error: 'Analytics unavailable' });
      return res.json(data);
    },

    async engagementLeastViewed(req, res) {
      const data = await viewAnalyticsService.leastViewed(req.query);
      if (!data) return res.status(503).json({ error: 'Analytics unavailable' });
      return res.json({ items: data });
    },

    /** The locales this build serves — the admin UI lists them from here rather
     *  than keeping its own copy in sync by hand. */
    async getLocales(_req, res) {
      return res.json({
        locales: localizationService.SUPPORTED_LOCALES,
        default: localizationService.DEFAULT_LOCALE,
      });
    },
  };
}

module.exports = { createQrMenuController };
