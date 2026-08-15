# Carmella Production — Pre-Deployment Verification Report

Date: 2026-07-15
Scope: `Sites/carmella-production` (server + client), verified locally against an
isolated database (`emenyu_carmella_production`) on port 3016, before any production
deployment. Nothing in this pass touched the live Carmella site, its database, or Trump.

Method: real Playwright browser automation against the built client (`vite build`) served
by the actual Node server (not dev mode), plus `tsc --noEmit` / `vite build` / server
syntax checks. Not a code-review checklist — every customer/admin item below was clicked
through in a live Chromium instance.

## Feature verification

| Item | Result | Evidence |
|---|---|---|
| Menu browsing | PASS | 190 real items render across 8 chapters/sections |
| Search | PASS | "coffee" query correctly filtered to matching items |
| Categories | PASS | Chapters/sections render; category reorder persists after reload |
| Item details | PASS | Modal opens with name/price/story/description/variants |
| Dietary/allergy information | PASS | Dietary tag chips (vegetarian, contains-nuts, etc.) and allergens text render in item modal; "Vegetarian Only" filter correctly narrows results |
| Cart | PASS | Add/remove/qty controls work; cart syncs live over Socket.IO across browser sessions for the same table |
| VAT/service charge | PASS | Both line items shown correctly in cart totals; total = subtotal + VAT + service, no tip/checkout math |
| Image upload | PASS | Uploading a photo in the item editor produces a live preview and persists via `PATCH /api/menu/items/:id/media` |
| Menu editing | PASS | Editing an item's name persists after save and reload |
| Availability toggle | PASS | Toggling sold-out/available flips and persists |
| Category reorder | PASS | Moving a category and reloading the page shows the new order |
| Promotions (Deal of the Day) | PASS | Created, listed, and deleted a promotion end-to-end through the admin UI |
| Happy Hour | PASS | Created a Happy Hour with item selection + discount; live-status indicator present |
| Specials | PASS | Created a Special with item selection; live-status indicator present |
| Analytics dashboard | PASS | Real aggregate data rendered: active carts, visitor counts, most-viewed/most-added rankings, peak-hour histogram, promo performance, available/unavailable counts — no mocked data |
| Live carts | PASS (after fix) | Initially only showed a stale snapshot — the admin client never joined the server's live-update socket room. Fixed; a guest's cart add now appears in the admin view without a manual refresh, verified with two concurrent browser sessions |

## Removal verification

| Item | Result | Evidence |
|---|---|---|
| No Trump branding anywhere | PASS | Landing/header/admin text checked programmatically for "Trump"; manifest.json, PWA identity, and default font stack (Cormorant Garamond/Manrope) rebranded/removed; only internal code comments (never rendered) still reference "Trump" for historical context |
| No login/auth remaining | PASS | No login screen exists anywhere in the client; server has no session/cookie/token code path (removed, not just hidden); Admin is reachable directly by URL |
| No waiter features remaining | PASS | Waiter/Kitchen/Reservation pages, contexts, and routes deleted outright (not hidden behind a flag); server has no waiter/kitchen controllers, routes, or services |
| No AI/recommendation features remaining | PASS | Chat, pairing, recommendation-engine components and their DB models deleted; no `/api/chat`, `/api/recommend`, `/api/ai-pairing` routes exist on the server at all |
| No checkout/payment functionality remaining | PASS | No `submitOrder`/order-placement code path exists client or server side; cart explicitly labeled "Estimated total" with no place-order action |
| No dead routes | PASS | `App.tsx` only defines `/Admin`, `/menu`, `/:tableId/menu`, `/:tableId`, and root redirects — no orphaned Waiter/Kitchen/Login/Reservation routes |
| No console errors | PASS* | Zero errors during the full customer + admin flow in this environment. *Three external Google Fonts requests failed during testing — confirmed to be this sandbox's lack of outbound internet access (a direct check with no page interaction reproduces the same failures against `fonts.gstatic.com` alone), not an application defect. Should self-resolve once running on a server with normal internet access; worth a quick post-deploy console check to confirm. |
| No TypeScript errors | PASS | `npx tsc --noEmit` exits 0 |
| No build errors | PASS | `npx vite build` completes with no errors or warnings |

## Real bugs found and fixed during this verification pass

These were only caught because the app was actually driven in a browser rather than just
type-checked/built — listed here for transparency:

1. **Env-load ordering bug** — the server's `helpers.js` read `TRUMP_RESTAURANT_ID` at
   module-load time, but `.env` was loaded after that `require()` ran, so the server
   silently booted with Trump's identity instead of Carmella's. Fixed by loading `.env`
   before any local `require()`.
2. **Callback-arity bug** — `rows.filter(isWithinSchedule)` passed `Array.filter`'s index
   argument into `isWithinSchedule`'s optional `now` parameter, crashing every public
   promotions/happy-hour/specials request with `now.getHours is not a function`. Fixed by
   wrapping in an explicit single-argument call in all three controllers.
3. **Missing thumbnails** — only full-size `Images/*.webp` were copied from the live
   Carmella build, not `Images/thumbnails/*.webp`; every one of 190 menu cards 404'd on
   its thumbnail request before falling back to the full image. Fixed by copying the
   missing 201 thumbnail files.
4. **Theme selector mismatch** — `carmella-theme.css` was still scoped to
   `[data-tenant="carmella"]`, but this app's `RESTAURANT_ID` is `carmella-production` —
   the theme would never have applied, and the app would have silently rendered in
   Trump's default dark-navy palette. Fixed by updating the selectors.
5. **Admin live-updates never wired up** — the admin client never emitted `joinAdmin`, so
   the server's `liveCartsChanged`/`promotionsUpdated` broadcasts never reached it; Live
   Carts (and any future live admin view) only showed a stale page-load snapshot. Fixed by
   joining the admin socket room on mount (with reconnect handling).

## Not covered by this pass

- Production infrastructure (Nginx, PM2, the shared droplet's disk/memory headroom) — this
  report is local-only, verified before any deployment step, per the requirement not to
  touch the live site until everything above passed.
- Load/performance testing under concurrent real traffic.
- Cross-browser testing (this pass used Chromium only; the customer flow uses no
  Chromium-specific APIs, so Safari/Firefox risk is low but unverified).

## Verdict

All requested customer, admin, and removal-verification items pass. Proceeding to
deployment: stand up `carmella-production` alongside the current live site, verify health,
then cut Nginx over — per the explicit instruction not to touch the existing deployment
until this point.
