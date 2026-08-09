/**
 * Owner-editable content: media galleries, translations, and the butchery
 * chart's cuts.
 *
 * The point of this module is that a restaurant can change what guests see —
 * add a video to a steak, reorder photographs, translate a dish into Korean,
 * relabel a primal — without a deploy and without a developer.
 *
 * Everything here is scoped to one restaurant and validated before it touches
 * the database: an admin session is trusted to be staff, not to be careful.
 */

const ENTITY_TYPES = new Set(['MENU_ITEM', 'MENU_CATEGORY', 'COW_CUT']);
const MEDIA_KINDS = new Set(['IMAGE', 'VIDEO']);
const TRANSLATABLE = {
  MENU_ITEM: new Set(['name', 'description', 'story', 'subtitle']),
  MENU_CATEGORY: new Set(['title', 'intro']),
  COW_CUT: new Set(['name', 'altName', 'description', 'texture']),
};
const MATCH_TYPES = new Set(['PRIMARY', 'RELATED']);

const MAX_URL = 500;
const MAX_TEXT = 4000;

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * Media URLs are either a path under the tenant's own static mounts or an
 * absolute http(s) URL. Anything else — `javascript:`, `data:`, a protocol
 * relative `//evil.example` — is refused: these strings end up in `src`
 * attributes on a guest's device.
 */
function safeMediaUrl(raw) {
  const url = clean(raw, MAX_URL);
  if (!url) return null;
  if (url.startsWith('//')) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^[\w.\-/]+$/.test(url)) return url;      // bare relative path
  return null;
}

function createContentAdminService({ prismaMenuService, socketService = null, logger = null } = {}) {
  const restaurantId = prismaMenuService?.restaurantId || 'trump';

  function withPrisma(event, op, fallback = null) {
    if (!prismaMenuService) return Promise.resolve(fallback);
    return prismaMenuService.withPrisma(event, op, fallback);
  }

  // Menu content changed → the per-locale menu cache must be dropped, or an
  // owner's edit stays invisible for up to a minute.
  function invalidateMenu() {
    try { socketService?.emitMenuUpdated?.(); } catch (err) { logger?.warn?.({ err }, 'menu invalidate failed'); }
  }

  /* ── media ───────────────────────────────────────────────────────────── */

  async function listMedia(entityType, entityId) {
    if (!ENTITY_TYPES.has(entityType)) return [];
    const id = Number(entityId);
    if (!Number.isInteger(id)) return [];
    return withPrisma('admin_media_list_failed', async prisma =>
      prisma.mediaAsset.findMany({
        where: { restaurantId, entityType, entityId: id },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }), []);
  }

  async function addMedia(body = {}) {
    const entityType = clean(body.entityType, 20);
    if (!ENTITY_TYPES.has(entityType)) return { error: 'Unknown entityType' };
    const entityId = Number(body.entityId);
    if (!Number.isInteger(entityId)) return { error: 'entityId must be an integer' };
    const kind = clean(body.kind, 10).toUpperCase();
    if (!MEDIA_KINDS.has(kind)) return { error: 'kind must be IMAGE or VIDEO' };
    const url = safeMediaUrl(body.url);
    if (!url) return { error: 'url must be a path under this site or an http(s) URL' };
    const posterUrl = body.posterUrl ? safeMediaUrl(body.posterUrl) : '';
    if (body.posterUrl && !posterUrl) return { error: 'posterUrl is not a valid media URL' };

    const created = await withPrisma('admin_media_add_failed', async prisma => {
      // Append to the end rather than fighting over sortOrder 0.
      const last = await prisma.mediaAsset.findFirst({
        where: { restaurantId, entityType, entityId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const anyFeatured = await prisma.mediaAsset.count({
        where: { restaurantId, entityType, entityId, featured: true },
      });
      return prisma.mediaAsset.create({
        data: {
          restaurantId, entityType, entityId, kind, url,
          posterUrl: posterUrl || '',
          alt: clean(body.alt, 200),
          caption: clean(body.caption, 300),
          durationSec: Number.isFinite(Number(body.durationSec)) ? Math.trunc(Number(body.durationSec)) : null,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          // First asset for an entity becomes the featured one automatically —
          // an entity with media but nothing featured has no obvious hero.
          featured: anyFeatured === 0,
        },
      });
    });
    if (created) invalidateMenu();
    return created ? { value: created } : { error: 'Could not save media' };
  }

  async function updateMedia(id, patch = {}) {
    const mediaId = Number(id);
    if (!Number.isInteger(mediaId)) return { error: 'Invalid media id' };
    const data = {};
    if (patch.alt !== undefined) data.alt = clean(patch.alt, 200);
    if (patch.caption !== undefined) data.caption = clean(patch.caption, 300);
    if (patch.visible !== undefined) data.visible = Boolean(patch.visible);
    if (patch.url !== undefined) {
      const url = safeMediaUrl(patch.url);
      if (!url) return { error: 'url is not valid' };
      data.url = url;
    }
    if (Object.keys(data).length === 0 && patch.featured === undefined) {
      return { error: 'Nothing to update' };
    }

    const updated = await withPrisma('admin_media_update_failed', async prisma => {
      const row = await prisma.mediaAsset.findFirst({ where: { id: mediaId, restaurantId } });
      if (!row) return null;
      // "Featured" is exclusive per entity. Enforced in one transaction so a
      // failure can never leave an entity with two heroes or none.
      if (patch.featured === true) {
        return prisma.$transaction(async tx => {
          await tx.mediaAsset.updateMany({
            where: { restaurantId, entityType: row.entityType, entityId: row.entityId },
            data: { featured: false },
          });
          return tx.mediaAsset.update({ where: { id: mediaId }, data: { ...data, featured: true } });
        });
      }
      return prisma.mediaAsset.update({ where: { id: mediaId }, data });
    });
    if (updated) invalidateMenu();
    return updated ? { value: updated } : { error: 'Media not found' };
  }

  /** Reorder a whole gallery in one call — ids in their new display order. */
  async function reorderMedia(entityType, entityId, ids = []) {
    if (!ENTITY_TYPES.has(entityType)) return { error: 'Unknown entityType' };
    const eid = Number(entityId);
    if (!Number.isInteger(eid)) return { error: 'entityId must be an integer' };
    const order = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger);
    if (order.length === 0) return { error: 'No ids supplied' };

    const done = await withPrisma('admin_media_reorder_failed', async prisma => {
      const owned = await prisma.mediaAsset.findMany({
        where: { restaurantId, entityType, entityId: eid },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map(o => o.id));
      // Silently ignoring foreign ids would let a stale tab reorder another
      // dish's gallery. Refuse the whole call instead.
      if (order.some(id => !ownedIds.has(id))) return null;
      await prisma.$transaction(
        order.map((id, index) => prisma.mediaAsset.update({ where: { id }, data: { sortOrder: index } }))
      );
      return true;
    });
    if (done) invalidateMenu();
    return done ? { value: true } : { error: 'Reorder rejected — ids do not all belong to this item' };
  }

  async function deleteMedia(id) {
    const mediaId = Number(id);
    if (!Number.isInteger(mediaId)) return { error: 'Invalid media id' };
    const removed = await withPrisma('admin_media_delete_failed', async prisma => {
      const row = await prisma.mediaAsset.findFirst({ where: { id: mediaId, restaurantId } });
      if (!row) return null;
      await prisma.mediaAsset.delete({ where: { id: mediaId } });
      // Deleting the hero promotes the next asset rather than leaving none.
      if (row.featured) {
        const next = await prisma.mediaAsset.findFirst({
          where: { restaurantId, entityType: row.entityType, entityId: row.entityId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        if (next) await prisma.mediaAsset.update({ where: { id: next.id }, data: { featured: true } });
      }
      return true;
    });
    if (removed) invalidateMenu();
    return removed ? { value: true } : { error: 'Media not found' };
  }

  /* ── translations ────────────────────────────────────────────────────── */

  async function listTranslations(entityType, entityId) {
    if (!ENTITY_TYPES.has(entityType)) return [];
    const id = Number(entityId);
    if (!Number.isInteger(id)) return [];
    return withPrisma('admin_translations_list_failed', async prisma =>
      prisma.translation.findMany({
        where: { restaurantId, entityType, entityId: id },
        orderBy: [{ locale: 'asc' }, { field: 'asc' }],
      }), []);
  }

  /**
   * Save one locale's fields for one entity.
   *
   * An empty value DELETES the row rather than storing "" — a blank
   * translation must fall back to English, not blank the dish out.
   */
  async function saveTranslations({ entityType, entityId, locale, fields = {}, source = 'human', reviewed = false }) {
    if (!ENTITY_TYPES.has(entityType)) return { error: 'Unknown entityType' };
    const id = Number(entityId);
    if (!Number.isInteger(id)) return { error: 'entityId must be an integer' };
    const loc = clean(locale, 12);
    if (!loc) return { error: 'locale is required' };
    if (loc.toLowerCase() === 'en') {
      // English lives on the entity itself; a row here would shadow it and
      // quietly become a second source of truth.
      return { error: 'English is edited on the item itself, not as a translation' };
    }
    const allowed = TRANSLATABLE[entityType];
    const entries = Object.entries(fields).filter(([f]) => allowed.has(f));
    if (entries.length === 0) return { error: 'No translatable fields supplied' };

    const written = await withPrisma('admin_translations_save_failed', async prisma =>
      prisma.$transaction(entries.map(([field, raw]) => {
        const value = clean(raw, MAX_TEXT);
        const where = { entityType_entityId_locale_field: { entityType, entityId: id, locale: loc, field } };
        if (!value) return prisma.translation.deleteMany({ where: { entityType, entityId: id, locale: loc, field } });
        return prisma.translation.upsert({
          where,
          update: { value, source: clean(source, 20) || 'human', reviewed: Boolean(reviewed) },
          create: {
            restaurantId, entityType, entityId: id, locale: loc, field, value,
            source: clean(source, 20) || 'human', reviewed: Boolean(reviewed),
          },
        });
      })), null);

    if (written) invalidateMenu();
    return written ? { value: entries.length } : { error: 'Could not save translations' };
  }

  /** How complete each locale is, so an owner can see what still needs doing. */
  async function translationCoverage() {
    return withPrisma('admin_translation_coverage_failed', async prisma => {
      const [items, rows] = await Promise.all([
        prisma.menuItem.count({ where: { restaurantId, visible: true } }),
        prisma.translation.groupBy({
          by: ['locale'],
          where: { restaurantId, entityType: 'MENU_ITEM', field: 'name' },
          _count: { _all: true },
        }),
      ]);
      return {
        items,
        locales: rows
          .map(r => ({
            locale: r.locale,
            translated: r._count._all,
            percent: items ? Math.round((r._count._all / items) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.translated - a.translated),
      };
    }, null);
  }

  /* ── butchery cuts ───────────────────────────────────────────────────── */

  async function listCuts() {
    return withPrisma('admin_cuts_list_failed', async prisma =>
      prisma.cowCut.findMany({
        where: { restaurantId },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { menuItem: { select: { id: true, name: true, price: true, visible: true } } },
          },
        },
      }), []);
  }

  async function updateCut(id, patch = {}) {
    const cutId = Number(id);
    if (!Number.isInteger(cutId)) return { error: 'Invalid cut id' };
    const data = {};
    if (patch.name !== undefined) data.name = clean(patch.name, 80);
    if (patch.altName !== undefined) data.altName = clean(patch.altName, 80);
    if (patch.description !== undefined) data.description = clean(patch.description, MAX_TEXT);
    if (patch.texture !== undefined) data.texture = clean(patch.texture, 500);
    if (patch.active !== undefined) data.active = Boolean(patch.active);
    if (patch.bestFor !== undefined) {
      data.bestFor = (Array.isArray(patch.bestFor) ? patch.bestFor : [])
        .map(v => clean(v, 40)).filter(Boolean).slice(0, 8);
    }
    if (Object.keys(data).length === 0) return { error: 'Nothing to update' };

    const updated = await withPrisma('admin_cut_update_failed', async prisma => {
      const row = await prisma.cowCut.findFirst({ where: { id: cutId, restaurantId } });
      if (!row) return null;
      return prisma.cowCut.update({ where: { id: cutId }, data });
    });
    return updated ? { value: updated } : { error: 'Cut not found' };
  }

  async function linkCutItem(cutId, body = {}) {
    const cId = Number(cutId);
    const menuItemId = Number(body.menuItemId);
    if (!Number.isInteger(cId) || !Number.isInteger(menuItemId)) return { error: 'Invalid ids' };
    const matchType = clean(body.matchType, 12).toUpperCase() || 'PRIMARY';
    if (!MATCH_TYPES.has(matchType)) return { error: 'matchType must be PRIMARY or RELATED' };

    const created = await withPrisma('admin_cut_link_failed', async prisma => {
      // Both sides must belong to this restaurant — an id from another tenant
      // would otherwise silently attach.
      const [cut, item] = await Promise.all([
        prisma.cowCut.findFirst({ where: { id: cId, restaurantId }, select: { id: true } }),
        prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId }, select: { id: true } }),
      ]);
      if (!cut || !item) return null;
      const last = await prisma.cowCutItem.findFirst({
        where: { cutId: cId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
      });
      return prisma.cowCutItem.upsert({
        where: { cutId_menuItemId: { cutId: cId, menuItemId } },
        update: { matchType, label: clean(body.label, 80) },
        create: {
          cutId: cId, menuItemId, matchType,
          label: clean(body.label, 80),
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
    });
    return created ? { value: created } : { error: 'Cut or menu item not found' };
  }

  async function unlinkCutItem(cutId, menuItemId) {
    const cId = Number(cutId);
    const mId = Number(menuItemId);
    if (!Number.isInteger(cId) || !Number.isInteger(mId)) return { error: 'Invalid ids' };
    const removed = await withPrisma('admin_cut_unlink_failed', async prisma => {
      const cut = await prisma.cowCut.findFirst({ where: { id: cId, restaurantId }, select: { id: true } });
      if (!cut) return null;
      const res = await prisma.cowCutItem.deleteMany({ where: { cutId: cId, menuItemId: mId } });
      return res.count > 0;
    });
    return removed ? { value: true } : { error: 'Link not found' };
  }

  return {
    listMedia, addMedia, updateMedia, reorderMedia, deleteMedia,
    listTranslations, saveTranslations, translationCoverage,
    listCuts, updateCut, linkCutItem, unlinkCutItem,
    TRANSLATABLE_FIELDS: TRANSLATABLE,
  };
}

module.exports = { createContentAdminService };
