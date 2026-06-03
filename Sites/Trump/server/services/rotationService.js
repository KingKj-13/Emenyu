'use strict';
// Deterministic, seeded, weighted recommendation rotation (Phase 3, Task 4).
//
// - Variety: different scope ids (per device/table, or per day) yield different
//   valid picks, so two guests don't always see the same set.
// - Priority-respecting: within a rotation group, higher-priority members are drawn
//   more often (weighted), not uniformly.
// - Explainable + reproducible: the seed is a pure function of
//   (restaurant, time bucket, scope, group). The same inputs always yield the same
//   order, so any shown set can be recomputed offline for reporting.

function hashString(value) {
  // FNV-1a (32-bit) — stable and dependency-free.
  let h = 2166136261 >>> 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function timeBucket(date, mode) {
  const d = date || new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (mode === 'hour') return `${y}-${m}-${day}T${String(d.getUTCHours()).padStart(2, '0')}`;
  if (mode === 'week') {
    const oneJan = Date.UTC(y, 0, 1);
    const week = Math.floor((d.getTime() - oneJan) / (7 * 86400000));
    return `${y}-W${week}`;
  }
  return `${y}-${m}-${day}`;
}

function createRotationService({ config = {}, logger = null } = {}) {
  const rcfg = (config.reco && config.reco.rotation) || {};
  const scopeMode = rcfg.scope || 'session'; // 'session' | 'day'
  const bucketMode = rcfg.bucket || 'day'; // 'hour' | 'day' | 'week'
  const restaurantId = config.restaurantId || 'trump';

  function rotationContext(payload = {}) {
    const scopeId = scopeMode === 'day'
      ? ''
      : String(payload.deviceId || payload.tableId || payload.sessionId || 'anon');
    return { scopeId, bucket: timeBucket(new Date(), bucketMode), scopeMode, bucketMode };
  }

  function seedFor(ctx, group) {
    const key = `${restaurantId}|${ctx.bucket}|${ctx.scopeId}|${group || ''}`;
    return { key, seed: hashString(key) };
  }

  // Weighted draw WITHOUT replacement → a full reordering of `items`.
  function weightedOrder(items, weightFn, rng) {
    const pool = items.slice();
    const out = [];
    while (pool.length) {
      const weights = pool.map(it => Math.max(0.0001, Number(weightFn(it)) || 0.0001));
      const total = weights.reduce((sum, w) => sum + w, 0);
      let r = rng() * total;
      let idx = 0;
      for (; idx < pool.length; idx += 1) {
        r -= weights[idx];
        if (r <= 0) break;
      }
      if (idx >= pool.length) idx = pool.length - 1;
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  // candidates: [{ item, score, rotationGroup?, priority? }]
  // Returns { ordered, ctx, explain }. Overall score order is preserved between
  // groups/solos; WITHIN a rotation group, which member fills the group's slots is
  // rotated by the seed (weighted by priority/score).
  function rotate(candidates = [], payload = {}) {
    const ctx = rotationContext(payload);
    const sorted = candidates
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (b.c.score - a.c.score) || (a.i - b.i))
      .map(x => x.c);

    const groupPositions = new Map();
    sorted.forEach((c, idx) => {
      const g = c.rotationGroup;
      if (!g) return;
      if (!groupPositions.has(g)) groupPositions.set(g, []);
      groupPositions.get(g).push(idx);
    });

    const explain = [];
    for (const [group, positions] of groupPositions) {
      if (positions.length <= 1) continue;
      const members = positions.map(p => sorted[p]);
      const { key, seed } = seedFor(ctx, group);
      const rng = mulberry32(seed);
      const reordered = weightedOrder(members, m => Math.max(1, m.priority || m.score || 1), rng);
      positions.forEach((p, k) => { sorted[p] = reordered[k]; });
      explain.push({ group, seedKey: key, picked: reordered[0]?.item?.name || null, of: members.length });
    }

    if (explain.length) {
      logger?.debug?.('reco_rotation', { scope: ctx.scopeMode, bucket: ctx.bucket, groups: explain });
    }
    return { ordered: sorted, ctx, explain };
  }

  return { rotate, rotationContext, seedFor, hashString };
}

module.exports = { createRotationService, hashString, mulberry32, timeBucket };
