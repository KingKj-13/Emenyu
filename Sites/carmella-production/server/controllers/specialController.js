const { isWithinSchedule } = require('../utils/schedule');

function toPublic(row) {
  return {
    id: row.id,
    title: row.title,
    bannerImage: row.bannerImage,
    itemIds: row.itemIds,
    discountPct: row.discountPct,
    startDate: row.startDate,
    endDate: row.endDate,
    startTime: row.startTime,
    endTime: row.endTime
  };
}

function sanitize(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) return { error: 'title is required' };
    out.title = title;
  }
  if (body.bannerImage !== undefined) out.bannerImage = String(body.bannerImage || '');
  if (!partial || body.itemIds !== undefined) {
    const ids = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
    if (ids.length === 0) return { error: 'itemIds must be a non-empty array of menu item ids' };
    out.itemIds = ids;
  }
  if (body.discountPct !== undefined) {
    out.discountPct = body.discountPct === null || body.discountPct === '' ? null : Number(body.discountPct);
  }
  if (body.startDate !== undefined) out.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) out.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startTime !== undefined) out.startTime = String(body.startTime || '');
  if (body.endTime !== undefined) out.endTime = String(body.endTime || '');
  if (body.active !== undefined) out.active = Boolean(body.active);
  return { value: out };
}

function createSpecialController({ getPrisma, socketService }) {
  return {
    async listActive(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.special.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } });
      res.json(rows.filter(row => isWithinSchedule(row)).map(toPublic));
    },

    async listAll(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.special.findMany({ orderBy: { createdAt: 'desc' } });
      res.json(rows.map(row => ({ ...row, isLiveNow: row.active && isWithinSchedule(row) })));
    },

    async create(req, res) {
      const parsed = sanitize(req.body, { partial: false });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const created = await prisma.special.create({ data: parsed.value });
      socketService?.emitPromotionsUpdated();
      res.status(201).json({ ok: true, special: created });
    },

    async update(req, res) {
      const parsed = sanitize(req.body, { partial: true });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const result = await prisma.special.updateMany({ where: { id: Number(req.params.id) }, data: parsed.value });
      if (result.count === 0) return res.status(404).json({ error: 'Special not found' });
      const updated = await prisma.special.findUnique({ where: { id: Number(req.params.id) } });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true, special: updated });
    },

    async remove(req, res) {
      const prisma = getPrisma();
      const result = await prisma.special.deleteMany({ where: { id: Number(req.params.id) } });
      if (result.count === 0) return res.status(404).json({ error: 'Special not found' });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true });
    }
  };
}

module.exports = { createSpecialController };
