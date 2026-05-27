const { PrismaClient } = require('@prisma/client');

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

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
