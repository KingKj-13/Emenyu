# Hybrid Auth Compatibility

Date: 2026-05-21

## Read Order

Auth now resolves users in this order:

1. PostgreSQL via Prisma
2. JSON fallback from `Sites/Trump/data/accounts.json`

If a JSON fallback login succeeds, the account is safely re-synced to PostgreSQL when possible.

## Write Behavior

During Phase 2A, account changes are dual-written:

- PostgreSQL is the scalable primary store.
- JSON remains as a compatibility mirror and fallback.

This applies to account creation, password updates, suspension/reactivation, and logout session invalidation.

## Compatibility Guarantees

Unchanged:

- frontend login UI
- admin/waiter/customer routes
- signed session cookie behavior
- protected route middleware
- owner/manager/waiter permissions
- chatbot and recommendation routes
- JSON account compatibility

Temporary fallback can be disabled for verification with `TRUMP_AUTH_POSTGRES_ENABLED=false`; full JSON removal should wait for a later phase after production burn-in.

