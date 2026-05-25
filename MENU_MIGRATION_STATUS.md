# Menu Migration Status

Date: 2026-05-21

## Migrated Data

Migrated from current JSON menu files into PostgreSQL:

- root categories: 24
- total categories and subcategories: 87
- menu items: 439
- recommendation groups: 5
- popular entries: 8

## Preserved JSON Sources

The following JSON compatibility files remain in place:

- `Sites/Trump/food/TrumpMenu.json`
- `Sites/Trump/food/menu_sections/index.json`
- `Sites/Trump/food/menu_sections/*.json`
- `Sites/Trump/food/recommendations.json`
- `Sites/Trump/food/popular.json`

JSON fallback is still active and should not be removed until a later production burn-in phase.

