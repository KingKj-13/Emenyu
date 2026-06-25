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
      const { username, password, deviceName, platform, deviceId } = req.body || {};
      const existing = accountService ? await accountService.findAccount(username) : null;
      if (existing && existing.status === 'suspended') {
        return res.status(403).json({ error: 'This account is suspended. Contact the owner.' });
      }
      const user = accountService ? await accountService.verifyCredentials(username, password) : null;
      if (!user) {
        logger?.warn('token_issue_failed', { username });
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const accessToken = auth.createAccessToken(user.username, accessTtlMs);
      const { refreshToken, device } = await tokenService.issueRefresh(user.username, { deviceId, deviceName, platform });
      logger?.info('token_issued', { username: user.username, deviceId: device.deviceId, platform: device.platform });
      return res.json({
        accessToken, refreshToken, tokenType: 'Bearer', expiresIn,
        user: accountService.sanitizeUser(user),
        device: { deviceId: device.deviceId, deviceName: device.deviceName, platform: device.platform }
      });
    },

    // POST /api/auth/token/refresh  { refreshToken }
    async refresh(req, res) {
      try {
        const { refreshToken } = req.body || {};
        const rotated = await tokenService.rotateRefresh(refreshToken);
        const user = accountService ? await accountService.findAccount(rotated.username) : null;
        if (!user || user.status === 'suspended') {
          await tokenService.revokeByRefresh(rotated.refreshToken).catch(() => {});
          return res.status(403).json({ error: 'Account unavailable.' });
        }
        const accessToken = auth.createAccessToken(rotated.username, accessTtlMs);
        return res.json({ accessToken, refreshToken: rotated.refreshToken, tokenType: 'Bearer', expiresIn });
      } catch (error) {
        return res.status(error.statusCode || 401).json({ error: error.message || 'Refresh failed.' });
      }
    },

    // POST /api/auth/token/revoke  { refreshToken }  (logout this device)
    async revoke(req, res) {
      const { refreshToken } = req.body || {};
      if (!refreshToken) return res.status(400).json({ error: 'refreshToken required.' });
      await tokenService.revokeByRefresh(refreshToken);
      return res.json({ ok: true });
    },

    // GET /api/auth/devices  (session management — staff)
    async listDevices(req, res) {
      return res.json(await tokenService.listDevices(req.user.username));
    },

    // DELETE /api/auth/devices/:deviceId  (revoke one of my devices)
    async revokeDevice(req, res) {
      return res.json(await tokenService.revokeDevice(req.user.username, req.params.deviceId));
    }
  };
}

module.exports = { createAuthTokenController };
