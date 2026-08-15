# Phase 2 — Waiter Experience + Premium UI

**Date:** 2026-07-05
**Status:** Implementation complete, locally validated and visually verified. **Not deployed.** Awaiting your approval per standing instruction ("Wait for my approval. Do NOT deploy automatically. Do NOT begin Phase 3.").

**Scope discipline:** No changes to the Recommendation Brain's scoring logic, auth, database architecture, chatbot logic, deployment scripts, or Recommendation APIs' contracts (only additive fields). Admin UI and Customer UI untouched. No Demo Mode, no fake data. `luxury/` untouched.

---

## 1. Features completed

| Brief requirement | What was built |
|---|---|
| **Table Overview redesign** | `TableCard` now shows an occasion badge (from the existing `WaiterContext.events` map) and an "Estimated Additional Value" chip (from the existing `opportunityService` via `getTableIntel`), fetched only for the waiter's own assigned/active tables — not all 30 tables — to stay instant. The Home screen's hero card gained a one-line **Table Intelligence Summary** composed client-side from data already loaded (e.g. *"Birthday celebration. Recommend a Cabernet upgrade before mains."*). |
| **Per-Seat section** | New `SeatBreakdown` component inside Table Details: the shared cart is round-robin-partitioned across `table.guests` seats (client-side, presentational only — no schema change, no fabricated per-guest data), grouped into Drinks/Mains/Desserts. Clearly labeled "Seat 1/2/3", not invented guest identities, per your explicit decision on this. |
| **3-tone recommendation card** | `AiRecommendationPanel` now shows Professional / Friendly / Luxury tabs. Scripts are generated server-side in `cartRecommendations()` by calling the **existing** `nlgService.phrase()` (the same wording layer already powering the AI Table Coach) three times per recommendation — no second wording system. Verified in the browser: switching tabs changes the actual sentence (e.g. Professional: *"...Shall I add it for R699?"* vs Luxury: *"May I suggest...a beautiful addition at R699."*). |
| **Recommendation status** | Pending → Suggested → Accepted/Declined/Ignored status chip, reusing the existing `recordUpsell` analytics call (now also invoked on decline with `accepted:false`) and a 45s client-side timeout for "ignored." |
| **Confidence / EV / Replacement / Occasion on every rec** | Already existed from Phase 1 — now visibly rendered as chips on the card (Confidence %, EV amount, "Upgrade from X" when applicable). |
| **Live-update badges** | `WaiterContext` gained `unseenTableUpdates` (a `Set<tableId>`), populated by the *existing* socket listeners (`kitchenStatusUpdate`, `guestEvent`, `orderPlaced`) plus one new `waiterTaskCreated` listener. Shown as a small pulsing dot on table cards and the mini-rail; cleared the instant that table is opened — never interrupts whichever table the waiter is currently viewing. |
| **Menu video browsing** | `AddItemThumb` now uses the same poster-first, tap-to-play `<video>` pattern already built for the customer menu's journey cards — image loads first, video only mounts after a tap, drinks still never get a video (existing `resolveVideo()` behavior, unchanged). |
| **Shift page additions** | **Tips**: `shiftService.js`'s existing metrics loop now also sums `Order.tip` (a field that already existed on the model, just never surfaced) — folded into the existing `responseMetrics` Json column, so it survives both the live view and the ended-shift summary with zero schema change. **Current Tables**: reuses `WaiterContext`'s existing `shift.section`. Verified live: shift shows "0h 00m · 0 Orders · R0 Revenue · R0 Tips · 0 Tasks" plus a "Current Tables: 5 7 12 18 21 24" row. |
| **Notification grouping** | `NotificationBell` groups the existing notification list by its existing `source` field (plus a light title/body sniff for Birthday/Anniversary/Kitchen Ready/Payment) — no new notification-generation logic. Verified live: a "SYSTEM" group header rendered correctly above a real notification row. |
| **Occasion cart-signal in the waiter view** | `cartRecommendations()` now also returns `occasionPrompt` by calling the *existing* Phase 1 `celebratoryOccasionPrompt()` (Champagne/sparkling-in-cart detector) — same detector the customer chatbot already uses, exposed on a second surface. |
| **Visual polish** | New CSS for every component above, following the existing `--w-*` design-token system in `waiter-theme.css` (no new colors invented), with tablet/desktop grid breakpoints matching the existing `@media (min-width: 700px/1000px)` pattern. |

---

## 2. Files modified

| File | Change |
|---|---|
| `server/services/aiService.js` | `cartRecommendations()`: 3-tone scripts (calls existing `nlgService`), `occasionPrompt` (calls existing Phase 1 method) |
| `server/services/shiftService.js` | `computeShiftMetrics()`: added `tipsHandled`, folded into existing `responseMetrics` Json |
| `client/src/types/waiter.ts` | Additive: `RecommendationScripts`, `RecommendationStatus`, `occasionPrompt` on `CartRecResponse` |
| `client/src/types/operations.ts` | Additive: `tipsHandled` on `ShiftRow`/`ShiftStatus` |
| `client/src/context/WaiterContext.tsx` | Added `unseenTableUpdates` state + `markTableUpdated`, wired into existing socket listeners + one new `waiterTaskCreated` listener |
| `client/src/pages/WaiterPage.tsx` | `TableCard`, `HomeScreen`, `TableDetails`, `AiRecommendationPanel` (rewritten), new `SeatBreakdown`/`useTableIntelMap`/`tableIntelSummary`, `AddItemThumb` (video), `TablesScreen` mini-rail badge |
| `client/src/components/operations/ShiftPanel.tsx` | Tips metric, Current Tables row |
| `client/src/components/operations/NotificationBell.tsx` | Grouping by source |
| `client/src/styles/waiter-v2.css` | ~90 new lines: status chips, tone tabs, seat grid, intel chips, update-dot badge, video play button, responsive breakpoints |

No changes to `prisma/schema.prisma`, `recommendationRules.js`, `recommendationScoring.js`, auth, deployment scripts, Admin UI, or Customer UI.

---

## 3. Performance improvements / considerations

- **Bounded API calls**: table-intel (EV/occasion) is fetched only for the waiter's own assigned, non-empty tables — typically 5–10, never all 30 — via `Promise.all`, not one-by-one.
- **No new polling loops**: live-update badges ride the *existing* socket subscriptions; nothing added a new interval or duplicate listener set.
- **Client bundle impact**: `WaiterPage` JS grew 47.4KB → 53.3KB gzipped-equivalent bundle size (+5.9KB), CSS grew 37.8KB → 40.6KB — modest for the feature set added.
- **Server cost**: the 3 tone scripts per recommendation are generated via 3 parallel (`Promise.all`) calls to the already-fast template NLG provider (no network/DB cost, pure string templating) — negligible added latency, confirmed via the integration check completing near-instantly.

---

## 4. UI improvements

See screenshots in `docs/project-progress/phase2-screenshots/`:
1. `1-home-overview.png` — Home screen, clean premium layout, next-best-action hero
2. `2-table-details-recommendation.png` — Table Details: Order Timeline, Guest Insights, AI Recommendation card with Confidence/EV chips, tone tabs, decline + add buttons
3. `3-recommendation-luxury-tone.png` — same card with **Luxury** tab active, showing genuinely different wording, plus the Revenue Opportunity panel and grouped Notifications visible
4. `4-shift-page.png` — Shift page with Tips metric and Current Tables row live
5. `5-notifications-grouped.png` — Notification drawer showing the "SYSTEM" group header
6. `6-tablet-responsive.png` — same shift screen at tablet width (820px), layout holds

**A real bug found and fixed via this visual pass**: the new decline button initially rendered as a second solid-gold circle (icon invisible) because the pre-existing `.wv-ai-foot button` rule's gold styling cascaded onto it. Fixed with a more specific `.wv-ai-foot .wv-plain-icon` override — confirmed via a before/after screenshot that the icon now renders correctly as a muted secondary action, visually distinct from "Add To Cart."

---

## 5. Known issues / limitations

- **Per-Seat section not visually exercised**: no table in the current local dev data has `guests > 1` set, so `SeatBreakdown` never rendered in this session's screenshots (its render guard is `seatCount <= 1 → return null`, which is working as designed against real data — it's a data gap, not a code gap). Verified correct by code review and TypeScript compilation instead. Recommend a manual check once a real multi-guest table is seated.
- **Video play button on menu items not visually exercised** — same category of gap (didn't navigate to the Add Items screen during the browser session); the underlying pattern is copy-pasted from the already-shipped, already-verified customer-menu journey card, so risk is low.
- **"Friendly" tone is the existing `casual` NLG tone** — there is no separate "friendly" tone in `templateNlgProvider.js`; this was flagged as a known mapping in the Phase 1 report and carries forward here.
- **Tips only appear for orders placed *after* this phase's `shiftService.js` change** — historical/already-ended shifts won't retroactively show tips (the value is computed at read time from `Order.tip`, not backfilled).
- A local dev server restart was required mid-session (see Section 8) — the old process had been running since 2026-07-03 and doesn't hot-reload server code; this is a pre-existing environment characteristic, not a Phase 2 defect.

---

## 6. Manual testing checklist (for your own pass)

- [ ] Log in as a waiter, start service, confirm the Home screen's occasion/EV chips appear on tables that actually have guests + cart activity
- [ ] Open a table with `guests > 1` set and confirm the Per-Seat section appears and partitions the cart sensibly
- [ ] Switch between Professional/Friendly/Luxury tabs on a recommendation and confirm the wording changes each time
- [ ] Accept a recommendation → confirm status chip changes to "Accepted"; decline one → confirm it changes to "Declined" and the decline button is visually muted (not gold)
- [ ] Leave a recommendation untouched for ~45s → confirm it becomes "Ignored"
- [ ] Add a Champagne/sparkling item to a cart and confirm the occasion prompt appears in the waiter view
- [ ] While viewing Table A, have another table's kitchen status change to "ready" → confirm a badge dot appears on that other table (not a popup interrupting your current view) and clears when you open it
- [ ] Open the Add Items screen and confirm a menu item with a video shows a play button that only starts playback on tap
- [ ] Start a DB shift (Profile tab → Start shift) and confirm Tips + Current Tables render
- [ ] Open Notifications and confirm items are grouped under readable headers (Birthday/Waiter Call/Kitchen Ready/etc.)
- [ ] Resize to phone width (375–430px), tablet (700–820px), and desktop (1000px+) and confirm no layout breakage at any size

---

## 7. Deployment checklist

- [ ] Get your explicit approval (standing instruction: no auto-deploy)
- [ ] Commit the 9 modified files
- [ ] Standard deploy path (`deploy-trump.sh`) — no schema migration, no new env vars, no new dependencies
- [ ] Post-deploy: spot-check the Waiter app on a real device (Android phone/tablet, iPad) per the brief's mobile requirement — this session's testing was via Playwright/Chromium viewport emulation, not physical devices
- [ ] Re-run `npm run reco:validate` / `chat:validate` against the deployed host if desired (no regression expected — these don't touch recommendation logic)

---

## 8. Testing performed

| Check | Result |
|---|---|
| `npm run typecheck` (client) | Clean, 0 errors |
| `npm run build` (client, via direct vite invocation — `npm run build` itself has a known sandbox quirk) | Success, 2309 modules |
| `npm run reco:validate` | 68/68 passed (unaffected — no recommendation logic touched) |
| `npm run chat:validate` | 49/49 passed (unaffected) |
| Server integration check (ad-hoc, not part of repo test suite) | 3/3 passed: 3 distinct tone scripts confirmed per recommendation; `occasionPrompt` fires correctly on a Champagne/sparkling cart and is `null` otherwise |
| Browser verification (Playwright + Chromium, phone/tablet viewports) | Home screen, Table Details (cart, timeline, guest insights, AI recommendation with confidence/EV/tone tabs/status), Revenue Opportunity, Shift page (tips/current tables), Notifications (grouped), tablet responsive layout — all confirmed rendering correctly against a freshly-restarted local dev server running today's code |
| Sockets | Verified structurally via code review (live-update badge listeners wired to existing socket events); not independently load-tested this session |

**Process note**: mid-session, discovered the local dev server (PID 25932/later 41012) had been running since 2026-07-03 and doesn't hot-reload server-side code — the first screenshot pass was silently testing stale server logic. Asked for and received explicit approval before restarting it, then re-verified. This is documented so future sessions know to check dev-server freshness before trusting screenshot evidence.

---

## Waiting for your approval before Phase 3

Per your standing instruction: not deploying, not starting Phase 3, until you've reviewed this report and the screenshots.
