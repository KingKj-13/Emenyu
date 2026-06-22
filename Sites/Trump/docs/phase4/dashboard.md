# Recommendation Analytics Dashboard (Phase 4, Task 2)

Admin → **Reco Analytics** (React console, `owner | manager`). Lives under the INSIGHT
nav group in [`AdminPage.tsx`](../../client/src/pages/AdminPage.tsx) as the
`recoanalytics` tab, rendered by `RecoAnalyticsPanel`.

## Layout

```
┌ Recommendation performance ───────────────────────────── [Refresh] ┐
│ [ Today ][ 7 Days ][ 30 Days ][ All ]                                │
│ [mode ▾] [category ▾] [source ▾] [rotation group ▾]                  │
│                                                                       │
│  ┌Impressions┐ ┌Clicks┐ ┌Accepted┐ ┌Acceptance┐ ┌Dismissal┐ ┌Orders┐ ┌Revenue┐
│  │   1 240   │ │  310 │ │   142  │ │  11.5%   │ │  4.0%   │ │  88  │ │ R12 400│
│  └───────────┘ └──────┘ └────────┘ └──────────┘ └─────────┘ └──────┘ └────────┘
│                                                                       │
│  Most shown            Most clicked          Highest conversion       │
│  Revenue attributed    By source             By rotation group        │
└───────────────────────────────────────────────────────────────────────┘
```

## Metrics

All "top" boards are ranked `RecoTally` rows; rates are computed in
[`recommendationAnalytics.aggregate`](../../server/services/recommendationAnalytics.js)
with **impressions as the denominator**:

| Metric | Definition |
|---|---|
| Impressions | recommendation render events |
| Clicks / CTR | opens; `clickRate = clicks / impressions` |
| Accepted | added to cart/order |
| **Acceptance rate** | `accepted / impressions` |
| **Dismissal rate** | `dismissed / impressions` |
| Orders generated | `ordered` events (accepted rec later checked out) |
| Revenue attributed | Σ `value` of `accepted` events (item price) |
| Conversion (`conversionRate`) | `ordered / impressions` |

Boards:

- **Most shown** — by impressions.
- **Most clicked** — by clicks.
- **Highest conversion** — by acceptance rate, gated at **≥ 5 impressions** so a single
  lucky view can't show 100%.
- **Revenue attributed** — by accepted-value.
- **By source** / **By rotation group** — the same tallies grouped by `source` /
  `rotationGroup`, so you can compare "Chef's pairing" vs "People also ordered", or see
  which rotation group converts best. A ⭐ marks chef recommendations.

## Filters

| Filter | Values | Effect |
|---|---|---|
| Date range | Today / 7 Days / 30 Days / All | `from`/`to` query params (shares `getDateRange` with Reports) |
| Mode | All / Customer / Waiter | guest app vs waiter app |
| Category | All / DISH / SIDE / DESSERT / BEVERAGE / STARTER / MAIN / WINE / DRINK | `recType` |
| Source | All / (values seen in data) | engine source or surface |
| Rotation group | All / (values seen in data) | a specific rotation group |

Source and rotation-group options are populated from the current response's `bySource` /
`byRotationGroup`, so they reflect real data. Changing any filter re-fetches.

## Data flow

`RecoAnalyticsPanel` → `api.getRecommendationAnalytics(params)` →
`GET /api/analytics/recommendations` → `recommendationEventService.getAnalytics` →
`loadEvents(filters)` + `aggregate(events, filters)`. Empty/zero state renders a friendly
"no events yet" panel rather than blank cards.

## Verifying without a database

The aggregation is unit-tested offline (`npm run reco:health:test`, which includes the
aggregator assertions). With no DB, ingest falls back to
`data/recommendation-events.json` and the dashboard reads from there, so the full
loop is demonstrable locally.

## Troubleshooting

- **Cards read 0 with events present** — check the date range (default 7 days) and the
  mode/category/source filters.
- **A source/group is missing from the dropdown** — dropdowns list only values present in
  the *current* filtered response; widen the date range or clear other filters.
- **Revenue looks low** — revenue is attributed from `accepted` events' `value` (item
  price at the time shown); impressions/clicks carry `value: 0`.
