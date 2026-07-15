const EVENT_TYPES = new Set(['session_start', 'item_view', 'add_to_cart', 'remove_from_cart']);

// STEP 8 — below this many REAL events, the dashboard would be empty/useless
// for demoing or evaluating the feature, so synthetic rows fill it in. Once
// real traffic crosses this line the seed is deleted outright (not just
// hidden) so it can never be mistaken for real activity again.
const SEED_THRESHOLD = 50;
const SEED_SESSION_COUNT = 40;

function startOfDay(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Lunch (12-14) and dinner (18-20) are busiest; late night/early morning are quiet.
function weightedHour() {
  const weights = [1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 5, 6, 9, 8, 5, 4, 5, 7, 9, 8, 6, 4, 3, 2];
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let hour = 0; hour < weights.length; hour++) {
    roll -= weights[hour];
    if (roll <= 0) return hour;
  }
  return 12;
}

async function ensureAnalyticsSeed(prisma) {
  const realCount = await prisma.analyticsEvent.count({ where: { isSeed: false } });
  if (realCount >= SEED_THRESHOLD) {
    // Enough real activity now — the seed's only job was to fill an empty
    // dashboard, so it disappears for good rather than lingering and
    // skewing numbers next to real data.
    await prisma.analyticsEvent.deleteMany({ where: { isSeed: true } });
    return;
  }

  const alreadySeeded = await prisma.analyticsEvent.count({ where: { isSeed: true } });
  if (alreadySeeded > 0) return; // idempotent — only generate once

  const items = await prisma.menuItem.findMany({ where: { available: true }, select: { id: true, categoryId: true } });
  if (items.length === 0) return;

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const events = [];
  const now = Date.now();

  for (let s = 0; s < SEED_SESSION_COUNT; s++) {
    const sessionId = `seed_${s}_${Math.random().toString(36).slice(2, 8)}`;
    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date(now - daysAgo * 86400000);
    createdAt.setHours(weightedHour(), Math.floor(Math.random() * 60), 0, 0);
    const tableId = `table${1 + Math.floor(Math.random() * 12)}`;

    events.push({ type: 'session_start', sessionId, tableId, isSeed: true, createdAt });

    const viewCount = 1 + Math.floor(Math.random() * 4);
    const viewedItems = [];
    for (let v = 0; v < viewCount; v++) {
      const item = pick(items);
      viewedItems.push(item);
      const viewedAt = new Date(createdAt.getTime() + v * 45000);
      events.push({ type: 'item_view', itemId: item.id, categoryId: item.categoryId, sessionId, tableId, isSeed: true, createdAt: viewedAt });
    }

    const addCount = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let a = 0; a < addCount; a++) {
      const item = pick(viewedItems.length ? viewedItems : items);
      const addedAt = new Date(createdAt.getTime() + (viewCount + a) * 45000);
      events.push({ type: 'add_to_cart', itemId: item.id, categoryId: item.categoryId, sessionId, tableId, isSeed: true, createdAt: addedAt });
    }
  }

  await prisma.analyticsEvent.createMany({ data: events });
}

function createAnalyticsController({ getPrisma, fileService }) {
  return {
    // Public, fire-and-forget — the client posts one of these per view/cart
    // change. Never blocks or fails the caller's UX: bad/unknown payloads are
    // just dropped.
    async recordEvent(req, res) {
      const { type, itemId, categoryId, tableId, sessionId } = req.body || {};
      if (!EVENT_TYPES.has(type)) {
        return res.status(400).json({ error: `type must be one of: ${[...EVENT_TYPES].join(', ')}` });
      }
      const prisma = getPrisma();
      await prisma.analyticsEvent.create({
        data: {
          type,
          itemId: Number.isInteger(Number(itemId)) ? Number(itemId) : null,
          categoryId: Number.isInteger(Number(categoryId)) ? Number(categoryId) : null,
          tableId: tableId ? String(tableId) : null,
          sessionId: sessionId ? String(sessionId) : null,
          isSeed: false
        }
      });
      res.status(202).json({ ok: true });
    },

    // STEP 10 — the admin analytics dashboard. Everything here is a real
    // aggregate query over AnalyticsEvent + MenuItem + the live cart table +
    // the three promotion tables; nothing is sampled or mocked, except the
    // one-time seed (see ensureAnalyticsSeed) which auto-removes itself once
    // real traffic exists.
    async getDashboard(req, res) {
      const prisma = getPrisma();
      await ensureAnalyticsSeed(prisma);

      const dayAgo = startOfDay(0);
      const weekAgo = startOfDay(6);
      const monthAgo = startOfDay(29);

      const [
        activeCarts,
        items,
        promotions,
        happyHours,
        specials,
        viewCounts,
        cartCounts,
        dailyVisitorRows,
        weeklyVisitorRows,
        monthlyVisitorRows,
        hourRows,
        seedRemaining
      ] = await Promise.all([
        fileService.listActiveCarts(),
        prisma.menuItem.findMany({ select: { id: true, name: true, categoryId: true, available: true, category: { select: { title: true } } } }),
        prisma.promotion.findMany(),
        prisma.happyHour.findMany(),
        prisma.special.findMany(),
        prisma.analyticsEvent.groupBy({ by: ['itemId'], where: { type: 'item_view', itemId: { not: null } }, _count: { itemId: true } }),
        prisma.analyticsEvent.groupBy({ by: ['itemId'], where: { type: 'add_to_cart', itemId: { not: null } }, _count: { itemId: true } }),
        prisma.analyticsEvent.findMany({ where: { type: 'session_start', createdAt: { gte: dayAgo } }, select: { sessionId: true } }),
        prisma.analyticsEvent.findMany({ where: { type: 'session_start', createdAt: { gte: weekAgo } }, select: { sessionId: true } }),
        prisma.analyticsEvent.findMany({ where: { type: 'session_start', createdAt: { gte: monthAgo } }, select: { sessionId: true } }),
        prisma.analyticsEvent.findMany({ where: { createdAt: { gte: weekAgo } }, select: { createdAt: true } }),
        prisma.analyticsEvent.count({ where: { isSeed: true } })
      ]);

      const itemById = new Map(items.map(item => [item.id, item]));
      const byCount = (rows, key) => rows
        .map(row => ({ id: row.itemId, count: row._count[key] }))
        .sort((a, b) => b.count - a.count);

      const labelItems = rows => rows
        .filter(row => itemById.has(row.id))
        .slice(0, 10)
        .map(row => ({ itemId: row.id, name: itemById.get(row.id).name, count: row.count }));

      const categoryCounts = new Map();
      viewCounts.forEach(row => {
        const item = itemById.get(row.itemId);
        if (!item) return;
        const title = item.category?.title || 'Uncategorized';
        categoryCounts.set(title, (categoryCounts.get(title) || 0) + row._count.itemId);
      });
      const popularCategories = [...categoryCounts.entries()]
        .map(([title, count]) => ({ category: title, count }))
        .sort((a, b) => b.count - a.count);

      const hourBuckets = new Array(24).fill(0);
      hourRows.forEach(row => { hourBuckets[new Date(row.createdAt).getHours()] += 1; });

      const distinct = rows => new Set(rows.map(r => r.sessionId).filter(Boolean)).size;

      const itemIdsOf = row => Array.isArray(row.itemIds)
        ? row.itemIds
        : Array.isArray(row.items) ? row.items.map(e => e.itemId) : [];

      const promoPerformance = (rows, key) => rows.map(row => {
        const itemIds = itemIdsOf(row);
        const addToCart = cartCounts
          .filter(c => itemIds.includes(c.itemId))
          .reduce((sum, c) => sum + c._count.itemId, 0);
        return { id: row.id, [key]: row.title || row.name, active: row.active, addToCartCount: addToCart };
      });

      res.json({
        isSeeded: seedRemaining > 0,
        activeLiveCarts: activeCarts.length,
        activeGuests: new Set(activeCarts.map(c => c.tableId)).size,
        mostViewedItems: labelItems(byCount(viewCounts, 'itemId')),
        mostAddedToCart: labelItems(byCount(cartCounts, 'itemId')),
        popularCategories,
        peakUsageHours: hourBuckets.map((count, hour) => ({ hour, count })),
        dailyVisitors: distinct(dailyVisitorRows),
        weeklyVisitors: distinct(weeklyVisitorRows),
        monthlyVisitors: distinct(monthlyVisitorRows),
        dealPerformance: promoPerformance(promotions, 'title'),
        happyHourPerformance: promoPerformance(happyHours, 'name'),
        specialsPerformance: promoPerformance(specials, 'title'),
        availableItems: items.filter(i => i.available).length,
        unavailableItems: items.filter(i => !i.available).length
      });
    }
  };
}

module.exports = { createAnalyticsController };
