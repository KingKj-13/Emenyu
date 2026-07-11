# Database — eMenyu Platform (post-Carmella)

## Isolation model

One shared Prisma schema (`prisma/schema.prisma`, repo root), one dedicated **database** per tenant (not just a shared-database-with-row-scoping — Trump, Demo, and Carmella each get their own Postgres database: `emenyu`/`emenyu_local`, `emenyu_demo`, `emenyu_carmella`). Every operational model additionally carries `restaurantId String @default("trump")` for defense-in-depth and for any future move to a shared database.

## Schema changes made for Carmella (migration `20260710120000_carmella_phase1_schema`)

All additive — no columns dropped, no types changed on existing columns.

| Model | Change | Why |
|---|---|---|
| `MenuItem` | `+story`, `+subtitle`, `+availability` (String, default `'available'`) | Narrative copy + a 3-state availability (`available`/`ask`/`unavailable`) superset of the existing boolean |
| `MenuCategory` | `+intro` | Chapter narrative opener text |
| `RecommendationBundle` | `+total` (nullable Float), `+daypart` | Fixed all-in bundle price override; day-part filter |
| `MenuItemVariant` | **new model** | Multi-choice items (name, price, image, `isAddon` flag), FK to `MenuItem` with cascade delete |
| `DayPart` | **new model** | Time-windowed content: slug, name, `fromTime`/`toTime` (HH:MM), greeting, `leadChapters`/`gaspardChips`/`suggestStrip` (Json) |

**No schema change was needed for pairings** — Carmella's curated item-to-item pairings reuse the existing `MenuItemRecommendation` model with a new `recType='PAIRING'` value and its existing `reason` field as the note.

**Considered and reverted:** adding `restaurantId` to `User` (to allow non-unique usernames across tenants). Reverted because it would require finding and updating every username-keyed auth lookup in the live login/session path — too risky to rush. Current design: usernames stay globally unique across the whole platform; Carmella's real accounts use prefixed usernames (`carmella-owner`, etc.). See `ARCHITECTURE_DECISIONS.md` AD-002 for the full reasoning.

## Applying this migration

This is a **shared-schema** migration — it must be applied to every database that runs this schema, not just Carmella's:

```bash
# Local dev — each database explicitly, never rely on a default .env
DATABASE_URL="postgresql://…/emenyu_local?schema=public"   npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://…/emenyu_demo?schema=public"    npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://…/emenyu_carmella?schema=public" npx prisma migrate deploy --schema prisma/schema.prisma
```

**Production still needs this migration applied** (to `emenyu` and whatever Demo's production database is called) before Carmella — or this migration's fixes — can go live. Skipping a database breaks its `GET /api/menu` outright (a real regression caught and fixed during this build — see `MONDAY_DEMO.md`).

A note on `emenyu_local`: this machine's local dev Postgres instance also hosts tables belonging to the off-limits `luxury/` app, managed by its own Alembic migrations (`AppRelease`, `BrainOutput`, `ContentVersion`, `DiningSession`, `LuxuryItemContent`, `alembic_version`). **Do not run `prisma migrate dev` or `prisma db push` against `emenyu_local`** — both tools want to reconcile every table in the database against `schema.prisma` and will try to drop the Luxury tables since they aren't modeled there. This migration was applied via `prisma db execute` (a plain SQL executor, no reconciliation) instead, followed by `prisma migrate resolve --applied` to update the migration-history bookkeeping. `emenyu_demo` and `emenyu_carmella` have no such conflict and were migrated normally with `migrate deploy`.

## Carmella's imported data (via `scripts/import-menu.js`)

Idempotent — safe to re-run any time `data/carmella-menu-data.json` changes (wipes and rebuilds this tenant's rows in one transaction first):

- 8 chapters → root `MenuCategory` rows (`intro` populated)
- 26 sections → child `MenuCategory` rows
- 190 items → `MenuItem` rows (`story`, `availability`, `imagePath` populated; `imagePath` resolves to the optimized WebP when present, falling back to the raw filename)
- 61 variants → `MenuItemVariant` rows (`isAddon` read directly from the source JSON)
- 3 day-parts → `DayPart` rows
- 3 bundles + their line items → `RecommendationBundle`/`RecommendationBundleItem` (line-item prices resolved from each item's own price, falling back to its cheapest non-addon variant price for variant-only items like coffees and wines-by-the-glass)
- 39 pairings → `MenuItemRecommendation` rows with `recType='PAIRING'`

Reconciliation: 0 missing images, 0 unmatched pairing sources/targets on every run this session.

## Cross-tenant write-path security fix (AD-003)

`prismaMenuService.js`'s `toggleItemAvailability`, `updateItemMedia`, `updateChefRecommendation`, and `deleteChefRecommendation` used to mutate rows by `id` alone — since `MenuItem.id`/`MenuItemRecommendation.id` are global autoincrement sequences shared across every tenant's rows in the same table (were this ever a shared database), an authenticated session on one tenant could mutate another tenant's row by guessing its numeric id. Fixed to scope every write by `(id, restaurantId)`, matching the pattern `updateItem()` already used. Independent of Carmella — this closes a real gap for Trump/Demo too.

## Full current schema

See `prisma/schema.prisma` at the repo root — 24 models, all documented inline with phase-history comments.
