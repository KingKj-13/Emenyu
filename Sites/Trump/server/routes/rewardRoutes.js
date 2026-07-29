const { tenantPaths } = require('../utils/helpers');

// Redemption only — issuance is internal (waiterApiController.completeTable
// calls rewardService.issue() directly, no public "issue" endpoint needed).
function registerRewardRoutes(app, config, controllers, staffAuth) {
  const redeemPaths = tenantPaths(config, '/api/rewards/:code/redeem');
  app.post(redeemPaths, staffAuth, controllers.reward.redeem);
}

module.exports = {
  registerRewardRoutes
};
