const path = require('path');

const { tableIdFromFilename } = require('../utils/helpers');

function createOrderController({ config, fileService, socketService, orderValidationService }) {
  return {
    serveAdminPage(req, res) {
      // Phase 01B: the admin console is the React SPA (client/dist). React Router
      // (basename "/Trump") renders the /Admin route. Served at /Trump/Admin.
      res.sendFile(path.join(config.directories.base, 'client', 'dist', 'index.html'));
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

      // The order SAVE is the only critical step (idempotent + retry-safe, Phase 05A).
      let savedFilename = null;
      try {
        savedFilename = await fileService.saveOrder(storedOrder, tableId);
      } catch {
        return res.status(500).json({ error: 'Save failed' });
      }
      if (!savedFilename) {
        return res.status(500).json({ error: 'Save failed' });
      }

      // Post-save side effects (cart clear + socket emits) are BEST-EFFORT: the order
      // is already persisted, so a failure here must NOT return 500 (which would make
      // the client retry and — pre-idempotency — duplicate). Swallow + continue.
      try {
        await socketService.replaceTableCart(tableId, [], { emit: true });
        await socketService.emitTableHistory(tableId);
        socketService.emitOrderPlaced(storedOrder);
      } catch {
        /* best-effort: order is persisted; live UI will reconcile on next sync */
      }
      return res.json({ ok: true });
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
