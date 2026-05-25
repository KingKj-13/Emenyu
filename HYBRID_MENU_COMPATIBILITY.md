# Hybrid Menu Compatibility

Date: 2026-05-21

## Read Order

Menu reads now use:

1. PostgreSQL via Prisma
2. JSON fallback from `Sites/Trump/food`

If PostgreSQL has no menu data yet, the JSON menu is migrated into PostgreSQL automatically when the service initializes.

## Write Behavior

Admin menu saves keep JSON compatibility and mirror the menu into PostgreSQL:

- JSON files remain available for rollback/fallback.
- PostgreSQL becomes the scalable primary query source.
- Recommendation saves are also mirrored into PostgreSQL.

## Compatibility Guarantees

Preserved:

- customer menu rendering
- category rails
- featured rails
- Most Popular
- Trending
- Chef Recommended
- Perfect Pairings
- People Also Ordered
- chatbot menu context
- recommendation engine
- admin menu editor
- waiter menu access
- JSON fallback

Temporary fallback can be tested with `TRUMP_MENU_POSTGRES_ENABLED=false`.

