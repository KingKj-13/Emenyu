// Guest intelligence — deterministic. No AI here.
// Aggregates returning-guest data (visits, spend, favorites, allergies, VIP)
// from the Guest table + that guest's historical orders.
const { getPrisma } = require('./prismaClient');
const { getCanonicalTableId } = require('../utils/helpers');

function createGuestService({ config }) {
  const restaurantId = config?.restaurantId || 'trump';

  function safePrefs(guest) {
    return guest && guest.preferences && typeof guest.preferences === 'object' ? guest.preferences : {};
  }

  // Derive the most frequently ordered item names from a guest's order history.
  function deriveFavorites(orders) {
    const counts = new Map();
    for (const order of orders) {
      const items = Array.isArray(order.raw?.items) ? order.raw.items : order.items || [];
      for (const item of items) {
        const name = String(item.name || '').trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + Number(item.quantity || item.qty || 1));
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }

  async function listGuests() {
    const db = getPrisma();
    try {
      return await db.guest.findMany({
        where: { restaurantId },
        orderBy: [{ vip: 'desc' }, { lifetimeSpend: 'desc' }]
      });
    } catch {
      return [];
    }
  }

  async function getGuest(id) {
    const db = getPrisma();
    try {
      return await db.guest.findFirst({ where: { id: Number(id), restaurantId } });
    } catch {
      return null;
    }
  }

  async function createGuest(data = {}) {
    const db = getPrisma();
    return db.guest.create({
      data: {
        restaurantId,
        name: String(data.name || 'Guest'),
        phone: String(data.phone || ''),
        email: String(data.email || ''),
        vip: Boolean(data.vip),
        loyaltyTier: String(data.loyaltyTier || ''),
        dietary: String(data.dietary || ''),
        allergies: String(data.allergies || ''),
        preferences: data.preferences || undefined,
        notes: String(data.notes || '')
      }
    });
  }

  async function updateGuest(id, data = {}) {
    const db = getPrisma();
    const patch = {};
    for (const key of ['name', 'phone', 'email', 'loyaltyTier', 'dietary', 'allergies', 'notes']) {
      if (data[key] !== undefined) patch[key] = String(data[key]);
    }
    if (data.vip !== undefined) patch.vip = Boolean(data.vip);
    if (data.preferences !== undefined) patch.preferences = data.preferences;
    return db.guest.update({ where: { id: Number(id) }, data: patch });
  }

  async function getSeatedGuestId(tableId) {
    const db = getPrisma();
    try {
      const table = await db.table.findUnique({
        where: { restaurantId_tableId: { restaurantId, tableId: getCanonicalTableId(tableId) } },
        select: { metadata: true }
      });
      const meta = table?.metadata && typeof table.metadata === 'object' ? table.metadata : {};
      return meta.guestId ? Number(meta.guestId) : null;
    } catch {
      return null;
    }
  }

  // Stamp the seated guest onto Table.metadata so the order builder / floor can read it.
  async function seatGuest(tableId, guestId) {
    const db = getPrisma();
    const cleanId = getCanonicalTableId(tableId);
    const existing = await db.table.findUnique({
      where: { restaurantId_tableId: { restaurantId, tableId: cleanId } },
      select: { metadata: true }
    });
    const meta = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
    const nextMeta = { ...meta, guestId: guestId ? Number(guestId) : null };
    await db.table.upsert({
      where: { restaurantId_tableId: { restaurantId, tableId: cleanId } },
      create: { restaurantId, tableId: cleanId, displayName: cleanId.replace(/^table/, 'Table '), metadata: nextMeta },
      update: { metadata: nextMeta }
    });
    return getGuestIntel({ guestId });
  }

  // Recompute denormalized stats from completed (history) orders linked to this guest.
  async function recomputeGuestStats(guestId) {
    const db = getPrisma();
    const orders = await db.order.findMany({
      where: { restaurantId, guestId: Number(guestId), status: 'history' },
      select: { total: true, timestamp: true }
    });
    const visitCount = orders.length;
    const lifetimeSpend = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const avgSpend = visitCount ? lifetimeSpend / visitCount : 0;
    const lastVisitAt = orders.reduce((latest, o) => (!latest || o.timestamp > latest ? o.timestamp : latest), null);
    await db.guest.update({
      where: { id: Number(guestId) },
      data: {
        visitCount,
        lifetimeSpend: Number(lifetimeSpend.toFixed(2)),
        avgSpend: Number(avgSpend.toFixed(2)),
        lastVisitAt
      }
    });
    return { visitCount, lifetimeSpend, avgSpend, lastVisitAt };
  }

  // The structured Guest Intelligence object the UI renders. Pure data — wording added by nlg layer.
  async function getGuestIntel({ guestId, tableId } = {}) {
    const db = getPrisma();
    let resolvedId = guestId ? Number(guestId) : null;
    if (!resolvedId && tableId) {
      resolvedId = await getSeatedGuestId(tableId);
    }
    if (!resolvedId) {
      return { present: false };
    }

    const guest = await getGuest(resolvedId);
    if (!guest) return { present: false };

    let history = [];
    try {
      history = await db.order.findMany({
        where: { restaurantId, guestId: resolvedId, status: 'history' },
        select: { total: true, timestamp: true, raw: true },
        orderBy: { timestamp: 'desc' },
        take: 60
      });
    } catch {
      history = [];
    }

    const prefs = safePrefs(guest);
    const derived = deriveFavorites(history);

    return {
      present: true,
      id: guest.id,
      name: guest.name,
      vip: guest.vip,
      loyaltyTier: guest.loyaltyTier || '',
      returning: (guest.visitCount || history.length) > 1,
      visitCount: guest.visitCount || history.length,
      lifetimeSpend: Number(guest.lifetimeSpend || 0),
      avgSpend: Number(guest.avgSpend || 0),
      lastVisitAt: guest.lastVisitAt,
      favorites: {
        wine: prefs.favoriteWine || null,
        main: prefs.favoriteMain || derived[0] || null,
        dessert: prefs.favoriteDessert || null
      },
      topItems: derived.slice(0, 3),
      avoids: prefs.avoids || (guest.allergies ? guest.allergies.split(',').map(s => s.trim()).filter(Boolean) : []),
      allergies: guest.allergies || '',
      dietary: guest.dietary || '',
      preferredSeating: prefs.preferredSeating || null,
      notes: guest.notes || ''
    };
  }

  return {
    listGuests,
    getGuest,
    createGuest,
    updateGuest,
    getSeatedGuestId,
    seatGuest,
    recomputeGuestStats,
    getGuestIntel
  };
}

module.exports = { createGuestService };
