const { isWithinSchedule } = require('../utils/schedule');

function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    itemIds: row.itemIds,
    discountPct: row.discountPct,
    startTime: row.startTime,
    endTime: row.endTime,
    activeDays: row.activeDays
  };
}

function sanitize(body = {}, { partial = false } = {}) {
  const out = {};
  if (body.name !== undefined) out.name = String(body.name || 'Happy Hour');
  if (!partial || body.itemIds !== undefined) {
    const ids = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
    if (ids.length === 0) return { error: 'itemIds must be a non-empty array of menu item ids' };
    out.itemIds = ids;
  }
  if (!partial || body.discountPct !== undefined) {
    const pct = Number(body.discountPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { error: 'discountPct must be between 0 and 100' };
    out.discountPct = pct;
  }
  if (!partial || body.startTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(body.startTime || '')) return { error: 'startTime must be HH:MM' };
    out.startTime = body.startTime;
  }
  if (!partial || body.endTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(body.endTime || '')) return { error: 'endTime must be HH:MM' };
    out.endTime = body.endTime;
  }
  if (body.activeDays !== undefined) {
    out.activeDays = Array.isArray(body.activeDays) ? body.activeDays.map(Number).filter(n => n >= 0 && n <= 6) : [];
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  return { value: out };
}

function createHappyHourController({ getPrisma, socketService }) {
  return {
    // Public — active happy hours right now, for the customer badge.
    async listActive(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.happyHour.findMany({ where: { active: true } });
      res.json(rows.filter(row => isWithinSchedule(row)).map(toPublic));
    },

    async listAll(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.happyHour.findMany({ orderBy: { createdAt: 'desc' } });
      res.json(rows.map(row => ({ ...row, isLiveNow: row.active && isWithinSchedule(row) })));
    },

    async create(req, res) {
      const parsed = sanitize(req.body, { partial: false });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const created = await prisma.happyHour.create({ data: parsed.value });
      socketService?.emitPromotionsUpdated();
      res.status(201).json({ ok: true, happyHour: created });
    },

    async update(req, res) {
      const parsed = sanitize(req.body, { partial: true });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const result = await prisma.happyHour.updateMany({ where: { id: Number(req.params.id) }, data: parsed.value });
      if (result.count === 0) return res.status(404).json({ error: 'Happy Hour not found' });
      const updated = await prisma.happyHour.findUnique({ where: { id: Number(req.params.id) } });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true, happyHour: updated });
    },

    async remove(req, res) {
      const prisma = getPrisma();
      const result = await prisma.happyHour.deleteMany({ where: { id: Number(req.params.id) } });
      if (result.count === 0) return res.status(404).json({ error: 'Happy Hour not found' });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true });
    }
  };
}

module.exports = { createHappyHourController };
