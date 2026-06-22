# Database-backed Recommendation Bundles (Phase 5, Task 1)

The menu "Not sure what to order?" persona bundles are now stored in Postgres and managed
in the admin console, replacing the hardcoded client constant (kept only as an offline
fallback). Existing bundle UI/behaviour is preserved.

## Data model

```
RecommendationBundle 1───* RecommendationBundleItem
  id, restaurantId, slug, persona, description,        bundleId (FK, cascade)
  icon, accent, active, priority, rotationGroup,        course, itemName, itemId?,
  sortOrder, createdBy, createdAt, updatedAt            price, sortOrder
```

A bundle groups items by a `course` label (Drink / Starter / Main / Dessert / …); a
course may have multiple items. Migration: `20260606120000_phase5_recommendation_bundle`
(idempotent).

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/Trump/api/menu/bundles` | public | active bundles in `PersonaOrder` shape for the guest menu |
| GET | `/Trump/api/menu/bundles/admin` | owner\|manager | all bundles (incl. inactive) for management |
| POST | `/Trump/api/menu/bundles` | owner\|manager | create |
| PATCH | `/Trump/api/menu/bundles/:id` | owner\|manager | update fields and/or replace items |
| DELETE | `/Trump/api/menu/bundles/:id` | owner\|manager | delete (cascades items) |

The public GET returns the exact `PersonaOrder` shape the client already renders
(`{ id, persona, icon, blurb, accent, courses: [{ course, name, price }] }`), so no UI
change was needed.

## Storage & fallback (resilience)

`recommendationBundleService` is Postgres-primary with a JSON fallback
(`data/recommendation-bundles.json`):

```
listActive()  → Postgres (active, priority-ordered, items included)
              → else JSON fallback
              → else []  ⇒ client uses its built-in constant
```

Writes (admin management) require Postgres. The client (`RecommendedOrders.tsx`) paints
from the built-in constant immediately, then swaps in live bundles when the API resolves —
so the strip always shows something, online or off.

## Admin management

Admin → **Bundles** (`owner|manager`). Create a bundle (persona, icon, accent, priority,
rotation group, description) with a courses-&-items editor; toggle active, edit priority /
rotation group, edit courses, or delete. Source of truth is the database; changes take
effect on the guest menu's next load.

## Seeding

```bash
npm run bundles:seed -- --apply   # upsert the 5 personas into Postgres (idempotent) + refresh the JSON fallback
npm run bundles:seed -- --json     # write only the JSON fallback (dev, no DB)
npm run bundles:seed -- --clear    # remove seed-created bundles
```

The seed data is ported verbatim from the original `recommendedOrders.ts` constant, so a
freshly-seeded database reproduces the previous bundles exactly.

## Analytics

Bundle surfaces emit recommendation events with `source: "bundle"` and the persona in
`originatingName`, so the dashboard attributes impressions/clicks/accepts per persona
(see [attribution-and-optimization.md](attribution-and-optimization.md) → "By bundle").

## Files

`server/services/recommendationBundleService.js`, `controllers/recommendationBundleController.js`,
`routes/recommendationBundleRoutes.js`, `scripts/seed-bundles.js`,
`client/src/components/menu/RecommendedOrders.tsx`, `client/src/pages/AdminPage.tsx`
(`BundlesPanel`), schema `RecommendationBundle(+Item)`.
