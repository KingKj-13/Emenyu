const zlib = require('zlib');
const crypto = require('crypto');

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

function createMenuController({ fileService, socketService, mediaEnrichmentService, prismaMenuService, config, localizationService = null }) {
  // Phase 05 — menu response cache. MEASURED: an uncached GET /api/menu re-runs
  // loadMenu (Prisma load + deserialization of ~440 items, ~150ms warm) on EVERY
  // request, capping throughput at ~12 req/s and ballooning latency to ~800ms p50
  // at 10 concurrent (it is CPU/event-loop bound, not DB bound). The menu changes
  // only on owner edits, which already emit emitMenuUpdated → _notifyDataChange('menu').
  // We cache the serialized JSON + a precomputed gzip buffer + ETag, invalidated on
  // any menu mutation, with a 60s TTL backstop for out-of-band changes.
  const MENU_CACHE_TTL_MS = 60 * 1000;
  // Keyed by locale. The German menu and the English menu are different
  // payloads with different ETags, so one shared slot would serve whichever
  // language happened to warm the cache first to everybody — the exact bug a
  // naive `?locale=` bolt-on produces.
  const menuCaches = new Map();   // locale -> { json, gzip, etag, builtAt }
  const menuRebuilds = new Map(); // locale -> Promise (single-flight, per locale)

  function buildMenuCache(menu) {
    const json = JSON.stringify(menu);
    const gzip = zlib.gzipSync(json);
    const etag = `W/"menu-${crypto.createHash('sha1').update(json).digest('base64url').slice(0, 24)}"`;
    return { json, gzip, etag, builtAt: Date.now() };
  }

  function invalidateMenuCache() { menuCaches.clear(); }

  function freshCache(locale) {
    const entry = menuCaches.get(locale);
    return entry && Date.now() - entry.builtAt <= MENU_CACHE_TTL_MS ? entry : null;
  }

  // Return a fresh cache, building it AT MOST ONCE across concurrent callers. The
  // 199 other requests during a cold rebuild await the same promise (no stampede).
  async function ensureMenuCache(locale) {
    const fresh = freshCache(locale);
    if (fresh) return fresh;
    let rebuild = menuRebuilds.get(locale);
    if (!rebuild) {
      rebuild = (async () => {
        try {
          // Ids are stamped so translations can be applied per item and so the
          // client can reference a dish for its gallery or a view event.
          const menu = await fileService.loadMenu({ includeIds: true });
          if (menu == null) return null;
          let payload = menu;
          if (localizationService && locale !== localizationService.DEFAULT_LOCALE) {
            const translations = await localizationService.loadTranslations(locale);
            // No rows for this locale yet: serve English rather than blanks.
            if (translations) payload = localizationService.localizeMenu(menu, translations);
          }
          const built = buildMenuCache(payload);
          menuCaches.set(locale, built);
          return built;
        } finally {
          menuRebuilds.delete(locale);
        }
      })();
      menuRebuilds.set(locale, rebuild);
    }
    return rebuild;
  }

  // Invalidate immediately on any menu data-change (covers all 7 mutation paths).
  if (socketService && typeof socketService.onDataChange === 'function') {
    socketService.onDataChange(scope => { if (scope === 'menu') invalidateMenuCache(); });
  }

  return {
    async getMenu(req, res) {
      const locale = localizationService
        ? localizationService.normalizeLocale(req.query.locale)
        : 'en';
      const cache = await ensureMenuCache(locale);
      // Don't cache empty/misses — let an empty menu be re-attempted next request.
      if (!cache) return res.json(null);
      const { json, gzip, etag } = cache;
      res.set('ETag', etag);
      res.set('Cache-Control', 'public, max-age=30');
      res.set('Vary', 'Accept-Encoding, Origin');
      res.set('Content-Language', locale);
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
        const status = await mediaEnrichmentService.getStatus(config.restaurantId);
        res.json(status);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },

    async triggerMediaEnrich(req, res) {
      try {
        const { limit = 20 } = req.body || {};
        const result = await mediaEnrichmentService.enrichBatch({ limit, restaurantId: config.restaurantId, retry: false });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },

    async retryMediaEnrich(req, res) {
      try {
        const { limit = 20 } = req.body || {};
        const result = await mediaEnrichmentService.enrichBatch({ limit, restaurantId: config.restaurantId, retry: true });
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
