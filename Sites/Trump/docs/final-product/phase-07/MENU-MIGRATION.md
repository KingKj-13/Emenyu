# MENU-MIGRATION.md — Loading the Restaurant's Menu

**Audience:** operator/owner loading the first restaurant's real menu into Trump. Two supported paths — pick one. The menu is the **source of truth for ordering** (prices are recomputed server-side), so accuracy matters.

> The menu lives in PostgreSQL (`MenuCategory` + `MenuItem`), served by `GET /api/menu` (cached). Media (images/video) is served statically from `Trump/Images` and `Trump/Video`.

---

## Path A — Owner console (recommended for a brand-new menu)
Best when there's no existing digital menu file. Owner logs in at `https://emenyu.com/Trump` → **Menu**:
1. Create **categories** (e.g. Starters, Mains, Drinks, Desserts) in display order.
2. Add **items** per category: name, price (in the restaurant's currency — ZAR), description, category.
3. Mark items **available/hidden** (hide sold-out).
4. Upload **media** per item (photo; optional video) — or rely on the keyword/category image fallback ([../../client/src/lib/imageResolver.ts](../../../client/src/lib/imageResolver.ts)).
5. Optionally set **chef recommendations** per item.
6. Save. Changes appear to customers within ~30 s (menu cache TTL) — or immediately on the next load (cache invalidates on edit).

**Verify:** open `https://emenyu.com/Trump/table1/menu` as a customer would; every item shows correct name, price, image.

## Path B — Bulk import from JSON (existing menu file)
Best when the restaurant already has a structured menu file. The legacy importer reads the site's menu JSON and writes it to Postgres.
```bash
cd /var/www/mysite/Emenyu/Trump
# 1. Place the menu JSON where the site expects it (food/*.json — match the existing structure).
# 2. Migrate JSON → Postgres:
npm run menu:migrate          # node scripts/migrate-menu-to-postgres.js
# 3. (optional) enrich tags used by recommendations:
npm run menu:enrich
# 4. confirm:
curl -s https://emenyu.com/Trump/api/menu | head -c 300    # categories + items present
```
**Menu JSON shape (match the existing site's format):** an object keyed by category → either an array of items or `{ items: [...] }`, each item `{ name, price, description?, ... }`. Mirror an existing `food/*.json` for the exact structure before importing.

## Media (images & video)
- Put item images in `Trump/Images/` and videos in `Trump/Video/` (served at `/Trump/Images/...`, `/Trump/Video/...`).
- The client resolves an item's image by name/category keyword if no explicit media is set — so a menu works even before every photo is uploaded.
- **Size guidance** (from Phase 05 MEDIA-BANDWIDTH): keep images modest (avoid multi-MB originals; ~100–300 KB is plenty for a card); video is heavy (avg 51 MB on the demo set) — only add video where it earns its bandwidth. Plan the Spaces+CDN offload before scaling.

## Pricing, tax, and totals (verify the math)
- Item prices are entered **tax-inclusive or exclusive per the restaurant's convention** — Trump applies `TRUMP_VAT_RATE` (15%) + `TRUMP_SERVICE_RATE` (5%) server-side at order time. Confirm the configured rates match the restaurant ([RESTAURANT-CONFIGURATION.md](RESTAURANT-CONFIGURATION.md) §2).
- **Test:** place a one-item order via `https://emenyu.com/Trump/table1/menu`; check subtotal + VAT + service + total against a hand calculation. Then delete the test order.

## Verification checklist
- [ ] Every category present + in the right order.
- [ ] Every item: correct name, **correct price**, category, availability.
- [ ] Sold-out / seasonal items hidden.
- [ ] Images load (explicit or fallback); any videos play.
- [ ] `GET /api/menu` returns the full menu; customer menu page renders it.
- [ ] Test order totals match expected VAT/service math.
- [ ] No leftover demo/seed items (`npm run orders:purge:demo` removes demo *orders*; remove demo menu items via the console if any).

**Record the menu source (console vs JSON import), item count, and who verified, in [CUSTOMER-ONBOARDING.md](CUSTOMER-ONBOARDING.md).**
