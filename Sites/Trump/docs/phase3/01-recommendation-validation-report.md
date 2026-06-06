# Recommendation Validation Report (Phase 3, Task 9)

**Method:** executable harness `scripts/phase3-validate.js` (`npm run reco:validate`) exercises
the deterministic modules directly with crafted inputs and asserts the approved properties.
Pure modules (no DB) → fully reproducible. Run date: 2026-06-06. **Result: 41/41 PASS.**

The engine order is **Chef → Category Safety → Rotation → Fallback**
([`aiService.recommend()`](../../server/services/aiService.js)): chef rows enter at a score
band (`1000 + priority`) above every algorithmic source, the candidate list is rotated, then
the category-safety filter runs before the final slice.

---

## 1. Single authoritative classifier

One classifier ([`categoryClassifier.js`](../../server/services/categoryClassifier.js)) decides
`categoryType` + `beverageKind`. The server stamps both onto every item it serves
([`prismaMenuService.dbItemToJson`](../../server/services/prismaMenuService.js)); the client
consumes them and no longer re-derives categories
([`imageResolver.ts`](../../client/src/lib/imageResolver.ts) prefers `item.categoryType`).
`helpers.getCategoryType` delegates here, so there is exactly one implementation.

```
PASS  Tomahawk Steak → MAIN
PASS  "steak" not misread as DRINK (contains "tea")
PASS  Calamari Starter → STARTER
PASS  Malva Pudding → DESSERT
PASS  Porcupine Ridge Shiraz → WINE
PASS  Margarita → DRINK
PASS  Margarita beverageKind → COCKTAIL
PASS  Shiraz beverageKind → WINE
PASS  Still Water beverageKind → SOFT (not wine)
PASS  Cappuccino beverageKind → HOT
PASS  Heineken (with "Beers" category) → DRINK
PASS  Heineken (with "Beers" category) beverageKind → BEER
```

> Brand-only names (e.g. "Heineken") carry no type keyword, so they are classified with their
> menu category — exactly the input the menu pipeline passes (`dbItemToJson` builds
> `{ name, category, subcategory }`). Bare-name cocktails ("Margarita") now classify correctly
> too, after the consistency fix described in the [README](README.md#notable-fix-found-by-the-harness).

## 2. Category safety rules (R1–R7)

[`recommendationRules.applyCategorySafety`](../../server/services/recommendationRules.js) walks
the ordered candidates and drops anything that violates a rule, recording the drop reason for
explainability.

```
PASS  R1 at most one beverage recommended
PASS  R2 never wine + cocktail together
PASS  R4 wine-only cart gets no drink-to-drink chain
PASS  R5 dessert cart drops algorithmic starters
PASS  Audit fix: dessert cart → ≤1 beverage and no starter
PASS  Chef starter survives stage rule (chef bypass)
PASS  Algorithmic starter still dropped at closing
PASS  Chef wins but R2 holds: no wine + cocktail
```

Mapping to the Phase 2 audit defects (all now fixed):

| Phase 2 finding (proven live) | Rule | Test |
|---|---|---|
| Dessert-only cart got a **starter + coffee + wine** | R1 + R5 | *Audit fix: dessert cart → ≤1 beverage and no starter* |
| Wine-only cart got **water** (drink→drink) | R4 | *R4 wine-only cart gets no drink-to-drink chain* |
| Two beverages / wine + cocktail together | R1 + R2 | *R1*, *R2* |
| Chef curation was low-leverage | chef-first | *Chef wins but R2 holds*, *Chef starter survives* |

Chef rows are exempt from the **course-stage** rule (a chef may pair across stages on purpose)
but the **beverage-primacy** rules (R1/R2) still apply to the whole set — so a chef wine and an
algorithmic cocktail can never co-appear.

## 3. Rotation engine

[`rotationService.js`](../../server/services/rotationService.js) — FNV-1a seed +
`mulberry32` PRNG, seeded by `(restaurant | time-bucket | scope | group)`. Within a rotation
group it draws **without replacement, weighted by priority**; between groups overall score
order is preserved.

```
PASS  Deterministic: same device → identical order
PASS  Variety: different guests see different leaders
PASS  Priority respected: P100 leads more than P80
PASS  Reproducible seed (offline recompute for reports)
```

- **Variety** — across 60 device ids the 3-wine group surfaced ≥2 distinct leaders.
- **Priority-weighted** — over 300 device ids the P100 wine led more often than the P80 wine.
- **Explainable / reportable** — the seed is a pure function of its inputs, so any shown set is
  reproducible offline (`rotate()` also returns an `explain` array: group, seed key, picked).

## How to re-run

```bash
cd Sites/Trump && npm run reco:validate          # table above, exit 0 on all-pass
node scripts/phase3-validate.js --json            # machine-readable summary
```

## Not covered here (needs DB)

`recommend()` end-to-end (menu resolution + order-popularity + chef-rec loading from Postgres)
and live chatbot transcripts require the running server. The chef-first ordering *logic* and
its interaction with safety/rotation are covered above with crafted candidate sets; the live
path was exercised when the backend landed (commit `23027f6`). Seed real chef rows with
`npm run reco:seed -- --apply`.
