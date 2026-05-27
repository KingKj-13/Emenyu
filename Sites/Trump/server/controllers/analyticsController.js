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
            _sum: { total: true },
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
        res.json({
          orderCount: agg._count.id || 0,
          revenue: Number((agg._sum.total || 0).toFixed(2)),
          avgOrderValue: Number((agg._avg.total || 0).toFixed(2)),
          topTable: topTables[0]?.tableId || null,
          topTableRevenue: Number((topTables[0]?._sum?.total || 0).toFixed(2))
        });
      } catch {
        res.json({ orderCount: 0, revenue: 0, avgOrderValue: 0, topTable: null, topTableRevenue: 0 });
      }
    },

    async getItems(req, res) {
      const { from, to } = req.query;
      try {
        const db = getPrisma();
        const orderWhere = { restaurantId, status: 'history', ...parseDateRange(from, to) };
        const rows = await db.orderItem.groupBy({
          by: ['name'],
          where: { order: orderWhere },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
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
    }
  };
}

module.exports = { createAnalyticsController };
