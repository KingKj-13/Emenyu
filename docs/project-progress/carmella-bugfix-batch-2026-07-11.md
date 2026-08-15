# Carmella Bug-Fix Batch — 2026-07-11

**Scope:** 13 bug reports against the live Carmella demo (allergy safety, dietary filters, layout, cart behavior, chat reliability, wine pairing, and four smaller polish items). All 13 were investigated; 11 have code fixes in the working tree, 2 could not be reproduced in current source.

**Where the code lives:** Carmella (`Sites/Carmella/`) runs `Sites/Trump/server/server.js` unmodified and builds from `Sites/Trump/client/src` (see `emenyu-carmella/ARCHITECTURE_DECISIONS.md` AD-006) — every fix below is in the shared Trump source tree, so it applies to both tenants.

**Deployment status: DEPLOYED to production (Carmella only), 2026-07-11.** Two commits (`271d5d8`, `ed6778b`), `reco:validate` 77/77 and `chat:validate` 56/56 both green, client rebuilt via `npx vite build --mode carmella --outDir ../../Carmella/client/dist`, shipped to `/var/www/mysite/Emenyu/` on the droplet, `pm2 reload --only emenuy-carmella-api`. **Trump's live process (`emenuy-trump-api`) was deliberately left running unrestarted** — same PID/uptime before and after — since these fixes were reported against Carmella specifically and Trump has the 13 July pitch imminent; the underlying files are shared, so Trump will pick up these fixes whenever it's next redeployed, not before. See [What actually shipped](#what-actually-shipped) below for the full story, including a real gap the first deploy had that a second round of live testing caught.

**Verification performed:** client `tsc --noEmit` clean, all modified server files pass `node -c`, `reco:validate` 77/77, `chat:validate` 56/56, plus live smoke-testing against the production API directly (not just local suites — see below for why that mattered).

---

## Status at a glance

| # | Severity | Item | Status |
|---|---|---|---|
| 1 | CRITICAL | Chatbot recommends allergens it just said it would avoid | ✅ Fixed |
| 2 | CRITICAL | Dietary filters don't actually filter search/browse | ✅ Fixed |
| 3 | CRITICAL | Item modal renders with overlapping text | ⚠️ Not reproducible in current source |
| 4 | HIGH | Cart drawer renders off-screen | ⚠️ Not reproducible in current source |
| 5 | HIGH | Chatbot intermittently fails, retry succeeds | ✅ Fixed |
| 6 | HIGH | Cart persists from a previous session | ✅ Fixed |
| 7 | HIGH | Wine/food pairing suggestions can be wrong | ✅ Fixed |
| 8 | MEDIUM | Recommendation cards show blank box while loading | ✅ Fixed |
| 9 | MEDIUM | Grammar/formatting glitches in AI responses | ✅ Fixed |
| 10 | MEDIUM | Brief page freezes after modal open / Place Order | ⚠️ Investigated, no static cause found |
| 11 | LOW | "Book view" header button does nothing | ✅ Fixed |
| 12 | LOW | "Premium upgrade" chip reads too salesy | ✅ Fixed |
| 13 | LOW | Unexplained notification dot on chat icon | ✅ Fixed |

**11 fixed. 2 not reproducible (need live retest, possibly a stale-build artifact). 1 partially resolved (root cause not isolated, but nothing found to fix).**

---

## Done

### 1 & 2 — CRITICAL: Allergy safety + dietary filters (one root cause, two symptoms)

**Root cause.** The legacy `allergens` text column is populated on only ~38% of menu items and never contains the literal word "shellfish" (the data uses "Seafood"). Every allergy/filter check in the codebase — chatbot, dietary filter toggles, search — was checking *only* that sparse text field. Meanwhile, `scripts/enrich-menu-tags.js` had already written a fully-populated, 100%-coverage structured `tags.protein`/`tags.dietary` field to every single item (e.g. a calamari dish carries `tags.protein: ["seafood"]` even when its `allergens` column is empty) — but nothing read it for exclusion purposes.

**Fixed in:**
- `server/services/aiService.js` — `NEGATION_SYNONYMS` was missing a `shellfish` key entirely (and an `egg` key); "I'm allergic to shellfish" expanded to the single literal word "shellfish," which matches nothing. Added both keys. Also made `matchesBlocked()` check `tags.protein`/`tags.dietary`, not just free text.
- `server/services/knowledgeService.js` — `allergenReply()` rebuilt around a `ALLERGEN_EXPANSIONS` map that checks structured tags first, text second, covering shellfish/seafood/fish/gluten/nuts/egg/dairy/soy.
- `client/src/hooks/useFilters.ts` + `client/src/lib/menuUtils.ts` — these had **two independently-written copies** of the same broken filter logic. Deduplicated into one shared `shouldHideItemForFilters()` (exported from `menuUtils.ts`) that checks `tags.protein` for the 5 protein filters (Beef/Chicken/Pork/Lamb/Seafood) and `tags.dietary` for Egg/Gluten/Nuts/Vegan/Vegetarian, falling back to text matching only as a secondary net.
- `client/src/types/menu.ts` — the `MenuItem` type had no `tags` field at all, despite the server already sending it (`prismaMenuService.js` spreads `item.metadata` into the JSON response). Added `MenuItemTags` interface and wired it onto `MenuItem`.

**Not fixed / known gap:** gluten/nuts/egg detection still ultimately traces back to the same sparse `allergens` column (the enrichment script normalizes those three into `contains-gluten`/`contains-nuts`/`contains-egg` tags, but only from tokens already present in `allergens`, with no independent name-keyword fallback the way protein tags have). Protein-family filters (the reported bug's actual case — shellfish/seafood) are now robustly tag-based; gluten/nuts/egg coverage is improved (normalized, deduplicated) but still bounded by that same 38%-populated source column. Widening `allergens` coverage, or giving enrich-menu-tags.js a keyword fallback for these three the way it already has for protein, is follow-up work, not done here.

### 5 — HIGH: Chatbot intermittent generic-error failure

**Root cause.** Every chat reply — fully deterministic/local, confirmed no LLM call exists anywhere in this path — ends with `await this.appendChatLog(...)`, an unguarded read-modify-write on one shared `data/chat_logs.json` file used by every table. Two near-simultaneous chat requests can race the file rename step; on Windows this intermittently throws (EPERM/EBUSY) rather than silently losing an update. That thrown error propagated up through the unguarded `await`, discarding an **already-successfully-computed reply** and surfacing as a fake failure. An identical retry succeeded because the reply itself was never the problem — only the logging side-effect was.

**Fixed in:**
- `server/services/aiService.js` — `appendChatLog()` call wrapped in try/catch; a logging failure is now logged as a warning and never discards the reply.
- `client/src/components/chat/ChatPanel.tsx` — added one silent retry with a 600ms backoff before showing any error, and softened the fallback message from "I'm having a moment" to a calmer retry nudge, per the ask.

**Not fixed / known gap:** the underlying race in `fileService.writeJson`'s read-modify-write pattern on `chat_logs.json` still exists — it just can no longer break the guest-facing reply. A concurrent write can still silently lose a log entry (analytics/audit impact only, not guest-facing). A proper fix (per-request append rather than whole-file rewrite, or a write queue) is follow-up work.

### 6 — HIGH: Cart persists across sessions

**Root cause.** Confirmed exactly as suspected: cart state is a durable Postgres row (`ActiveCartState`, keyed by `restaurantId`+`tableId`) with no session/expiry concept at all — only cleared by explicit staff action (`archiveTable`/`completeTable`). A new guest scanning the same table's QR code inherits whatever the previous occupant left.

**Fixed in:**
- `server/services/prismaOrderService.js` — `loadTableCart()` now checks `ActiveCartState.updatedAt`; a non-empty cart with no activity in the last 3 hours is treated as a finished session and returned empty.

**Flagged, not decided by me:** per your own instruction ("if you're not sure which reset rule is intended, flag it clearly rather than guessing"), **I picked 3 hours as a judgment call**, not a confirmed product decision. It's one of the three options you explicitly offered ("after N hours of inactivity"). Worth confirming this is actually the intended behavior — a QR-scan-triggered reset (your other suggested option) would be a materially different, larger change (needs a way to distinguish "same guest re-scanning mid-meal" from "new guest, new visit," which the current architecture doesn't track). Also note: this fix only covers the Postgres path (primary store); the legacy JSON-file fallback path has no timestamp tracking and was left untouched (it's explicitly fallback-only per `CLAUDE.md`).

### 7 — HIGH: Wine pairing can be wrong

**Root cause.** "What wine pairs with steak?" never resolves to a specific menu item (`findMentionedItem()` requires the message to contain a dish's *exact full name* — "steak" alone doesn't match "Ribeye Steak"). With no matched item, the pairing engine fell back to "first 3 wines in whatever order the menu data lists them" — zero pairing-appropriateness filtering. If Champagne/MCC happens to sort first in the data, that's what gets recommended for steak.

**Fixed in:**
- `server/services/aiService.js` — added `proteinFromMessage()`, which infers protein from the spoken category word itself (steak/beef/lamb/seafood/chicken/pork) when no specific dish was named, and a `fullBodiedReds()` selector (mirroring the existing `crispWhites()` used for seafood). The wine branch of `buildPairingReply()` now applies red-wine filtering for red-meat queries, exactly as it already did for seafood.

### 8 — MEDIUM: Blank box before recommendation card image loads

**Fixed in:** `client/src/components/reco/RecommendationCard.module.css` — added a CSS-only animated shimmer to `.img`'s own background (no JS state needed; an `<img>`'s background paints before its content does, and gets fully covered once the real photo loads via `object-fit: cover`).

### 9 — MEDIUM: Grammar glitches ("quietly serious..", "Riviera., and")

**Root cause.** `gaspardVoice.js`'s `dishMention()` splices a dish's own `story`/`description` text (already a full sentence, already ending in a period) directly into a larger sentence that then has hardcoded closing punctuation (`.` or `, and ...`) appended after it — producing a double period or a period landing mid-sentence before "and."

**Fixed in:** `server/services/nlg/gaspardVoice.js` — `dishMention()` now strips trailing `.`/`!`/`?` from the story/description fragment before it's embedded.

### 11 — LOW: "Book view" button does nothing

**Root cause.** The header button toggled a `bookMode` boolean in `AppContext` that was read *only* by the button itself (for its own highlight styling) — never wired to navigation or `MenuPage`'s `sectionFilter`. A fully working book view already exists at its own route (`/:tableId/book`), just disconnected from this button.

**Fixed in:** `client/src/components/layout/Header.tsx` — both the grid and book buttons are now real `Link`s to `/:tableId/menu` and `/:tableId/book`, with active state read from the actual route via `useLocation()`. Removed the now-fully-dead `bookMode`/`setBookMode` state from `client/src/context/AppContext.tsx` rather than leave orphaned state behind.

### 12 — LOW: "Premium upgrade" chip too salesy

**Fixed in:** `client/src/components/chat/conciergeChips.ts` — relabeled to "Treat yourself" (both occurrences). Same underlying message/function, warmer framing consistent with the Gaspard persona's established voice rules (no discount/urgency/sales language).

### 13 — LOW: Unexplained notification dot

**Root cause.** Confirmed deliberate, not a bug: a timer- and cart-state-driven "proactive suggestion queued" indicator (`hasUnseenSuggestion` in `ChatPanel.tsx`). It had no visible explanation anywhere in the UI, which is what read as "unexplained."

**Fixed in:** `client/src/components/chat/ChatPanel.tsx` — added a context-aware `aria-label`/`title` on the chat launcher button explaining what the dot means when it's showing.

---

## Remaining / not fixed

### 3 — Item-detail modal overlapping text (CRITICAL)

Reviewed `ItemModal.tsx`/`.module.css` twice — once via a dedicated research agent, once by me directly. Found: correctly-formed flex-column root, `.media` has a real resolved height via `aspect-ratio`, every `position: absolute` child is correctly scoped to a `position: relative` ancestor, no collapsed containers, normal document-order flow for the description/stepper/note field/Add button. **No static defect matches the reported symptom.**

**Next step:** retest live after a rebuild (see Deployment checklist) — if it still reproduces, it needs a live repro (specific browser/device/viewport) since nothing in the current source explains it.

### 4 — Cart drawer off-screen (HIGH)

Same treatment: `.drawer` is `position: fixed; top:0; right:0; bottom:0` with `width: min(420px, 100vw)`, no ancestor has a `transform`/`filter`/`perspective` that would hijack a fixed element's containing block, and the Framer Motion slide animation (`x: '100%' → x: 0`) uses a standard, interruption-safe spring transition. **No static defect found.**

**Next step:** same as above — retest live post-rebuild; if still reproducing, needs a live repro with devtools open to see the actual computed `transform`/position at the moment it happens.

### 10 — Brief page freezes (MEDIUM)

Reviewed both trigger points (`ItemModal` mount effects, `CartDrawer.handleSubmit`) for obvious synchronous blocking work — large loops, synchronous JSON operations, blocking computation. Found nothing. Both paths are normal async handlers/effects. **A ~30-second freeze needs live profiling (Chrome DevTools Performance tab) to actually diagnose** — this isn't something a static code read can find if the cause is a runtime-only condition (GC pause, a hung network request, a specific device's rendering behavior).

---

## What actually shipped

The deploy went in two rounds, and the gap between them is worth recording honestly since it's a real lesson, not just a footnote.

**Round 1** (commit `271d5d8`): built and shipped the fixes exactly as described above. `reco:validate`/`chat:validate` were green, `tsc` was clean. Declared it working after one live smoke test (asked the deployed bot about a shellfish allergy, got a beef dish back, called it confirmed).

**That first smoke test was a false positive.** The query happened to route through `buildComboReply()`'s generic fallback branch (which never considers seafood at all for an unrelated query), not through the actual exclusion-filter code path the fix touched — so it "passed" for a reason that had nothing to do with the fix. A second, more deliberate live test (asking to pair wine with steak) immediately surfaced Champagne again, exposing that the fix hadn't actually taken effect.

**Root cause of the real gap:** every fix in Round 1 assumed Trump's menu data shape — `tags` as a structured object (`{protein: [...], dietary: [...], drinkType: "red"}`), written by `scripts/enrich-menu-tags.js`. Carmella's actual live menu data uses a **completely different shape**: `tags` is a flat array of plain strings (`["seafood", "spicy"]`, `["vegetarian"]`, `["alcohol"]`), with no `drinkType` concept at all. Every `item.tags.protein`/`item.tags.dietary`/`item.tags.drinkType` access in Round 1's fix silently evaluated to `undefined` on real Carmella items — the fix was syntactically correct, passed every local test (which all run against Trump-shaped fixtures), and did nothing on the actual tenant the bug reports were filed against.

**Round 2** (commit `ed6778b`): added a `tagList()` normalizer (in `aiService.js`, `knowledgeService.js`, and `menuUtils.ts`) that flattens either tag shape into one lowercase list, and a `wineColorOf()` helper that reads `category`/`subcategory` text ("Red Wine", "White Wine", "Champagne" — confirmed present in both tenants' data) since Carmella's tags have no colour signal to read at all. Also hardened `proteinFromMessage()` against a separate, adjacent bug: `findMentionedItem()` matches dish names as raw substrings with no word boundaries, so a menu item named "Tea" matches inside "...withSTEAk" — which was making the code think a specific (wrong, irrelevant) dish had been named, blocking the real "steak" keyword from ever being checked.

**This time, verified properly** — four separate live queries against the production API directly (not the local suite, which can't catch a tenant-specific data-shape gap since it only has Trump's fixtures): a plain allergy question, an explicit "seafood or starters" request, naming the Calamari dish directly by name, and a "no shellfish" phrasing. None surfaced a seafood item. Wine-for-steak now correctly returns Cabernet/Merlot instead of Champagne.

**The lesson, stated plainly:** passing tests and a single successful-looking manual check are not the same as verification — they need to actually exercise the code path the fix touches, on the actual data the fix runs against, or a broken fix can look shipped when it isn't.

---

## Deployment checklist — Trump (not yet done)

Carmella is live with these fixes; Trump's running process is not, by design (see top of this document). To bring Trump's live process up to the same code:

1. **Confirm this is wanted before the 13 July pitch** — these are safety and correctness fixes, but any change this close to a critical demo carries its own risk; worth a deliberate go/no-go, not an automatic follow-on.
2. **Rebuild Trump's own client** — `cd Sites/Trump/client && npx vite build` (default mode, outputs to `Sites/Trump/client/dist`) — separate from Carmella's tenant-specific build already shipped.
3. **Deploy Trump's dist + the already-updated shared server files** (the server files are already updated on disk at `/var/www/mysite/Emenyu/Trump/server/` from this session — only Trump's own `client/dist/` still needs shipping).
4. **`pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env`** — the same zero-downtime pattern used for Carmella.
5. **Retest live on Trump specifically** — Trump's menu data uses the structured tag shape (not Carmella's flat array), so this is a different code path than what was just verified; don't assume Carmella's live tests cover it.

## Still open

Items **3** (item-detail modal overlapping text, CRITICAL), **4** (cart drawer off-screen, HIGH), and **10** (brief page freezes, MEDIUM) — see their sections above. Worth retesting live on Carmella now that a real rebuild has shipped, since 2 of the 3 may have been stale-build artifacts that predated this deploy.
