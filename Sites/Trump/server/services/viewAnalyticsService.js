/**
 * Anonymous guest-engagement analytics.
 *
 * What this records: which dishes, categories and cuts were looked at, which
 * videos played, which language was in use, and when. What it deliberately does
 * NOT record: names, emails, phone numbers, IP addresses, device fingerprints,
 * or anything that could re-identify a guest across visits. `sessionId` is a
 * random id the browser mints for one sitting and forgets.
 *
 * The old RecommendationEvent table measured whether the AI's suggestions
 * converted into orders. That question no longer exists — this measures
 * attention, which is what a menu without a cart can actually be judged on.
 */

const EVENT_TYPES = new Set([
  'MENU_VIEW',        // the menu screen opened
  'CATEGORY_VIEW',    // a category scrolled into view / was chosen
  'ITEM_VIEW',        // a dish detail opened
  'CUT_VIEW',         // a butchery primal was selected
  'VIDEO_PLAY',
  'VIDEO_PROGRESS',
  'VIDEO_COMPLETE',
  'PHOTO_VIEW',       // a gallery image was opened or swiped to
  'LANGUAGE_SELECT',
  'SEARCH',
]);

const DEVICE_TYPES = new Set(['phone', 'tablet', 'desktop', '']);

/** Hard caps so a malformed or hostile client cannot write unbounded rows. */
const MAX_BATCH = 40;
const MAX_STRING = 160;

function str(value, max = MAX_STRING) {
  return String(value ?? '').slice(0, max);
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Coerce one client-supplied event into a row we are willing to store.
 * Returns null for anything unrecognised rather than throwing: one bad event in
 * a batch must never cost the other thirty-nine.
 */
function sanitizeEvent(raw, { restaurantId, locale }) {
  if (!raw || typeof raw !== 'object') return null;
  const eventType = str(raw.eventType, 24).toUpperCase();
  if (!EVENT_TYPES.has(eventType)) return null;
  const sessionId = str(raw.sessionId, 64);
  if (!sessionId) return null;

  const deviceType = str(raw.deviceType, 12).toLowerCase();
  const dwellMs = intOrNull(raw.dwellMs);
  const positionSec = intOrNull(raw.positionSec);

  return {
    restaurantId,
    eventType,
    sessionId,
    locale: str(raw.locale || locale, 12) || 'en',
    menuItemId: intOrNull(raw.menuItemId),
    categoryId: intOrNull(raw.categoryId),
    cutSlug: raw.cutSlug ? str(raw.cutSlug, 40) : null,
    tableId: str(raw.tableId, 32),
    label: str(raw.label),
    categoryName: str(raw.categoryName),
    // A dwell longer than an hour is a device that went to sleep with the modal
    // open, not attention. Discard rather than skew every average.
    dwellMs: dwellMs != null && dwellMs >= 0 && dwellMs <= 3_600_000 ? dwellMs : null,
    positionSec: positionSec != null && positionSec >= 0 && positionSec <= 86_400 ? positionSec : null,
    deviceType: DEVICE_TYPES.has(deviceType) ? deviceType : '',
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined,
  };
}

function createViewAnalyticsService({ prismaMenuService, logger = null } = {}) {
  const restaurantId = prismaMenuService?.restaurantId || 'trump';

  async function record(events, { locale = 'en' } = {}) {
    if (!prismaMenuService) return { accepted: 0, rejected: 0 };
    const list = Array.isArray(events) ? events.slice(0, MAX_BATCH) : [events];
    const rows = list.map(e => sanitizeEvent(e, { restaurantId, locale })).filter(Boolean);
    const rejected = list.length - rows.length;
    if (rows.length === 0) return { accepted: 0, rejected };

    await prismaMenuService.withPrisma(
      'view_events_write_failed',
      // skipDuplicates is irrelevant here (no unique key) but createMany is one
      // round trip for the whole batch, which is the point of batching at all.
      async prisma => prisma.viewEvent.createMany({ data: rows }),
      null
    );
    return { accepted: rows.length, rejected };
  }

  /** Inclusive-start, exclusive-end window. Defaults to the last 30 days. */
  function windowFrom(query = {}) {
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date();
    const from = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    return {
      from: Number.isNaN(from.getTime()) ? new Date(Date.now() - 30 * 24 * 3600 * 1000) : from,
      to: Number.isNaN(to.getTime()) ? new Date() : to,
    };
  }

  function baseWhere(range) {
    return { restaurantId, createdAt: { gte: range.from, lte: range.to } };
  }

  /**
   * The admin dashboard payload, in one pass.
   *
   * Every figure is computed from stored events — nothing here is a constant,
   * and a restaurant with no traffic yet gets honest zeroes rather than a demo
   * shape that looks like data.
   */
  async function summary(query = {}) {
    if (!prismaMenuService) return null;
    const range = windowFrom(query);
    const where = baseWhere(range);

    return prismaMenuService.withPrisma('view_analytics_summary_failed', async prisma => {
      const [
        totals, byType, sessions, topItems, topCategories, topCuts,
        byLocale, videoPlays, videoCompletes, dwell,
      ] = await Promise.all([
        prisma.viewEvent.count({ where }),
        prisma.viewEvent.groupBy({ by: ['eventType'], where, _count: { _all: true } }),
        prisma.viewEvent.findMany({ where, select: { sessionId: true }, distinct: ['sessionId'] }),
        prisma.viewEvent.groupBy({
          by: ['menuItemId', 'label'],
          where: { ...where, eventType: 'ITEM_VIEW', menuItemId: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { menuItemId: 'desc' } },
          take: 25,
        }),
        prisma.viewEvent.groupBy({
          by: ['categoryName'],
          where: { ...where, eventType: 'CATEGORY_VIEW' },
          _count: { _all: true },
          orderBy: { _count: { categoryName: 'desc' } },
          take: 25,
        }),
        prisma.viewEvent.groupBy({
          by: ['cutSlug', 'label'],
          where: { ...where, eventType: 'CUT_VIEW', cutSlug: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { cutSlug: 'desc' } },
          take: 25,
        }),
        prisma.viewEvent.groupBy({
          by: ['locale'], where, _count: { _all: true },
          orderBy: { _count: { locale: 'desc' } },
        }),
        prisma.viewEvent.groupBy({
          by: ['menuItemId', 'label'],
          where: { ...where, eventType: 'VIDEO_PLAY' },
          _count: { _all: true },
        }),
        prisma.viewEvent.groupBy({
          by: ['menuItemId'],
          where: { ...where, eventType: 'VIDEO_COMPLETE' },
          _count: { _all: true },
        }),
        prisma.viewEvent.aggregate({
          where: { ...where, eventType: 'ITEM_VIEW', dwellMs: { not: null } },
          _avg: { dwellMs: true }, _count: { dwellMs: true },
        }),
      ]);

      const totalLocale = byLocale.reduce((s, r) => s + r._count._all, 0) || 1;
      const completesById = new Map(videoCompletes.map(r => [r.menuItemId, r._count._all]));

      return {
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        totals: {
          events: totals,
          sessions: sessions.length,
          byType: Object.fromEntries(byType.map(r => [r.eventType, r._count._all])),
          avgDwellMs: Math.round(dwell._avg.dwellMs || 0),
          dwellSamples: dwell._count.dwellMs || 0,
        },
        topItems: topItems.map(r => ({
          menuItemId: r.menuItemId, name: r.label, views: r._count._all,
        })),
        topCategories: topCategories
          .filter(r => r.categoryName)
          .map(r => ({ name: r.categoryName, views: r._count._all })),
        topCuts: topCuts.map(r => ({ slug: r.cutSlug, name: r.label, views: r._count._all })),
        languages: byLocale.map(r => ({
          locale: r.locale,
          views: r._count._all,
          // Computed, never hardcoded.
          share: Math.round((r._count._all / totalLocale) * 1000) / 10,
        })),
        video: videoPlays.map(r => {
          const completed = completesById.get(r.menuItemId) || 0;
          return {
            menuItemId: r.menuItemId,
            name: r.label,
            plays: r._count._all,
            completes: completed,
            completionRate: r._count._all ? Math.round((completed / r._count._all) * 1000) / 10 : 0,
          };
        }).sort((a, b) => b.plays - a.plays).slice(0, 25),
      };
    }, null);
  }

  /** Views bucketed by hour-of-day and by calendar day. */
  async function timeline(query = {}) {
    if (!prismaMenuService) return null;
    const range = windowFrom(query);
    return prismaMenuService.withPrisma('view_analytics_timeline_failed', async prisma => {
      const rows = await prisma.viewEvent.findMany({
        where: baseWhere(range),
        select: { createdAt: true },
      });
      const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0 }));
      const byDay = new Map();
      for (const r of rows) {
        byHour[r.createdAt.getHours()].views += 1;
        const day = r.createdAt.toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) || 0) + 1);
      }
      return {
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        byHour,
        byDay: [...byDay.entries()].sort().map(([date, views]) => ({ date, views })),
      };
    }, null);
  }

  /**
   * Dishes with the least attention. Answering "what is nobody looking at" needs
   * the menu itself, not just the event table — an item with zero views has no
   * rows to group by, so it can only appear by starting from the item list.
   */
  async function leastViewed(query = {}) {
    if (!prismaMenuService) return null;
    const range = windowFrom(query);
    return prismaMenuService.withPrisma('view_analytics_least_failed', async prisma => {
      const [items, views] = await Promise.all([
        prisma.menuItem.findMany({
          where: { restaurantId, visible: true },
          select: { id: true, name: true },
        }),
        prisma.viewEvent.groupBy({
          by: ['menuItemId'],
          where: { ...baseWhere(range), eventType: 'ITEM_VIEW', menuItemId: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const seen = new Map(views.map(v => [v.menuItemId, v._count._all]));
      return items
        .map(i => ({ menuItemId: i.id, name: i.name, views: seen.get(i.id) || 0 }))
        .sort((a, b) => a.views - b.views || a.name.localeCompare(b.name))
        .slice(0, 40);
    }, null);
  }

  return { record, summary, timeline, leastViewed, EVENT_TYPES };
}

module.exports = { createViewAnalyticsService, EVENT_TYPES };
