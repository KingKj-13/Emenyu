const { isWithinSchedule } = require('../utils/schedule');
const { effectivePrice } = require('../services/prismaMenuService');

function sanitize(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) return { error: 'title is required' };
    out.title = title;
  }
  if (body.description !== undefined) out.description = String(body.description || '');
  if (body.bannerImage !== undefined) out.bannerImage = String(body.bannerImage || '');
  if (body.itemIds !== undefined) {
    const ids = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
    if (!partial && ids.length === 0) return { error: 'itemIds must be a non-empty array of dish MenuItem ids' };
    out.itemIds = ids;
  }
  if (body.drinkItemIds !== undefined) {
    out.drinkItemIds = Array.isArray(body.drinkItemIds) ? body.drinkItemIds.map(Number).filter(Number.isInteger) : [];
  }
  if (!partial || body.comboPrice !== undefined) {
    const comboPrice = Number(body.comboPrice);
    if (!Number.isFinite(comboPrice) || comboPrice < 0) return { error: 'comboPrice must be a non-negative number' };
    out.comboPrice = comboPrice;
  }
  if (body.startDate !== undefined) out.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) out.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startTime !== undefined) out.startTime = String(body.startTime || '');
  if (body.endTime !== undefined) out.endTime = String(body.endTime || '');
  if (body.active !== undefined) out.active = Boolean(body.active);
  return { value: out };
}

function createComboController({ getPrisma, socketService }) {
  async function resolveItems(prisma, ids) {
    if (ids.length === 0) return [];
    const items = await prisma.menuItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, price: true, imagePath: true, variants: { select: { price: true, isAddon: true } } }
    });
    const byId = new Map(items.map(i => [i.id, i]));
    // Preserve admin-chosen order, drop any id that no longer resolves
    // (deleted item) rather than erroring the whole combo out.
    return ids.map(id => byId.get(id)).filter(Boolean).map(item => ({ id: item.id, name: item.name, price: effectivePrice(item), img: item.imagePath }));
  }

  async function toPublic(prisma, row) {
    const itemIds = Array.isArray(row.itemIds) ? row.itemIds : [];
    const drinkItemIds = Array.isArray(row.drinkItemIds) ? row.drinkItemIds : [];
    const [items, drinks] = await Promise.all([resolveItems(prisma, itemIds), resolveItems(prisma, drinkItemIds)]);
    const originalPrice = [...items, ...drinks].reduce((s, i) => s + i.price, 0);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      bannerImage: row.bannerImage,
      items,
      drinks,
      comboPrice: row.comboPrice,
      originalPrice,
      savings: Math.max(0, originalPrice - row.comboPrice),
      startDate: row.startDate,
      endDate: row.endDate,
      startTime: row.startTime,
      endTime: row.endTime
    };
  }

  return {
    async listActive(req, res) {
      const prisma = getPrisma();
      const rows = (await prisma.comboSpecial.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } }))
        .filter(row => isWithinSchedule(row));
      res.json(await Promise.all(rows.map(row => toPublic(prisma, row))));
    },

    async listAll(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.comboSpecial.findMany({ orderBy: { createdAt: 'desc' } });
      const enriched = await Promise.all(rows.map(async row => ({
        ...(await toPublic(prisma, row)),
        active: row.active,
        isLiveNow: row.active && isWithinSchedule(row)
      })));
      res.json(enriched);
    },

    async create(req, res) {
      const parsed = sanitize(req.body, { partial: false });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const created = await prisma.comboSpecial.create({ data: parsed.value });
      socketService?.emitPromotionsUpdated();
      res.status(201).json({ ok: true, combo: created });
    },

    async update(req, res) {
      const parsed = sanitize(req.body, { partial: true });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const prisma = getPrisma();
      const result = await prisma.comboSpecial.updateMany({ where: { id: Number(req.params.id) }, data: parsed.value });
      if (result.count === 0) return res.status(404).json({ error: 'Combo not found' });
      const updated = await prisma.comboSpecial.findUnique({ where: { id: Number(req.params.id) } });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true, combo: updated });
    },

    async remove(req, res) {
      const prisma = getPrisma();
      const result = await prisma.comboSpecial.deleteMany({ where: { id: Number(req.params.id) } });
      if (result.count === 0) return res.status(404).json({ error: 'Combo not found' });
      socketService?.emitPromotionsUpdated();
      res.json({ ok: true });
    }
  };
}

module.exports = { createComboController };
