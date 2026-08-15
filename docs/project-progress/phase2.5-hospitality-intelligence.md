# Phase 2.5 — Hospitality Intelligence

Branch `feat/chatbot-reco-rework`. Extends the existing Recommendation Brain
and narrative layer (Phase 1 + the prior "Recommendation Brain V2" narrative
pass) so every recommendation, across all 439 menu items — not just the ~110
hand-authored hero dishes — reads like it came from an experienced waiter,
not a template and not an AI. No new recommendation engine, no new API, no
duplicated logic.

## The problem this closes

Before this phase, the "why" behind a pairing had two tiers:

- **Tier 1 (hero)** — ~110 hand-authored dish × varietal lines in
  `trump_hero_pairings.json`. Excellent quality, but only ~110 dishes.
- **Tier 2 (everything else)** — `templateNlgProvider.pairingReason()` matched
  on **regex against the dish's name** (`/steak|beef|rump|fillet|tomahawk|
  ribeye|wagyu/`) — not the `metadata.tags` every item already has. Anything
  that didn't hit a name keyword fell to a single generic line: *"Pairs
  naturally with the X."*

That generic line is what a guest actually saw for the majority of the menu —
sides, sushi, cocktails, spirits, salads, most of the wine list. It's the
"does math but has no narrative" problem, at the scale of the full menu.

## What was built

**`server/services/nlg/hospitalityKnowledge.js`** (new) — a pure, tag-driven
rules engine. Reads `metadata.tags` (protein, richness, body, drinkType,
texture, spice, course, flavour — all already populated on all 439 items by
`scripts/enrich-menu-tags.js`, verified before writing any code) and returns:

- `whyClauseFor({ dish, drink, tone })` — the reasoning behind a dish×drink
  pairing, from 18 tag-combination rules (red+rich meat, red+rich non-meat,
  medium red, white+seafood, white+light, sparkling, rosé, beer+spice,
  beer, cocktail+citrus, cocktail, chicken+light, crispy+carbonation,
  spirit+dessert, spirit+rich, spirit general, cider, mocktail/soft,
  hot+dessert, hot general, and an always-true catch-all so a pairing is
  never left without a considered reason). Each rule carries 3 tone
  registers and, where natural, 2 phrasing variants.
- `foodPairClauseFor({ target, source, tone })` — the fallback for food+food
  suggestions (starter/side/salad/dessert with no wine in the cart yet).
- `cookingMethodFor(item)` — a short, concrete prep description **derived**
  from tags (e.g. beef+charred → "char-grilled over the coals", seafood →
  "kept simple so the flavour stays clean", SUSHI → "sliced fresh to order").
  Nothing is stored — it's computed at read time from tags every item has.
- `signatureFor(item)` — derives signature/chef-recommendation status from
  name keywords (wagyu/tomahawk/signature) or richness=3 MAIN, used to swap
  in a "this is one of our signature dishes" closer instead of a generic one.

**`templateNlgProvider.js`** — `pairingReason()` and `upsellScript()` were
rewritten to call into this engine, then compose a full narrative via one
new shared method, `composePairingLine()`: opener (acknowledges what's
already on the table) → recommendation → the tag-driven WHY → an optional
cooking-method line → a closer. Every part rotates deterministically (reusing
`rotationService.hashString`, not a new random source) per (item, anchor)
pair, so 100 different pairings don't all read identically, while the same
pairing always reads the same way twice.

**`upsellScript()` now reuses the same engine** — the waiter's
Professional/Friendly/Luxury tone tabs (Phase 2) were, before this phase,
built from a separate, much thinner "benefit" string with no tag awareness.
`aiService.cartRecommendations()` now resolves the same food/wine cart
anchors `recommend()` already computes and passes them (with tags) into
`upsellScript()`'s data, so the card's "why" and the waiter's spoken script
are one narrative engine, not two.

**Tone default changed to Friendly** — `nlgProvider.normalizeTone()`'s
fallback and `reasonComposer.pairingReason()`'s default parameter both moved
from `'professional'` to `'casual'` (the code name for "Friendly" — there's
no separate `'friendly'` tone constant, by design, per Phase 2's original
build). The waiter UI's tone-tab default was also switched to Friendly.

**Two real pre-existing bugs found and fixed via validation, not assumption:**
1. `trump_hero_pairings.json` had two authored lines using "indulgent" (a
   banned word per this phase's style guide) — both fixed to "feels rich
   enough to sit beside them comfortably."
2. `categoryClassifier.js`'s food-guard regex matched the bare word `side`
   inside **"Side Car"** (a cocktail), so "Remy Martin 1738 Side Car" was
   misclassified as a MAIN dish everywhere in the app (menu grouping, cards,
   recommendations) — a pre-existing bug, not introduced this phase, caught
   because the 120-item sample surfaced a nonsensical pairing. Fixed with a
   narrow negative lookahead (`side(?!\s*car)`); verified `ONION RINGS` and
   other real side dishes still classify correctly, and both regression
   suites stayed green after the fix.

**Occasion words** — added the one missing named occasion from the product
brief (`family_dinner`, alongside the existing birthday/anniversary/
graduation/business_dinner (covers "Corporate Dinner")/sports_night/date
(covers "Date Night")/celebration detection in `intentClassifier.js`) with
its own natural lead-in line in `aiService.intentLead()`.

## What was NOT built (honest scope)

- **Tone variance inside `dessertNarrative()`** (the multi-anchor "you've
  chosen X and Y" dessert line from the prior V2 session) — it still reads
  the same regardless of which tone tab is open. It's a strong, working
  narrative; extending it to 3 tones is a small, separate follow-up, not
  done in this pass.
- **Generic (non-hero) premium-upgrade nudges** — `heroPairings.upgradeFor()`
  still only covers the 5 hand-authored steak→Wagyu upgrade paths from the
  prior session. A fully generic "any rich dish → its premium sibling"
  matcher across all 439 items would need cross-menu-item matching logic;
  extending coverage today is pure content (add a row to the `upgrades`
  array in `trump_hero_pairings.json`), not an engineering gap.
- **"Popular combinations" / "seasonal notes"** from the brief's aspirational
  metadata list — the architecture supports adding these as tag-driven rules
  exactly like the 18 above, but no seasonal-calendar or order-frequency data
  source exists yet to drive them honestly, so none were fabricated.

## Before / after — 24 categories, real menu items, real DB

Generated from the actual `reasonComposer`/`templateNlgProvider` pipeline
(not reconstructed by hand). "Before" reproduces the exact prior algorithm
verbatim against the same real item + anchor pair.

| Category | Item (→ anchor) | Before | After (Friendly) |
|---|---|---|---|
| Starters | TEMPURA PRAWN ← Cucumber & Mint G&T | "A light opener before the CUCUMBER AND MINT G&T lands." | "I noticed you've gone with the CUCUMBER AND MINT G&T. If you're open to a recommendation, I'd definitely pair it with our TEMPURA PRAWN. The citrus in that cocktail cuts right through the richness, keeps every bite feeling lighter. It's kept simple so the flavour stays clean. It's one of my favourite combinations on the menu." |
| Salads | GREEK SALAD ← Makers Mark | "Pairs naturally with the MAKERS MARK." | "Since you've already got the MAKERS MARK on the table, I'd pair it with our GREEK SALAD. Nothing complicated here, it just goes well alongside. It's tossed fresh. It's always a hit at this table." |
| Sushi | ROSES – SALMON (6pc) ← Armand de Brignac Rosé | "Pairs naturally with the ARMAND DE BRIGNAC..." | "I noticed you've gone with the ARMAND DE BRIGNAC BRUT ROSÉ (ACE OF SPADES). ... Bubbles always cut through a plate like this, it keeps things feeling fresh — and it's got a nice celebratory lift too. It's sliced fresh to order. It's one of my favourite combinations on the menu." |
| Signature Seafood | FALKLANDS CALAMARI ← Rupert & Rothschild Baroness Nadine | "Pairs naturally with the RUPERT & ROTHSCHILD..." | "...That crisp acidity just lifts the falklands calamari right up, it's a classic match for a reason. It's kept simple so the flavour stays clean. ..." |
| Trumps Premium Steaks | T-BONE 700g ← Springfield Life of Stone | "Pairs naturally with the SPRINGFIELD LIFE OF STONE." | "...Keeps things light, the wine won't bulldoze the t-bone 700g at all. It's char-grilled over the coals. ..." |
| Pork & Ribs | FULL RACK PORK LOIN RIBS ← Castle Lite | "Pairs naturally with the CASTLE LITE." | "Sometimes sticky ribs just want an ice-cold draught — Castle's crisp, clean bite resets the palate between every messy mouthful." |
| Lamb | LAMB CHOPS 4's 500g ← Glenfiddich 26yo | "Pairs naturally with the GLENFIDDICH 26 year..." | "...It's got enough weight that it won't get lost next to something this rich. It's char-grilled over the coals. It's always a hit at this table." |
| Venison & Game | SPRINGBOK ±450g ← Meerlust Red | "Pairs naturally with the MEERLUST RED." | "...It's a solid, easy match for the springbok ±450g, you really can't go wrong with it. It's char-grilled over the coals. ..." |
| Oxtail & Beef Ribs | BEEF RIBS (2pc) 600g ← Durbanville Hills | "Pairs naturally with the DURBANVILLE HILLS." | "...This one's not too heavy, so it just rounds out the beef ribs (2 pce) 600g without taking over. It's char-grilled over the coals. ..." |
| Signature Combos | MIXED GRILL ← Rust en Vrede Estate | "Pairs naturally with the RUST EN VREDE ESTATE." | "...Honestly the char on the mixed grill is made for a red with this much backbone, it just softens everything out. It's char-grilled over the coals. ..." |
| Burgers | JALAPENO CHILLI AND CHEESE BURGER ← Five Roses Tea | "Pairs naturally with the FIVE ROSES TEA." | "...Good one to have once the plate's cleared, rounds things off nicely. It's grilled to order. It's one of our signature dishes, so you're in good hands." |
| Chicken Dishes | HALF CHICKEN ← Martini (Gin) | "Pairs naturally with the MARTINI (GIN)." | "...It's got enough going on that it won't get lost next to the half chicken. It's flame-grilled. It's always a hit at this table." |
| Pastas | ALFREDO ← Alto | "Pairs naturally with the ALTO." | "...That creamy, rich sauce on the alfredo can really take a red with this much weight — it softens everything out. It's a signature plate here — always a good sign." |
| Vegetarian | HALLOUMI BURGER ← Hennessy VSOP Privilege | "Pairs naturally with the HENNESSY VSOP PRIVILEGE." | "...It's got enough weight that it won't get lost next to something this rich. It's fried till properly crisp. It's one of our signature dishes, so you're in good hands." |
| Sides | ADD FETA ← 1800 Tequila Reposado | "Pairs naturally with the 1800 TEQUILA REPOSADO." | "...Nothing complicated here, it just goes well alongside. It's one of my favourite combinations on the menu." |
| Dessert | CAPE MALVA PUDDING ← Jose Cuervo Reposado | "The sweet finish that completes the JOSE CUERVO..." | "...A neat pour like that is honestly the perfect way to finish once the dessert's done. It's baked in-house. It's always a hit at this table." |
| Set Menus | CHEF'S PREMIUM – 2 Courses ← Red Bull Red Edition | "Pairs naturally with the RED BULL RED EDITION." | "...Chicken goes with almost anything, but keeping it light like this keeps the whole plate balanced. It's pan-seared so it stays flaky. It's always a hit at this table." |
| Champagne | VEUVE CLICQUOT ROSÉ ← Rainbow Roll – Salmon | "A crisp white — delicate red berry..., a classic match for the RAINBOW ROLL..." | "...Bubbles always cut through a plate like this, it keeps things feeling fresh — and it's got a nice celebratory lift too. ..." |
| White Wine | DURBANVILLE HILLS ← Chakalaka Sauce | "a balanced profile that sits beautifully at the table — a confident pour with the CHAKALAKA SAUCE." | "...It's a solid, easy match for the chakalaka sauce, you really can't go wrong with it. It's one of my favourite combinations on the menu." |
| Red Wine | BEYERSKLOOF RESERVE ← Beef Ribs (2pc) 600g | "A bold, full-bodied red — a balanced profile..., built to stand up to the char..." | "...The marbling in the beef ribs (2 pce) 600g really works with a fuller-bodied red — you get a much smoother finish. It's always a hit at this table." |
| Beers | CORONA ← Trumps Rainbow Reloaded (10pc) | "A great glass to round off the TRUMPS RAINBOW..." | "...Honestly a cold beer is the best way to cool that heat down, works every time. It's one of our signature dishes, so you're in good hands." |
| Spirits | CARDHU 12yo ← Veg Burger | "a balanced profile that sits beautifully at the table — a confident pour with the VEG BURGER." | "...Nothing complicated here, it just goes well alongside. It's one of my favourite combinations on the menu." |
| Cocktails | REMY MARTIN 1738 SIDE CAR ← Cucumber & Mint G&T | "Pairs naturally with the CUCUMBER AND MINT G&T." (mis-tagged as MAIN before the classifier fix above) | "...The citrus in that cocktail cuts right through the richness, keeps every bite feeling lighter. It's one of my favourite combinations on the menu." |
| Mocktails & Cold Beverages | SHAKES ← Ribeye 850g–900g | "A great glass to round off the RIBEYE 850g - 900g." | "...It's nice and refreshing, keeps things feeling light between bites of the ribeye 850g - 900g. It's one of my favourite combinations on the menu." |

## Validation results

**`scripts/hospitality-validate.js`** (new) — samples 120 real menu items
(stratified across all 24 real categories, ≥1 per category) from the live
local database, runs each through the real `reasonComposer` in all 3 tones
(360 generations), and checks: zero banned words, zero outputs over 5
sentences, and an exact-text collision rate under 15% (two *different*
pairings producing byte-identical output — the practical signature of a
template not actually varying).

```
sampled: 120 items across 24 categories | generations: 360 (3 tones each)
banned-word hits: 0 | over-length (>5 sentences): 0 | exact-text collisions: 12 (3.3%)
result: PASS
```

The remaining ~3% collisions are, by inspection, correct-not-broken: the
same hero dish token (e.g. "Rump") legitimately maps multiple menu-item
variants (Rump 400g / Rump 600g) to the same authored Tier-1 line when paired
with the same varietal — matching the existing, intentional "one authored
reason per (dish × varietal)" design from the prior session, not a Phase 2.5
regression.

**Regression suites** (must stay green — proves no recommendation-logic
change): `npm run reco:validate` **68/68**, `npm run chat:validate`
**56/56** (one assertion text updated to match the banned-word fix, no
behavior assertion changed). Client `npm run typecheck` clean, `npx vite
build` clean (note: `npm run build` reports exit 1 with no output in this
sandbox even on success — a known environment quirk, verified via direct
`vite build` invocation).

## How to add a future menu item — metadata only

1. Add the item to the menu (Admin UI or DB) with a name, category and
   description as usual.
2. Run `node scripts/enrich-menu-tags.js --apply` — it tags the new item
   from its category/name/description automatically (closed vocabulary,
   deterministic, already covers 439/439 items).
3. Done. `hospitalityKnowledge.js` reads tags at request time — a new dish
   with `protein: ['beef'], richness: 2, texture: ['charred']` immediately
   gets a real cooking-method line, a tag-matched wine/beer/cocktail WHY
   clause, and all 3 tones, with zero new code. Optional, content-only
   upgrades (a hand-authored hero line, a premium-upgrade nudge, a sauce
   suggestion) are a JSON row in `trump_hero_pairings.json` — never a new
   function.
