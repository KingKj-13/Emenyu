'use strict';
// Curated Demo Mode — one-time-redemption "make-good" reward QR ("your next
// drink is on us"). Mirrors tokenService.js's proven shape: mint
// `<id>.<secret>`, persist only sha256(secret), never the secret itself.
// Redemption is a single atomic conditional update (status: 'issued' ->
// 'redeemed') — the DB row can only ever win that race once, which is what
// makes this provably one-time-use even under a concurrent double-scan.
const crypto = require('crypto');
const { getPrisma } = require('./prismaClient');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');
const randomSecret = () => crypto.randomBytes(20).toString('base64url');

const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — generous enough for "next visit", short enough to bound fraud exposure

function createRewardService({ config, logger = null } = {}) {
  const restaurantId = config?.restaurantId || 'trump';

  // Fraud protection (rate limit): at most one ACTIVE (status 'issued',
  // non-expired) reward per device at a time. A fresh issuance revokes any
  // still-active one for that device first, so a guest can't accumulate
  // multiple free drinks by re-triggering the make-good flow in one visit.
  async function issue({ tableId, deviceId, reason = '' } = {}) {
    const prisma = getPrisma();
    await prisma.rewardCode.updateMany({
      where: { restaurantId, deviceId: String(deviceId || ''), status: 'issued' },
      data: { status: 'revoked' }
    });

    const secret = randomSecret();
    const expiresAt = new Date(Date.now() + EXPIRY_MS);
    const row = await prisma.rewardCode.create({
      data: {
        restaurantId,
        tableId: String(tableId || ''),
        deviceId: String(deviceId || ''),
        codeHash: sha256(secret),
        status: 'issued',
        reason: String(reason || ''),
        expiresAt
      }
    });
    logger?.info?.('reward_issued', { restaurantId, tableId, deviceId, id: row.id });
    return { code: `${row.id}.${secret}`, expiresAt, id: row.id };
  }

  // Fraud protection (one-time use): only ever transitions 'issued' ->
  // 'redeemed', gated on a fresh expiry check in the SAME update. Two
  // concurrent redeem attempts for the same code both run this updateMany;
  // exactly one can ever match `status: 'issued'` and actually flip a row —
  // the other's `count` comes back 0, which is the whole fraud guard, no
  // separate lock needed.
  async function redeem(code, { redeemedBy = '' } = {}) {
    const [idStr, secret] = String(code || '').split('.');
    const id = Number(idStr);
    if (!id || !secret) return { ok: false, reason: 'invalid' };

    const prisma = getPrisma();
    const row = await prisma.rewardCode.findUnique({ where: { id } });
    if (!row || row.restaurantId !== restaurantId) return { ok: false, reason: 'invalid' };

    const provided = Buffer.from(sha256(secret));
    const stored = Buffer.from(row.codeHash);
    if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
      return { ok: false, reason: 'invalid' };
    }
    if (row.status === 'redeemed') return { ok: false, reason: 'already_redeemed' };
    if (row.status === 'revoked') return { ok: false, reason: 'invalid' };
    if (row.expiresAt < new Date()) {
      await prisma.rewardCode.updateMany({ where: { id, status: 'issued' }, data: { status: 'expired' } });
      return { ok: false, reason: 'expired' };
    }

    const result = await prisma.rewardCode.updateMany({
      where: { id, status: 'issued', expiresAt: { gt: new Date() } },
      data: { status: 'redeemed', redeemedAt: new Date(), redeemedBy: String(redeemedBy || '') }
    });
    if (result.count === 0) {
      // Lost the race, or it expired/was revoked between the read above and this update.
      return { ok: false, reason: 'already_redeemed' };
    }
    logger?.info?.('reward_redeemed', { restaurantId, id, redeemedBy });
    return { ok: true, tableId: row.tableId, deviceId: row.deviceId };
  }

  return { issue, redeem };
}

module.exports = { createRewardService };
