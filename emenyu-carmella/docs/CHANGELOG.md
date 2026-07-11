# Changelog — Carmella Build

All entries from this build session (2026-07-10 → 2026-07-11). Not yet deployed to production.

## Added

- `Sites/Carmella/` — new tenant: `server.js`, `.env`, `.gitignore`, `scripts/import-menu.js`, optimized `Images/`.
- `Sites/Trump/ecosystem.config.js` — `emenuy-carmella-api` PM2 app entry (port 3015).
- `Sites/Trump/client/.env.carmella` — Carmella's Vite build-time environment.
- Prisma migration `20260710120000_carmella_phase1_schema` — `MenuItemVariant` and `DayPart` models; `story`/`subtitle`/`availability` on `MenuItem`; `intro` on `MenuCategory`; `total`/`daypart` on `RecommendationBundle`.
- `server/utils/dayPartResolver.js` — pure day-part window resolver.
- `server/services/nlg/gaspardVoice.js` — Carmella's deterministic AI persona voice.
- `config.assistantPersona` (env `TRUMP_ASSISTANT_PERSONA`) — persona-selection seam in `createConfig()`.
- `client/src/styles/carmella-theme.css` — tenant-scoped day-part theme tokens.
- Variant selector UI in `ItemModal` (radio + add-on checkboxes).
- Story-line and chapter-intro rendering (`ItemModal`, `CategorySection`).
- `emenyu-carmella/ARCHITECTURE_DECISIONS.md` — 7 entries (AD-001–AD-007).
- Full `emenyu-carmella/docs/` deliverable set (this file included).

## Changed (shared code, all backward-compatible)

- `server/utils/helpers.js` — new `tenantPaths()` helper; every hardcoded `/Trump`/`trump` route literal across `server.js` and 14 route files replaced with it (AD-001).
- `server/middleware/requestLogger.js` — health-check log-filter now config-driven, not hardcoded to `/Trump`.
- `server/services/pushService.js` — push-notification deep-link URL now uses the requesting tenant's real `publicBasePath`, not a hardcoded `/Trump/Waiter`.
- `server/controllers/orderController.js` — `redirectRoot()` now uses `config.publicBasePath`, not a hardcoded `/Trump/table1`.
- `client/src/pages/AdminPage.tsx` — two push-notification `fetch()` calls now use `ENDPOINTS` instead of hardcoded `/Trump/api/push/*` literals.
- `client/src/lib/imageResolver.ts` — `resolveThumbnail()`'s regex now built from `BASE_PATH`, not hardcoded to `/Trump|trump/`.
- `server/services/prismaMenuService.js` — `toggleItemAvailability`/`updateItemMedia`/`updateChefRecommendation`/`deleteChefRecommendation` now scope writes by `(id, restaurantId)` (AD-003); `dbItemToJson()`/`itemToCreateData()` extended for `story`/`subtitle`/`availability`/`variants`; new `loadDayParts()`; price falls back to cheapest variant when the base price is 0 (AD-007 companion fix).
- `server/services/aiService.js` — `publicItem()` now includes `availability`; `chat()` now applies the persona-voice swap as its final step when `config.assistantPersona === 'gaspard'`.
- `server/services/recommendationRules.js` — beverage-safety rules R1/R3 now bypass for chef-curated candidates, matching the already-documented "chef always wins" invariant (AD-007).
- `server/controllers/aiController.js` — `getConfig()` now async, surfaces `assistantPersona` and `currentDayPart`.
- `server/server.js` — `createRequestLogger`/`createAiController` call sites updated for the above; `config` threaded to every route-registration call.
- `client/src/main.tsx` — sets `document.documentElement.dataset.tenant` at boot.
- `client/src/context/AppContext.tsx` — fetches config once, exposes `dayPart`, sets `data-theme`.
- `client/src/types/menu.ts` — `MenuItemVariant` type; `MenuItem`/`MenuSection`/`MenuCategory` extended; new `AppConfig`/`DayPart` types.
- `client/src/lib/menuUtils.ts` — `buildMenuSections()` threads `intro` through.
- `client/src/services/api.ts`, `client/index.html` — `AppConfig` typed return; Fraunces/Inter added to the shared font link.
- `Sites/Trump/scripts/media-optimize.js` — generalized to accept `--dir`/`--restaurant-id` instead of being hardcoded to Trump's own path (used to optimize Carmella's images, not duplicated).
- `prisma/schema.prisma` — see Prisma migration above.

## Fixed

- Cross-tenant write-path isolation gap (4 methods in `prismaMenuService.js` — AD-003).
- Chef-curated beverage pairings silently overridden by a diversity heuristic (AD-007) — affects every tenant's chef-curated recommendations, not just Carmella's.
- Bundle line items and variant-only menu items (coffees, wines by the glass) displaying R0 instead of a real price.
- A missing-migration regression on `emenyu_demo` (caught by this build's own regression discipline, fixed within the same session).

## Reverted (considered, then backed out)

- `User.restaurantId` schema change — too risky to rush given the number of live auth lookup sites it would touch; documented in AD-002 as deliberately deferred.
