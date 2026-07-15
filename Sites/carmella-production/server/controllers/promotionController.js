const { isWithinSchedule } = require('../utils/schedule');

const BADGES = new Set(['NEW', 'SPECIAL', '10% OFF', '20% OFF', 'LIMITED', 'CHEF SPECIAL']);

function toPublic(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    bannerImage: row.bannerImage,
    badge: row.badge,
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
  if (body.description !== undefined) out.description = String(body.description || '');
  if (body.bannerImage !== undefined) out.bannerImage = String(body.bannerImage || '');
  if (body.badge !== undefined) {
    const badge = String(body.badge || '');
    if (badge && !BADGES.has(badge)) {
      return { error: `badge must be one of: ${[...BADGES].join(', ')}` };
    }
    out.badge = badge;
  }
  if (body.startDate !== undefined) out.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) out.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startTime !== undefined) out.startTime = String(body.startTime || '');
  if (body.endTime !== undefined) out.endTime = String(body.endTime || '');
  if (body.active !== undefined) out.active = Boolean(body.active);
  return { value: out };
}

function createPromotionController({ getPrisma, socketService }) {
  return {
    // Public — Deal of the Day, only what's live right now.
    async listActive(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.promotion.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } });
      res.json(rows.filter(row => isWithinSchedule(row)).map(toPublic));
    },

    // Admin — every promotion regardless of schedule, with its computed live status.
    async listAll(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });
      res.json(rows.map(row => ({ ...row, isLiveNow: row.active && isWithinSchedule(row) })));
    },

    async create(req, res) {
      const parsed = sanitize(req.body, { partial: false });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const created = await prisma.promotion.create({ data: parsed.value });
      socketService?.emitPromotionsUpdated();
      res.status(201).json({ ok: true, promotion: created });
    },

    async update(req, res) {
      const parsed = sanitize(req.body, { partial: true });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const result = await prisma.promotion.updateMany({ where: { id: Number(req.params.id) }, data: parsed.value });
      if (result.count === 0) return res.status(404).json({ error: 'Promotion not found' });
      const updated = await prisma.promotion.findUnique({ where: { id: Number(req.params.id) } });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true, promotion: updated });
    },

    async remove(req, res) {
      const prisma = getPrisma();
      const result = await prisma.promotion.deleteMany({ where: { id: Number(req.params.id) } });
      if (result.count === 0) return res.status(404).json({ error: 'Promotion not found' });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true });
    }
  };
}

module.exports = { createPromotionController, BADGES };
