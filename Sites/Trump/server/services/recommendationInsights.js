'use strict';
// Pure recommendation-optimization insights (Phase 5, Task 3). Turns analytics +
// health + chef-rec/menu data into ranked, actionable owner recommendations — not raw
// metrics. No I/O; unit-tested offline.

const DEFAULTS = {
  deadMinImpressions: 20,        // "high impressions"
  deadMaxAcceptance: 0.05,        // "low conversion"
  poorRotationMinImpressions: 20,
  poorRotationMaxAcceptance: 0.05,
  missingPairingLimit: 5
};

function pct(r) {
  return `${Math.round((Number(r) || 0) * 100)}%`;
}

// { analytics, health, chefRecs, items } → { count, counts, insights[] }.
// items are admin menu items (carry dbId, categoryType, available, visible).
function generate({ analytics = {}, health = {}, chefRecs = [], items = [], thresholds = {} } = {}) {
  const t = { ...DEFAULTS, ...thresholds };
  const insights = [];
  const add = (severity, type, title, detail, action, extra = {}) =>
    insights.push({ severity, type, title, detail, action, ...extra });

  // 1. Dead recommendations — enough exposure, near-zero acceptance.
  for (const it of analytics.items || []) {
    if (it.impressions >= t.deadMinImpressions && it.acceptanceRate <= t.deadMaxAcceptance) {
      add('high', 'dead_recommendation',
        `"${it.name}" rarely converts`,
        `${it.impressions} impressions, ${pct(it.acceptanceRate)} acceptance${it.source ? ` (via ${it.source})` : ''}.`,
        'Re-pair this item, refresh its reason, or retire the recommendation.',
        { name: it.name, impressions: it.impressions, acceptanceRate: it.acceptanceRate });
    }
  }

  // 2. Broken references — disabled / deleted items behind active recommendations (health).
  for (const issue of health.issues || []) {
    if (issue.code === 'disabled_target') {
      add('high', 'disabled_target', 'Recommendation points at an unavailable item', issue.message,
        'Un-hide the item, or disable/redirect the chef recommendation.', { recId: issue.recId });
    } else if (issue.code === 'orphaned_source' || issue.code === 'missing_target') {
      add('high', issue.code, 'Recommendation references a deleted item', issue.message,
        'Delete or repoint this chef recommendation.', { recId: issue.recId });
    }
  }

  // 3. Missing pairings — main-course items with no chef recommendation as a source.
  const sourcesWithRecs = new Set(
    (chefRecs || []).filter(r => r.active !== false).map(r => Number(r.sourceItemId))
  );
  const mainsMissing = (items || [])
    .filter(i => String(i.categoryType || '').toUpperCase() === 'MAIN' && i.available !== false && i.visible !== false)
    .filter(i => !sourcesWithRecs.has(Number(i.dbId ?? i.id)))
    .slice(0, t.missingPairingLimit);
  for (const i of mainsMissing) {
    add('medium', 'missing_pairing', `No pairing for "${i.name}"`,
      'This main has no chef recommendation to upsell alongside it.',
      'Add a wine / side / dessert chef recommendation for this dish.', { name: i.name });
  }

  // 4. Rotation groups converting poorly.
  for (const g of analytics.byRotationGroup || []) {
    if (g.impressions >= t.poorRotationMinImpressions && g.acceptanceRate <= t.poorRotationMaxAcceptance) {
      add('medium', 'poor_rotation_group', `Rotation group "${g.rotationGroup}" converts poorly`,
        `${g.impressions} impressions, ${pct(g.acceptanceRate)} acceptance across the group.`,
        'Review the members — replace the weakest pour or adjust priorities.', { rotationGroup: g.rotationGroup });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const counts = insights.reduce((acc, i) => { acc[i.severity] = (acc[i.severity] || 0) + 1; return acc; }, {});
  return { count: insights.length, counts, insights };
}

module.exports = { generate, DEFAULTS };
