# Recommendation Performance Review (Phase 4, Task 5)

Audit of the recommendation execution path with **safe, behaviour-preserving**
optimizations only. Because the menu lives in Postgres and there is no local DB, this is
a static call-graph + query-count analysis (the most honest "measurement" available
offline) rather than wall-clock timing; the applied change is a pure de-duplication of
work, so it cannot change output.

## Server execution path

```
POST /api/chat ─▶ aiService.chat()
   ├─ getMenuContext()              ← fileService.loadMenu()  [1 menu query + buildMenuContext()]
   ├─ chatbotNlu.normalize()        ← pure
   ├─ knowledge.detectIntent/answer ← reads data/knowledge.json (no DB)
   └─ recommend() / build*Reply()
        ├─ getMenuContext()         ← BEFORE: a 2nd loadMenu() + buildMenuContext()
        ├─ loadRecommendations()    ← 1 query
        ├─ loadChefRecommendations()← 2 queries (recs + items)
        ├─ getOrderRecords()        ← orders + history (2)
        └─ getPopularityScores()    ← loadPopular() (1)   [orderRecords reused]

POST /api/ai-pairing ─▶ aiService.aiPairing()
   ├─ getMenuContext()              ← [1 menu query]
   └─ recommend()  → BEFORE: a 2nd getMenuContext()
```

### Finding 1 — the menu context was loaded & rebuilt twice per request (FIXED)

`chat()` and `aiPairing()` each build the full menu context, then call `recommend()`
(or a `build*Reply` helper) which built it **again** from the database. `loadMenu()` is
the heaviest query (all categories + every item, with `include`), and `buildMenuContext`
walks the whole tree. The item modal fires `aiPairing` on **every item open**, so this is
a hot path.

**Fix (safe, no behaviour change):** `recommend()` now accepts an optional
`menuContext`; `chat()`, `aiPairing()`, `buildPairingReply()`, `buildComboReply()` and
`buildWineReply()` pass the context they already built. Same data, computed once.

| Request | Full menu loads + builds — before | after |
|---|--:|--:|
| `POST /api/chat` (recommendation/pairing/wine/combo intents) | 2 | **1** |
| `POST /api/ai-pairing` (every item modal open) | 2 | **1** |
| `POST /api/recommend` (guest cart, waiter cart-rec) | 1 | 1 (unchanged) |

Roughly halves the menu query + tree-walk cost on the two hottest recommendation
endpoints.

### Finding 2 — per-call reload of orders/recommendations (DEFERRED, documented)

`recommend()` reloads recommendations, chef recs, order history and popular items on
every call. Within a single request that calls `recommend()` once this is correct and
cheap relative to the menu load. A request-scoped or short-TTL cache would help under
load, but TTL caching introduces staleness (a behaviour change) and request-scoped
memoization needs context threading — **out of scope for "no behaviour changes."**
Recorded as a Phase 5 candidate (invalidate on `menuUpdated`/`recommendationUpdated`).

## Client execution path

| Concern | Status | Detail |
|---|---|---|
| Duplicate fetches (guest cart) | OK | `CartRecommendations` debounces the cart signature 600 ms and cancels stale responses with a `cancelled` flag. |
| Duplicate fetches (waiter) | OK | `CartRecScreen` memoizes `cartSig` and only refetches when the cart actually changes. |
| Duplicate fetches (pairings) | OK | `ItemPairings` effect is keyed on `item.name`. |
| Analytics network spam | OK (new) | `recoAnalytics` **dedupes impressions** per `source|name|session`, **batches** them (1.2 s timer) and sends via `navigator.sendBeacon`; funnel events flush promptly; everything flushes on `pagehide`/visibility-hidden. Re-rendering a strip does not re-send impressions. |
| Unnecessary re-renders | Reviewed, not changed | `RecommendationCard` is presentational. `React.memo` was considered but the surfaces pass inline `onOpen`/`onAdd` callbacks (new refs each render) which would negate memoization, and the parents do not re-render in hot loops. Adding `memo` here would imply a benefit it can't deliver, so it was deliberately **not** applied. |

## Analytics ingest cost

- Writes are **fire-and-forget** and never block a response (`recordEvents` returns `202`
  immediately; the client uses `sendBeacon`/`keepalive`).
- Postgres writes use `createMany` (one round-trip per batch). The JSON fallback is a
  single serialized read-modify-write capped at 5 000 events.
- Reads aggregate **in memory** over a date-filtered window (cap 20 000 rows). For a
  single venue's volume this is well within budget and keeps the math identical to the
  offline-tested pure aggregator. A very high-volume deployment would move the
  aggregation into SQL `GROUP BY` (Phase 5 candidate).

## Validation that behaviour is unchanged

- `npm run reco:validate` — Phase 3 engine/safety/rotation/NLU suite still **41/41**
  (the `menuContext` passthrough does not touch these pure modules, and `recommend()`
  produces identical candidates given identical context).
- `npm run reco:health:test` — analyzer + aggregator self-tests **17/17**.
- `tsc --noEmit` and `vite build` clean; `node --check` clean on all changed server files.

## Summary

| Optimization | Type | Risk |
|---|---|---|
| `menuContext` passthrough in `recommend()` | de-duplicate work | none — identical data, computed once |
| Impression dedupe + batching + `sendBeacon` | fewer/0-blocking requests | none — analytics only |
| Considered & rejected: `React.memo`, TTL menu cache | — | rejected to avoid false benefit / staleness |
