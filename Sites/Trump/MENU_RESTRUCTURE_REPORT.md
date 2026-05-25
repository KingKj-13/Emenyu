# Menu Restructure Report

Generated: 2026-05-19

## New Structure

The large menu is now split under:

- `food/menu_sections/index.json`
- `food/menu_sections/01-starters.json`
- `food/menu_sections/02-salads.json`
- `food/menu_sections/03-sushi.json`
- `food/menu_sections/...`
- `food/menu_sections/24-mocktails-and-cold-beverages.json`

`food/menu_sections/index.json` is the source manifest and preserves display order.

## Compatibility

- `/Trump/api/menu` still returns the same combined object shape used by the customer UI, admin UI, waiter UI, chatbot, and recommendation engine.
- `food/TrumpMenu.json` remains as a regenerated compatibility snapshot for older local Python loaders such as `ChatBot.py`, `recommend.py`, `pop_recommend.py`, and `josh_enterprise`.
- Admin menu saves now write both the modular sections and the compatibility snapshot.

## Validation

- Split manifest entries: 24.
- Rebuilt menu categories: 24.
- Runtime menu item count: 439.
- Rebuilt split menu matched `food/TrumpMenu.json` at the JSON object level.
- Recommendation and chatbot endpoints successfully consumed the split-built menu through `FileService`.
