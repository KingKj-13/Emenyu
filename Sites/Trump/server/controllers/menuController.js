function createMenuController({ fileService, socketService, mediaEnrichmentService, prismaMenuService }) {
  return {
    async getMenu(req, res) {
      const menu = await fileService.loadMenu();
      res.json(menu);
    },

    async deleteItem(req, res) {
      const { id } = req.params;
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service) return res.status(503).json({ error: 'Not available' });
      const ok = await service.withPrisma('menu_delete_item_failed', async prisma => {
        await prisma.menuItem.delete({ where: { id: Number(id) } });
        return true;
      }, false);
      if (!ok) return res.status(500).json({ error: 'Delete failed' });
      socketService.emitMenuUpdated();
      res.json({ ok: true });
    },

    async bulkItemAction(req, res) {
      const { action, ids } = req.body;
      if (!['hide', 'show', 'delete'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid action or ids' });
      }
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service) return res.status(503).json({ error: 'Not available' });
      const numIds = ids.map(Number);
      const ok = await service.withPrisma('menu_bulk_action_failed', async prisma => {
        if (action === 'delete') {
          await prisma.menuItem.deleteMany({ where: { id: { in: numIds } } });
        } else {
          await prisma.menuItem.updateMany({ where: { id: { in: numIds } }, data: { visible: action === 'show' } });
        }
        return true;
      }, false);
      if (!ok) return res.status(500).json({ error: 'Bulk action failed' });
      socketService.emitMenuUpdated();
      res.json({ ok: true, count: numIds.length });
    },

    async getAdminItems(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service) return res.status(503).json({ error: 'Not available' });
      const items = await service.loadAdminItems();
      if (!items) return res.status(503).json({ error: 'Database unavailable' });
      res.json(items);
    },

    async getCategories(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service?.listCategories) return res.status(503).json({ error: 'Not available' });
      const categories = await service.listCategories();
      res.json(categories || []);
    },

    async createItem(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service?.createItem) return res.status(503).json({ error: 'Not available' });

      const { name, category } = req.body || {};
      if (!String(name || '').trim() || !String(category || '').trim()) {
        return res.status(400).json({ error: 'name and category are required' });
      }

      const item = await service.createItem(req.body || {});
      if (!item) return res.status(500).json({ error: 'Failed to create item' });

      socketService.emitMenuUpdated();
      res.status(201).json({ ok: true, item });
    },

    async toggleAvailability(req, res) {
      const { id } = req.params;
      const available = req.body?.available !== false;
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service) return res.status(503).json({ error: 'Not available' });
      const ok = await service.toggleItemAvailability(Number(id), available);
      if (!ok) return res.status(500).json({ error: 'Failed to update availability' });
      socketService.emitMenuUpdated();
      res.json({ ok: true, id: Number(id), available });
    },

    async updateItemMedia(req, res) {
      const { id } = req.params;
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service?.updateItemMedia) return res.status(503).json({ error: 'Not available' });

      const updated = await service.updateItemMedia(Number(id), req.body || {});
      if (!updated) return res.status(500).json({ error: 'Failed to update item media' });

      socketService.emitMenuUpdated();
      res.json({ ok: true, item: updated });
    },

    async saveMenu(req, res) {
      try {
        await fileService.saveMenu(req.body);
        socketService.emitMenuUpdated();
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Menu save failed' });
      }
    },

    async getRecommendations(req, res) {
      const recommendations = await fileService.loadRecommendations();
      res.json(recommendations);
    },

    async saveRecommendations(req, res) {
      try {
        await fileService.saveRecommendations(req.body);
        socketService.emitRecommendationUpdated();
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Recommendation save failed' });
      }
    },

    async getMediaStatus(req, res) {
      try {
        const status = await mediaEnrichmentService.getStatus('trump');
        res.json(status);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },

    async triggerMediaEnrich(req, res) {
      try {
        const { limit = 20 } = req.body || {};
        const result = await mediaEnrichmentService.enrichBatch({ limit, restaurantId: 'trump', retry: false });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },

    async retryMediaEnrich(req, res) {
      try {
        const { limit = 20 } = req.body || {};
        const result = await mediaEnrichmentService.enrichBatch({ limit, restaurantId: 'trump', retry: true });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },
  };
}

module.exports = {
  createMenuController
};
