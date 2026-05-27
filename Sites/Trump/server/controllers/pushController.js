const pushService = require('../services/pushService');

function createPushController({ config }) {
  const restaurantId = config.restaurantId;

  return {
    getVapidKey(req, res) {
      const publicKey = pushService.getVapidPublicKey();
      if (!publicKey) return res.json({ publicKey: null });
      res.json({ publicKey });
    },

    async subscribe(req, res) {
      const { endpoint, keys } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Missing subscription fields' });
      }
      const userRole = req.user?.role || 'waiter';
      const username = req.user?.username || '';
      await pushService.saveSubscription(restaurantId, endpoint, keys.p256dh, keys.auth, userRole, username);
      res.json({ ok: true });
    },

    async unsubscribe(req, res) {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
      await pushService.deleteSubscription(endpoint);
      res.json({ ok: true });
    }
  };
}

module.exports = { createPushController };
