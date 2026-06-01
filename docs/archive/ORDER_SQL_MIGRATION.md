# Order SQL Migration

Date: 2026-05-21

## Summary

Phase 2C added PostgreSQL-backed operational order and table models through Prisma while preserving the existing JSON order and table files as temporary fallback/mirror storage.

## Applied Migrations

Migration files:

- `prisma/migrations/20260521103000_order_table_system/migration.sql`
- `prisma/migrations/20260521104000_order_filename_scope/migration.sql`

Created tables:

- `Table`
- `Order`
- `OrderItem`
- `OrderStatusHistory`
- `ActiveCartState`
- `WaiterAssignment`

Important note: order filename uniqueness is scoped to `restaurantId + sourceKind + filename` because the legacy JSON data contains at least one filename in both active orders and history.

## Verification

Completed successfully:

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npx prisma migrate status`
- `npm run db:check`

Current database status: schema is up to date.

