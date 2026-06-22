# Recommendation Analytics — Event Pipeline (Phase 4, Task 1)

Local, deterministic, no external services. Tracks the recommendation funnel
(impression → click → accepted → ordered, plus dismissed) across the guest app and
the waiter app, stores events in Postgres (with a JSON fallback), and aggregates them
for the [dashboard](dashboard.md).

## Architecture

```
 Guest / Waiter surfaces                         Server                         Storage
 ───────────────────────                         ──────                         ───────
 CartRecommendations ─┐
 ChatPanel            │  trackImpressions/Click   POST /api/reco/events    ┌─ Postgres
 ItemModal pairings   ├─▶ lib/recoAnalytics.ts ─▶ (public, rate-limited) ─▶│  RecommendationEvent
 PairingModal         │   • per-load impression       │                    │  (createMany)
 CartRecScreen        │     dedupe                     ▼                    │      └─ or ─┐
 CartDrawer (ordered)─┘   • batch + sendBeacon    recordEvents ctrl ─▶ RecommendationEventService
                          • flush on pagehide          │                    └─ data/recommendation-events.json
                                                        │                       (ring buffer, ≤5000)
 Admin → Reco Analytics  ─ GET /api/analytics/recommendations (owner|manager)
                            │
                            ▼
                          getAnalytics ─▶ loadEvents(filters) ─▶ aggregate()  ◀── pure, unit-tested
                            │                (Postgres findMany / JSON read)        recommendationAnalytics.js
                            ▼
                          dashboard payload (totals, top boards, by-source, by-group)
```

The aggregation function is **pure** and shared by both the Postgres and JSON paths, so
the dashboard math is identical regardless of where rows are stored, and is unit-tested
offline (`npm run reco:health:test`).

## Events & when they fire

| Event | Fires when | Surfaces | Mode |
|---|---|---|---|
| `impression` | a recommendation is rendered (deduped per session+item+source) | cart, chat, item pairings, waiter cart-rec | both |
| `click` | the guest/waiter opens a recommended item | cart, chat, item pairings | both |
| `accepted` | the item is added to cart / order | guest cart, waiter cart-rec | both |
| `dismissed` | a recommendation surface closes with the item shown-but-unopened | item pairings (on modal close) | customer |
| `ordered` | an order is placed containing a previously-accepted recommendation | CartDrawer checkout | customer |

`accepted` is remembered in `sessionStorage`; at checkout `trackOrdered(cartItemNames)`
emits `ordered` for the matching names and clears the buffer.

## Captured fields (`RecommendationEvent`)

| Field | Notes |
|---|---|
| `eventType` | impression \| click \| accepted \| dismissed \| ordered |
| `source` | engine `source_title` ("Chef's pairing", "People also ordered", …) or surface (`cart`, `chat`, `pairing`, `cart-rec`) |
| `recType` | the item `categoryType` (DISH/SIDE/DESSERT/BEVERAGE/STARTER/MAIN/WINE/DRINK) |
| `recommendedItemId` | best-effort menu id (the engine is name-keyed; usually null) |
| `recommendedName` | **the reliable join key** |
| `originatingItemId` / `originatingName` | the cart/item that triggered the recommendation |
| `rotationGroup` | the engine's rotation group, carried through `recommend()` |
| `sessionId` | per-browser id in `localStorage` (`reco_sid`) |
| `mode` | `customer` or `waiter` (server stamps `waiter` for authenticated callers) |
| `chef` | whether this was a chef recommendation |
| `value` | item price — used for revenue attribution on accepted/ordered |
| `createdAt` | event time |

## API contracts

### `POST /Trump/api/reco/events` — ingest (public)

Public (guests have no session); sanitised hard, capped at 100 events/request, and
rate-limited (shares the generous chat bucket). Fire-and-forget.

```jsonc
// request — a single event or { "events": [ … ] }
{ "events": [
  { "eventType": "impression", "recommendedName": "Porcupine Ridge Shiraz",
    "source": "Chef's pairing", "recType": "WINE", "rotationGroup": "chef:ribeye:reds",
    "originatingName": "Ribeye", "sessionId": "s_abc", "mode": "customer",
    "chef": true, "value": 0 }
] }
// response (always 202, never blocks the UX)
{ "ok": true, "stored": 1, "sink": "postgres" }   // sink: "postgres" | "json"
```

Events with an unknown `eventType` or no `recommendedName` are silently dropped by
`sanitizeEvent`.

### `GET /Trump/api/analytics/recommendations` — read (owner|manager)

Query params (all optional): `from`, `to` (ISO date), `category` (recType), `source`,
`rotationGroup`, `mode`. Returns:

```jsonc
{
  "totals": { "impressions": 0, "clicks": 0, "accepted": 0, "dismissed": 0, "ordered": 0,
              "revenue": 0, "clickRate": 0, "acceptanceRate": 0, "dismissalRate": 0, "conversionRate": 0 },
  "topShown": [ /* RecoTally[] */ ], "topClicked": [], "topConverting": [], "topRevenue": [],
  "bySource": [], "byRotationGroup": [], "items": [], "eventCount": 0
}
```

Rates are fractions (`0.2` = 20%); the dashboard renders them as percentages.

## Storage

- **Primary:** Postgres `RecommendationEvent` (`createMany` on write; `findMany` with a
  filter where-clause, capped at 20 000 rows, on read).
- **Fallback:** when the DB (or the Prisma model) is unavailable,
  `RecommendationEventService` appends to `data/recommendation-events.json`, a serialized
  **ring buffer capped at 5 000 events**, with writes serialized through a promise chain to
  avoid interleaving. This keeps the dashboard working in dev/degraded mode. The JSON
  fallback is intended for low volume; production should run Postgres.

## Files

| File | Role |
|---|---|
| `client/src/lib/recoAnalytics.ts` | batching, dedupe, sendBeacon, ordered attribution |
| `server/services/recommendationAnalytics.js` | pure `sanitizeEvent` / `filterEvents` / `aggregate` |
| `server/services/recommendationEventService.js` | hybrid Postgres/JSON storage |
| `server/controllers/recommendationAnalyticsController.js` | ingest + read endpoints |
| `server/routes/recommendationAnalyticsRoutes.js` | route registration |
| `prisma/schema.prisma` → `RecommendationEvent` | table + indexes |
| `prisma/migrations/20260606000000_phase4_recommendation_event/migration.sql` | idempotent DDL |

## Troubleshooting

- **Dashboard shows nothing** — there may be no events yet, or the date filter excludes
  them. Confirm ingest with: `curl -XPOST .../Trump/api/reco/events -H 'content-type: application/json' -d '{"eventType":"impression","recommendedName":"Test"}'` → `{"ok":true,...}`.
- **`sink: "json"` in the response** — Postgres (or the generated Prisma model) is
  unavailable; run the migration and `npx prisma generate`. Events are still captured in
  `data/recommendation-events.json` meanwhile.
- **Events rejected** — `eventType` must be one of the five types and `recommendedName`
  must be non-empty (`sanitizeEvent`).
- **`ordered` never recorded** — it only fires for cart items whose names match a
  recommendation accepted earlier in the same browser session (`sessionStorage.reco_accepted`).
- **Rate limited (429)** — ingest shares the chat limiter; raise `TRUMP_CHAT_RATE_LIMIT_MAX`
  if a high-traffic venue trips it.
