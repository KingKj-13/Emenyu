# Phase 4 — Recommendation Analytics & Production Hardening

Builds on [Phase 3](../phase3/README.md). Scope: `Sites/Trump` only. Local and
deterministic — no external services. Branch `feat/phase3-reco-implementation`.
**Not deployed, not merged.**

## What shipped

| Task | Deliverable | Where |
|---|---|---|
| 1 | Recommendation lifecycle event pipeline (impression/click/accepted/dismissed/ordered) | `client/src/lib/recoAnalytics.ts`, `server/services/recommendationAnalytics.js` + `recommendationEventService.js`, `controllers/recommendationAnalyticsController.js`, `routes/recommendationAnalyticsRoutes.js`, `RecommendationEvent` model + migration |
| 2 | Admin → **Reco Analytics** dashboard (metrics + filters) | `client/src/pages/AdminPage.tsx` (`RecoAnalyticsPanel`) |
| 3 | `RecommendedOrders` standardized onto `RecommendationCard` | `client/src/components/menu/RecommendedOrders.tsx` (+ CSS) |
| 4 | `npm run reco:health` data-integrity checks + offline self-test | `server/services/recommendationHealth.js`, `scripts/reco-health.js` |
| 5 | Recommendation performance review + safe optimization | `server/services/aiService.js` (`menuContext` passthrough) |
| 6 | Documentation | this folder |

## Docs

1. [analytics.md](analytics.md) — event pipeline architecture, API contracts, data model, data flow, troubleshooting.
2. [dashboard.md](dashboard.md) — the Reco Analytics dashboard, metric definitions, filters.
3. [health-checks.md](health-checks.md) — `reco:health`, checks, codes, JSON report, troubleshooting.
4. [performance-review.md](performance-review.md) — execution-path audit, findings, applied/deferred optimizations.

## Commands

```bash
cd Sites/Trump
npm run reco:validate       # Phase 3 engine/safety/rotation/NLU suite (41/41)
npm run reco:health:test    # Phase 4 health analyzer + analytics aggregator self-test (17/17, no DB)
npm run reco:health         # live chef-rec integrity check (needs Postgres)
cd client && npm run typecheck && npm run build
```

## Production notes

- Apply the migration and regenerate the client on deploy:
  `npx prisma migrate deploy --schema prisma/schema.prisma` then `npx prisma generate`.
  Until then, analytics ingest transparently falls back to
  `data/recommendation-events.json` (a 5 000-event ring buffer).
- Event ingest (`POST /api/reco/events`) is public (guests have no session), hard-sanitised,
  capped at 100 events/request, and rate-limited (shares the chat bucket).
- The read endpoint and dashboard are `owner | manager`.

## Remaining production risks / Phase 5 candidates

- **JSON fallback is for dev/degraded mode**, not sustained high volume — run Postgres in
  production.
- **Analytics ingest is unauthenticated** (by necessity for guests); abuse is bounded by
  the rate limiter and hard sanitisation, not by auth.
- **In-memory aggregation** over a date window suits a single venue; move to SQL `GROUP BY`
  for very high volume.
- **`recommend()` reloads supporting data per call** (orders/recs/popular) — a TTL/
  request-scoped cache was deferred to avoid staleness (a behaviour change).
- `RecommendedOrders` still uses the hardcoded `recommendedOrders.ts` persona bundles
  (audit F8); the DB-backed `RecommendationBundle` table remains a Phase 5 item.
