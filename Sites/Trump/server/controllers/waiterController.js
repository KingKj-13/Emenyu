const path = require('path');

const { normalizeId } = require('../utils/helpers');
const { PrismaClient } = require('@prisma/client');

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function getItemQuantity(item) {
  return Number(item.quantity || item.qty || 1);
}

function getItemsTotal(items) {
  return items.reduce((sum, item) => sum + (Number(item.price) || 0) * getItemQuantity(item), 0);
}

function getItemsCount(items) {
  return items.reduce((sum, item) => sum + getItemQuantity(item), 0);
}

function createWaiterController({ config, fileService, socketService }) {
  return {
    serveWaiterPage(req, res) {
      // The waiter app is now the React SPA (client/dist). React Router (basename
      // "/Trump") renders the /Waiter route. The legacy waiter.html is retired.
      const spaIndex = path.join(config.directories.base, 'client', 'dist', 'index.html');
      res.sendFile(spaIndex, err => {
        if (err) res.sendFile(path.join(config.directories.base, 'waiter.html'));
      });
    },

    async getTableStatus(req, res) {
      const cleanId = normalizeId(req.params.tableId);
      const state = await socketService.getTableState(cleanId);
      const cart = Array.isArray(state.cart) ? state.cart : await fileService.loadTableCart(cleanId);
      const activeOrders = await fileService.getTableActiveOrders(cleanId);
      const orderCount = getItemsCount(cart) + getItemsCount(activeOrders);
      const total = getItemsTotal(cart) + getItemsTotal(activeOrders);

      let oldestOrderAt = null;
      try {
        const db = getPrisma();
        const oldest = await db.order.findFirst({
          where: { tableId: cleanId, restaurantId: config.restaurantId, status: 'active' },
          orderBy: { timestamp: 'asc' },
          select: { timestamp: true }
        });
        if (oldest) oldestOrderAt = oldest.timestamp.toISOString();
      } catch {}

      res.json({
        status: orderCount > 0 ? 'active' : 'empty',
        orderCount,
        total,
        oldestOrderAt
      });
    },

    async addItems(req, res) {
      const { tableId, items, waiterName, notes } = req.body || {};
      if (!tableId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Missing tableId or items' });
      }

      const cleanId = normalizeId(tableId);
      const actor = req.user?.username || waiterName || 'waiter';
      const order = {
        table_number: cleanId,
        waiterName: waiterName || actor,
        notes: notes || '',
        items,
        timestamp: new Date().toISOString(),
        restaurantId: config.restaurantId
      };

      try {
        await fileService.saveOrder(order, cleanId);
        await socketService.replaceTableCart(cleanId, [], { emit: true });
        await socketService.emitTableHistory(cleanId);
        socketService.emitOrderPlaced(order);
        return res.json({ ok: true });
      } catch {
        return res.status(500).json({ error: 'Failed to save order' });
      }
    },

    async getTableCarts(req, res) {
      const TABLE_COUNT = 15;
      const tables = Array.from({ length: TABLE_COUNT }, (_, i) => `table${i + 1}`);
      const results = await Promise.all(
        tables.map(async tableId => {
          const state = await socketService.getTableState(tableId);
          const cart = Array.isArray(state.cart) ? state.cart : [];
          const overrides = Array.isArray(state.adminOverrides) ? state.adminOverrides : [];
          const total = cart.reduce((sum, item) =>
            sum + (Number(item.price) || 0) * (Number(item.quantity || item.qty) || 1), 0);
          return { tableId, cart, overrides, itemCount: cart.length, total };
        })
      );
      res.json(results);
    },

    async archiveTable(req, res) {
      const { tableId } = req.body;
      if (!tableId) {
        return res.status(400).json({ error: 'Missing tableId' });
      }

      const cleanId = normalizeId(tableId);
      const actor = req.user?.username || 'waiter';

      try {
        const archivedCount = await fileService.archiveTable(cleanId, actor);
        await socketService.resetTableState(cleanId, {
          preserveAdminOverrides: false,
          emit: true
        });
        await socketService.emitTableHistory(cleanId);
        socketService.emitOrderUpdated();
        return res.json({ ok: true, archivedCount });
      } catch {
        return res.status(500).json({ error: 'Archive failed' });
      }
    }
  };
}

module.exports = {
  createWaiterController
};
