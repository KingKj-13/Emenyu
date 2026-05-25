# Menu SQL Migration

Date: 2026-05-21

## Summary

Phase 2B added PostgreSQL-backed menu tables through Prisma while preserving the existing JSON API payload shape used by the customer menu, admin editor, waiter UI, chatbot, and recommendation engine.

## Applied Migration

Migration file:

- `prisma/migrations/20260521101500_menu_system/migration.sql`

Created tables:

- `MenuCategory`
- `MenuItem`
- `FeaturedItem`
- `Recommendation`
- `RestaurantMenuSettings`

Key indexes:

- category ordering by restaurant and parent
- item lookup by normalized name
- item ordering by category
- availability/featured/popular flags
- recommendation ordering
- featured item grouping

## Verification

Completed successfully:

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npx prisma migrate status`
- `npm run db:check`

Current database status: schema is up to date.

