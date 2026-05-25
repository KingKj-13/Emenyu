# Hybrid Order Compatibility

Date: 2026-05-21

## Read Order

Operational reads now use:

1. PostgreSQL via Prisma
2. JSON fallback from `Sites/Trump/orders`, `Sites/Trump/history`, and `Sites/Trump/tables`

## Write Behavior

Operational writes are mirrored:

- Orders are written to JSON and PostgreSQL.
- Table cart state is written to JSON and PostgreSQL.
- Order status movement updates PostgreSQL and mirrors JSON file movement when the file exists.
- Deletes mark PostgreSQL rows as `deleted` and remove JSON files when present.

## Compatibility Guarantees

Preserved:

- customer ordering
- cart behavior
- waiter dashboard flows
- waiter add-items
- table archive
- admin current orders
- admin order history
- recommendations that read order history
- chatbot/order context dependencies
- Socket.IO event names and payloads
- JSON fallback

Temporary fallback can be tested with `TRUMP_ORDER_POSTGRES_ENABLED=false`.

