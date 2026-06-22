# Trump Menu — Contamination Audit (STEP 1, read-only)

**Date:** 2026-06-19
**Branch:** `feat/chatbot-reco-rework` (local only, no writes performed)
**Method:** read-only queries against the live Postgres (`MenuItem` / `MenuCategory`), plus a static read of every menu query in `Sites/Trump/server`.

---

## TL;DR — the premise does not hold, and the destructive step must NOT run

> **STOP before deleting anything.** The "851-item, 174-category multi-cuisine menu" is **not** Trump's menu. It is the **entire shared multi-tenant table across all four restaurants**. Trump's own menu is **439 items / 87 categories**, and it is a clean, coherent South African steakhouse menu. The Indian / Greek / Italian-seafood cuisines are **not in Trump's tenant** — they are correctly tagged to `imli` / `greek` / `al_pescatore` and are already filtered out of Trump's menu by the read path.

There is **no tenant leak** and **no bad import into `trump`**. The numbers that triggered Phase 1 are a **measurement error** (counting the whole table instead of Trump's tenant). Deleting "~750 items" would destroy the other three restaurants' menus and/or Trump's legitimate items, and would fix nothing.

---

## The key fork — resolved

The prompt framed a fork: are the non-steakhouse items (a) **leaked in** under other tenants' IDs, or (b) **bad-imported** all under `trump`?

**Neither.** The 851 rows are cleanly partitioned by `restaurantId`, one partition per restaurant:

| `restaurantId` | Items | Categories |
|---|---:|---:|
| **trump** | **439** | **87** |
| al_pescatore | 143 | 36 |
| greek | 125 | 21 |
| imli | 144 | 30 |
| **TOTAL** | **851** | **174** |

`439 + 143 + 125 + 144 = 851` and `87 + 36 + 21 + 30 = 174` — the exact figures from the Phase 1 prompt. **"851 / 174" = the global table, all four tenants.** Each cuisine sits in its own tenant; nothing is mis-tagged into `trump`.

---

## Does the menu read filter by tenant? — Yes, everywhere

This was the critical "live isolation bug" check. **Every** `MenuItem` / `MenuCategory` query in `Sites/Trump/server` is scoped by `restaurantId` (which resolves from `TRUMP_RESTAURANT_ID=trump`):

- Customer menu: `menuController.getMenu` → `fileService.loadMenu()` → `prismaMenuService.loadMenu()` → `findMany({ where: { restaurantId } })` ([prismaMenuService.js:387-388](server/services/prismaMenuService.js#L387-L388)).
- Admin items, categories, flat items, chef-recs, popular, count, create, media-enrich, waiter analytics — all carry `where: { restaurantId }` (verified by grepping every `menuItem.*`/`menuCategory.*` call site).

**Conclusion:** read-layer tenant isolation is intact. A customer or admin on Trump sees **439 items / 87 categories**, never 851. There is **no** path in the running app that renders other tenants' food. The isolation bug the prompt worried about does not exist.

(One write-path note, not an isolation bug: `menuController.deleteItem` / `bulkItemAction` delete by primary-key `id` without a `restaurantId` guard — [menuController.js:53-56](server/controllers/menuController.js#L53-L56), [:71-74](server/controllers/menuController.js#L71-L74). IDs are globally unique so this is safe in practice, but any future cleanup tooling should still scope deletes by `restaurantId` defensively.)

---

## Where the "851 / 174 multi-cuisine" figure came from

It originates in a prior audit doc, **not** from the running Trump app:

- [CHATBOT_RECO_AUDIT.md:45-62](CHATBOT_RECO_AUDIT.md#L45-L62) reports *"Real coverage (851 items) … Categories 174"* and lists **Imli's** Indian sections — `TANDOORI STARTER`, `Madras Terminal` — as if they were part of the menu under analysis.

That audit counted the whole `MenuItem` table without a `restaurantId` filter, so it folded all four tenants together and saw a "multi-cuisine" menu. That measurement error propagated into the Phase 1 premise. The Indian/Greek categories it cites genuinely exist — under `imli` and `greek`, never under `trump`.

---

## What Trump's tenant actually contains (439 items)

**153 food + 286 beverage.** A full upscale steakhouse with a complete bar program.

**Food (153 items, 100% steakhouse-appropriate):**

| Section | Items | Notes |
|---|---:|---|
| Starters — Small Plates | 12 | livers, trinchado, wings, biltong, boerewors, springbok carpaccio, snails, calamari, mussels, prawns, halloumi, small Greek salad |
| Starters — Tempura | 3 | tempura chicken / prawn / biltong |
| Salads — Bespoke | 5 | Trumps / Greek / Halloumi / Caprese / char-grilled chicken |
| **Sushi** (5 sub-cats) | **23** | Crispy Rice & Roses, California, Rainbow, Signature Rolls, Sashimi — Trump-branded ("TRUMPS RAINBOW RELOADED", "TRUMPS SALMON SASHIMI") |
| Signature Seafood | 11 | salmon, kingklip, hake, calamari, queen prawns |
| Premium Steaks (6 sub-cats) | 35 | SA Prime Beef on/off bone, Premium Cuts, Kings Cuts (21-day matured), **Wagyu** (marbling 8-10+), steak enhancements/sauces |
| Pork & Ribs | 4 | chops, pork tomahawk, eisbein, loin ribs |
| Lamb | 4 | rump, shank, chops, combo |
| Venison & Game | 3 | ostrich, kudu, springbok |
| Oxtail & Beef Ribs | 3 | oxtail, beef ribs |
| Signature Combos "since 1994" | 9 | surf & turf, mixed grill, platters |
| Gourmet Burgers | 7 | beef/chicken/cheese/bacon |
| Chicken | 5 | half/full, breast, wings |
| Pastas | 6 | bolognese, alfredo, beef fillet, seafood |
| Vegetarian | 4 | veg burger/platter, halloumi, caprese |
| Sides & Extras | 12 | mash, creamed spinach, chips, mushrooms, rice |
| Dessert & Cakes | 6 | ice cream, malva, red velvet, brownie |
| Set Menus | 4 | Chef's Choice / Premium, 2 & 3 course |

**Beverage (286 items):** Champagne (19), White Wine (27), Red Wine (74), Beers/Ciders (27), Spirits (84: malts, cognac, tequila, gin, brandy, vodka, rum, bourbon, liqueurs, digestifs), Cocktails (21), Mocktails & Cold/Hot Beverages (34). A normal full-bar list for a venue at this tier.

**Foreign-cuisine keyword scan** (curry, biryani, masala, tikka, souvlaki, gyro, moussaka, tandoori, dosa, chow mein, szechuan, pad thai, ramen, taco, etc.) over all 439 names → **0 matches.** "Greek salad" and "halloumi" are ordinary steakhouse line-items, not Greek-tenant rows.

---

## The only genuine judgment call: the Sushi section (23 items)

The single thing in Trump's tenant that isn't classic grill-and-bar is the **Sushi** category (incl. Tempura), 23 items. This is **not contamination** — it's Trump-tagged and Trump-branded, and a sushi bar is common in upscale South African steakhouses. Whether to keep it is a **business decision for the owner**, not a data-cleanup action. I am flagging it, not recommending its removal.

---

## Proposed plan for STEP 2

Given the findings, the destructive Phase 1 as written is **based on a miscount and should be cancelled.** My recommendation:

1. **Do NOT delete any menu items.** There is no contamination in Trump's tenant to clean. A "~750 item" delete would hit other tenants and/or valid Trump items.
2. **Correct the source of the error:** annotate/fix [CHATBOT_RECO_AUDIT.md](CHATBOT_RECO_AUDIT.md) so its "851 items / 174 categories" coverage numbers are scoped to `restaurantId = 'trump'` (439 / 87). Any future tagging/bootstrap pass must filter by tenant or it will tag four restaurants at once.
3. **(Optional, defensive)** add a `restaurantId` guard to `deleteItem` / `bulkItemAction` so admin deletes can never cross tenants even by accident.
4. **(Owner decision, separate from this audit)** confirm the Sushi section (23 items) is intended. If the owner wants it gone, that's a small, clean, tenant-scoped hide/delete of one category — not a menu decontamination.

**No data has been changed. Awaiting your go-ahead** on which of the above (if any) to action. If you have independent evidence the live Trump app renders Indian/Greek/Chinese items to customers, send it and I'll re-investigate that specific surface — but every read path I can see is tenant-scoped.
