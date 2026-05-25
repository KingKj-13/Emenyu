# Realtime Validation

Date: 2026-05-21

## Passed Checks

Validated:

- owner auth for admin order operations
- waiter auth for waiter order operations
- cart update persistence
- cart clear after customer order submit
- customer order submission
- admin complete order
- admin mark incomplete
- admin delete order
- waiter add-items flow
- waiter table status flow
- table archive flow
- `syncCart` event path
- `orderPlaced` event path
- `waiterOnTheWay` event path
- `waiterCallAlert` event path
- PostgreSQL order status persistence
- PostgreSQL waiter assignment persistence

## Validation Note

The runtime validation used temporary table IDs and temporary validation account hashes, then restored original account records and removed temporary orders, carts, and waiter assignments from JSON and PostgreSQL.

