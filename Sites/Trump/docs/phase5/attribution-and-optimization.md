# Attribution & Optimization (Phase 5, Tasks 2 & 3)

Extends the Phase 4 analytics into item- and bundle-level attribution, and adds an
owner-facing optimization layer that turns metrics into **actions**. All additive — the
Phase 4 aggregator output is a superset of before; Phase 3 (41/41) and Phase 4 (17/17)
suites are unchanged.

## Task 2 — attribution

The pure aggregator ([`recommendationAnalytics.js`](../../server/services/recommendationAnalytics.js))
gained, additively:

- **`revenuePerImpression`** on every tally (totals, per-item, per-source, per-group,
  per-bundle): `revenue / impressions` — the revenue efficiency of a recommendation.
- **`byBundle`** — bundle-level attribution. Bundle events carry `source: "bundle"` and the
  persona in `originatingName`; the aggregator groups them so each persona has its own
  impressions/clicks/accepts/revenue and rates.
- **`underperforming`** — items with enough exposure (`impressions ≥ minImpressions`) sorted
  by **lowest** acceptance first (the inverse of `topConverting`).

Existing tracked metrics (CTR, acceptance rate, dismissal rate, conversion, revenue,
top-shown/clicked/converting/revenue, by-source, by-rotation-group) are unchanged.

### Dashboard surfacing

Admin → Reco Analytics now shows: a **revenue / impression** sub-metric on the revenue KPI;
an **Underperforming** board; and a **By bundle (persona)** board, alongside the existing
boards and filters (date range, mode, category, source, rotation group).

## Task 3 — optimization insights

[`recommendationInsights.js`](../../server/services/recommendationInsights.js) (pure) combines
**analytics + data-integrity health + the chef-rec/menu graph** into ranked, actionable items
— not raw metrics. Surfaced at the top of Reco Analytics as **Action items**, and served by
`GET /Trump/api/analytics/recommendations/insights` (owner|manager).

| Insight | Trigger | Severity | Suggested action |
|---|---|---|---|
| `dead_recommendation` | impressions ≥ 20 and acceptance ≤ 5% | high | re-pair, refresh the reason, or retire |
| `disabled_target` | a recommendation points at a hidden/unavailable item (health) | high | un-hide the item or disable the rec |
| `orphaned_source` / `missing_target` | a rec references a deleted item (health) | high | delete or repoint the rec |
| `missing_pairing` | a main-course item has no chef recommendation as a source | medium | add a wine/side/dessert pairing |
| `poor_rotation_group` | a rotation group: impressions ≥ 20 and acceptance ≤ 5% | medium | review members / priorities |

Thresholds are parameterisable (`recommendationInsights.DEFAULTS`). Insights are sorted
high → medium → low, each with a title, detail and a concrete action.

## Why this preserves behaviour

- The engine and its chef-first priority, safety rules and rotation are **unchanged** —
  this layer only *reports* and *advises*.
- The aggregator changes are pure additions to the output object; no existing field or
  value changed (verified: Phase 4 `reco:health:test` still 17/17).
- Insights are read-only suggestions; acting on them is a manual owner decision in the
  existing Chef Recs / Bundles / Menu admin tools.

## Validation

`npm run reco:validate:phase5` (17 checks) covers `byBundle` grouping, `revenuePerImpression`,
`underperforming`/`topConverting` ordering, and each insight type (incl. negative cases).
