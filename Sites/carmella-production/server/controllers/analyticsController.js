const EVENT_TYPES = new Set(['session_start', 'item_view', 'add_to_cart', 'remove_from_cart']);

function startOfDay(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
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
          sessionId: sessionId ? String(sessionId) : null
        }
      });
      res.status(202).json({ ok: true });
    },

    // STEP 10 — the admin analytics dashboard. Everything here is a real
    // aggregate query over AnalyticsEvent + MenuItem + the live cart table +
    // the three promotion tables; nothing is sampled or mocked.
    async getDashboard(req, res) {
      const prisma = getPrisma();
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
        hourRows
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
        prisma.analyticsEvent.findMany({ where: { createdAt: { gte: weekAgo } }, select: { createdAt: true } })
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

      const promoPerformance = (rows, key) => rows.map(row => {
        const itemIds = Array.isArray(row.itemIds) ? row.itemIds : [];
        const addToCart = cartCounts
          .filter(c => itemIds.includes(c.itemId))
          .reduce((sum, c) => sum + c._count.itemId, 0);
        return { id: row.id, [key]: row.title || row.name, active: row.active, addToCartCount: addToCart };
      });

      res.json({
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
