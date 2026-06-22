# Task 1 — Recommendation System Audit

**Phase 2 · audit only · no code changed.** Branch `feat/phase2-recommendation-design`.
Evidence is from the code as it stands plus live probes against the running server
(2026-06-03). Code: [server/services/aiService.js](Sites/Trump/server/services/aiService.js),
[server/services/opportunityService.js](Sites/Trump/server/services/opportunityService.js),
[server/utils/helpers.js](Sites/Trump/server/utils/helpers.js),
[client/src/lib/imageResolver.ts](Sites/Trump/client/src/lib/imageResolver.ts).

---

## 1. Current recommendation flow

All recommendation surfaces funnel through one function: `AiService.recommend()`
([aiService.js:800](Sites/Trump/server/services/aiService.js#L800)). It assembles
scored candidates from several sources, dedupes by normalized name, sorts by score,
and returns the top N as `publicItem`s tagged with a `source_title`.

```
recommend({cart, limit, reason})
  ├─ loadMenu → buildMenuContext()         (categoryType per item, searchText)
  ├─ loadRecommendations()  → chef groups  → "Chef's Pairing"        score 120  (cart-gated)
  ├─ getOrderRecords() (orders+history JSON)
  ├─ addPeopleAlsoOrdered()                → "People also ordered"   score 100+co-occurrence (cart-gated)
  ├─ addPerfectPairings()  typed WINE/DRINK/MAIN regex rules         score 84–94 (cart-gated)
  ├─ addFoodPairings()     sides by regex                            score 84–90 (cart-gated)
  ├─ addCourseCompletions()  STARTER/WINE/DRINK/DESSERT not in cart  score 66–76
  ├─ addPopularCandidates()  popularity heuristic                    score 52+
  └─ if reason: scoreSearch(reason)                                  score 82
  → sort desc, slice(limit), publicItem(source)
```

Consumers:
- `POST /api/recommend` → cart suggestions (guest cart drawer).
- `POST /api/ai-pairing` → splits `recommend()` output into `foodPairings` /
  `drinkPairings` ([aiService.js:770](Sites/Trump/server/services/aiService.js#L770)).
- `POST /api/waiter/cart-recommendations` → `cartRecommendations()` wraps
  `recommend()` with upsell script/probability ([aiService.js:473](Sites/Trump/server/services/aiService.js#L473)).
- `opportunityService.getOpportunity()` → takes `recommend()[0]` as "best next action".
- `chat()` routes most intents back through `recommend()` ([aiService.js:319](Sites/Trump/server/services/aiService.js#L319)).

## 2. Data sources

| Source | Where | Type | Notes |
|---|---|---|---|
| Menu items | Postgres `MenuItem` → `loadMenu()` → `buildMenuContext()` | live | `categoryType` derived by `getCategoryType()` |
| Chef recommendation groups | Postgres `Recommendation` (`description` + `items[]`) → `loadRecommendations()` | live, chef-editable | **group-level**, not per-item; only fires when cart contains a group item |
| Popular/featured | Postgres `FeaturedItem` (group=`popular`) → `loadPopular()` | live, chef-editable | name + reason, flat list |
| Order history | JSON `orders/` + `history/` → `getOrderRecords()` | live | drives "people also ordered" + popularity |
| Per-item flags | `MenuItem.chefPick`, `popular`, `sourceTitle` | live | booleans only; **not** used by `recommend()` scoring |
| Persona bundles | `client/src/constants/recommendedOrders.ts` | **hardcoded demo** | 5 personas; comment says "for the demo"; names can drift from menu |
| Dish stories | `client/src/lib/dishStories.ts` | **hardcoded, 1 entry** | only `ribeye` |
| Image inference | `IMAGE_BANK` (server) + `KEYWORD_MAP`/`DRINK_IMAGE_MAP` (client) | hardcoded | keyword → file |
| Heuristic popularity | regex bonuses in `getPopularityScores()` ([aiService.js:1117](Sites/Trump/server/services/aiService.js#L1117)) | hardcoded | tomahawk/wagyu/prawn/etc. get synthetic score |

**Observation:** chef control today is coarse (group lists + boolean flags + a featured
list). There is no per-item "recommend these sides / this wine / this dessert" model —
that gap is the subject of [Task 2](Sites/Trump/docs/phase2/02-recommendation-database-design.md).

## 3. Pairing logic

- **Perfect pairings** ([aiService.js:908](Sites/Trump/server/services/aiService.js#L908)):
  regex on combined cart `searchText` → typed keyword groups searched within a
  `categoryType` (WINE/DRINK/MAIN). Wine/drink picks are rotated by a hash of cart text
  (`pickVariedMenuItem`). Rules cover steak, seafood, burger/ribs, lamb/Greek, dessert.
- **Food pairings / sides** ([aiService.js:979](Sites/Trump/server/services/aiService.js#L979)):
  regex → side keywords (chips, onion rings, garlic bread…), skips a MAIN side if the
  cart already has a MAIN.
- **Pairing reason copy** ([aiService.js:700](Sites/Trump/server/services/aiService.js#L700)):
  derived from `categoryType` + name regex.

## 4. Category logic

- `getCategoryType(name)` ([helpers.js:591](Sites/Trump/server/utils/helpers.js#L591)):
  regex precedence STARTER → DESSERT → **food guard** → WINE → DRINK → default MAIN.
  The food guard runs before drink/wine so "steak"/"steakhouse" (contains "tea") isn't
  read as a drink. Default is **MAIN** when nothing matches.
- `buildMenuContext.walk()` ([aiService.js:194](Sites/Trump/server/services/aiService.js#L194))
  inherits a parent category's type into children unless the child name re-derives a
  non-MAIN type. Type is therefore name/category-string driven, never explicit data.
- Client mirrors this with `isDrinkItem`/`isCocktailItem`/`isDessertItem`
  ([imageResolver.ts:255](Sites/Trump/client/src/lib/imageResolver.ts#L255)) using a
  separate `DRINK_TERMS` list — **two independent classifiers** that can disagree.

## 5. Drink logic

- Server: only `categoryType ∈ {WINE, DRINK}` distinguishes beverages; cocktail vs wine
  vs coffee is not modelled (all non-wine drinks are `DRINK`).
- Client: `DRINK_TERMS`/`EXTRA_DRINK_TERMS` + `COCKTAIL_TERMS` decide imagery and whether
  an item gets a video (drinks get no video unless cocktail).

## 6. Cart recommendation logic

`cartRecommendations()` ([aiService.js:473](Sites/Trump/server/services/aiService.js#L473))
calls `recommend(limit 8)`, removes cart items, slices to 4, and attaches a `reason`,
`script`, and `upsell` value. **No beverage-count or category-conflict constraint** is
applied — whatever `recommend()` returns is shown.

## 7. AI chat recommendation logic

`chat()` ([aiService.js:319](Sites/Trump/server/services/aiService.js#L319)) is an
ordered if/else over keyword tests: deals → category → pair → combo → recommendation →
wine → dietary → mentioned-item → `scoreSearch` → popular fallback. Exclusions ("no
seafood") are post-filtered ([aiService.js:392](Sites/Trump/server/services/aiService.js#L392)).
Most "what should I get" paths delegate to `recommend()`. (Chatbot understanding is
audited in [Task 6](Sites/Trump/docs/phase2/06-chatbot-audit.md).)

---

## 8. Findings (with evidence)

### F1 — Multiple beverage recommendations appear together — **HIGH**
`addCourseCompletions()` ([aiService.js:1041](Sites/Trump/server/services/aiService.js#L1041))
adds a **WINE (76→74)** *and* a **DRINK (72)** independently when neither is in the cart,
and `addPerfectPairings()` can add another WINE/beer. Nothing enforces "one primary
beverage."
**Live proof — dessert-only cart returned both a coffee and a wine:**
```
- MACCHIATO [DRINK] <Sweet finish pairing>
- DURBANVILLE HILLS [WINE] <Wine pairing>
```

### F2 — Invalid course pairing: dessert → starter — **HIGH**
`addCourseCompletions()` always offers a STARTER if the cart has no STARTER, regardless
of what stage the meal is at.
**Live proof — dessert-only cart:**
```
- FIRECRACKER CHICKEN WINGS (400g) [STARTER] <Start with a starter>
```
Recommending a starter to a guest ordering only dessert is incoherent.

### F3 — Drink → drink loop — **MEDIUM**
With a wine already in the cart, the DRINK course-completion slot still fires.
**Live proof — wine-only cart:**
```
- WATER 750ML LA VIE (TRUMPS) [DRINK] <Cellar pairing>   (+ "Start with a starter")
```

### F4 — Food recommended as the answer to a beverage/quality question — **MEDIUM**
For the most natural question, "whats good here", the bot returned two tequilas and a
starter (off-target), mixing categories with no primacy:
```
GARLIC SNAILS[STARTER], HERENCIA REPOSADO[DRINK], HERENCIA ANEJO[DRINK]
```
(Root cause analysed in Task 6.) Category mislabeling can also occur because two
independent classifiers (server `getCategoryType` vs client `isDrinkItem`) can disagree
on the same item.

### F5 — Weak relevance / "poor quality" for vague queries — **MEDIUM**
`recommend()` with no strong signal falls through to **course completions + popularity
heuristics**, which surface the same few high-heuristic items (Tomahawk/Wagyu/Fillet)
regardless of context — e.g. "im hungry lol" and "stake" both returned the identical
Tomahawk/Wagyu/Fillet trio. Generic, repetitive output.

### F6 — Near-duplicate / nonsensical cross-sells — **MEDIUM**
Dedup is by exact normalized name only ([aiService.js:817](Sites/Trump/server/services/aiService.js#L817)),
so semantically odd items slip through: pairing a **salad** returned a **TOMAHAWK
850g–900g** as a "food pairing", and `addFoodPairings` can surface two different
chip/side items. No "don't recommend a second main" rule beyond a single `cartTypes`
check.

### F7 — Chef curation is low-leverage — **HIGH (product)**
Chef-curated groups score highest (120) but only fire when the cart already contains a
group member; with an empty cart (the menu-browse case) chef intent never shows. Per-item
`chefPick`/`popular` booleans are **not** consulted by `recommend()` at all. The brief's
priority ("chef-curated over algorithmic") is not achievable with today's model.

### F8 — Hardcoded demo data in the recommendation surface — **MEDIUM**
`recommendedOrders.ts` (5 personas) and `dishStories.ts` (1 story) are hardcoded in the
client and labelled "for the demo". Item names there can drift from the live menu (no
validation), and they are not chef-editable.

### Severity summary
| ID | Finding | Severity |
|---|---|---|
| F1 | Multiple beverages together | High |
| F2 | Dessert → starter (invalid course) | High |
| F7 | Chef curation low-leverage / not prioritized | High |
| F3 | Drink → drink loop | Medium |
| F4 | Category-mixed answers / dual classifier drift | Medium |
| F5 | Poor relevance for vague queries | Medium |
| F6 | Near-duplicate / second-main cross-sells | Medium |
| F8 | Hardcoded demo recommendation data | Medium |

These map directly onto the designs in Tasks 2 (per-item chef recs), 3 (category safety
rules — fixes F1/F2/F3/F6), 4 (rotation — fixes F5 repetition), 5 (UI consistency), and
6/7 (chatbot + knowledge — fixes F4 and vague-query quality).
