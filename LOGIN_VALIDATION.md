# Login Validation

Date: 2026-05-21

## Automated Checks

Passed:

- owner login
- manager login
- waiter login
- owner protected admin access
- manager protected admin access
- waiter protected page access
- waiter blocked from admin API
- waiter redirected away from admin page
- session persistence across repeated `/api/auth/me`
- logout invalidates existing session token
- account creation persists through auth API
- account suspension blocks login
- Prisma role lookup
- PostgreSQL account persistence
- JSON fallback when PostgreSQL auth is disabled

## Validation Note

The HTTP role-flow test used temporary validation password hashes for `owner`, `manager`, and `waiter`, then restored the original JSON and PostgreSQL records. This avoided exposing or guessing production credentials while validating the live auth paths.

