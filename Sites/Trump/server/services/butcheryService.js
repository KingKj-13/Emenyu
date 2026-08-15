/**
 * The butchery chart's data: primals, their media, and which dishes come off
 * each one.
 *
 * The chart's GEOMETRY (the traced SVG paths, label placement) stays in the
 * client — it is presentation, and it does not change per restaurant sitting.
 * Everything an owner should be able to edit without a deploy lives here.
 *
 * If a restaurant has never curated its cuts, this returns an empty list and
 * the client falls back to its built-in catalogue plus name-matching rules, so
 * the screen works on day one and gets better as the data is filled in.
 */

const ENTITY = 'COW_CUT';

function createButcheryService({ prismaMenuService, localizationService, logger = null } = {}) {
  const restaurantId = prismaMenuService?.restaurantId || 'trump';

  /**
   * Every active cut with its media and linked dishes, ready to serialize.
   * One query per table — not one per cut.
   */
  async function getCuts({ locale = 'en' } = {}) {
    if (!prismaMenuService) return [];

    const cuts = await prismaMenuService.withPrisma('butchery_cuts_failed', async prisma => {
      const rows = await prisma.cowCut.findMany({
        where: { restaurantId, active: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: {
              menuItem: {
                select: {
                  id: true, name: true, description: true, price: true,
                  imagePath: true, videoPath: true, visible: true,
                  available: true, availability: true,
                },
              },
            },
          },
        },
      });
      if (rows.length === 0) return [];

      // Media for every cut in one go.
      const media = await prisma.mediaAsset.findMany({
        where: {
          restaurantId, entityType: ENTITY, visible: true,
          entityId: { in: rows.map(r => r.id) },
        },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      });
      const mediaByCut = new Map();
      for (const m of media) {
        if (!mediaByCut.has(m.entityId)) mediaByCut.set(m.entityId, []);
        mediaByCut.get(m.entityId).push(m);
      }
      return rows.map(r => ({ ...r, media: mediaByCut.get(r.id) || [] }));
    }, []);

    if (!cuts || cuts.length === 0) return [];

    const translations = localizationService
      ? await localizationService.loadTranslations(locale)
      : null;

    return cuts.map(cut => {
      const localized = translations ? localizationService.localizeCut(cut, translations) : cut;
      return {
        id: cut.id,
        slug: cut.slug,
        name: localized.name,
        altName: localized.altName || '',
        description: localized.description || '',
        texture: localized.texture || '',
        bestFor: Array.isArray(cut.bestFor) ? cut.bestFor : [],
        media: cut.media.map(m => ({
          id: m.id,
          kind: m.kind,
          url: m.url,
          posterUrl: m.posterUrl || '',
          alt: m.alt || localized.name,
          caption: m.caption || '',
          durationSec: m.durationSec ?? null,
          featured: m.featured,
        })),
        // A dish hidden from the menu must not resurface through the chart.
        items: cut.items
          .filter(link => link.menuItem && link.menuItem.visible !== false)
          .map(link => {
            // The cut itself was localized above, but the dishes hanging off it
            // were being returned raw — so a guest reading Japanese got a
            // Japanese chart with an English dish list under it. Same per-field
            // fallback the menu endpoint uses.
            const tx = translations ? translations.get(`MENU_ITEM:${link.menuItem.id}`) : null;
            return {
              menuItemId: link.menuItem.id,
              name: (tx && tx.name) || link.menuItem.name,
              description: (tx && tx.description) || link.menuItem.description || '',
              price: link.menuItem.price,
              img: link.menuItem.imagePath || '',
              video: link.menuItem.videoPath || '',
              available: link.menuItem.available !== false
                && link.menuItem.availability !== 'unavailable',
              matchType: link.matchType,
              label: link.label || '',
            };
          }),
      };
    });
  }

  /** Gallery for one menu item — the "significantly more photos and videos". */
  async function getItemMedia(menuItemId) {
    if (!prismaMenuService) return [];
    const id = Number(menuItemId);
    if (!Number.isInteger(id)) return [];
    const rows = await prismaMenuService.withPrisma('item_media_failed', async prisma =>
      prisma.mediaAsset.findMany({
        where: { restaurantId, entityType: 'MENU_ITEM', entityId: id, visible: true },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      }), []);
    return (rows || []).map(m => ({
      id: m.id,
      kind: m.kind,
      url: m.url,
      posterUrl: m.posterUrl || '',
      alt: m.alt || '',
      caption: m.caption || '',
      durationSec: m.durationSec ?? null,
      featured: m.featured,
    }));
  }

  logger?.debug?.({ restaurantId }, 'butchery service ready');
  return { getCuts, getItemMedia };
}

module.exports = { createButcheryService };
