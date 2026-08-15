const { tenantPaths } = require('../utils/helpers');

/**
 * Routes for the QR-menu redesign.
 *
 * Guest routes carry no auth guard on purpose: the whole product is a menu you
 * reach by scanning a QR code. Every admin route below goes through the same
 * `adminAuth` guard the rest of the admin API uses — removing CUSTOMER
 * authentication changed nothing about staff authentication.
 */
function registerQrMenuRoutes(app, config, controllers, adminAuth) {
  const c = controllers.qrMenu;

  // ── guest ────────────────────────────────────────────────────────────────
  app.get(tenantPaths(config, '/api/butchery/cuts'), c.getCuts);
  app.get(tenantPaths(config, '/api/menu/items/:id/gallery'), c.getItemMedia);
  app.get(tenantPaths(config, '/api/locales'), c.getLocales);

  // Write-only, unauthenticated, rate-limited by the global limiter. It stores
  // no identifier beyond a per-sitting random session id.
  app.post(tenantPaths(config, '/api/engagement'), c.recordEvents);

  // ── admin ────────────────────────────────────────────────────────────────
  app.get(tenantPaths(config, '/api/analytics/engagement'), adminAuth, c.engagementSummary);
  app.get(tenantPaths(config, '/api/analytics/engagement/timeline'), adminAuth, c.engagementTimeline);
  app.get(tenantPaths(config, '/api/analytics/engagement/least-viewed'), adminAuth, c.engagementLeastViewed);
}

module.exports = { registerQrMenuRoutes };
