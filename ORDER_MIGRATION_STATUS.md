# Order Migration Status

Date: 2026-05-21

## Migrated Data

Migrated from current JSON operational files into PostgreSQL:

- active orders: 4
- history orders: 20
- table cart states: 4

Current PostgreSQL counts after validation cleanup:

- active orders: 4
- history orders: 20
- deleted orders: 0
- table cart states: 4
- waiter assignments: 0

## Preserved JSON Sources

The following JSON compatibility folders remain active:

- `Sites/Trump/orders`
- `Sites/Trump/history`
- `Sites/Trump/tables`

JSON fallback remains available and should not be removed until a later burn-in phase.

