# AUDIT-DATABASE.md — Phase 00 Database Audit

**Scope:** `prisma/schema.prisma` (root, shared) as used by Trump (PostgreSQL). **Date:** 2026-06-24.

---

## 1. Summary

Trump runs on **PostgreSQL via Prisma** (`@prisma/client` ^6.19). The schema has **20 models**, is well-indexed, and uses a denormalised `restaurantId String @default("trump")` on almost every model to anticipate multi-restaurant. Persistence is **hybrid** — Postgres is primary, with JSON files (`orders/`, `tables/`, `history/`, `data/accounts.json`) as a fallback.

**Multi-tenant readiness: partial.** The `restaurantId` column exists nearly everywhere, but there is **no `Restaurant` entity** and — critically — **the `User` (accounts) model has no `restaurantId`**, so staff accounts are global. Supporting genuinely separate owners/managers/waiters per restaurant requires schema changes (documented in §6, not implemented here).

---

## 2. Models (20)

| # | Model | Purpose | restaurantId? |
|---|---|---|---|
| 1 | `User` | staff accounts (auth) | **NO** |
| 2 | `MenuCategory` | menu tree (self-relation parent/children) | yes |
| 3 | `MenuItem` | dishes/drinks | yes |
| 4 | `FeaturedItem` | featured groupings | yes |
| 5 | `Recommendation` | legacy recommendation sets | yes |
| 6 | `MenuItemRecommendation` | Phase 3 per-item chef recs | yes |
| 7 | `RestaurantMenuSettings` | per-restaurant settings blob | yes (unique) |
| 8 | `Table` | tables | yes |
| 9 | `Order` | orders | yes |
| 10 | `OrderItem` | order line items | via order |
| 11 | `OrderStatusHistory` | status transitions | via order |
| 12 | `OrderRating` | post-meal ratings | yes |
| 13 | `ActiveCartState` | live cart per table | yes |
| 14 | `WaiterAssignment` | waiter↔table | yes |
| 15 | `Guest` | CRM/guest profiles | yes |
| 16 | `UpsellEvent` | upsell tracking | yes |
| 17 | `WaiterTask` | Waiter V2 task queue | yes |
| 18 | `RecommendationEvent` | Phase 4 reco analytics events | yes |
| 19 | `RecommendationBundle` + `RecommendationBundleItem` | Phase 5 DB-backed bundles | yes / via bundle |
| 20 | `Reservation`, `PushSubscription` | bookings, web-push | yes |

---

## 3. Relationships (foreign keys)

- `MenuCategory` → self (`parentId`, `onDelete: Cascade`) → `MenuItem` (`categoryId`, Cascade).
- `Table` —(composite key `[restaurantId, tableId]`)→ `Order`, `ActiveCartState`, `WaiterAssignment`. **Orders reference tables by the composite natural key**, not surrogate id — a deliberate but unusual choice.
- `Order` → `OrderItem` (Cascade), `OrderStatusHistory` (Cascade), `OrderRating` (Cascade, unique per order), `Guest` (optional `guestId`).
- `RecommendationBundle` → `RecommendationBundleItem` (Cascade).
- `MenuItemRecommendation` references `MenuItem.id` via `sourceItemId`/`targetItemId` but **as plain Int columns, not declared Prisma relations** (FK-constrained only in raw SQL, per the schema comment). Slight integrity gap at the ORM layer.
- `RecommendationEvent` stores `recommendedItemId`/`originatingItemId` as **best-effort, name-keyed** (no FK) — by design (engine is name-keyed).

---

## 4. Indexes

Indexing is thorough and query-shaped:
- `User`: `role`, `suspended`.
- `MenuItem`: `[restaurantId, normalizedName]`, `[restaurantId, categoryId, sortOrder]`, `visible`, `available`, `chefPick`, `popular`.
- `Order`: 7 indexes incl. `[restaurantId, status, timestamp]`, `[restaurantId, tableId, status]`, `[restaurantId, kitchenStatus]`, `[restaurantId, waiterName, status]`, plus unique `[restaurantId, sourceKind, filename]`.
- `WaiterTask`, `RecommendationEvent`, `Guest`, `Reservation`, `RecommendationBundle` all carry composite indexes leading with `restaurantId`.

No obvious missing index for current query patterns. **Good.**

---

## 5. Role / multi-owner support (current)

- **Roles** live as a free-text `User.role String` (no enum, no `Role` table). Valid roles enforced in app code (`accountService` `VALID_ROLES = owner|manager|waiter|kitchen`), not in the DB.
- **Multiple owners/managers/waiters of the *same* restaurant: supported today** — any number of `User` rows with `role='owner'` etc. `createdBy` tracks who provisioned the account; `canManageRole` enforces hierarchy in code.
- **Per-restaurant ownership: NOT supported** — `User` has no `restaurantId`, and `username` is **globally unique**. Two restaurants cannot both have a `manager` account, and an owner of restaurant A is not distinguishable from restaurant B at the data layer.
- **Waiter→table scoping:** `WaiterAssignment` exists; `accountService` also has an `assignedTables` field (JSON-side only, not in the Prisma `User` model) — an inconsistency.

---

## 6. Multi-restaurant readiness — schema changes required later (NOT implemented)

To support multiple restaurants with isolated owners/managers/waiters:

1. **Add a `Restaurant` model** (`id`, `slug`, `name`, `status`, settings) as the tenant root.
2. **Add `restaurantId` to `User`** and change uniqueness from `@unique username` to `@@unique([restaurantId, username])`. This is the central blocker for true multi-tenancy.
3. **Promote `role` to an enum** (or `Role` table) and add `assignedTables` to the `User` model (currently only in JSON).
4. **Convert `restaurantId` defaults** from the literal `"trump"` to FK references to `Restaurant`.
5. **Add row-level scoping** at the service layer so every query is filtered by the authenticated user's restaurant (today everything assumes `"trump"`).
6. Consider a surrogate `Table.id`-based FK for `Order` instead of the composite natural key, to simplify multi-tenant joins.

These are **future** items; per Phase 00 rules they are documented, not built.

---

## 7. Persistence integrity observations

- **Hybrid risk:** orders/tables/carts exist both in Postgres and JSON files. `accountService` writes accounts to both `data/accounts.json` and `User`. If the two diverge (e.g., a Postgres outage during a write), reconciliation is `updatedAt`-based (`shouldUpdateFromJson`) — works, but is a consistency hazard at scale.
- **`BigInt sessionInvalidBefore`** on `User` is used for server-side session invalidation (good), serialised to Number in app code.
- **No soft-delete pattern** on orders/menu (hard deletes via Cascade) — acceptable, but order deletes (`DELETE /delete/:type/:file`) remove history.
- **Migrations:** applied via `npx prisma migrate deploy`. Per project memory, production (134.122.99.78) is caught up through the WaiterTask/reco-event/bundle/covers migrations as of 2026-06-23.

---

## 8. Recommendations

1. (Future) Implement the `Restaurant` model + `User.restaurantId` before onboarding a second venue — **hard blocker for multi-tenant**.
2. Add the missing `User.assignedTables` field to the Prisma model (currently JSON-only) to remove the schema/app mismatch.
3. Declare `MenuItemRecommendation` source/target as real Prisma relations for ORM-level integrity.
4. Decide the authoritative store and reduce dual-write surface (see AUDIT-BACKEND §6).
5. Establish an automated `pg_dump` backup (see AUDIT-DEPLOYMENT) — there is no DB backup automation in the repo today.
