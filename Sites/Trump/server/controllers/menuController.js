const REC_TYPES = new Set(['DISH', 'SIDE', 'DESSERT', 'BEVERAGE']);
const BEVERAGE_KINDS = new Set(['WINE', 'COCKTAIL', 'BEER', 'SOFT', 'HOT', 'NONE']);

// Validate + coerce a chef-recommendation payload. `partial` allows PATCH updates.
function sanitizeChefRec(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.sourceItemId !== undefined) {
    const s = Number(body.sourceItemId);
    if (!Number.isInteger(s)) return { error: 'sourceItemId must be an integer item id' };
    out.sourceItemId = s;
  }
  if (!partial || body.targetItemId !== undefined) {
    const t = Number(body.targetItemId);
    if (!Number.isInteger(t)) return { error: 'targetItemId must be an integer item id' };
    out.targetItemId = t;
  }
  if (!partial || body.recType !== undefined) {
    const rt = String(body.recType || '').toUpperCase();
    if (!REC_TYPES.has(rt)) return { error: 'recType must be DISH | SIDE | DESSERT | BEVERAGE' };
    out.recType = rt;
  }
  if (body.beverageKind !== undefined) {
    const bk = String(body.beverageKind || 'NONE').toUpperCase();
    if (!BEVERAGE_KINDS.has(bk)) return { error: 'invalid beverageKind' };
    out.beverageKind = bk;
  }
  if (body.priority !== undefined) {
    const p = Number(body.priority);
    if (!Number.isFinite(p)) return { error: 'priority must be a number' };
    out.priority = Math.trunc(p);
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.season !== undefined) out.season = String(body.season || 'ALL_YEAR');
  if (body.rotationGroup !== undefined) out.rotationGroup = String(body.rotationGroup || '');
  if (body.reason !== undefined) out.reason = String(body.reason || '');
  if (body.createdBy !== undefined) out.createdBy = String(body.createdBy || 'system');
  if (body.startsAt !== undefined) out.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) out.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  return { value: out };
}

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
      // Scope the delete to this tenant so an admin can never remove another
      // restaurant's item by id (defence-in-depth — reads are already scoped).
      const count = await service.withPrisma('menu_delete_item_failed', async prisma => {
        const result = await prisma.menuItem.deleteMany({
          where: { id: Number(id), restaurantId: service.restaurantId }
        });
        return result.count;
      }, null);
      if (count === null) return res.status(500).json({ error: 'Delete failed' });
      if (count === 0) return res.status(404).json({ error: 'Item not found' });
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
      // Scope to this tenant so a bulk action can never touch another restaurant's
      // items, even if a foreign id is passed in. Report the real affected count.
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

    async updateItem(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
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

    // ── Owner controls: chef recommendation management (Phase 3, Task 8) ──────────
    async getChefRecommendations(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service?.listChefRecommendationsAdmin) return res.status(503).json({ error: 'Not available' });
      const rows = await service.listChefRecommendationsAdmin();
      res.json(rows || []);
    },

    async createChefRecommendation(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service?.createChefRecommendation) return res.status(503).json({ error: 'Not available' });
      const parsed = sanitizeChefRec(req.body || {}, { partial: false });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      if (!parsed.value.createdBy && req.user?.username) parsed.value.createdBy = req.user.username;
      const created = await service.createChefRecommendation(parsed.value);
      if (!created) return res.status(500).json({ error: 'Create failed (duplicate or database unavailable)' });
      socketService.emitRecommendationUpdated();
      res.status(201).json({ ok: true, recommendation: created });
    },

    async updateChefRecommendation(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service?.updateChefRecommendation) return res.status(503).json({ error: 'Not available' });
      const parsed = sanitizeChefRec(req.body || {}, { partial: true });
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const updated = await service.updateChefRecommendation(req.params.id, parsed.value);
      if (!updated) return res.status(500).json({ error: 'Update failed' });
      socketService.emitRecommendationUpdated();
      res.json({ ok: true, recommendation: updated });
    },

    async deleteChefRecommendation(req, res) {
      const service = prismaMenuService || fileService?.prismaMenu;
      if (!service?.deleteChefRecommendation) return res.status(503).json({ error: 'Not available' });
      const ok = await service.deleteChefRecommendation(req.params.id);
      if (!ok) return res.status(500).json({ error: 'Delete failed' });
      socketService.emitRecommendationUpdated();
      res.json({ ok: true });
    },
  };
}

module.exports = {
  createMenuController
};
