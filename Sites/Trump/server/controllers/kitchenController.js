// Shared, explicitly-resolved Prisma client (avoids the local @prisma/client stub
// silently failing kitchen status updates).
const { getPrisma } = require('../services/prismaClient');

// The only legal forward path for a ticket. A transition is allowed iff the new
// status is exactly the next step for the order's current status — no skips
// (new → served) and no going backwards (ready → preparing).
const STATUS_FLOW = { new: 'preparing', preparing: 'ready', ready: 'served' };

function createKitchenController({ config, fileService, socketService }) {
  return {
    async getOrders(req, res) {
      try {
        const db = getPrisma();
        const orders = await db.order.findMany({
          where: {
            restaurantId: config.restaurantId,
            status: 'active'
          },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { timestamp: 'asc' }
        });
        return res.json(orders);
      } catch {
        const fallback = await fileService.listOrders('orders');
        return res.json(fallback);
      }
    },

    async updateKitchenStatus(req, res) {
      const { id } = req.params;
      const { kitchenStatus } = req.body;
      const validStatuses = ['new', 'preparing', 'ready', 'served'];
      if (!validStatuses.includes(kitchenStatus)) {
        return res.status(400).json({ error: 'Invalid kitchenStatus' });
      }

      try {
        const db = getPrisma();
        const existing = await db.order.findUnique({
          where: { id: Number(id) },
          select: { kitchenStatus: true }
        });
        if (!existing) {
          return res.status(404).json({ error: 'Order not found' });
        }

        // Enforce the forward-only flow: new → preparing → ready → served.
        const expected = STATUS_FLOW[existing.kitchenStatus];
        if (kitchenStatus !== expected) {
          return res.status(409).json({
            error: 'Illegal kitchen status transition',
            from: existing.kitchenStatus,
            to: kitchenStatus,
            allowed: expected || null
          });
        }

        const order = await db.order.update({
          where: { id: Number(id) },
          data: { kitchenStatus },
          include: { items: true }
        });

        socketService.emitKitchenStatusUpdate(order.id, order.tableId, kitchenStatus, order);

        if (kitchenStatus === 'served') {
          const actor = req.user?.username || 'kitchen';
          await fileService.moveOrder('orders', 'history', order.filename, actor).catch(() => {});
          socketService.emitOrderUpdated();
          await socketService.emitTableHistory(order.tableId).catch(() => {});
        }

        return res.json({ ok: true, kitchenStatus });
      } catch (err) {
        return res.status(500).json({ error: 'Update failed' });
      }
    }
  };
}

module.exports = { createKitchenController };
