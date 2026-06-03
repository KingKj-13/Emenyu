# Task 3 — Category Safety Rules (Design)

**Design only.** A deterministic constraint layer applied to the merged candidate list
**after** scoring and **before** the final slice, in `recommend()` (and therefore in
ai-pairing, cart-rec, chat, and the opportunity engine, which all consume it). Fixes
audit findings F1, F2, F3, F6.

## Inputs the rules use

- Each candidate's `categoryType` (STARTER/MAIN/DESSERT/WINE/DRINK) and, once
  [Task 2](Sites/Trump/docs/phase2/02-recommendation-database-design.md) lands,
  `beverageKind` (WINE/COCKTAIL/BEER/SOFT/HOT). Until then, `beverageKind` is inferred
  from the name with the existing client term lists.
- The **cart contents** (their categoryTypes / beverageKinds), used to derive a **meal
  stage**.

### Meal stage (derived from cart)
| Stage | Trigger |
|---|---|
| `EMPTY` | cart empty |
| `OPENING` | only STARTER(s) / drinks so far |
| `MAIN` | cart contains a MAIN |
| `CLOSING` | cart contains a DESSERT (and a MAIN already, or dessert only) |

## The rules

### R1 — One primary beverage *(fixes F1)*
At most **one** "primary" beverage in the final list. Primary = `WINE`, `COCKTAIL`, or
`BEER`. If multiple primaries are present after scoring, keep the highest-scoring one and
drop the rest.

### R2 — No wine + cocktail together *(fixes F1)*
WINE and COCKTAIL are mutually exclusive in one recommendation set (a stricter corollary
of R1; called out explicitly in the brief). If both survive scoring, keep the higher
score; on a tie prefer WINE with a food cart, COCKTAIL with a drinks-led/celebration cart.

### R3 — At most one secondary beverage, and never as the headline
A single non-alcoholic "secondary" (`SOFT`/`HOT`, e.g. coffee/water) may appear **only**
after a primary or in `CLOSING` (a coffee with dessert). Never surface `WATER`/`SOFT` as a
standalone upsell. *(This is what produced "WATER … <Cellar pairing>" for a wine cart, F3.)*
Default policy: **one beverage total** unless the cart is `CLOSING` (then allow wine/digestif
+ coffee). Configurable via `TRUMP_RECO_MAX_BEVERAGES` (default 1).

### R4 — No drink → same-kind drink *(fixes F3)*
If the cart already contains a beverage of kind K, do not recommend another beverage of
kind K. Combined with R1, ordering a wine never yields another wine/most drinks.

### R5 — Course-stage validity *(fixes F2)*
Recommendations must respect meal stage:

| Cart stage | STARTER | MAIN | SIDE | DESSERT | BEVERAGE |
|---|:--:|:--:|:--:|:--:|:--:|
| EMPTY | ✅ | ✅ | – | – | ✅ (1) |
| OPENING | ✅ | ✅ | ✅ | – | ✅ (1) |
| MAIN | – | ❌ 2nd main | ✅ | ✅ | ✅ (1) |
| CLOSING | ❌ **starter** | ❌ | – | ✅ (share) | ✅ digestif/coffee |

R5 explicitly forbids **STARTER when stage = CLOSING** (the dessert→starter bug) and a
**second MAIN** when one is present.

### R6 — Source→target category compatibility *(fixes F6)*
A per-source allow-list prevents nonsensical cross-sells (e.g. a salad → tomahawk):

| Source categoryType | Allowed recommendation types |
|---|---|
| STARTER | MAIN, BEVERAGE |
| MAIN | SIDE, BEVERAGE, DESSERT, (complementary STARTER if stage=OPENING) |
| DESSERT | BEVERAGE(HOT/dessert-wine only) |
| WINE / DRINK | STARTER, MAIN (food to accompany) — **never** another primary beverage |

### R7 — De-duplicate by role, not just name *(fixes F6)*
Beyond the existing exact-name dedupe, collapse near-duplicates that fill the same role:
at most one "fries/chips" side, at most one of each `recType` slot unless the chef
explicitly lists more. Prevents two interchangeable sides crowding the list.

### R8 — Chef override wins, but rules still apply
Chef-authored recs (Task 2) outrank algorithmic ones, **but** R1/R2/R4 (beverage primacy
and conflicts) still apply across the merged set so a chef wine + algorithmic cocktail
never co-appear. R5/R6 are relaxed for explicit chef rows (the chef may intentionally
pair across stages); a chef rec is never *dropped* by R5/R6, only re-ordered.

## Application order (pseudocode — not implemented)

```
candidates = score(allSources)                 // chef band + algorithmic bands
candidates = filterByStageAndCompatibility(candidates, cart)   // R5, R6 (skip-drop for chef rows)
candidates = enforceBeverageRules(candidates, cart)            // R1, R2, R3, R4
candidates = dedupeByRole(candidates)                          // R7
return rotate(candidates).slice(limit)                         // Task 4
```

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `TRUMP_RECO_MAX_BEVERAGES` | `1` | total beverages in a rec set |
| `TRUMP_RECO_ALLOW_SECONDARY_BEVERAGE` | `true` (CLOSING only) | permit coffee/water alongside a primary |
| `TRUMP_RECO_ENFORCE_STAGE` | `true` | apply R5 course-stage matrix |

## Coverage vs audit findings
| Rule | Fixes |
|---|---|
| R1, R2, R3 | F1 (multiple beverages), wine+cocktail |
| R4 | F3 (drink→drink) |
| R5 | F2 (dessert→starter, second main) |
| R6, R7 | F6 (nonsensical / duplicate cross-sells) |
| R8 | preserves Task 2 chef priority safely |
