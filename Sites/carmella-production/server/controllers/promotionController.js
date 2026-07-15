const { isWithinSchedule } = require('../utils/schedule');
const { effectivePrice } = require('../services/prismaMenuService');

const BADGES = new Set(['NEW', 'SPECIAL', '10% OFF', '20% OFF', 'LIMITED', 'CHEF SPECIAL']);

function toPublic(row, itemsById) {
  const itemIds = Array.isArray(row.itemIds) ? row.itemIds : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    bannerImage: row.bannerImage,
    badge: row.badge,
    startDate: row.startDate,
    endDate: row.endDate,
    startTime: row.startTime,
    endTime: row.endTime,
    items: itemsById ? itemIds.map(id => itemsById.get(id)).filter(Boolean) : itemIds
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
  if (body.itemIds !== undefined) {
    out.itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
  }
  if (body.startDate !== undefined) out.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) out.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startTime !== undefined) out.startTime = String(body.startTime || '');
  if (body.endTime !== undefined) out.endTime = String(body.endTime || '');
  if (body.active !== undefined) out.active = Boolean(body.active);
  return { value: out };
}

function createPromotionController({ getPrisma, socketService }) {
  async function resolveItemsById(prisma, rows) {
    const ids = [...new Set(rows.flatMap(row => (Array.isArray(row.itemIds) ? row.itemIds : [])))];
    if (ids.length === 0) return new Map();
    const items = await prisma.menuItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, price: true, imagePath: true, variants: { select: { price: true, isAddon: true } } }
    });
    return new Map(items.map(item => [item.id, { id: item.id, name: item.name, price: effectivePrice(item), img: item.imagePath }]));
  }

  return {
    // Public — Deal of the Day, only what's live right now.
    async listActive(req, res) {
      const prisma = getPrisma();
      const rows = (await prisma.promotion.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } }))
        .filter(row => isWithinSchedule(row));
      const itemsById = await resolveItemsById(prisma, rows);
      res.json(rows.map(row => toPublic(row, itemsById)));
    },

    // Admin — every promotion regardless of schedule, with its computed live status.
    async listAll(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });
      const itemsById = await resolveItemsById(prisma, rows);
      res.json(rows.map(row => ({ ...toPublic(row, itemsById), active: row.active, isLiveNow: row.active && isWithinSchedule(row) })));
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
