# Phase 2 — Enrich + Seed (STEP 1: proposal only, nothing executed)

**Date:** 2026-06-19 · **Branch:** `feat/chatbot-reco-rework` (local only) · **Scope:** `restaurantId='trump'` — **439 items** (153 food + 286 beverage), 87 categories.

> **Scope change vs the original Phase 2 prompt.** Phase 2 was written assuming Phase 1 would leave ~65–150 "cleaned" items. Phase 1 found nothing to clean — Trump's real menu is **439 items**. Good news: the **286 beverages are almost entirely tag-derivable from their varietal categories** (cheap), so the real hand-effort is the **~153 food items**. Everything below is tenant-scoped; **every pass filters by `restaurantId='trump'`**.

---

## A) Tag schema — `metadata.tags` (no migration)

`metadata Json?` already exists on every row (today it holds `mediaSrc/mediaStatus/...`). We add a sibling `tags` block — **no schema migration**, and media keys are untouched.

```jsonc
metadata.tags = {
  "v": 1,
  "source": "bootstrap",          // → "reviewed" once a human edits it in the menu CRUD
  "kind": "FOOD" | "DRINK",
  "course": "STARTER|SALAD|SUSHI|MAIN|SIDE|DESSERT|SET|DRINK",

  // ── FOOD axes ───────────────────────────────────────────────
  "protein":   ["beef|chicken|lamb|pork|seafood|game|none"],
  "spice":     0,                 // 0 none · 1 mild(🌶️) · 2 medium(🌶️🌶️) · 3 hot
  "richness":  0,                 // 0–3  fat / unctuousness
  "acid":      0,                 // 0–3  brightness
  "sweetness": 0,                 // 0–3
  "flavour":   ["smoky|charred|garlicky|herby|creamy|citrus|umami|peppery|cheesy|chocolate|fruity"],
  "texture":   ["crispy|tender|juicy|crunchy|soft|flaky"],
  "temperature": "hot|cold|room",
  "aromatics": ["garlic|chilli|herbs|citrus|smoke|truffle"],
  "dietary":   ["vegetarian|vegan|gluten-free-able|contains-gluten|contains-egg|contains-nuts"],
  "occasion":  ["sharing|date|celebration|quick|hearty|light"],

  // ── DRINK axes (kind=DRINK) ─────────────────────────────────
  "drinkType": "red|white|rose|sparkling|beer|cider|cocktail|mocktail|spirit|soft|hot",
  "body":      "light|medium|full",
  "drySweet":  "dry|off-dry|sweet",
  "abv":       "none|low|standard|high"
}
```

**Provenance matters:** `source` distinguishes auto-tagged from chef-reviewed. The bootstrap **never overwrites a `"reviewed"` row** on re-run. This is what lets us bulk-bootstrap safely and refine the long tail by hand in the existing editor (not a parallel system).

**Honest confidence per axis** (what the bootstrap can fill vs. what needs review):

| Axis | Bootstrap source | Confidence |
|---|---|---|
| kind, course | category | ✅ ~100% |
| drinkType / body / drySweet | varietal category (286 drinks) | ✅ ~100% |
| protein | `allergens` token + category + name | ✅ ~90% |
| dietary | `allergens` tokens + `VEGETARIAN` cat | ✅ high where present |
| spice | 🌶️ emoji + desc keywords (peri-peri/chilli/firecracker) | 🟡 ~25–30% |
| flavour, aromatics, richness | desc + category keyword inference (67% have desc) | 🟡 medium → **review** |
| acid, texture, sweetness | desc keywords + category | 🟡 medium → **review** |
| occasion | derived from category/format (platter→sharing, signature cut→date) | 🟡 medium |

Low-confidence axes are emitted to a **review report** so the chef refines them in the menu CRUD — not invented with false precision.

---

## B) Bootstrap mapping — 3 deterministic, layered passes

**Pass 1 — Category → defaults** (map keyed on the 24 roots + notable sub-cats). Representative rows:

| Category (root › sub) | Defaults applied |
|---|---|
| Trumps Premium Steaks › *(all cuts, Wagyu, Kings)* | MAIN · beef · richness 2 · flavour[charred,peppery] · texture[juicy,tender] · occasion[hearty,date] |
| Signature Seafood · Pastas(seafood) | MAIN · seafood · occasion[date] |
| Sushi › * | SUSHI · seafood* · flavour[umami,fresh] · texture[soft] · temp cold · occasion[date] *(name "Vegetable"→none)* |
| Pork & Ribs / Lamb / Venison & Game / Oxtail | MAIN · pork/lamb/game · occasion[hearty] |
| Signature Combos / Platters | MAIN · occasion[sharing,hearty] |
| Burgers | MAIN · occasion[quick] |
| Chicken Dishes | MAIN · chicken |
| Starters › Small Plates / Tempura | STARTER · occasion[sharing] |
| Salads | SALAD · temp cold · acid 2 · occasion[light] |
| Vegetarian | MAIN · none · dietary[vegetarian] |
| Sides | SIDE |
| Dessert | DESSERT · sweetness 3 · flavour[chocolate,sweet] · occasion[date] |
| Set Menus | SET |
| Red Wine › Cabernet/Shiraz/Pinotage/Merlot/Red Blends | DRINK · red · full · dry · occasion[date] |
| White Wine › Sauvignon Blanc/Chenin/Chardonnay | DRINK · white · light–medium · dry |
| Champagne / Cap Classique | DRINK · sparkling · light · dry/off-dry · occasion[celebration] |
| Beers / Ciders | DRINK · beer/cider · occasion[sharing] |
| Spirits (malts/gin/tequila/…) | DRINK · spirit · abv high |
| Cocktails / Mocktails / Cold / Hot Bev | DRINK · cocktail/mocktail/soft/hot |

**Pass 2 — Structured field signals (override/augment):**
- `allergens` tokens → **protein** (Beef/Chicken/Lamb/Pork/Seafood) and **dietary** (Vegetarian, Vegan, Gluten→contains-gluten, Egg→contains-egg, Nuts→contains-nuts). *(165 items / 38% carry these.)*
- `spice` emoji → **spice** level (🌶️=1, 🌶️🌶️=2).

**Pass 3 — Name + description keyword lexicon** (67% have usable descriptions):
- spice: peri-peri, chilli, jalapeño, firecracker, "hint of chilli" → spice ≥ 1
- flavour/aromatics: bbq/glaze→smoky · garlic→garlicky+aromatics · cream/cheese→creamy+richness↑ · truffle→truffle+richness↑ · lemon/citrus→citrus+acid↑ · chocolate→chocolate
- texture: crispy/fried/tempura→crispy · grilled/crusted→charred · "thinly sliced"→soft
- occasion: platter/combo/sharing/wings→sharing · "for 1"→quick

**Re-runnable & safe:** tenant-scoped, idempotent, skips `source:"reviewed"`. Emits `enrich-report.json` (per-axis fill rate + a low-confidence review list).

---

## C) ~10 auto-tagged sample items (rules applied by hand to real rows)

| Item (category) | Bootstrapped `tags` (abridged) |
|---|---|
| **RIBEYE 380g** (Steaks › Prime Beef) | FOOD·MAIN · protein[beef] · spice 0 · richness 2 · flavour[charred,smoky,peppery] · texture[juicy,tender] · temp hot · occasion[hearty,date] |
| **TRUMPS SALMON SASHIMI** (Sushi › Sashimi) | FOOD·SUSHI · protein[seafood] · acid 1 · flavour[umami,fresh] · texture[soft] · temp cold · occasion[date] |
| **FIRECRACKER CHICKEN WINGS 400g** (Starters) | FOOD·STARTER · protein[chicken] · spice 1 · sweetness 1 · flavour[smoky,sweet] · aromatics[chilli] · texture[crispy] · occasion[sharing] |
| **GARLIC LEMON CALAMARI** (Starters) | FOOD·STARTER · protein[seafood] · acid 1 · flavour[garlicky,creamy,citrus] · aromatics[garlic,citrus] · richness 1 · occasion[sharing] |
| **LAMB CHOPS 4's 500g** (Lamb) | FOOD·MAIN · protein[lamb] · flavour[charred,peppery] · texture[juicy] · richness 2 · occasion[hearty] |
| **VEG BURGER** (Vegetarian) | FOOD·MAIN · protein[none] · dietary[vegetarian,contains-gluten] · spice 1 · flavour[sweet] · aromatics[chilli] · occasion[quick] |
| **DEATH BY CHOCOLATE CAKE** (Dessert) | FOOD·DESSERT · dietary[vegetarian,contains-gluten,contains-egg] · sweetness 3 · richness 3 · flavour[chocolate] · texture[soft] · occasion[date] |
| **GREEK SALAD** (Salads) | FOOD·SALAD · protein[none] · dietary[vegetarian] · acid 2 · flavour[fresh,cheesy] · texture[crunchy] · temp cold · occasion[light] |
| **SEAFOOD PASTA** (Pastas) | FOOD·MAIN · protein[seafood] · dietary[contains-gluten] · spice 1 · flavour[garlicky,umami] · acid 1 · aromatics[garlic,chilli] · occasion[hearty] |
| **Cabernet Sauvignon** *(Red Wine › Cabernet — category-derived, any label)* | DRINK · drinkType red · body full · drySweet dry · flavour[fruity] · occasion[date] |

These are illustrative output of the proposed rules — **not yet written to the DB.**

---

## D) Seed plan — realistic demo baskets, clearly marked & purgeable

- **Script:** `Sites/Trump/scripts/seed-demo-orders.js` → npm **`orders:seed:demo`** (tenant-scoped, idempotent — re-run replaces the prior demo set).
- **Purge marker (belt-and-braces, one-command removal):** every seeded order stamped with **(1)** `filename` prefix `demo_seed_…`, **(2)** `raw.demoSeed = true`, **(3)** `[DEMO]` in `notes`. Purge = `order.deleteMany({ where: { restaurantId:'trump', filename: { startsWith: 'demo_seed_' } } })` (OrderItems cascade) → npm **`orders:purge:demo`**.
- **Volume:** ~18 baskets across ~8 tables (a few tables get 2–3 orders), timestamps spread over the last ~10 days plus a couple "today" for the dashboards. Mostly `status:history`/complete so they count in analytics + co-occurrence; optionally 1–2 `active` for live screens.
- **Composition (credible co-occurrence for the Phase 3 waiter "ordered-together"):**
  - ribeye + creamed spinach + chips + **Cabernet**
  - tomahawk (share) + 2 sides + **Red Blend** (celebration)
  - salmon sashimi + california roll + **Sauvignon Blanc** (date)
  - firecracker wings + **2× draught** (football/sharing)
  - springbok carpaccio + fillet + **Shiraz**
  - seafood pasta + greek salad + **white**
  - veg burger + chips + **soft drink** (quick)
  - lamb chops + mash + **Pinotage**
  - cheese burger + **cold beverage** (quick)
  - + death-by-chocolate / Dom Pedro dessert add-ons on a couple
  Realistic quantities, covers, and subtotal/VAT/service computed with current configured rates.
- **At deploy (Phase 5):** excluded or purged via the marker in one command. Per the master plan, default is to **ship them as deliberate demo-dressing** so the pitch URL looks alive, with `orders:purge:demo` ready for go-live. *(Build-time check: confirm whether analytics/co-occurrence should default-include or offer `?includeDemo=false`; today they'd include — I'll wire an opt-out filter if you want them hidden pre-launch.)*

---

## Decisions locked (STEP 2)
- **Axes kept** as proposed. **`pairsWith` dropped** — tags describe what a dish *is*; pairings live in the chef-recs store + the Phase 4 dataset, never on the dish.
- **`flavour` is a closed 14-value list** (no free text): `smoky, charred, garlicky, herby, creamy, citrus, umami, peppery, cheesy, chocolate, fruity, briny, fresh, nutty`. Other list axes are likewise closed: `texture`(crispy,tender,juicy,crunchy,soft,flaky), `aromatics`(garlic,chilli,herbs,citrus,smoke,truffle), `occasion`(sharing,date,celebration,quick,hearty,light), `protein`(beef,chicken,lamb,pork,seafood,game,none), `dietary`(vegetarian,vegan,gluten-free-able,contains-gluten,contains-egg,contains-nuts).
- **Demo orders visible now** — no `includeDemo=false` analytics filter; `orders:purge:demo` is the go-live cleanup.
- **Seed repeats pairings on purpose** so co-occurrence has signal: e.g. ribeye+Cabernet ×5, calamari+crisp white ×3, wings+draught ×3 — not 18 one-offs.

## STEP 2 — outcome (executed 2026-06-19, all on a LOCAL database)

**Local-only workflow.** A local Postgres database **`emenyu_local`** was created on `localhost:5432`, all 14 migrations applied (`prisma migrate deploy`), and prod's data copied in (data-only `pg_dump`, excl. `_prisma_migrations`): 174 categories / 851 items / 32 chef-recs. The connection lives in **`.env.local`** (gitignored — confirmed); the three scripts load it with `override:true` so build/test work targets local automatically and **never touches prod** (no-op in production, which has no `.env.local`).

**1. Tagging — DONE (local).** `npm run menu:enrich -- --apply` wrote `metadata.tags` to **all 439** trump items (FOOD 153 / DRINK 286); existing media metadata preserved. Fill: occasion/temperature 100%, flavour 63%, drink axes 65%, protein/richness 35%, dietary 15%, spice 11%. **21 low-confidence items** flagged for chef review (Wagyu cuts, big "850-900g" cuts, sauces, biltong, veg rolls, surf-&-turf) — listed in [data/enrich-report.json](data/enrich-report.json), not guessed. Re-runnable + idempotent; skips any row marked `tags.source='reviewed'`.

**2. Seeding — DONE (local).** `npm run orders:seed:demo -- --apply` wrote **18 demo baskets** (status=history, R16,581) across 8 tables / 3 waiters (6 each). Repeated pairings confirmed in-DB for co-occurrence: **ribeye+Cabernet ×5, calamari+crisp white ×3, wings+draught ×3**. Every row marked `demo_seed_` + `raw.demoSeed` + `[DEMO]` notes → `npm run orders:purge:demo -- --apply` removes them.

**Prod left untouched.** The earlier accidental tag write to prod was reverted: a full `pg_dump` backup was taken (`d:/tmp/prod-emenyu-backup-*.sql`, contains the 439 tagged rows if ever needed), then `metadata.tags` stripped from all 439 prod items. Verified: **prod = 0 tags, 0 demo orders.**

> **⚠️ Phase 5 STEP 1 input — schema drift.** The live DB is **3 migrations behind this branch**: applied through `20260603100000_phase3_menu_item_recommendation`; **pending:** `20260606000000_phase4_recommendation_event`, `20260606120000_phase5_recommendation_bundle`, `20260616120000_party_size_covers` (adds the `covers` column the order path writes). Deploy must `prisma migrate deploy` these **before** seeding/serving the new order code.

### Phase 5 prod commands (run during deploy, not now)
```bash
npx prisma migrate deploy --schema prisma/schema.prisma   # apply the 3 pending migrations on prod
cd Sites/Trump && npm run menu:enrich -- --apply            # re-tag prod's 439 items
cd Sites/Trump && npm run orders:seed:demo -- --apply       # optional demo dressing (status=history)
cd Sites/Trump && npm run orders:purge:demo -- --apply      # one-command removal at go-live
```
