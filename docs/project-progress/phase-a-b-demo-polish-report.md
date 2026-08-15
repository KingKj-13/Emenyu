# Final Touching — Phase A (Demo Critical Fixes) + Phase B (Demo Polish & Finishing Pass)

**Date:** 2026-07-10
**Branch:** `feat/chatbot-reco-rework`
**Commits:** `4ab11cc`, `fdd1bf1`, `65be3c0`, `a93f55d` (plus `f0c467b`/`d098092` for the 16→20-video extension shipped earlier the same day)
**Status:** Deployed and verified live on `https://emenyu.com`

Both phases were executed as one merged effort — Phase B's scope (visual consistency, copy polish, UI cleanup, responsiveness, loading/empty states, bug sweep) heavily overlapped Phase A's, so covering the same ground twice would have been redundant. Diagnosis was run as two parallel 12- and 11-agent workflow batches (23 agent-investigations total) before any code was touched; every fix below traces to a specific file:line finding.

---

## Executive summary

Fixed 10/10 reported recommendation-experience bugs (the explicitly "most important feature"), the wording quality issue behind 4 separate root causes, the video-performance regression from the recent 20-video reshoot, 2 notification delivery gaps, 3 chatbot UX bugs, 2 navigation bugs, a stale-timezone/unvalidated-date-range gap in analytics, 3 analytics drink-in-dishes leaks, 7 copy/branding inconsistencies, a systemic stale-gold-color-token drift across 21 files, and added a missing loading state to the waiter app's two busiest screens. Two items were deliberately deferred with recorded rationale (see Known Remaining Issues) rather than rushed.

---

## Priority 1 — Recommendation experience ("the most important feature")

**All 10 reported bugs fixed**, each traced to a real root cause in `server/services/aiService.js` / `recommendationRules.js` / client consumption code — no changes to the core scoring/candidate-selection engine:

1. **Beer → no food recommendation** — added a beer-keyed rule to `addFoodPairings()`'s data table (wings/biltong/burger/snails/calamari); previously only food→beer existed, never the reverse.
2. **Steak → dessert poor** — all 6 desserts share identical richness/sweetness tags (verified live), so richness couldn't differentiate them; now prefers a cold dessert (ice cream) as temperature-contrast after a hot, heavy main, with a safe fallback to the full pool.
3. **Too many starters** — extended the existing "no starter once dessert is in cart" rule to also apply once a main is already in cart (mid-meal).
4. **Two wine recommendations for one steak** — the waiter's cart-rec panel merges two independent engines (the main scoring engine + a separate CSV-driven SmartPairingEngine); the CSV engine had no beverage-primacy logic of its own. Now drops any CSV-sourced beverage once the main engine has already supplied one.
5. **Food ordered, no drink recommendation** — the "drink" journey stage had no filter restricting its pool to wine/cocktail/beer; a soft-drink/water pick would get silently dropped by an existing "no secondary beverage headline" rule, leaving zero drink candidates for that turn.
6. **Timing feels unnatural** — the proactive chat nudge wasn't sending `tableId` (so server-side pacing was a no-op), and the "just accepted, pause" flag only reset on chat's own Add button, not the cart-strip or item-modal Add buttons. Both fixed; the pause now triggers off the shared cart-mutation signal every accept path already flows through.
7. **Decline behaviour incorrect** — a waiter's explicit decline only ever wrote an analytics row; `recommendationMemory.recordDecline()` (built specifically to durably suppress a declined item) had zero callers anywhere in the codebase. Now wired.
8. **Accepted recommendations keep recommending** — the waiter's cart-rec fetch had no stale-response guard; a fast add-then-refetch could let an out-of-order network response clobber the fresh one. Added the same cancellation-guard pattern the customer-facing cart already used.
9. **Ignored recommendations reappear** — `tableId` was silently dropped in two call paths (`cartRecommendations()`'s internal call, and the customer cart strip's fetch), so the existing "recently ignored" session memory could never activate for either surface.
10. **Budget not respected** — the item-modal journey's "extras" strip had no cap at all (the one recommendation surface in the whole system with an unbounded list); now capped at 4. Also flagged (not removed) two dead, self-contradicting config thresholds in `businessRules.js`.

## Recommendation wording

- Dropped the generic rule-name badge ("People also ordered," "Goes well together" — shown on ~98% of cards) in favour of the composed reason text already below it.
- `foodPairClauseFor()` (the long-tail food+food fallback) now varies its sentence by the target's own texture/flavour tags instead of one fixed template per course bucket.
- The waiter cart-rec panel's CSV-sourced reasoning (a separate wording system that bypassed the sommelier composer entirely, using formulaic text that repeated verbatim across unrelated dishes) now routes through the same composer the rest of the app uses.
- `cookingMethodFor()` was returning the identical phrase under all three tone keys (verified: 100% byte-identical) — `knowledge/protein_rules.json` gained genuine professional/friendly/luxury variants for all 7 phrase groups, and the function now actually selects by tone.
- The waiter's tone-tabbed cart card had a frozen "why" line that never changed across Professional/Friendly/Luxury tabs (only the pitch below it did) — removed the redundant frozen line.

**Deferred (logged, not fixed):** the ~110 curated hero dish×wine pairings are still tone-blind (heroPairings.reasonFor has no tone parameter at all) — a real content-authoring task for 110+ entries, out of scope for a mechanical fix this pass.

## Recommendation card visual polish

Badge given real chip styling (was bare text next to a filled pill), name/price bumped for actual size hierarchy, four different hand-picked border-radii replaced with design tokens, spacing snapped to the shared scale, added a rest/hover elevation shadow, added a `--color-gold-rgb` token and removed ~15 hand-picked alpha values (one of which used the wrong RGB entirely).

## Media performance

**Root cause found and fixed:** `ItemModal.tsx`'s hero `<video>` was mounting and fetching immediately on modal-open — unlike the poster-first, tap-to-play pattern used everywhere else the same 20 videos render (`RecommendationCard`, `WaiterPage`). This was a real regression introduced when the video reshoot brought `resolveVideo()` back to life without updating `ItemModal` to match. Fixed: the `<video>` element itself doesn't exist in the DOM until the existing 3-second poster delay has already elapsed. Verified live on production via Playwright (video absent at 1s, present/playing at 9s).

**Also found, not fixed:** `ItemModal`/`CartDrawer`/`ChatPanel` all statically pull in the Modal wrapper (→ framer-motion, ~133KB), so it preloads on every menu visit instead of only when opened — deferred, since these three are rendered unconditionally (visibility toggled, not conditionally mounted) and actually deferring the fetch would risk breaking their close-animation; logged as a known low-severity item.

---

## Priority 2

**Chatbot:** the enlarged suggestion card's gold glow was clipped almost fully invisible by the chat panel's own scroll container on real phone widths (narrowed card + glow radius to fit). Scroll-to-newest-message now anchors to the top of the newest reply instead of the panel bottom (a reply + enlarged card together can exceed the visible window — previously only the price/Add button stayed visible). Added a one-time, session-scoped entrance pulse + label so a guest just browsing (no cart yet) gets a cue the concierge exists. The "unnecessary book icon" complaint could not be reproduced — grepped the entire chat component tree, zero Book icon usage exists there today; flagged for the reporter to pin down which icon they mean.

**Waiter AI wording:** covered above (tone-varied cooking-method phrases, frozen-reason fix).

**Notifications:** kitchen-ready and waiter-call events reached only a transient socket emit, never the persistent Notification system — a page refresh or a momentarily-disconnected waiter lost the alert permanently. Both now call `notificationService.notify()`. The bell also now listens for the server's existing real-time push instead of only polling every 20s.

**Live synchronization:** OwnerDashboard had zero socket subscriptions anywhere (every KPI only refetched on a range change) — now refetches (debounced) on order/kitchen events. AdminPage's several "LIVE"-labeled tabs (Orders, Tables, Menu, Deals, etc.) still don't actually live-refresh — deferred, logged as a follow-up (large multi-tab scope, real regression surface for one pass).

---

## Priority 3

**Navigation:** OwnerDashboard was the only staff console missing the hardware/browser-Back guard every other console has. The staff login page's "Back to menu" link was hardcoded to `/Trump/table1` (always wrong table, forced a full page reload) — now derives the real table from context and uses client-side routing.

**Kitchen fire-lock:** investigated thoroughly — found no live, reproducible bug. The "lock" is enforced by fired items living in a separate array the edit UI never wires controls to, not an explicit checked flag; traced every mutation endpoint and found no path that can reach a fired item today. Left as a structural observation (defense-in-depth recommendation for if an "edit a fired order" feature is ever built), not a fix, since inventing a guard for a non-existent bug isn't warranted.

**Admin dates:** `parseDateRange` now drops an invalid date instead of throwing deep inside a query (previously indistinguishable from a genuinely quiet period from the caller's view) and self-corrects a reversed from/to range. Server timezone pinned to `Africa/Johannesburg` so hour/day-of-week/trend bucketing no longer silently depends on the host OS's timezone. A shared `sastTodayStartIso()` helper replaced 4 independent copies of a browser-local midnight calculation across Admin/Owner/Chef Intelligence/AI Performance panels.

**Analytics:** extended the items endpoint to accept multi-category `category`/`excludeCategory` params. Owner Dashboard's and Chef Intelligence's "Top/Bottom dishes" and "Highest-priced dishes" now exclude wine/drinks (were unfiltered — a well-selling bottle could appear under "dishes"). "Top drinks" now requests both WINE and DRINK categories (was DRINK-only, so wine could never appear despite its own subtitle promising it). Reports tab subtitle reworded to match what that section actually shows.

---

## Phase B sweep findings

**Copy/UI cleanup:** chat greeting is now time-of-day aware (was hardcoded "Good evening" always — a lunchtime guest saw a factually wrong opener); waiter name field no longer pre-fills a hardcoded "Demetri"; corrected `emenyu.io`→`emenyu.com` in the Admin console's URL bar; receipt tagline now matches the brand tagline used everywhere else; fixed a "Trump's"/"Trumps" apostrophe inconsistency in `manifest.json`; renamed dead "donaldRevenue" branding-residue variable; reworded a shift-start line that read as a past-tense status before the button was even pressed. Grepped for TODO/FIXME/Lorem ipsum/debug labels/retired-restaurant references/assistant-naming-policy violations — none found beyond what's listed above.

**Visual consistency:** the biggest finding — `--color-gold` was rebranded from `#c6a24b` to `#c8a555` at some point, but the old value stayed hardcoded across ~160 occurrences in 21 files (Admin/Owner/Waiter/Chat/Cart/Book/Reservation all rendered a visibly duller gold than Login/Landing/the customer menu). Mechanically replaced everywhere, verified with a full build after. Also found (not fixed, logged as follow-ups): the shared typography/spacing token scales exist but are adopted in almost no files; 4 different modal implementations coexist instead of the one shared Modal component; the shared Button/Badge components are barely used, so the same "sign out" action is styled 3 different ways across 3 pages; ~15 native `alert()`/`confirm()` calls break the branded console look (a design-system decision, not a copy fix).

**Responsiveness/loading/empty states:** the entire waiter app had zero loading-state tracking — every async fetch (floor, tasks, table intel, chat, performance) initialized to null/empty and rendered through the identical branch used for genuinely-empty data, so staff briefly saw a false "nothing here" message on every screen open. Fixed for the two busiest screens (Home, Tables) with the existing Spinner component. No genuinely blank-with-no-explanation lists/tables found elsewhere; no fully breakpoint-free component found (AdminPage/KitchenPage are desktop-first with collapses, Owner/Waiter are mobile-first with enhancements) — one small inconsistency found (`AdminPage.module.css`'s `.formGrid2` missing a mobile override its sibling `.formGrid3` has) but left as low-priority.

---

## Files changed

**Server (10 files):** `aiService.js`, `recommendationRules.js`, `businessRules.js`, `socketService.js`, `server.js`, `analyticsController.js`, `kitchenController.js`, `waiterApiController.js`, `nlg/hospitalityKnowledge.js`, `nlg/templateNlgProvider.js`
**Knowledge data (1 file):** `knowledge/protein_rules.json`
**Client — new (2 files):** `lib/businessDay.ts`, `lib/greeting.ts`
**Client — logic/markup (16 files):** `ItemModal.tsx`, `RecommendationCard.tsx`, `journey.ts`, `CartRecommendations.tsx`, `ChatPanel.tsx`, `NotificationBell.tsx`, `WaiterPage.tsx`, `StartShiftScreen.tsx`, `OwnerDashboard.tsx`, `LoginPage.tsx`, `AdminPage.tsx`, `ChefIntelligencePanel.tsx`, `AIPerformancePanel.tsx`, `ReceiptView.tsx`, `manifest.json`, `api.ts`
**Client — CSS (23 files):** `RecommendationCard.module.css`, `ChatPanel.module.css`, `index.css` (hand-edited), plus 21 files mechanically updated for the gold-color-token fix

## Validation performed

- `npx tsc --noEmit` — clean after every batch of changes (checked in ~6 checkpoints through the session, not just once at the end)
- `npx vite build` — clean production build, final bundle sizes verified
- `node --check` — every touched server file, all pass
- Direct unit tests: `cookingMethodFor()` tone variance, `parseDateRange()` malformed/reversed-range handling, `foodPairClauseFor()` texture-based variety — all verified against real data
- Playwright, local dev DB (full 439-item production-mirror catalog): item-modal video poster-gate timing, recommendation journey cards render without error, chat launcher + time-aware greeting, non-mapped item shows no video
- Playwright, **live production**: video poster-gate confirmed absent at 1s / present+playing (readyState 4, advancing currentTime) at 9s post-open, zero page errors
- Manual: baseline health (`readyz` 200, PM2 restart count) before and after deploy, confirmed exactly +1 restart (clean reload, no crash loop)

## Production deployment

Tar+scp sync (excluding `.env`/`node_modules`/`Images`/`Video`/`uploads`/persistent data dirs) → `deploy-trump.sh SKIP_CLIENT_BUILD=1` with `TRUMP_PRISMA_SCHEMA` exported → prisma generate/migrate (no pending migrations) → PM2 zero-downtime reload → readyz gate. Zero downtime throughout. `git log`: 4 commits on `feat/chatbot-reco-rework`, pushed.

## Known remaining issues (deliberately deferred, not fixed this phase)

1. Hero-tier (110+) wine pairings still tone-blind — needs a content-authoring pass, not a mechanical fix.
2. Birthday/anniversary `emitGuestEvent` is dead code (client fully wired, zero server callers) — wiring it risks creating a duplicate-notification bug alongside the existing WaiterTask approval flow; needs a design decision on which system is canonical.
3. AdminPage's several "LIVE"-labeled tabs (Orders/Tables/Menu/Deals/Chef Recs/Bundles/Reco Analytics) don't actually socket-refresh — large multi-tab scope, deferred to a dedicated follow-up.
4. ItemModal/CartDrawer/ChatPanel eagerly pull in the Modal→framer-motion chunk on every menu load (~133KB) — code-splitting them safely needs a change to conditional-mounting that risks breaking their close animations.
5. Shared typography/spacing/Button/Badge/Modal design-system components exist but are adopted in very few files — real consistency win available, bigger scope than this pass.
6. ~15 native `alert()`/`confirm()` calls break the branded console look — a design-system decision (styled confirm dialog + migration), not a quick fix.
7. Kitchen fire-lock has no explicit checked guard (works today only because fired items live in a separate, un-wired array) — flagged as defense-in-depth for if an "edit a fired order" feature is ever built.

All 7 are logged with full rationale in `docs/project-progress/phase-a-b-decisions-log.md`.
