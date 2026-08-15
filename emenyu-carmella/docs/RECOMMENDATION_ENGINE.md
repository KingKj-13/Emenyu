# Recommendation Engine

The scoring/candidate-generation engine is **entirely tenant-agnostic** and was not modified for Carmella except for one real bugfix (below) that benefits every tenant. This document covers `recommend()`'s pipeline; see `AI_ENGINE.md` for how a persona voice sits on top of it.

## Pipeline (in `aiService.recommend()`)

Candidates are added in strict priority tiers, each only filling gaps the tier above didn't cover:

1. **Chef-first** — per-item curated `MenuItemRecommendation` rows (Trump's admin-curated pairings; Carmella's imported `pairings` map, `recType='PAIRING'`) win outright at score band 1000+priority. This is where Carmella's 39 curated pairings enter.
2. **Legacy admin recommendation groups** — mid-tier fallback.
3. **Authored hero pairings** — Trump-specific wine-varietal matching (`heroPairings.js`); not applicable to Carmella's data shape (not extended for this build — Carmella relies entirely on tier 1's `pairings` map instead, which is simpler and sufficient for its curated-pairing needs).
4. **Tag-aware matching** — when the guest's intent carries dietary/attribute/occasion slots, matches `metadata.tags` directly (works for Carmella since its items carry `tags: ["vegetarian", "contains-nuts", ...]` from the source JSON, passed through automatically via the item metadata mechanism).
5. **Algorithmic fallback** — "people also ordered," perfect pairings, course completions, popularity.

After candidates are collected: rotation (variety), then **category safety** (`recommendationRules.js`), then dietary/allergy hard filtering, then confidence/expected-value scoring and re-ranking (`recommendationScoring.js`), then the Phase-4 candidate filter pipeline (never-suggest-declined, no-dessert-before-mains, etc.).

## Bugfix: chef candidates now actually bypass the beverage-headline rule (AD-007)

**The bug:** `recommendationRules.js`'s category-safety stage enforces R1–R4 beverage rules on every beverage candidate. R3 ("a soft/hot beverage must not headline unless the meal is closing") had no exception for chef-curated candidates — only the stage rules (R5) had a `!chef` bypass. Result: Carmella's curated "A Day in Paris → Cappuccino" pairing was silently dropped (cappuccino is a SOFT/HOT kind, not a PRIMARY beverage), and the reply fell back to an algorithmically-selected Champagne with generic template reasoning — nonsensical for a croissant.

**The fix:** added `!chef` to R1 (beverage cap) and R3 (secondary-headline, water-headline). R2 (never two primary beverages) and R4 (don't re-suggest a kind already on the table) stay enforced regardless — those protect table-setting sanity, not algorithmic diversity.

**Why this matters beyond Carmella:** the exact same gap would have silently overridden any of Trump's own admin-curated chef pairings that happen to suggest a non-wine/cocktail beverage. The code's own comment already documented the intended invariant ("chef recommendations keep their existing 'always wins' position") — this fix closes an implementation gap against that stated design, it doesn't change the design.

**Verified live** (before → after):
```
POST /Carmella/api/ai-pairing {"name":"A Day in Paris",...}
  before: GH Mumm Grand Cordon (champagne), generic reasoning
  after:  Cappuccino (R35) — "The classic café ritual."
          Red Juice (R70)  — "Something bright alongside."
```

## Companion fix: variant-only items now price correctly

Carmella has 34 items with no single base price — only per-variant prices (coffees: Single/Double; wines: priced by the glass). `dbItemToJson()`'s `price` field now falls back to the cheapest non-addon variant price when the base `price` is 0 and variants exist (`effectivePrice()` in `prismaMenuService.js`). Without this, these items — and any bundle referencing them — displayed a bare R0. The import script's bundle-item price lookup got the identical fallback so bundle totals/line-items match.

## What was deliberately NOT changed

- The scoring functions themselves (`recommendationScoring.js`: `baseConfidence`, `guestAdjustedConfidence`, `findReplacementTarget`, `netRevenueIncrease`, `scoreCandidate`) — zero changes. They operate purely on tags/prices/cart/order-history with no dish names or persona strings, and already worked correctly against Carmella's menu once its items carried the same tag vocabulary (`vegetarian`, `vegan`, `contains-nuts`, `spicy`, `seafood`, etc.).
- `heroPairings.js` — its wine-varietal domain model doesn't fit Carmella's flat pairings map; not extended, not touched. Carmella doesn't need it (tier 1 covers its pairing needs).
- Rotation/frequency/cooldown logic — unchanged.
