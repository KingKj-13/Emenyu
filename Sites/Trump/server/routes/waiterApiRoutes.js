// Waiter-AI API routes. All require a floor role. Follows the project's
// multi-alias path convention (/api/..., /Trump/api/..., /trump/api/...).
function alias(path) {
  return [`/api/${path}`, `/Trump/api/${path}`, `/trump/api/${path}`];
}

function registerWaiterApiRoutes(app, controllers, auth) {
  const waiterAuth = auth.requireRoles(['owner', 'manager', 'waiter']);
  const c = controllers.waiterApi;

  // Floor + table intelligence
  app.get(alias('floor'), waiterAuth, c.getFloor);
  app.get(alias('waiter/table/:tableId/intel'), waiterAuth, c.getTableIntel);

  // AI coach / sommelier / voice / recovery
  app.post(alias('waiter/coach'), waiterAuth, c.postCoach);
  app.post(alias('sommelier'), waiterAuth, c.postSommelier);
  app.post(alias('ask'), waiterAuth, c.postAsk);
  app.post(alias('waiter/recovery'), waiterAuth, c.postRecovery);
  app.post(alias('upsell-event'), waiterAuth, c.postUpsellEvent);

  // Performance / leaderboard / shift report
  app.get(alias('waiter/me/performance'), waiterAuth, c.getMyPerformance);
  app.get(alias('waiter/me/shift-report'), waiterAuth, c.getMyShiftReport);
  app.get(alias('waiter/leaderboard'), waiterAuth, c.getLeaderboard);

  // Guests
  app.get(alias('guests'), waiterAuth, c.listGuests);
  app.post(alias('guests'), waiterAuth, c.createGuest);
  app.get(alias('guests/:id'), waiterAuth, c.getGuest);
  app.post(alias('waiter/table/:tableId/seat-guest'), waiterAuth, c.seatGuest);

  // NLG status (handy for verifying template vs LLM mode)
  app.get(alias('waiter/nlg-status'), waiterAuth, c.nlgStatus);
}

module.exports = { registerWaiterApiRoutes };
