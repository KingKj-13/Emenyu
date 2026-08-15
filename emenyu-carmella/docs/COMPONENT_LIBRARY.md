# Component Library — Reuse Map

One React component tree (`Sites/Trump/client/src/`) serves every tenant. This is the reuse audit: what Carmella gets for free, what needed a small generic extension, and the one new interaction pattern.

## Reused as-is (zero changes)

- **Cart/checkout**: `CartDrawer`, `CartItem`, `BottomBar`, `ReceiptView`, `CartContext` — fully data-driven, no Trump-specific strings.
- **Menu browsing shell**: `MenuPage`'s default grid view, `CategorySection`, `CategoryTabBar`, `MenuSkeletonGrid` — render whatever chapters/sections/items the API returns; Carmella's real chapter names ("The Morning Pages", etc.) appear correctly with no Carmella-specific frontend chapter config.
- **Waiter app**: every waiter page/component — data-driven, verified via the shared `NlgProvider` wording layer.
- **Admin panel**: menu/order/analytics/operations tabs — generic CRUD over the same API. Two hardcoded `/Trump/api/push/*` fetch calls were found and fixed to use the `ENDPOINTS` constants (would have silently called the wrong URL under Carmella's `BASE_PATH` otherwise).
- **`resolveImage()`** (`lib/imageResolver.ts`): Carmella's items all carry an explicit `img` path (`/Images/<file>.webp`), which the existing "explicit path" branch already handles correctly — the Trump-specific keyword-matching fallback (`KEYWORD_MAP`, `Tomahawk.jpg` default) is simply never reached for Carmella's data. No new image resolver was needed.
- **Currency formatting**: `lib/currency.ts`'s `formatCurrency()` — ZAR is already correct for both Johannesburg tenants.

## Extended generically (small, tenant-agnostic changes)

- **`resolveThumbnail()`**: previously matched a hardcoded `/Trump|trump/` regex — fixed to build its pattern from the `BASE_PATH` constant, so every tenant's thumbnails resolve correctly (was silently falling back to full-resolution images for Carmella before this fix, which would have quietly regressed the exact "H1" perf bug Trump fixed once already).
- **`MenuItem` type**: added optional `story`, `subtitle`, `availability`, `variants[]` fields — empty/absent for tenants that don't use them (Trump), populated for Carmella.
- **`MenuSection`/`MenuCategory` types**: added optional `intro` field, threaded through `buildMenuSections()`.
- **`ItemModal`**: added conditional renders for `story` (serif italic, above description), `subtitle`, and a 3-state availability banner (`unavailable` vs `ask` get different copy) — all no-ops when the fields are absent.
- **`CategorySection`**: added a conditional `intro` render (chapter narrative opener) below the section title.
- **`AppContext`**: added one more `GET /api/config` field consumption (`currentDayPart`) and sets `data-theme` — a no-op for tenants where the field is absent.

## New interaction pattern: variant selector (`ItemModal`)

Trump's menu model has no concept of item variants (every dish is a single flat price). Carmella needs multi-choice items ("Amy's Choice": Plain/Ham & cheese/.../Extra mushroom add-on). New UI, generic (not Carmella-specific — any future tenant with variant items gets it for free):

- Radio group for mutually-exclusive base variants (defaults to the first).
- Checkbox group for `isAddon` variants (additive to whichever base is selected).
- Displayed price recomputes live: `selectedVariant.price + sum(selectedAddons.price)`.
- On add-to-cart, constructs a single cart line with a composed name (`"Amy's Choice — Ham and cheese"`) and the computed price — no changes to `CartContext`, order submission, or the backend order model were needed.

Renders only when `item.variants` is present and non-empty; otherwise `ItemModal` behaves exactly as before.

## Explicitly not built this session

- A dedicated Carmella `chapters.ts` config / icon map (not needed — see reuse notes above; the default grid view doesn't consume `chapters.ts` at all, only the secondary "book" page-turning viewer does).
- Terracotta-accent wiring into `RecommendationJourney`/chat-bubble components (token exists, not yet applied — see `FUTURE_ROADMAP.md`).
- A live-ticking day-part clock component (day-part is resolved once per page load).
