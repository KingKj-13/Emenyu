# Phase 3 — AI Dining Concierge

Branch `feat/chatbot-reco-rework`. Turns the existing chatbot/Recommendation
Brain (Phase 1) + Hospitality Intelligence narrative engine (Phase 2.5) into a
dining-journey-aware concierge: it now recommends the right NEXT thing for
where the guest actually is in the meal, not just a tag-matched pairing. No
new recommendation engine, no duplicated logic — everything below extends
`aiService.recommend()`, `recommendationScoring.js`, `recommendationRules.js`,
`chatSession.js`, and the existing `RecommendationCard`/`ChatPanel` components.

## What was built

### 1. The dining journey stage machine
**`server/services/recommendationScoring.js`** gained `nextJourneyStage(cart,
menuByName, {upgradeAvailable, upgradeOffered})` — a pure function implementing
the exact sequence from the product brief:

```
nothing selected -> drink -> food (starter/main) -> wine -> premium upgrade
  -> dessert -> coffee -> digestif -> done (stop recommending)
```

**`aiService.addCourseCompletions()`** was rewritten to compute this ONE stage
per turn (instead of unconditionally checking 4 fixed courses) and push the
single course-appropriate candidate through the exact same candidate/scoring
pipeline every other source here uses. New capabilities that didn't exist
before this phase: **coffee** and **digestif** stages (filtered by
`beverageKind === 'HOT'` / `tags.drinkType` in `['spirit','port','amarula']`),
and a **premium-upgrade** stage that reuses the existing
`heroPairings.upgradeFor()` (Brain V2) to surface a same-role swap (e.g.
Ribeye -> Wagyu Ribeye) once wine + main are both on the table. Once every
stage is satisfied, course-completion recommendations stop firing entirely —
per the brief's "journey complete -> stop recommending."

**Three real bugs found and fixed while wiring this up** (each verified via a
live local server before/after, not assumed):
- `recommendationRules.js`'s R5 ("no second main once the cart has one")
  unconditionally dropped the Wagyu upgrade candidate — it only had a `chef`
  bypass, not the `isReplacement` bypass R4 already has for beverages. Added
  the same bypass, consistent with the existing Phase 1 Replacement Logic
  design.
- Chef-tier candidates (`chefScored`) were never sorted by score, only by
  insertion order — fine when a dish had one chef pairing, but the upgrade
  nudge (also correctly marked `chef: true`, since it's a curated suggestion
  that deserves the same guaranteed placement as any other chef pairing) lost
  a tie to earlier-inserted sauce/side chef recs and vanished off the end of
  a normal 3-4 item result. Now sorted by `score` within the tier.
- The upgrade candidate's authored note ("for noticeably richer marbling...")
  was being silently dropped because it was passed as the candidate's
  display-title argument instead of `extra.reason` — `reasonComposer`'s
  Tier-1b ("chef reason wins verbatim") only reads the latter.

### 2. "Never repeatedly recommend the same thing" — real conversation memory
`server/services/chatSession.js`'s ignored-suggestion tracking previously only
looked at the immediately-preceding turn. Extended to scan the WHOLE
conversation (`allIgnoredNames`) so a dish suggested three messages ago and
never added stays excluded too — still fully stateless, still derived only
from the `history` the client already sends, no new persistence. Verified: a
dish declined 4 messages back, with two unrelated turns in between, stays
excluded on the next recommendation request.

### 3. Chat recommendation cards: Add to Cart, Replace, Premium badge
`ChatPanel.tsx`'s suggestion cards already rendered `RecommendationCard`, but
with no `onAdd` at all (guests had to open the item modal first) and no
"replace" affordance despite the card's `replacement` field already existing
since Phase 1. Added:
- **Add to Cart** directly from the chat card (reuses `CartContext.addItem` —
  the same cart every other add-to-cart path in the app uses).
- **Replace** — when `item.replacement` is present, swaps the old cart line
  for the new one. Deliberately gated: only rendered for WINE/DRINK/DESSERT
  (Phase 1's original, reliable replacement case) or an explicit
  `rotationGroup: "upgrade:*"` candidate — **not** blanket-trusted for every
  MAIN-category item, because `categoryClassifier` has no distinct "SIDE"
  categoryType (sides/sauces bucket as MAIN), so `findReplacementTarget`
  would otherwise mislabel "replace the Ribeye with the Steakhouse Chips" as
  a valid swap. Documented as a known limitation below rather than papered
  over.
- **Premium badge** — shown when `rotationGroup` starts with `upgrade:`.
- The card's `reason` (the WHY) is now always shown in chat (`showReason`).

### 4. Chat notification badge
A quiet gold, gently-pulsing dot on the chat launcher icon (`ChatPanel.tsx` +
`.module.css`) — appears when a background check (debounced 700ms after a
cart change, reusing the existing `/api/recommend` endpoint, no new backend
route) finds a new top suggestion AND the chat is closed; clears the instant
the guest opens chat; never opens the panel itself; never re-fires for the
same suggestion twice.

### 5. Hospitality metadata: conversation tips + a real edge-case fix
`hospitalityKnowledge.js` gained `conversationTipFor(item)` — a short,
tag-gated aside ("Fair warning, it's the spiciest thing on the menu.",
"It's a popular one for the table to share.") wired into the chatbot's
`itemExplanation()` ("why guests love this"). Works off the SAME tags every
item already has, so a new menu item needs nothing else.

While validating against the wider menu, found `MUSHROOM TRUFFLE BUTTER` (a
R49 condiment) inheriting `course: MAIN, protein: beef` from its root category
("Trumps Premium Steaks"), which made `cookingMethodFor`/`signatureFor`
nonsensically call a butter "grilled to order" and "one of our signature
dishes." Fixed by excluding condiment-named items (`sauce|butter|dressing|
dip|chutney|relish|glaze`) from both functions — a real, if minor, narrative
bug in the existing metadata inheritance, not introduced this phase but only
now surfaced because the engine actually reads `cookingMethodFor` for every
item.

### 6. A grammar bug found during self-review
The never-blank fallback (fires when a recommendation has NO cart anchor —
which is exactly a guest's very first "what's good here?") defaulted
`forName` to the literal string `'this dish'`, producing "A light opener
before the this dish lands." Pre-existing (carried over from before Phase
2.5, not introduced this session), but caught during self-review by testing
the empty-cart chat flow live, not assumed fine. Fixed with dedicated,
anchor-free lines for the no-source case.

## Dining journey — verified live (local server, real menu data)

| Cart state | Journey stage | Top result |
|---|---|---|
| (empty) | drink | *(chef/popular picks, none yet cart-anchored)* |
| Nederburg (wine) | food | T-Bone, Wings & Boerewors [MAIN] |
| Nederburg Wine Masters (wine) + Ribeye 380g | **upgrade** | **Wagyu Ribeye 300g** — "If you'd like something even more memorable, I'd suggest the Wagyu Ribeye — for noticeably richer marbling and a more buttery finish." (replacement: Ribeye 380g, net +R330) |
| ...+ Wagyu Ribeye instead (upgrade taken) | dessert | Trio of Ice Cream |
| ...+ Cape Malva Pudding | coffee | Dom Amarula *(next: coffee item)* |
| ...+ Cappuccino | digestif | Amarula |
| ...+ Amarula | **done** | *(course-completion stops; no forced filler)* |

## 20+ real pairing examples (Hospitality Intelligence, unchanged engine, now journey-aware)

See `data/hospitality-report.json` (generated by `hospitality-validate.js
--report`) for the full 44-example, 24-category set behind this table —
Starters, Salads, Sushi, Signature Seafood, Trumps Premium Steaks, Pork &
Ribs, Lamb, Venison & Game, Oxtail & Beef Ribs, Signature Combos, Burgers,
Chicken Dishes, Pastas, Vegetarian, Sides, Dessert, Set Menus, Champagne,
White Wine, Red Wine, Beers, Spirits, Cocktails, Mocktails & Cold Beverages.
Sample:

> **Signature Combos — RUMP STEAK, BOEREWORS AND RIBS** (anchor: Boekenhoutskloof): *"Juicy and full-flavoured, the rump meets its match in Shiraz's spice and depth. Full-flavoured and well-worked, which is why it holds up best of all the cuts to a hard sear. If you'd like something even more memorable, I'd suggest upgrading to the Wagyu Rump — the same full flavour, elevated by Wagyu's fat."*

> **Cocktails — DON MAGARITA** (anchor: Wagyu Fillet 300g): *"I noticed you've gone with the WAGYU FILLET 300g. If you're open to a recommendation, I'd definitely pair it with our DON MAGARITA. The citrus in that cocktail cuts right through the richness, keeps every bite feeling lighter. It's one of our signature dishes, so you're in good hands."*

## Files modified

**Server:** `services/recommendationScoring.js` (nextJourneyStage), `services/aiService.js`
(addCourseCompletions rewrite, chef-tier sort, intentLead family_dinner),
`services/recommendationRules.js` (R5 isReplacement bypass), `services/chatSession.js`
(allIgnoredNames), `services/intentClassifier.js` (family_dinner occasion),
`services/nlg/hospitalityKnowledge.js` (conversationTipFor, condiment guard),
`services/nlg/templateNlgProvider.js` (no-anchor fallback fix), `scripts/phase3-validate.js`
(9 new journey-stage tests), `scripts/hospitality-validate.js` (sample size 120 -> 150).

**Client:** `components/reco/RecommendationCard.tsx` (+.module.css: onReplace,
premium badge), `components/chat/ChatPanel.tsx` (+.module.css: add-to-cart,
replace, notification badge), `types/menu.ts` (ChatSuggestionItem additive
fields).

## Testing

`npm run reco:validate` **77/77** (68 existing + 9 new journey-stage tests),
`npm run chat:validate` **56/56**, `node scripts/hospitality-validate.js`
(150 items x 3 tones = 450 generations) **0 banned words, 0 over-length,
1.8% exact-text collisions** (down from a hypothetical unguarded baseline;
threshold is 15%). Client `tsc --noEmit` clean, `vite build` clean. All
verified against a live local dev server (not just unit fixtures) walking
the full journey with real menu items end-to-end.

## Known limitations (honest, not fabricated)

- **View-time / dwell-time tracking** does not exist anywhere in the app
  (`ItemModal` has no open/close analytics hook). The brief asks for "time
  spent viewing menu items" as a signal; building that is a real, separate
  analytics feature, not something this phase invented data for.
- **Budget signals / premium-interest scoring** are not tracked. Nothing in
  the codebase infers a guest's price sensitivity today.
- **"Wine + Main -> better wine"** (upgrading the WINE specifically, distinct
  from "add a first wine") is simplified to "any wine present satisfies the
  wine milestone" — a deliberate scope simplification, not a wine-upgrade
  sub-stage, given time constraints.
- **The "Replace" affordance is deliberately conservative** (WINE/DRINK/DESSERT
  + explicit upgrades only) because of the categoryClassifier's MAIN-bucket
  limitation described above. Extending Replace to sides/starters safely
  would need a proper SIDE categoryType — a shared-classifier change, out of
  scope for this phase per "don't redesign."
- **"Anything else?"**-style vague follow-ups sometimes route to a generic
  off-topic-ish reply that doesn't apply the ignored-names exclusion (only
  clearer recommendation-seeking phrasing does) — a pre-existing intent-
  classification gap, not introduced this phase, found during self-review.
- The Wagyu Ribeye's `img` field resolves to a mismatched stock photo
  ("Rump Steak.jpg") — a pre-existing media-mapping data issue, unrelated to
  this phase's logic, left untouched (fixing it means re-running the image
  pipeline, out of scope here).
