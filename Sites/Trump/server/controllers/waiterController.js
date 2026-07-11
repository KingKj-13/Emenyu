const path = require('path');

const { normalizeId } = require('../utils/helpers');
// Shared, explicitly-resolved Prisma client (see prismaClient.js).
const { getPrisma } = require('../services/prismaClient');

function getItemQuantity(item) {
  return Number(item.quantity || item.qty || 1);
}

function getItemsTotal(items) {
  return items.reduce((sum, item) => sum + (Number(item.price) || 0) * getItemQuantity(item), 0);
}

function getItemsCount(items) {
  return items.reduce((sum, item) => sum + getItemQuantity(item), 0);
}

function createWaiterController({ config, fileService, socketService, orderValidationService }) {
  return {
    serveWaiterPage(req, res) {
      // The waiter app is the React SPA (client/dist). React Router (basename
      // config.publicBasePath) renders the /Waiter route.
      res.sendFile(path.join(config.directories.base, 'client', 'dist', 'index.html'));
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

      let validated;
      try {
        // Same authoritative menu validation as guest orders (item existence,
        // availability, quantity bounds, server-side prices). Totals are not
        // required for waiter-entered orders.
        validated = await orderValidationService.validateOrder(
          { items, table_number: tableId },
          { requireTotals: false, tableId }
        );
      } catch (error) {
        const status = error.statusCode === 503 ? 503 : 400;
        return res.status(status).json({ error: error.message || 'Invalid order', details: error.details || [] });
      }

      const { order: validatedOrder, tableId: cleanId } = validated;
      const actor = req.user?.username || waiterName || 'waiter';
      const order = {
        ...validatedOrder,
        waiterName: waiterName || actor,
        notes: notes || '',
        timestamp: new Date().toISOString()
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
