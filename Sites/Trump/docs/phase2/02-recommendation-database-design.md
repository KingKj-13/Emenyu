# Task 2 — Chef-Controlled Recommendation: Database Design (Proposal)

**Design only — do NOT migrate in this phase.** Resolves audit findings F7 (chef
curation is low-leverage) and F8 (hardcoded demo bundles).

## 1. Goal

Every menu item can carry chef-authored recommendations across four buckets —
**dishes, sides, desserts, beverages** — each with **priority**, **active/inactive**,
**seasonal window**, and **rotation group**. Chef intent must be able to win over the
algorithm (the Phase 2 priority).

## 2. What exists today (baseline)

- `MenuItem.chefPick` / `popular` — booleans, not consumed by `recommend()`.
- `Recommendation` — group-level lists (`description` + `items[]`), cart-gated.
- `FeaturedItem` (group=`popular`) — flat featured list.

None expresses "for item X, recommend items A/B/C as the wine / the side / the dessert."

## 3. Proposed model (Prisma — PROPOSAL, not applied)

```prisma
// One chef-authored recommendation: "from this item, suggest that item, as a <type>."
enum RecommendationType { DISH SIDE DESSERT BEVERAGE }
// Sub-type used for the "one primary beverage" safety rule (see Task 3).
enum BeverageKind { WINE COCKTAIL BEER SOFT HOT NONE }
enum SeasonTag { ALL_YEAR SUMMER WINTER SPRING AUTUMN FESTIVE }

model MenuItemRecommendation {
  id             Int                @id @default(autoincrement())
  restaurantId   String             @default("trump")

  sourceItemId   Int                                  // the item being viewed/ordered
  sourceItem     MenuItem           @relation("RecoSource", fields: [sourceItemId], references: [id], onDelete: Cascade)
  targetItemId   Int                                  // the item being recommended
  targetItem     MenuItem           @relation("RecoTarget", fields: [targetItemId], references: [id], onDelete: Cascade)

  recType        RecommendationType
  beverageKind   BeverageKind       @default(NONE)    // required when recType = BEVERAGE

  priority       Int                @default(100)     // higher = stronger; chef-tunable
  active         Boolean            @default(true)
  season         SeasonTag          @default(ALL_YEAR)
  startsAt       DateTime?                            // optional explicit seasonal window
  endsAt         DateTime?
  rotationGroup  String             @default("")      // members rotate (see Task 4); "" = always show

  note           String             @default("")      // chef's one-line reason (shown as the card reason)
  createdBy      String             @default("system")
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@unique([restaurantId, sourceItemId, targetItemId, recType])
  @@index([restaurantId, sourceItemId, active, recType])
  @@index([restaurantId, rotationGroup])
  @@index([restaurantId, season, active])
}

// MenuItem additions (relations only; existing fields unchanged):
//   recommendationsFrom MenuItemRecommendation[] @relation("RecoSource")
//   recommendationsTo   MenuItemRecommendation[] @relation("RecoTarget")
```

### Optional companion (replaces the hardcoded persona bundles, F8)

```prisma
// Chef-editable "one-tap" bundles — replaces client/src/constants/recommendedOrders.ts.
model RecommendationBundle {
  id            Int      @id @default(autoincrement())
  restaurantId  String   @default("trump")
  title         String                              // "The Steak Lover"
  blurb         String   @default("")
  icon          String   @default("")
  accent        String   @default("")
  active        Boolean  @default(true)
  season        SeasonTag @default(ALL_YEAR)
  rotationGroup String   @default("")
  sortOrder     Int      @default(0)
  items         BundleItem[]
}
model BundleItem {
  id        Int    @id @default(autoincrement())
  bundleId  Int
  bundle    RecommendationBundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  itemId    Int                                   // FK to a real MenuItem (no name drift)
  course    String                                // Drink|Starter|Main|Dessert
  sortOrder Int    @default(0)
}
```

## 4. Why this shape

- **Per-item + typed** (`recType`) gives the chef exactly the four buckets requested,
  and `beverageKind` lets the safety layer (Task 3) enforce "one primary beverage" and
  "no wine+cocktail together" without re-parsing names.
- **FK targets** (not free-text names) eliminate the name-drift that the current
  `Recommendation.items` JSON and the demo bundles suffer from (F8).
- **`priority`** is the lever that lets chef recs outrank algorithmic candidates: in
  `recommend()`, chef recs would be injected at a score band strictly above all
  algorithmic bands (e.g. `1000 + priority`), so a populated chef set always leads.
- **`active` / `season` / `startsAt`–`endsAt`** support seasonal menus and instant
  enable/disable without deletion.
- **`rotationGroup`** is consumed by [Task 4](Sites/Trump/docs/phase2/04-recommendation-rotation-design.md)
  to vary which of several equal-priority recs is shown.

## 5. How `recommend()` would consume it (design note — not implemented)

1. Resolve the cart/source item id(s).
2. Load active, in-season `MenuItemRecommendation` rows for those source ids.
3. Emit candidates at score `1000 + priority` tagged `source_title = note || "Chef's pairing"`.
4. Run the existing algorithmic sources **below** that band as fallback/fill.
5. Apply the Task 3 category-safety filter to the merged list before slicing.
6. Apply Task 4 rotation among equal-priority / same-rotationGroup ties.

This preserves the current engine as the fallback while making chef curation
authoritative when present.

## 6. Migration & compatibility (planning only)

- Additive tables; **no change** to existing `MenuItem`/`Recommendation`/`FeaturedItem`,
  so the current engine keeps working during rollout.
- Backfill path: translate existing `Recommendation` groups into per-item rows
  (cartesian within a group, `recType` inferred from target `categoryType`,
  `priority` from `sortOrder`), and seed the 5 demo personas into `RecommendationBundle`
  with FK-validated items.
- Admin UI (later phase) needs CRUD for these tables; out of scope here.
- A new Prisma migration + `prisma generate` will be required **when** implemented — not
  in this phase.

## 7. Open questions for the chef/owner

- Should beverage primacy be per-`beverageKind` (one wine *and* one soft allowed) or one
  beverage total? (Task 3 proposes a default; chef-configurable.)
- Do bundles rotate per session or per day? (Task 4 covers both modes.)
- Seasonal granularity: tag-based (`SeasonTag`) vs explicit date windows vs both
  (proposed: both, with explicit dates winning).
