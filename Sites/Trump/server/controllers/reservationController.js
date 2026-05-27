const { PrismaClient } = require('@prisma/client');

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function createReservationController({ config }) {
  const restaurantId = config?.restaurantId || 'trump';

  return {
    async listReservations(req, res) {
      const { date } = req.query;
      try {
        const db = getPrisma();
        const where = { restaurantId };
        if (date) {
          const start = new Date(date);
          start.setHours(0, 0, 0, 0);
          const end = new Date(date);
          end.setHours(23, 59, 59, 999);
          where.date = { gte: start, lte: end };
        }
        const rows = await db.reservation.findMany({
          where,
          orderBy: { date: 'asc' }
        });
        res.json(rows);
      } catch {
        res.json([]);
      }
    },

    async createReservation(req, res) {
      const { name, phone, partySize, date, time, notes } = req.body || {};
      if (!name || !date) return res.status(400).json({ error: 'Name and date are required' });
      try {
        const db = getPrisma();
        const row = await db.reservation.create({
          data: {
            restaurantId,
            name: String(name).trim(),
            phone: String(phone || '').trim(),
            partySize: Number(partySize) || 2,
            date: new Date(date),
            notes: String(notes || '').trim(),
            status: 'pending'
          }
        });
        res.json(row);
      } catch {
        res.status(500).json({ error: 'Failed to create reservation' });
      }
    },

    async updateReservation(req, res) {
      const { id } = req.params;
      const { status, tableId, name, phone, partySize, date, notes } = req.body || {};
      try {
        const db = getPrisma();
        const data = {};
        if (status) data.status = status;
        if (tableId !== undefined) data.tableId = String(tableId);
        if (name) data.name = String(name).trim();
        if (phone !== undefined) data.phone = String(phone).trim();
        if (partySize) data.partySize = Number(partySize);
        if (date) data.date = new Date(date);
        if (notes !== undefined) data.notes = String(notes).trim();
        const row = await db.reservation.update({ where: { id: Number(id) }, data });
        res.json(row);
      } catch {
        res.status(500).json({ error: 'Failed to update reservation' });
      }
    },

    async deleteReservation(req, res) {
      const { id } = req.params;
      try {
        const db = getPrisma();
        await db.reservation.delete({ where: { id: Number(id) } });
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Failed to delete reservation' });
      }
    }
  };
}

module.exports = { createReservationController };
