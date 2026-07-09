// Use the shared, explicitly-resolved Prisma client so a Trump-local @prisma/client
// stub can't shadow the generated client (which silently zeroed analytics).
const { getPrisma } = require('../services/prismaClient');
// Read-only classification for reporting (category splits, pairing labels). This
// is the same shared classifier every other surface uses — not part of the
// recommendation engine's candidate/scoring pipeline.
const { categoryType, beverageKind } = require('../services/categoryClassifier');
const { getCanonicalTableId } = require('../utils/helpers');

function parseDateRange(from, to) {
  const ts = {};
  if (from) ts.gte = new Date(from);
  if (to) ts.lte = new Date(to);
  return Object.keys(ts).length > 0 ? { timestamp: ts } : {};
}

const pad = n => String(n).padStart(2, '0');

// Bucket a date into a sortable key for the revenue trend (server-local time, to
// match getHours/getDayOfWeek). Week buckets key on that week's Monday.
function bucketKey(d, bucket) {
  if (bucket === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (bucket === 'week') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function createAnalyticsController({ config }) {
  const restaurantId = config?.restaurantId || 'trump';

  return {
    async getSummary(req, res) {
      const { from, to } = req.query;
      try {
        const db = getPrisma();
        const where = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const [agg, topTables] = await Promise.all([
          db.order.aggregate({
            where,
            _count: { id: true },
            _sum: { total: true, covers: true },
            _avg: { total: true }
          }),
          db.order.groupBy({
            by: ['tableId'],
            where,
            _sum: { total: true },
            orderBy: { _sum: { total: 'desc' } },
            take: 1
          })
        ]);
        const covers = agg._sum.covers || 0;
        const revenue = Number((agg._sum.total || 0).toFixed(2));
        res.json({
          orderCount: agg._count.id || 0,
          revenue,
          avgOrderValue: Number((agg._avg.total || 0).toFixed(2)),
          topTable: topTables[0]?.tableId || null,
          topTableRevenue: Number((topTables[0]?._sum?.total || 0).toFixed(2)),
          covers,
          avgPerCover: covers > 0 ? Number((revenue / covers).toFixed(2)) : 0
        });
      } catch {
        res.json({ orderCount: 0, revenue: 0, avgOrderValue: 0, topTable: null, topTableRevenue: 0, covers: 0, avgPerCover: 0 });
      }
    },

    // order=desc (default) → best sellers; order=asc → worst sellers (bottom dishes).
    // Both are over items that sold at least once in the period. An optional
    // `category` (STARTER|MAIN|DESSERT|WINE|DRINK) narrows to that categoryType —
    // pulled over a wider pool then filtered in-process, since categoryType isn't
    // a stored column on OrderItem.
    async getItems(req, res) {
      const { from, to, order, category, limit } = req.query;
      const dir = order === 'asc' ? 'asc' : 'desc';
      const take = category ? 200 : (Math.min(Number(limit) || 10, 50));
      try {
        const db = getPrisma();
        const orderWhere = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        let rows = await db.orderItem.groupBy({
          by: ['name'],
          where: { order: orderWhere },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: dir } },
          take
        });
        if (category) rows = rows.filter(r => categoryType(r.name) === String(category).toUpperCase()).slice(0, Math.min(Number(limit) || 10, 50));
        const names = rows.map(r => r.name);
        const revenues = await db.orderItem.groupBy({
          by: ['name'],
          where: { name: { in: names }, order: orderWhere },
          _sum: { price: true }
        });
        const revMap = Object.fromEntries(revenues.map(r => [r.name, r._sum.price || 0]));
        res.json(rows.map(r => ({
          name: r.name,
          quantity: r._sum.quantity || 0,
          revenue: Number((revMap[r.name] || 0).toFixed(2)),
          categoryType: categoryType(r.name)
        })));
      } catch {
        res.json([]);
      }
    },

    async getTables(req, res) {
      const { from, to } = req.query;
      try {
        const db = getPrisma();
        const where = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const rows = await db.order.groupBy({
          by: ['tableId'],
          where,
          _sum: { total: true },
          _count: { id: true },
          orderBy: { _sum: { total: 'desc' } }
        });
        res.json(rows.map(r => ({
          tableId: r.tableId,
          revenue: Number((r._sum.total || 0).toFixed(2)),
          orderCount: r._count.id || 0
        })));
      } catch {
        res.json([]);
      }
    },

    async getHours(req, res) {
      const { from, to } = req.query;
      try {
        const db = getPrisma();
        const where = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const orders = await db.order.findMany({
          where,
          select: { timestamp: true }
        });
        const counts = new Array(24).fill(0);
        for (const { timestamp } of orders) {
          const h = new Date(timestamp).getHours();
          counts[h] += 1;
        }
        res.json(counts.map((count, hour) => ({ hour, count })));
      } catch {
        res.json(Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 })));
      }
    },

    // Revenue + orders over time, bucketed by day | week | month.
    async getTrend(req, res) {
      const { from, to, bucket } = req.query;
      const b = ['day', 'week', 'month'].includes(bucket) ? bucket : 'day';
      try {
        const db = getPrisma();
        const where = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const orders = await db.order.findMany({ where, select: { timestamp: true, total: true } });
        const map = new Map();
        for (const { timestamp, total } of orders) {
          const key = bucketKey(new Date(timestamp), b);
          const cur = map.get(key) || { revenue: 0, orders: 0 };
          cur.revenue += Number(total) || 0;
          cur.orders += 1;
          map.set(key, cur);
        }
        const points = [...map.entries()]
          .map(([date, v]) => ({ date, revenue: Number(v.revenue.toFixed(2)), orders: v.orders }))
          .sort((a, c) => a.date.localeCompare(c.date));
        res.json({ bucket: b, points });
      } catch {
        res.json({ bucket: b, points: [] });
      }
    },

    // Popular pairings — which two items most often appear on the same bill.
    // Pure reporting: computed fresh from completed orders, no recommendation
    // engine involved and nothing fed back into it.
    async getPairings(req, res) {
      const { from, to } = req.query;
      try {
        const db = getPrisma();
        const where = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const orders = await db.order.findMany({
          where,
          select: { items: { select: { name: true, price: true, quantity: true } } }
        });
        const pairs = new Map(); // "A|B" (alpha-sorted) -> { a, b, count, revenue }
        for (const order of orders) {
          const names = [...new Set(order.items.map(i => i.name))];
          for (let i = 0; i < names.length; i++) {
            for (let j = i + 1; j < names.length; j++) {
              const [a, b] = [names[i], names[j]].sort();
              const key = `${a}|${b}`;
              const itemA = order.items.find(it => it.name === a);
              const itemB = order.items.find(it => it.name === b);
              const lineRevenue = (Number(itemA?.price) || 0) * (Number(itemA?.quantity) || 1)
                + (Number(itemB?.price) || 0) * (Number(itemB?.quantity) || 1);
              const cur = pairs.get(key) || { a, b, count: 0, revenue: 0 };
              cur.count += 1;
              cur.revenue += lineRevenue;
              pairs.set(key, cur);
            }
          }
        }
        const top = [...pairs.values()]
          .filter(p => p.count > 1) // a pairing needs to have actually repeated to be "popular"
          .sort((x, y) => y.count - x.count || y.revenue - x.revenue)
          .slice(0, 10)
          .map(p => ({ a: p.a, b: p.b, count: p.count, revenue: Number(p.revenue.toFixed(2)) }));
        res.json(top);
      } catch {
        res.json([]);
      }
    },

    // Customer journey for a single table — built fresh from Order/OrderItem for
    // its most recent order (active if one exists, else the latest history one).
    // Pure reporting: classification reuses the shared categoryClassifier, nothing
    // here reads or writes recommendation-engine state.
    async getJourney(req, res) {
      const tableId = getCanonicalTableId(req.query.tableId || '');
      if (!tableId) return res.status(400).json({ error: 'tableId required' });
      try {
        const db = getPrisma();
        const active = await db.order.findFirst({
          where: { restaurantId, tableId, status: 'active' },
          orderBy: { timestamp: 'desc' },
          include: { items: true }
        });
        const order = active || await db.order.findFirst({
          where: { restaurantId, tableId, status: 'history' },
          orderBy: { timestamp: 'desc' },
          include: { items: true }
        });
        if (!order) return res.json({ tableId, found: false });

        const buckets = { drink: [], starter: [], main: [], dessert: [], coffee: [] };
        for (const item of order.items) {
          const type = categoryType(item.name);
          if (type === 'STARTER') buckets.starter.push(item.name);
          else if (type === 'DESSERT') buckets.dessert.push(item.name);
          else if (type === 'MAIN') buckets.main.push(item.name);
          else if (type === 'WINE' || type === 'DRINK') {
            (beverageKind(item.name) === 'HOT' ? buckets.coffee : buckets.drink).push(item.name);
          }
        }

        const [rating, waiter, recoEvent] = await Promise.all([
          db.orderRating.findUnique({ where: { orderId: order.id } }).catch(() => null),
          db.waiterAssignment.findFirst({ where: { restaurantId, tableId, status: 'active' }, orderBy: { assignedAt: 'desc' } }).catch(() => null),
          db.recommendationEvent.findFirst({
            where: { restaurantId, eventType: 'accepted', sessionId: { contains: tableId } },
            orderBy: { createdAt: 'desc' }
          }).catch(() => null)
        ]);

        const steps = [
          { key: 'entered', label: 'Guest seated', done: true, detail: waiter?.waiterName ? `Served by ${waiter.waiterName}` : '' },
          { key: 'drink', label: 'Drink ordered', done: buckets.drink.length > 0, items: buckets.drink },
          { key: 'starter', label: 'Starter', done: buckets.starter.length > 0, items: buckets.starter },
          { key: 'main', label: 'Main course', done: buckets.main.length > 0, items: buckets.main },
          { key: 'dessert', label: 'Dessert', done: buckets.dessert.length > 0, items: buckets.dessert },
          { key: 'coffee', label: 'Coffee / digestif', done: buckets.coffee.length > 0, items: buckets.coffee },
          { key: 'recommendation', label: `${req.query.assistantLabel || 'AI'} recommendation accepted`, done: Boolean(recoEvent), detail: recoEvent?.recommendedName || '' },
          { key: 'billPaid', label: 'Bill settled', done: order.status === 'history' },
        ];

        res.json({
          tableId, found: true, status: order.status, timestamp: order.timestamp, total: order.total,
          waiterName: waiter?.waiterName || order.waiterName || '', rating: rating?.rating || null,
          steps
        });
      } catch (err) {
        res.status(500).json({ tableId, found: false, error: err.message });
      }
    },

    // Orders + revenue distributed across the days of the week (for staffing).
    async getDayOfWeek(req, res) {
      const { from, to } = req.query;
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      try {
        const db = getPrisma();
        const where = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const orders = await db.order.findMany({ where, select: { timestamp: true, total: true } });
        const counts = new Array(7).fill(0);
        const revenue = new Array(7).fill(0);
        for (const { timestamp, total } of orders) {
          const d = new Date(timestamp).getDay();
          counts[d] += 1;
          revenue[d] += Number(total) || 0;
        }
        res.json(labels.map((label, dow) => ({
          dow, label, count: counts[dow], revenue: Number(revenue[dow].toFixed(2))
        })));
      } catch {
        res.json(labels.map((label, dow) => ({ dow, label, count: 0, revenue: 0 })));
      }
    }
  };
}

module.exports = { createAnalyticsController };
