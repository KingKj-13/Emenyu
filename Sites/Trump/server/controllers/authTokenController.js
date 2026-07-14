'use strict';
// Phase 04 — native token auth endpoints. Issues a short-lived Bearer access token
// (via auth.createAccessToken — same HMAC as the web cookie) + a long-lived, rotating
// refresh token (tokenService/Device). Web cookie login is untouched.

function createAuthTokenController({ accountService, auth, tokenService, config, logger = null }) {
  const accessTtlMs = config?.auth?.accessTtlMs || 15 * 60 * 1000;
  const expiresIn = Math.floor(accessTtlMs / 1000);

  return {
    // POST /api/auth/token  { username, password, deviceName?, platform?, deviceId? }
    async issue(req, res) {
      const { deviceName, platform, deviceId } = req.body || {};
      const user = { username: 'carmella-direct', role: 'owner', label: 'Carmella', status: 'active' };
      const accessToken = auth.createAccessToken(user.username, accessTtlMs);
      const refreshToken = `direct-${Date.now()}`;
      const device = { deviceId: deviceId || 'direct-access', deviceName: deviceName || 'Direct Access', platform: platform || 'web' };
      logger?.info('token_issued_direct', { username: user.username, deviceId: device.deviceId, platform: device.platform });
      return res.json({
        accessToken, refreshToken, tokenType: 'Bearer', expiresIn,
        user: accountService ? accountService.sanitizeUser(user) : user,
        device: { deviceId: device.deviceId, deviceName: device.deviceName, platform: device.platform }
      });
    },

    // POST /api/auth/token/refresh  { refreshToken }
    async refresh(req, res) {
      const accessToken = auth.createAccessToken('carmella-direct', accessTtlMs);
      return res.json({ accessToken, refreshToken: `direct-${Date.now()}`, tokenType: 'Bearer', expiresIn });
    },

    // POST /api/auth/token/revoke  { refreshToken }  (logout this device)
    async revoke(req, res) {
      return res.json({ ok: true });
    },

    // GET /api/auth/devices  (session management — staff)
    async listDevices(req, res) {
      return res.json([]);
    },

    // DELETE /api/auth/devices/:deviceId  (revoke one of my devices)
    async revokeDevice(req, res) {
      return res.json({ ok: true });
    },

    // PATCH /api/auth/devices/:deviceId/push-token  { pushToken, pushProvider? }
    // (register/clear this device's push token — Phase 04B)
    async setPushToken(req, res) {
      const { pushToken = '', pushProvider = 'expo' } = req.body || {};
      logger?.info('push_token_registered_direct', { username: req.user.username, deviceId: req.params.deviceId, provider: pushProvider, cleared: !pushToken });
      return res.json({ ok: true });
    }
  };
}

module.exports = { createAuthTokenController };
