# API — eMenyu Platform (post-Carmella)

All endpoints are mounted three ways for every tenant: bare (`/api/...`), under the tenant's `publicBasePath` (`/Carmella/api/...`), and lower-cased (`/carmella/api/...`) — see `server/utils/helpers.js`'s `tenantPaths()`. Static client/media assets are prefix-only (never served at bare `/`).

## Config & AI

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/api/config` | GET | none | Returns `assistantName`, `assistantPersona`, `brandName`, `waiterApkUrl`, `waiterLatestVersion`, and — **new** — `currentDayPart` (omitted entirely for tenants with no `DayPart` rows, i.e. Trump/Demo unaffected). Resolved server-side from real DB rows + current server time (SAST). |
| `/api/chat` | POST | none | Customer chatbot. `{message, tableId?, history?, ...}` → `{reply, suggestions[]}`. When `config.assistantPersona === 'gaspard'`, `reply` is composed by `gaspardVoice.js` over the exact same `suggestions` the shared engine produced — see `AI_ENGINE.md`. |
| `/api/ai-pairing` | POST | none | Per-item pairing box (ItemModal). `{name, price, description}` → `{title, foodPairings[], drinkPairings[], pairings[]}`. Now correctly surfaces curated `MenuItemRecommendation` (`recType='PAIRING'`) rows — see AD-007. |
| `/api/recommend` | POST | none | Cart-level suggestions. |
| `/api/waiter/cart-recommendations`, `/api/waiter/ordered-together` | POST | waiter+ | Waiter-surface variants, unchanged. |

## Menu (public read)

| Endpoint | Method | Notes |
|---|---|---|
| `/api/menu` | GET | Full menu, grouped by chapter → section → items. Each item now includes `story`, `subtitle`, `availability`, and `variants[]` (all optional/empty for tenants that don't use them). |
| `/api/menu/bundles` | GET | Active bundles ("Gaspard's Tables" for Carmella). Each bundle now includes `total`/`daypart` when set. |
| `/api/deals` | GET | Unchanged. |

## Menu (admin, owner/manager)

| Endpoint | Method | Notes |
|---|---|---|
| `/api/menu/items` | GET/POST | List/create items. |
| `/api/menu/items/:id` | PATCH/DELETE | `updateItem()` now also accepts `story`, `subtitle`, `availability` in the patch body. |
| `/api/menu/items/:id/availability` | PATCH | Now tenant-scoped on write (AD-003). |
| `/api/menu/items/:id/media` | PATCH | Now tenant-scoped on write (AD-003). |
| `/api/menu/categories` | GET | Unchanged. |
| `/api/menu/chef-recs`, `/api/menu/chef-recs/:id` | GET/POST/PATCH/DELETE | Now tenant-scoped on write (AD-003). This is also where Carmella's curated pairings live (`recType='PAIRING'`). |
| `/api/menu/bundles/admin`, `/api/menu/bundles/:id` | GET/POST/PATCH/DELETE | Unchanged. |

## Auth

Unchanged shape; every tenant gets real accounts (`/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/accounts`) except Demo, which stays on its no-auth bypass. Carmella's seed accounts: `carmella-owner`, `carmella-manager`, `carmella-waiter`, `carmella-kitchen`, `carmella-admin`.

## Push notifications

`/api/push/vapid-key`, `/api/push/subscribe` — unchanged endpoints, but the notification **payload** bug is fixed: push notifications used to hardcode `url: '/Trump/Waiter'` regardless of tenant; now uses the requesting tenant's real `publicBasePath`. `AdminPage.tsx`'s two calls to these endpoints were also fixed from hardcoded `/Trump/api/push/*` literals to the `ENDPOINTS` constants (they'd have silently called the wrong URL under any non-Trump `BASE_PATH`).

## Everything else

Analytics, reservations, ratings, operations (shifts/ownership/notifications/audit), native-device auth, waiter-AI routes — all unchanged in shape; every one now correctly derives its path aliases from `config.publicBasePath` via `tenantPaths()` instead of a hardcoded `/Trump` literal (AD-001), so every one of them now works correctly for Carmella (and any future tenant) without per-route changes.

Full endpoint constant list: `Sites/Trump/client/src/constants/api.ts` (`ENDPOINTS`).
