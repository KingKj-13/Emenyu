# Prisma Menu Report

Date: 2026-05-21

## Implemented

Added `Sites/Trump/server/services/prismaMenuService.js` with PostgreSQL-backed support for:

- menu categories and subcategories
- menu items
- item visibility and media visibility
- pricing and item metadata
- popular/featured records
- recommendation groups
- restaurant menu settings
- JSON-to-PostgreSQL migration

Updated `Sites/Trump/server/services/fileService.js` so existing callers continue using:

- `loadMenu`
- `saveMenu`
- `loadRecommendations`
- `saveRecommendations`
- `loadPopular`

## Preserved Behavior

No frontend menu rendering code was rewritten. The API response from `/api/menu` remains the current nested JSON object, so category rails, featured rails, item cards, cart behavior, admin editing, waiter menu loading, chatbot context, and recommendation logic keep their existing contract.

## Runtime Safety

PostgreSQL is tried first. If Prisma or PostgreSQL is unavailable, the service falls back to the existing JSON files in `Sites/Trump/food`.

