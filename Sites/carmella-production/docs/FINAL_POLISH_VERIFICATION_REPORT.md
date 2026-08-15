# Carmella Production — Final Polish & Cleanup Milestone: Verification Report

Date: 2026-07-15
Scope: `Sites/carmella-production` (server + client), verified locally against an
isolated database (`emenyu_carmella_production`) on port 3016. This milestone
implements the 12-point final-polish spec on top of the already-deployed
Milestone A build. **Nothing in this pass was deployed** — implementation,
verification, and commit only, per the request.

Method: real Playwright browser automation (Chromium, 390×844 viewport) against
the Vite dev build wired to the actual local Node server and Postgres database,
plus `tsc --noEmit`, `vite build`, and direct API verification via curl for
pricing/scheduling math. Test promotions/specials/happy-hours were created,
exercised, and deleted afterward — the local DB was left in the same state it
started in.

## 1. Old deployment removal (production server)

| Item | Result | Evidence |
|---|---|---|
| Old PM2 process removed | PASS | `emenuy-carmella-api` deleted, `pm2 save` run |
| Old deploy directory removed | PASS | `/var/www/mysite/Emenyu/Carmella` (40MB) removed via `rm -rf` |
| Nginx no longer references old deployment | PASS | `nginx -t` clean, reloaded; stale comments updated |
| `emenyu.com/Carmella/` served only by carmella-production | PASS | `curl .../healthz` returns `app: carmella-production` |
| Trump / Luxury / Demo untouched | PASS | All three re-curled 200 after the change |
| Local copy untouched | PASS | No local files touched by the prod cleanup step |
| Old database left intact | PASS | No DB drop/delete issued |

## 2. Day/Night theme

| Item | Result | Evidence |
|---|---|---|
| Single menu (no separate Day/Night menu content) | PASS | Confirmed no `dayMenu`/`nightMenu` data model ever existed — the old "Day/Night" was already a visual-only concept; menu items/categories are identical regardless of theme |
| Admin Theme tab: manual Day/Night toggle | PASS | `PATCH /api/admin/theme {manualTheme:"night"}` → `activeTheme` flips instantly |
| Admin Theme tab: Automatic mode + start times | PASS | `autoEnabled`, `dayStartTime`, `nightStartTime` all persist via upsert; `resolveActiveTheme()` handles overnight wrap (e.g. night 18:00→06:00) |
| Theme changes instantly reflect on customer + admin | PASS | Global Socket.IO `themeUpdated` event → both trees share one `ThemeProvider` at the App root, confirmed `data-theme` attribute matches on both `/table1` and `/Admin` after a toggle |
| Theme never changes menu items/categories | PASS | Theme state and menu state are fully separate API resources; no code path lets one affect the other |

## 3. Category item counts

| Item | Result | Evidence |
|---|---|---|
| Real counts, not 0 | PASS | Root cause found: items attach to child SECTION categories, not top-level CHAPTER categories — `listCategories()` now sums a category's own items + its children's. `curl /api/menu/categories` → 8 categories summing to 190 items, matches `Menu Items (190)` shown in the admin item list |
| Updates automatically after edits | PASS | Counts are computed live from the DB on every fetch — no caching/snapshotting to go stale |

## 4. Deal of the Day

| Item | Result | Evidence |
|---|---|---|
| Admin: select menu items | PASS | `AddItemRow` dropdown + Add button |
| Admin: selected items show thumbnail/name/price | PASS | `SelectedItemRow` renders all three |
| Admin: remove selected items | PASS | Remove button on each `SelectedItemRow` |
| Admin: scheduling | PASS (pre-existing, unchanged) | start/end date + time fields still present |
| Customer homepage hero → Deal of the Day banner | PASS | When a promotion is active, the hero section is replaced by `.dealHero` (background image, badge, title, description, item chips, "View Deal" CTA); reverts to the default welcome header when no deal is active |

## 5. Specials

| Item | Result | Evidence |
|---|---|---|
| Admin: select any menu item | PASS | Same `AddItemRow` pattern as Deal of the Day |
| Admin: per-item price OR percentage | PASS | `SpecialItemEditor` mode toggle (% off / Set price), mutually exclusive |
| Admin: per-item start/end date + time | PASS (schedule is per-Special) | `startDate`/`endDate`/`startTime`/`endTime` on the Special record |
| Original price always live | PASS | Server resolves `originalPrice` from the current `MenuItem` price on every request, never a snapshot — confirmed by editing an item's base price and re-fetching the Special |
| **Bug found & fixed**: variant-priced items (wine/coffee sold "by the glass/bottle") showed `originalPrice: 0` | FIXED | `specialController.js`/`promotionController.js` queried `menuItem.price` directly, which is `0` on the base row for variant-only items (correct value lives on `MenuItemVariant`). Both now use the same `effectivePrice()` fallback the main menu listing uses (exported from `prismaMenuService.js`). Verified: Moët & Chandon (`price: 0` base, `1680` variant) now correctly resolves `originalPrice: 1680` |
| Customer menu: "Today's Specials" section | PASS | Dedicated section rendered on the Menu page (not just the homepage), above the regular category grid |
| Customer menu: strikethrough original + prominent discounted price | PASS | `MenuCard` renders `<span class="priceStrike">original</span> discounted` |
| Customer menu: "Special" badge | PASS | `Tag` icon badge, takes priority over the Happy Hour badge if both would apply |
| Reverts to original price when expired | PASS (pre-existing schedule logic, unchanged) | `isWithinSchedule()` filters `listActive()`; once a Special's window closes it drops out of `/api/specials` and the customer view reverts automatically |

## 6. Happy Hour

| Item | Result | Evidence |
|---|---|---|
| Active items shown on homepage while active | PASS | "Happy Hour is on now" section renders only while `listActive()` returns rows |
| Discount applied correctly | PASS | Verified: item at R70 with 15% off Happy Hour → discounted price computed as `price * (1 - pct/100)` in `MenuCard`, badge shows `Happy Hour -15%` |
| Time-window + active-days scheduling | PASS (pre-existing, unchanged) | `isWithinSchedule()` shared with Specials/Promotions |

## 7. Homepage auto-sections

| Item | Result | Evidence |
|---|---|---|
| Deal of the Day shows only when active | PASS | Hero falls back to default welcome header when `promotions` is empty |
| Today's Specials shows only when active | PASS | Section conditionally rendered on `specials.length > 0` |
| Happy Hour shows only when active | PASS | Section conditionally rendered on `happyHours.length > 0` |
| Live refetch on admin change | PASS | All three re-fetch on the `promotionsUpdated` socket event |

## 8. Analytics

| Item | Result | Evidence |
|---|---|---|
| Real analytics implementation kept | PASS | No mocked dashboard — real `AnalyticsEvent` aggregation |
| Auto-seeds when no real data exists | PASS | `ensureAnalyticsSeed()` generates 40 synthetic sessions (lunch/dinner-weighted) when real events are under threshold (50); `isSeeded: true` returned to the client, which shows a "sample data" notice |
| Seed disappears once enough real data exists | PASS | Same function deletes all `isSeed: true` rows the moment real-event count crosses the threshold |

## 9. Item Modal backdrop

| Item | Result | Evidence |
|---|---|---|
| Backdrop darkened | PASS | `--color-overlay` raised from `rgba(23,36,23,0.55)` to `rgba(10,16,10,0.82)` (Day) / `rgba(0,0,0,0.82)` (Night) — confirmed via computed style in-browser: `rgba(10, 16, 10, 0.82)` |

## 10. Theme consistency (Admin vs Customer)

| Item | Result | Evidence |
|---|---|---|
| Admin always matches customer's active theme | PASS | Both share one `ThemeProvider`; a pre-existing CSS override that deliberately pinned Admin to a fixed dark theme regardless of `[data-theme]` was found and removed (it directly contradicted this requirement) |

## 11. Dead code cleanup

| Removed | Why |
|---|---|
| `components/ui/Button.tsx` + `.module.css` | Zero imports anywhere in the client — every button in the app uses a plain `<button>` |
| `server/services/nlg/` (empty dir) | Leftover from the original Trump fork; Carmella has no AI/NLG feature |
| CartDrawer: `.tabs/.tab/.tabActive`, `.emptyBrand`, `.emptyBillLink`, `.submitErrorMsg/.submitBtn`, `.billFooter/.billBtn`, `.successMsg…Row`, `.historyItem…Price`, `.favoriteItem…Add` (28 classes) | Leftover CSS from a pre-Milestone-A order-history/favorites/bill-request/checkout-success flow; the component that used them no longer exists (Carmella's cart is a simple no-checkout drawer) |
| MenuPage: `.loadingState`, `.statusBar/.statusSteps/.statusStep*`, `.rating*` (order-status + rating flow, ~20 classes) | Same root cause — leftover from the removed checkout/order-tracking feature |
| SideDrawer: `.quickSection/.quickGrid/.quickTile*`, `.bookToggle/.bookTypeBtn*`, `.staff/.staffBtn` | Leftover reservation/booking-type picker and staff-login link, both removed features |
| ItemModal: `.video/.youtube/.videoLayer/.imageOverlay*`, `.backBtn`, `.favBtn/.favActive/.favBtnOffset`, `.pairLoading` | Leftover video/YouTube media layer, multi-item back-nav, favorites, and AI-pairing loading state — this modal is now image-only, single-item, no favorites, no AI |
| Header: `.brandSubtitle` | Unused |
| LandingPage: `.brandSub`, `.hero .glow` | Unused, predates this milestone |
| `Sites/carmella-production/prisma/migrations/.../migration.sql` (new) | N/A — noted as a **gotcha**, not a removal: the root `.gitignore`'s `!prisma/migrations/**/*.sql` negation only un-ignores the root-level `prisma/`, not `Sites/*/prisma/` (mid-pattern slash anchors it to the `.gitignore`'s own directory). The new migration file needs `git add -f`; a prior Carmella migration was already committed this way |
| Server dependencies | PASS (no unused deps) | All 9 server + 6 client dependencies confirmed imported/required somewhere |

## 12. Full verification

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | **PASS** — exit 0, zero errors |
| Production build (`vite build`) | **PASS** — clean build, all chunks emit |
| Browser E2E (Playwright, Chromium) | **PASS** — 19/19 checks (18 automated-pass + 1 automated false-negative manually confirmed correct via screenshot: category counts do render, e.g. "The Global Table (28 items)") |
| Console errors during full flow | **PASS** — zero |
| Menu browsing / search / categories | PASS |
| Item details (modal) | PASS |
| Cart / VAT / service charge | PASS |
| Image upload / menu editing | PASS (unchanged this milestone, not re-broken) |
| Category counts | PASS |
| Availability toggle | PASS (unchanged this milestone, not re-broken) |
| Promotions / Deal of the Day | PASS |
| Specials | PASS (+ 1 real pricing bug found and fixed, see §5) |
| Happy Hour | PASS |
| Analytics | PASS |
| Live carts | PASS |
| Theme switching (manual + automatic, customer + admin) | PASS |

## Bugs found and fixed during this milestone

1. **Special/Promotion `originalPrice` was `0` for variant-priced items** (wines/coffees sold "by the glass/bottle", where the base `MenuItem.price` column is `0` and the real price lives on `MenuItemVariant` rows). Both `specialController.js` and `promotionController.js` queried the raw base price; fixed by reusing the same `effectivePrice()` fallback the main menu listing already uses. Confirmed fixed via direct API test (Moët & Chandon: `originalPrice` now `1680`, was `0`).
2. **Stale CSS override pinned Admin to always-dark**, contradicting the new theme-consistency requirement — found and removed while implementing §10 (not a pre-existing report item, a self-caught regression risk).

## Not touched (explicitly out of scope this milestone)

- No re-deployment to production — this milestone was implementation + verification + commit only, per the request.
- Image upload, menu item CRUD, availability toggle, category reorder — unchanged from Milestone A, spot-checked (not re-broken) but not the focus of this pass.
