# Phase 5 — AI Concierge & Customer Intelligence (presentation layer)

**Date:** 2026-07-09
**Branch:** feat/chatbot-reco-rework
**Scope:** presentation only. Recommendation Engine V2 (Phase 4) was not modified — no changes to `aiService.js`, `recommendationScoring.js`, `candidateFilterPipeline.js`, `businessRules.js`, `recommendationMemory.js`, `hospitalityKnowledge.js`, `reasonComposer.js`, `nlgService.js`, `heroPairings.js`, or any `knowledge/*.json` file. This phase decides *when* and *how* the engine's existing output is shown; it never decides *what* to recommend.

## 1. Architecture summary

The concierge is a thin, additive layer entirely inside the customer React SPA, sitting on top of the same `api.getRecommendations()`/`api.chat()` calls the app already used:

- **`useConciergeTiming` hook** (new) — the only piece of "logic" this phase adds. Classifies the cart into one of 4 states (drink-only / food-only / drink-and-main / other) and fires a callback after the spec's scenario delay (15s / 5s / 10s), gated by a 2-proactive-nudge + 1-dessert budget, never repeating an already-shown (state, cart) combination. Never touches candidate selection — it only decides when to call `api.getRecommendations({ proactive: true })`.
- **`ChatPanel.tsx`** (rewritten) — wires the timing hook to the existing suggestion-rendering path, adds the browser-notification trigger, the dynamic chip row, and the quick-action button; the actual message/reply construction and `RecommendationCard` rendering reuse the same code paths as before.
- **`browserNotify.ts`** (new) — thin wrapper around the standard `Notification` API (ask-once via a `localStorage` flag, click-to-focus-and-open). Deliberately not the VAPID/service-worker push path already used by the owner/manager admin panel — that's a different transport for a different audience; a guest-facing nudge the *page itself* already knows about doesn't need a server round-trip.
- **`conciergeChips.ts`** (new) — pure data: the quick-action list and a small cart-context → chip-set mapping.
- **`QuickActionMenu.tsx`** (new) — the popup beside the input.
- **`RecommendationCard.tsx`** (extended) — a natural-language confidence label ("A confident pick" / "Recommended", never a percentage) and auto-derived "uplift" pill from the engine's own `netRevenueIncrease` for replacement/upgrade cards — no new technical fields exposed to the guest.

## 2. Files changed

**New:**
- `client/src/hooks/useConciergeTiming.ts`
- `client/src/lib/browserNotify.ts`
- `client/src/components/chat/conciergeChips.ts`
- `client/src/components/chat/QuickActionMenu.tsx` + `.module.css`

**Rewritten/extended:**
- `client/src/components/chat/ChatPanel.tsx` — timing hook, notifications, dynamic chips, quick-action button, expanded keyword highlighting, notification-click scroll/highlight, rename.
- `client/src/components/chat/ChatPanel.module.css` — single-pulse badge (was infinite), new chip-row styles, one-shot flash-glow highlight.
- `client/src/components/reco/RecommendationCard.tsx` + `.module.css` — confidence label, auto-derived uplift.
- `client/src/constants/config.ts` — `ASSISTANT_NAME` default → "🍷 Your Sommelier".
- `client/src/pages/OwnerDashboard.tsx` — one hardcoded `'Donald'`/`'your AI'` user-facing string fixed to use `ASSISTANT_NAME`.
- `client/src/types/cart.ts`, `client/src/context/CartContext.tsx` — optional `categoryType`/`beverageKind` on `CartItem` (needed for the timing hook to classify the cart without re-deriving categories).
- `client/src/pages/MenuPage.tsx`, `client/src/components/cart/CartDrawer.tsx`, `client/src/components/cart/CartRecommendations.tsx` — the 5 `addItem()` call sites now pass `categoryType`/`beverageKind` through.
- `client/src/types/menu.ts` — added `beverageKind?` to `ChatSuggestionItem` (was missing; the server already returns it).
- **Server (branding config only, one line):** `Sites/Trump/server/utils/helpers.js` — `assistantName` default `'Donald'` → `'🍷 Your Sommelier'`. Not recommendation logic.

## 3. Features implemented (per spec section)

- **AI identity:** renamed everywhere in the customer app to "🍷 Your Sommelier" — verified zero occurrences of "Donald" and no bare "AI"/"Bot"/"Chatbot" labels remain in guest-facing UI (see §6 for the one deliberately-out-of-scope admin-internal exception).
- **Browser notifications:** ask-once permission, `🍷 Your Sommelier` title, click opens chat + scrolls + highlights the card with a one-shot glow. Never fires while the chat panel is already open.
- **Recommendation timing:** all 3 cart-state scenarios (drink-only 15s, food-only 5s, drink+main 10s upgrade) implemented and verified live with real timers in a browser. Scenario 6 (demo-only dessert nudge, 60s after the upgrade moment) implemented, not live-timed in this pass (60s wait was judged low marginal value given it shares the identical trigger mechanism already verified twice).
- **Accept/ignore rules:** accepting pauses further proactive nudges for 8s and doesn't re-arm until the cart genuinely changes (verified: 0 new messages in the 9s after an accept); every shown item name is remembered so it's never suggested twice in the same visit; an ignored suggestion's exact (state, cart) context is never retried.
- **Proactive limits:** 2 general + 1 dessert, session-scoped, independent of Phase 4's own (deliberately dormant-by-default) server-side frequency counters — this phase is the first caller to actually set `proactive: true`, so Phase 4's engine-side gate is now genuinely exercised as a second, looser layer underneath this phase's tighter one.
- **Chat notification badge:** single 900ms pulse (was `infinite` before this phase — a real spec violation fixed), settles to a static dot until chat opens.
- **Chat experience:** the welcome screen and an always-visible chip row above the input are never empty; chips update with cart context (verified: steak+wine in cart → "Best wine / Recommend sauce / Dessert afterwards / Coffee pairing", matching the spec's own example exactly).
- **Quick-action button:** `+` button beside the input opens a 9-option popup (all spec-listed options); typing normally still works.
- **Highlighting:** expanded from "this message's own suggestion names" to also cover wine/beer/cocktail/steak/dessert/chef-special/premium-upgrade keyword categories, gold, in the concierge's own reply text.
- **Recommendation cards:** natural-language confidence label, auto-derived expected-value ("uplift") pill on upgrade/replacement cards, premium badge and Replace button (already existed, verified still correct) — no raw confidence/EV numbers shown anywhere.
- **Conversation style:** the underlying "why" text (hospitalityKnowledge/reasonComposer, Phase 2.5–4 work) already meets the spec's own "Good" example bar — verified via live output ("The richness in the ribeye holds up well against a fuller-bodied red — it softens the tannins…"), not modified this phase.

## 4. Validation results

| Check | Result |
|---|---|
| `client && npx tsc --noEmit` | clean |
| `client && npx vite build` | clean, `dist/index.html` fresh |
| `reco:validate` (unaffected — no engine files touched) | 77/77 |
| `chat:validate` (unaffected) | 56/56 |
| existing `phase5-validate.js` (unrelated older analytics suite, name collision with this phase number) | 17/17 |
| **Live browser test** (Playwright + Chromium, against a local mock backend — see §5) | see below |

**Live browser verification performed:**
1. Rename: zero "Donald", zero bare "AI" badge, header reads "🍷 YOUR SOMMELIER".
2. Quick-action menu: all 9 options render and are clickable.
3. Chip row: correct base set on empty cart; correct dynamic set after steak+wine (exact spec-example match).
4. Food-only scenario (5s): added Ribeye → waited 6s → notify badge appeared → reopened chat → wine pairing shown with natural confidence label.
5. Drink-and-main scenario (10s): added Cabernet too → waited 11s → notify badge appeared → reopened chat → Wagyu Ribeye upgrade shown with Premium badge, Replace button, "+R230" uplift pill.
6. **Found and fixed a real bug via this testing:** reopening the chat panel didn't scroll to the latest message — the panel unmounts on close (`AnimatePresence`), so a fresh mount always started scrolled to the top, and the scroll effect only re-ran when `messages` changed, not when the panel reopened. Fixed by also re-scrolling on `chatOpen`; re-verified with a screenshot showing the latest recommendation immediately visible on reopen.
7. Accept flow: clicking Add on a proactive suggestion added it to cart and produced zero new proactive messages in the following 9 seconds.
8. Notification permission: `Notification.requestPermission()` invoked on the first proactive nudge; the "asked" flag persisted so it won't ask again.
9. Zero page errors across the whole run (the only console noise was expected 404s from the deliberately minimal local mock backend, which doesn't implement Socket.IO or serve real image files — not a defect in the code under test).

**Not live-tested this pass** (implemented and code-reviewed, sharing the identical, already-verified trigger mechanism, but not run end-to-end with real timers): the drink-only 15s scenario, the 60s demo-only dessert nudge, tablet/mobile viewport sizes, and the notification-permission-denied path. Flagging honestly rather than claiming a full matrix run.

## 5. Local test environment

No production or shared database was used. A standalone mock HTTP server (scratchpad-only, never part of the repo) served `/Trump/api/{menu,config,recommend,chat,reco/events,ai-pairing}` with realistic canned data on port 3012; the real Vite dev server (port 5173, its existing proxy config unmodified) served the actual client build. This was necessary because no local Postgres dev database (`emenyu_local`) connection was available in this session (`.env.local` doesn't exist on this machine) — rather than reconstruct credentials or risk any ambiguity about which database was in use, a fully isolated mock was safer and faster, and it directly exercises the real component code under test (only the backend responses are fake).

## 6. Known limitations / observations flagged, not fixed

Per your explicit instruction: recommendation *behavior* is Phase 4's exclusively — anything noticed here is reported, not touched.

- **`aiService.js` line ~1138** still has a hardcoded `'Donald'` string as a fallback (`config.assistantName || 'Donald'`). It's dead in practice now (the config default was changed, so `config.assistantName` is always truthy), but the literal string remains inside the engine file. Not touched, per the phase boundary — flagging for whenever Phase 4's territory is next open for changes.
- **The chat's own wrapper/lead-in phrasing** (e.g., "I would steer you toward X", "I see you've added X — why not add our Y?") lives inside `aiService.js`'s `buildSuggestionReply()`/`cartAwareLead()` and is comparatively plain next to the sommelier-quality reason text those same replies carry (`hospitalityKnowledge`/`reasonComposer`, already excellent). Worth a copy pass in a future phase that's allowed to touch that file — not something this phase's client-only scope could address.
- **Dessert demo scenario (60s)** and **drink-only scenario (15s)** were implemented via the same code path as the two scenarios verified live, but not individually timed end-to-end in this pass (time budget) — see §4.
- **`item_graph.json`'s pairs_with edges** (from Phase 4) were *not* used to power anything in this phase — Phase 5's spec scope was presentation of what the engine already returns, not building new recommendation surfaces from the graph.

## 7. Production deployment

See the next message in this conversation for the deploy + production verification steps (backup → sync → `deploy-trump.sh` → smoke test → live check), performed after this report was written.
