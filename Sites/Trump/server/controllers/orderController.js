const path = require('path');

const { tableIdFromFilename } = require('../utils/helpers');

function createOrderController({ config, fileService, socketService, orderValidationService }) {
  return {
    serveAdminPage(req, res) {
      res.sendFile(path.join(config.directories.base, 'admin.html'));
    },

    redirectRoot(req, res) {
      res.redirect('/Trump/table1');
    },

    serveMenuPage(req, res, next) {
      if (req.params.tableId && req.params.tableId.includes('.')) {
        return next();
      }

      return res.sendFile(path.join(config.directories.base, 'client', 'dist', 'index.html'));
    },

    async submitOrder(req, res) {
      let validated;
      try {
        // Server-authoritative validation: rejects unknown/unavailable items,
        // bad quantities, and invalid tables; recomputes prices + totals from the
        // live menu so client-supplied pricing is never trusted.
        validated = await orderValidationService.validateOrder(req.body, { requireTotals: true });
      } catch (error) {
        const status = error.statusCode === 503 ? 503 : 400;
        return res.status(status).json({ error: error.message || 'Invalid order', details: error.details || [] });
      }

      const { order: storedOrder, tableId } = validated;

      try {
        await fileService.saveOrder(storedOrder, tableId);
        await socketService.replaceTableCart(tableId, [], { emit: true });
        await socketService.emitTableHistory(tableId);
        socketService.emitOrderPlaced(storedOrder);
        return res.json({ ok: true });
      } catch {
        return res.status(500).json({ error: 'Save failed' });
      }
    },

    async listOrders(req, res) {
      const orders = await fileService.listOrders('orders');
      res.json(orders);
    },

    async listHistory(req, res) {
      const history = await fileService.listOrders('history');
      res.json(history);
    },

    async markComplete(req, res) {
      const actor = req.user?.username || 'admin';
      try {
        const filename = await fileService.moveOrder('orders', 'history', req.body.filename, actor);
        socketService.emitOrderUpdated();
        await socketService.emitTableHistory(tableIdFromFilename(filename));
        return res.json({ ok: true });
      } catch {
        return res.status(500).json({ error: 'Move failed' });
      }
    },

    async markIncomplete(req, res) {
      const actor = req.user?.username || 'admin';
      try {
        const filename = await fileService.moveOrder('history', 'orders', req.body.filename, actor);
        socketService.emitOrderUpdated();
        await socketService.emitTableHistory(tableIdFromFilename(filename));
        return res.json({ ok: true });
      } catch {
        return res.status(500).json({ error: 'Move failed' });
      }
    },

    async deleteOrder(req, res) {
      const type = req.params.type === 'history' ? 'history' : 'orders';
      const actor = req.user?.username || 'admin';

      try {
        const filename = await fileService.deleteOrder(type, req.params.file, actor);
        socketService.emitOrderUpdated();
        if (type === 'orders') {
          await socketService.emitTableHistory(tableIdFromFilename(filename));
        }
        return res.json({ ok: true });
      } catch {
        return res.status(500).json({ error: 'Delete failed' });
      }
    }
  };
}

module.exports = {
  createOrderController
};
