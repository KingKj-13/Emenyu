const { PrismaClient } = require('@prisma/client');

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

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
    // Both are over items that sold at least once in the period.
    async getItems(req, res) {
      const { from, to, order } = req.query;
      const dir = order === 'asc' ? 'asc' : 'desc';
      try {
        const db = getPrisma();
        const orderWhere = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const rows = await db.orderItem.groupBy({
          by: ['name'],
          where: { order: orderWhere },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: dir } },
          take: 10
        });
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
          revenue: Number((revMap[r.name] || 0).toFixed(2))
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
