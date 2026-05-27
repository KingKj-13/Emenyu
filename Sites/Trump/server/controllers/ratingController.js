const { PrismaClient } = require('@prisma/client');

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function createRatingController({ config }) {
  const restaurantId = config?.restaurantId || 'trump';

  return {
    async submitRating(req, res) {
      const { orderId, tableId, rating, comment } = req.body || {};
      if (!orderId || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'orderId and rating (1-5) are required' });
      }
      try {
        const db = getPrisma();
        const row = await db.orderRating.upsert({
          where: { orderId: Number(orderId) },
          create: {
            restaurantId,
            orderId: Number(orderId),
            tableId: String(tableId || ''),
            rating: Number(rating),
            comment: String(comment || '').trim()
          },
          update: {
            rating: Number(rating),
            comment: String(comment || '').trim()
          }
        });
        res.json(row);
      } catch {
        res.status(500).json({ error: 'Failed to submit rating' });
      }
    },

    async getRatings(req, res) {
      const { from, to } = req.query;
      try {
        const db = getPrisma();
        const where = { restaurantId };
        if (from || to) {
          where.createdAt = {};
          if (from) where.createdAt.gte = new Date(from);
          if (to) where.createdAt.lte = new Date(to);
        }
        const [rows, agg] = await Promise.all([
          db.orderRating.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { id: true, rating: true, comment: true, tableId: true, createdAt: true }
          }),
          db.orderRating.aggregate({ where, _avg: { rating: true }, _count: { id: true } })
        ]);
        res.json({
          average: Number((agg._avg.rating || 0).toFixed(1)),
          count: agg._count.id || 0,
          recent: rows
        });
      } catch {
        res.json({ average: 0, count: 0, recent: [] });
      }
    }
  };
}

module.exports = { createRatingController };
