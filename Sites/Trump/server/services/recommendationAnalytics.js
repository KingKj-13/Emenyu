'use strict';
// Pure recommendation-analytics aggregation (Phase 4, Task 1/2). No DB, no I/O —
// takes an array of events and returns the dashboard metrics. The storage layer
// (recommendationEventService) loads rows from Postgres (or the JSON fallback) and
// runs THIS function, so the math is identical regardless of where rows came from
// and is fully unit-testable offline.

const EVENT_TYPES = ['impression', 'click', 'accepted', 'dismissed', 'ordered'];
const MODES = ['customer', 'waiter'];

function clampStr(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

function toIntOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

// Validate + coerce a raw event from the client/API into a stored shape.
// Returns null when the event is unusable (bad type or no item identity).
function sanitizeEvent(raw = {}) {
  const eventType = String(raw.eventType || '').toLowerCase();
  if (!EVENT_TYPES.includes(eventType)) return null;
  const recommendedName = clampStr(raw.recommendedName, 160).trim();
  if (!recommendedName) return null; // must identify which recommendation this is
  return {
    eventType,
    source: clampStr(raw.source, 80),
    recType: clampStr(raw.recType, 16).toUpperCase(),
    recommendedItemId: toIntOrNull(raw.recommendedItemId),
    recommendedName,
    originatingItemId: toIntOrNull(raw.originatingItemId),
    originatingName: clampStr(raw.originatingName, 160),
    rotationGroup: clampStr(raw.rotationGroup, 80),
    sessionId: clampStr(raw.sessionId, 80),
    deviceId: clampStr(raw.deviceId, 80),
    tableId: clampStr(raw.tableId, 40),
    mode: MODES.includes(String(raw.mode)) ? String(raw.mode) : 'customer',
    chef: raw.chef === true || raw.chef === 'true',
    value: Number.isFinite(Number(raw.value)) ? Math.max(0, Number(raw.value)) : 0,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date()
  };
}

function eventTime(ev) {
  const t = ev.createdAt instanceof Date ? ev.createdAt : new Date(ev.createdAt || ev.timestamp || Date.now());
  return t.getTime();
}

// Filters: { from, to (ISO/date), category (recType), source, rotationGroup, mode }.
function filterEvents(events = [], filters = {}) {
  const fromTs = filters.from ? new Date(filters.from).getTime() : null;
  const toTs = filters.to ? new Date(filters.to).getTime() : null;
  const category = filters.category ? String(filters.category).toUpperCase() : null;
  const source = filters.source ? String(filters.source).toLowerCase() : null;
  const rotationGroup = filters.rotationGroup ? String(filters.rotationGroup) : null;
  const mode = filters.mode && MODES.includes(filters.mode) ? filters.mode : null;

  return events.filter(ev => {
    const t = eventTime(ev);
    if (fromTs !== null && t < fromTs) return false;
    if (toTs !== null && t > toTs) return false;
    if (category && String(ev.recType || '').toUpperCase() !== category) return false;
    if (source && String(ev.source || '').toLowerCase() !== source) return false;
    if (rotationGroup && String(ev.rotationGroup || '') !== rotationGroup) return false;
    if (mode && ev.mode !== mode) return false;
    return true;
  });
}

function rate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

function emptyTally(extra = {}) {
  return { impressions: 0, clicks: 0, accepted: 0, dismissed: 0, ordered: 0, revenue: 0, ...extra };
}

function bump(tally, ev) {
  if (ev.eventType === 'impression') tally.impressions += 1;
  else if (ev.eventType === 'click') tally.clicks += 1;
  else if (ev.eventType === 'accepted') { tally.accepted += 1; tally.revenue += Number(ev.value) || 0; }
  else if (ev.eventType === 'dismissed') tally.dismissed += 1;
  else if (ev.eventType === 'ordered') { tally.ordered += 1; tally.revenueOrdered = (tally.revenueOrdered || 0) + (Number(ev.value) || 0); }
}

// Derived rates for a tally. acceptanceRate / conversionRate use impressions as the
// denominator (shown → added / shown → ordered); clickRate and dismissalRate too.
function withRates(tally) {
  return {
    ...tally,
    revenue: Number((tally.revenue || 0).toFixed(2)),
    revenueOrdered: Number((tally.revenueOrdered || 0).toFixed(2)),
    clickRate: rate(tally.clicks, tally.impressions),
    acceptanceRate: rate(tally.accepted, tally.impressions),
    dismissalRate: rate(tally.dismissed, tally.impressions),
    conversionRate: rate(tally.ordered, tally.impressions),
    // Phase 5: revenue efficiency — accepted revenue per impression.
    revenuePerImpression: Number((tally.impressions > 0 ? (tally.revenue || 0) / tally.impressions : 0).toFixed(2))
  };
}

// Aggregate a filtered event list into the dashboard payload.
// `minImpressions` gates the "top converting" board so a single lucky impression
// doesn't show a 100% rate.
function aggregate(events = [], filters = {}, { minImpressions = 5, topN = 10 } = {}) {
  const filtered = filterEvents(events, filters);

  const totals = emptyTally();
  const byItem = new Map();
  const bySource = new Map();
  const byGroup = new Map();
  const byBundle = new Map();

  for (const ev of filtered) {
    bump(totals, ev);

    const itemKey = ev.recommendedName || '(unknown)';
    if (!byItem.has(itemKey)) byItem.set(itemKey, emptyTally({ name: itemKey, source: ev.source || '', recType: ev.recType || '', chef: !!ev.chef }));
    bump(byItem.get(itemKey), ev);

    const srcKey = ev.source || '(none)';
    if (!bySource.has(srcKey)) bySource.set(srcKey, emptyTally({ source: srcKey }));
    bump(bySource.get(srcKey), ev);

    if (ev.rotationGroup) {
      if (!byGroup.has(ev.rotationGroup)) byGroup.set(ev.rotationGroup, emptyTally({ rotationGroup: ev.rotationGroup }));
      bump(byGroup.get(ev.rotationGroup), ev);
    }

    // Phase 5: bundle-level attribution. Bundle events carry source "bundle" and the
    // persona in originatingName.
    if (ev.source === 'bundle' && ev.originatingName) {
      if (!byBundle.has(ev.originatingName)) byBundle.set(ev.originatingName, emptyTally({ name: ev.originatingName, source: 'bundle' }));
      bump(byBundle.get(ev.originatingName), ev);
    }
  }

  const items = [...byItem.values()].map(withRates);
  const desc = key => (a, b) => b[key] - a[key];
  const asc = key => (a, b) => a[key] - b[key];
  const seen = items.filter(i => i.impressions >= minImpressions);

  return {
    totals: withRates(totals),
    topShown: [...items].sort(desc('impressions')).slice(0, topN),
    topClicked: [...items].sort(desc('clicks')).slice(0, topN),
    topConverting: [...seen].sort(desc('acceptanceRate')).slice(0, topN),
    // Phase 5: underperformers — enough exposure, lowest acceptance (drives the
    // optimization "dead recommendation" insights).
    underperforming: [...seen].sort(asc('acceptanceRate')).slice(0, topN),
    topRevenue: [...items].sort(desc('revenue')).slice(0, topN),
    bySource: [...bySource.values()].map(withRates).sort(desc('impressions')),
    byRotationGroup: [...byGroup.values()].map(withRates).sort(desc('impressions')),
    byBundle: [...byBundle.values()].map(withRates).sort(desc('impressions')),
    items,
    eventCount: filtered.length
  };
}

module.exports = {
  EVENT_TYPES,
  MODES,
  sanitizeEvent,
  filterEvents,
  aggregate,
  withRates
};
