const { isWithinSchedule } = require('../utils/schedule');
const { effectivePrice } = require('../services/prismaMenuService');

// Each entry sets exactly one of specialPrice/discountPct; discountPct wins
// if a caller somehow sends both (mirrors the schema comment). `silent`
// (default false) is per-item: a silent item's discount still applies
// wherever it's normally sold (its own category card/modal), it just never
// gets a "Today's Specials" promotional card -- the customer only notices
// the reduced price, nothing calls attention to it.
function sanitizeItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'items must be a non-empty array' };
  const items = [];
  for (const entry of raw) {
    const itemId = Number(entry?.itemId);
    if (!Number.isInteger(itemId)) return { error: 'each item needs a valid itemId' };
    const specialPrice = entry.specialPrice === null || entry.specialPrice === undefined || entry.specialPrice === ''
      ? null : Number(entry.specialPrice);
    const discountPct = entry.discountPct === null || entry.discountPct === undefined || entry.discountPct === ''
      ? null : Number(entry.discountPct);
    if (specialPrice == null && discountPct == null) {
      return { error: `item ${itemId} needs a specialPrice or discountPct` };
    }
    items.push({ itemId, specialPrice, discountPct, silent: Boolean(entry.silent) });
  }
  return { value: items };
}

function sanitize(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) return { error: 'title is required' };
    out.title = title;
  }
  if (body.bannerImage !== undefined) out.bannerImage = String(body.bannerImage || '');
  if (!partial || body.items !== undefined) {
    const parsedItems = sanitizeItems(body.items);
    if (parsedItems.error) return { error: parsedItems.error };
    out.items = parsedItems.value;
  }
  if (body.startDate !== undefined) out.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) out.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startTime !== undefined) out.startTime = String(body.startTime || '');
  if (body.endTime !== undefined) out.endTime = String(body.endTime || '');
  if (body.active !== undefined) out.active = Boolean(body.active);
  return { value: out };
}

function createSpecialController({ getPrisma, socketService }) {
  async function toPublic(prisma, row) {
    const entries = Array.isArray(row.items) ? row.items : [];
    const ids = entries.map(e => e.itemId);
    const menuItems = ids.length
      ? await prisma.menuItem.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, price: true, imagePath: true, variants: { select: { price: true, isAddon: true } } }
        })
      : [];
    const byId = new Map(menuItems.map(i => [i.id, i]));

    const items = entries.map(entry => {
      const item = byId.get(entry.itemId);
      if (!item) return null;
      const originalPrice = effectivePrice(item);
      const specialPrice = entry.discountPct != null
        ? Math.max(0, originalPrice * (1 - entry.discountPct / 100))
        : entry.specialPrice;
      return {
        itemId: item.id,
        name: item.name,
        img: item.imagePath,
        originalPrice,
        specialPrice,
        discountPct: entry.discountPct,
        silent: Boolean(entry.silent)
      };
    }).filter(Boolean);

    return {
      id: row.id,
      title: row.title,
      bannerImage: row.bannerImage,
      items,
      startDate: row.startDate,
      endDate: row.endDate,
      startTime: row.startTime,
      endTime: row.endTime
    };
  }

  return {
    async listActive(req, res) {
      const prisma = getPrisma();
      const rows = (await prisma.special.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } }))
        .filter(row => isWithinSchedule(row));
      res.json(await Promise.all(rows.map(row => toPublic(prisma, row))));
    },

    async listAll(req, res) {
      const prisma = getPrisma();
      const rows = await prisma.special.findMany({ orderBy: { createdAt: 'desc' } });
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
