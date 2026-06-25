'use strict';
// Phase 04 — native token auth: refresh-token + device registry.
//
// Access tokens are stateless (minted by createRoleAuth.createAccessToken, the cookie
// HMAC format) and NOT stored here. This service owns the long-lived, revocable
// REFRESH tokens, one per device. A refresh token is `<deviceId>.<secret>`; only
// sha256(secret) is persisted. Refresh rotates the secret on every use.
const crypto = require('crypto');
const { getPrisma } = require('./prismaClient');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');
const randomSecret = () => crypto.randomBytes(32).toString('base64url');
const newDeviceId = () => crypto.randomUUID();
const norm = (v) => String(v || '').trim().toLowerCase();

class TokenService {
  constructor({ config, logger = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.restaurantId = config?.restaurantId || 'trump';
    this.refreshTtlMs = config?.auth?.refreshTtlMs || 30 * 24 * 60 * 60 * 1000;
  }

  // Register/refresh a device and mint a new refresh token. Returns { refreshToken, device }.
  async issueRefresh(username, { deviceId, deviceName = '', platform = '' } = {}) {
    const id = deviceId || newDeviceId();
    const secret = randomSecret();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    const base = {
      restaurantId: this.restaurantId, username: norm(username), deviceName: String(deviceName || ''),
      platform: String(platform || ''), refreshTokenHash: sha256(secret), refreshExpiresAt,
      revokedAt: null, lastSeenAt: new Date()
    };
    const device = await getPrisma().device.upsert({
      where: { deviceId: id }, update: base, create: { deviceId: id, ...base }
    });
    return { refreshToken: `${id}.${secret}`, device };
  }

  // Verify + ROTATE a refresh token. Returns { username, refreshToken, device } or throws (401).
  async rotateRefresh(refreshToken) {
    const [deviceId, secret] = String(refreshToken || '').split('.');
    if (!deviceId || !secret) { const e = new Error('Invalid refresh token'); e.statusCode = 401; throw e; }
    const device = await getPrisma().device.findUnique({ where: { deviceId } });
    if (!device || device.revokedAt || device.refreshExpiresAt < new Date()) {
      const e = new Error('Refresh token expired or revoked'); e.statusCode = 401; throw e;
    }
    const provided = Buffer.from(sha256(secret));
    const stored = Buffer.from(device.refreshTokenHash);
    if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
      const e = new Error('Invalid refresh token'); e.statusCode = 401; throw e;
    }
    const newSecret = randomSecret();
    await getPrisma().device.update({
      where: { deviceId },
      data: { refreshTokenHash: sha256(newSecret), refreshExpiresAt: new Date(Date.now() + this.refreshTtlMs), lastSeenAt: new Date() }
    });
    return { username: device.username, refreshToken: `${deviceId}.${newSecret}`, device };
  }

  async revokeByRefresh(refreshToken) {
    const [deviceId] = String(refreshToken || '').split('.');
    if (!deviceId) return { revoked: false };
    const r = await getPrisma().device.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { revoked: r.count > 0 };
  }

  async listDevices(username) {
    return getPrisma().device.findMany({
      where: { username: norm(username), revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: { deviceId: true, deviceName: true, platform: true, lastSeenAt: true, createdAt: true }
    });
  }

  async revokeDevice(username, deviceId) {
    const r = await getPrisma().device.updateMany({
      where: { username: norm(username), deviceId, revokedAt: null }, data: { revokedAt: new Date() }
    });
    return { revoked: r.count > 0 };
  }
}

module.exports = { TokenService };
