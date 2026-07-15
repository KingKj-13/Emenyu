const zlib = require('zlib');
const crypto = require('crypto');

function createMenuController({ fileService, socketService, prismaMenuService }) {
  // Menu response cache: GET /api/menu is hit on every page load/refresh, but
  // the menu only changes on an admin edit (which emits emitMenuUpdated).
  // Cache the serialized JSON + gzip + ETag, invalidated on any mutation,
  // with a 60s TTL backstop for out-of-band changes.
  const MENU_CACHE_TTL_MS = 60 * 1000;
  let menuCache = null;   // { json, gzip, etag, builtAt }
  let menuRebuild = null; // single-flight guard against a cold-cache stampede

  function buildMenuCache(menu) {
    const json = JSON.stringify(menu);
    const gzip = zlib.gzipSync(json);
    const etag = `W/"menu-${crypto.createHash('sha1').update(json).digest('base64url').slice(0, 24)}"`;
    return { json, gzip, etag, builtAt: Date.now() };
  }

  function invalidateMenuCache() { menuCache = null; }

  function freshCache() {
    return menuCache && Date.now() - menuCache.builtAt <= MENU_CACHE_TTL_MS ? menuCache : null;
  }

  async function ensureMenuCache() {
    const fresh = freshCache();
    if (fresh) return fresh;
    if (!menuRebuild) {
      menuRebuild = (async () => {
        try {
          const menu = await fileService.loadMenu();
          if (menu != null) menuCache = buildMenuCache(menu);
          return menu != null ? menuCache : null;
        } finally {
          menuRebuild = null;
        }
      })();
    }
    return menuRebuild;
  }

  if (socketService && typeof socketService.onDataChange === 'function') {
    socketService.onDataChange(scope => { if (scope === 'menu') invalidateMenuCache(); });
  }

  function menuService() {
    return prismaMenuService || fileService?.prismaMenu;
  }

  return {
    async getMenu(req, res) {
      const cache = await ensureMenuCache();
      if (!cache) return res.json(null);
      const { json, gzip, etag } = cache;
      res.set('ETag', etag);
      res.set('Cache-Control', 'public, max-age=30');
      res.set('Vary', 'Accept-Encoding, Origin');
      res.type('application/json');
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        res.set('Content-Encoding', 'gzip');
        return res.send(gzip);
      }
      return res.send(json);
    },

    async deleteItem(req, res) {
      const { id } = req.params;
      const service = menuService();
      if (!service) return res.status(503).json({ error: 'Not available' });
      const ok = await service.deleteItem(id);
      if (!ok) return res.status(404).json({ error: 'Item not found' });
      socketService.emitMenuUpdated();
      res.json({ ok: true });
    },

    async bulkItemAction(req, res) {
      const { action, ids } = req.body;
      if (!['hide', 'show', 'delete'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid action or ids' });
      }
      const service = menuService();
      if (!service) return res.status(503).json({ error: 'Not available' });
      const numIds = ids.map(Number);
      const count = await service.withPrisma('menu_bulk_action_failed', async prisma => {
        const where = { id: { in: numIds }, restaurantId: service.restaurantId };
        const result = action === 'delete'
          ? await prisma.menuItem.deleteMany({ where })
          : await prisma.menuItem.updateMany({ where, data: { visible: action === 'show' } });
        return result.count;
      }, null);
      if (count === null) return res.status(500).json({ error: 'Bulk action failed' });
      socketService.emitMenuUpdated();
      res.json({ ok: true, count });
    },

    async getAdminItems(req, res) {
      const service = menuService();
      if (!service) return res.status(503).json({ error: 'Not available' });
      const items = await service.loadAdminItems();
      if (!items) return res.status(503).json({ error: 'Database unavailable' });
      res.json(items);
    },

    async getCategories(req, res) {
      const service = menuService();
      if (!service?.listCategories) return res.status(503).json({ error: 'Not available' });
      const categories = await service.listCategories();
      res.json(categories || []);
    },

    // STEP 6 — admin creates a new (initially empty) category.
    async createCategory(req, res) {
      const service = menuService();
      if (!service?.createCategory) return res.status(503).json({ error: 'Not available' });
      const category = await service.createCategory(req.body?.title);
      if (!category) return res.status(400).json({ error: 'title is required' });
      socketService.emitMenuUpdated();
      res.status(201).json({ ok: true, category });
    },

    // STEP 6 — admin reorders categories: body is { orderedIds: [id, id, ...] }.
    async reorderCategories(req, res) {
      const service = menuService();
      if (!service?.reorderCategories) return res.status(503).json({ error: 'Not available' });
      const ok = await service.reorderCategories(req.body?.orderedIds);
      if (!ok) return res.status(400).json({ error: 'orderedIds must be a non-empty array of category ids' });
      socketService.emitMenuUpdated();
      res.json({ ok: true });
    },

    async createItem(req, res) {
      const service = menuService();
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

    async updateItem(req, res) {
      const service = menuService();
      if (!service?.updateItem) return res.status(503).json({ error: 'Not available' });

      const body = req.body || {};
      if (Object.prototype.hasOwnProperty.call(body, 'name') && !String(body.name || '').trim()) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }

      const item = await service.updateItem(req.params.id, body);
      if (!item) return res.status(500).json({ error: 'Failed to update item' });

      socketService.emitMenuUpdated();
      res.json({ ok: true, item });
    },

    async toggleAvailability(req, res) {
      const { id } = req.params;
      const available = req.body?.available !== false;
      const service = menuService();
      if (!service) return res.status(503).json({ error: 'Not available' });
      const ok = await service.toggleItemAvailability(Number(id), available);
      if (!ok) return res.status(500).json({ error: 'Failed to update availability' });
      socketService.emitMenuUpdated();
      res.json({ ok: true, id: Number(id), available });
    },

    async updateItemMedia(req, res) {
      const { id } = req.params;
      const service = menuService();
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
    }
  };
}

module.exports = {
  createMenuController
};
