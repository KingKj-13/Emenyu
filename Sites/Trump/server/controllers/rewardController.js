// Staff-facing redemption for Curated Demo Mode's one-time reward QR ("your
// next drink is on us"). Issuance itself happens server-side from the Order
// Complete flow (waiterApiController.completeTable) — this controller only
// exposes redemption, which a staff member triggers by scanning/typing the
// code the guest presents.
function createRewardController({ rewardService }) {
  return {
    async redeem(req, res) {
      const code = String(req.params.code || req.body?.code || '').trim();
      if (!code) {
        return res.status(400).json({ ok: false, reason: 'invalid' });
      }
      const redeemedBy = req.user?.username || req.user?.label || 'staff';
      const result = await rewardService.redeem(code, { redeemedBy });
      const status = result.ok ? 200 : result.reason === 'already_redeemed' || result.reason === 'expired' ? 409 : 400;
      res.status(status).json(result);
    }
  };
}

module.exports = { createRewardController };
