# MENU-IMPORT-TOOLS.md — Phase 09 (FRP1) Step 2

**Tool:** `scripts/menu-import.js` · **alias:** `npm run menu:import` · **Status: ✅ built + validated (caught a real defect in itself, fixed).**
**Purpose:** make menu onboarding fast + safe — validate a CSV, catch problems before they reach customers, and emit a clean normalized menu. Reduces setup time + risk (Rule 3).

---

## Usage
```bash
node scripts/menu-import.js menu.csv                 # validate + report (+ write menu.normalized.json)
node scripts/menu-import.js menu.csv --apply         # ALSO load it via the menu service
```
**Default is dry-run** (validate + report + write a normalized JSON). `--apply` loads it through the existing menu service (server stays source of truth — Rule 3).

## CSV format
Header row (case-insensitive): `category, name, price, [description], [image], [subcategory]`
```csv
category,name,price,description,image
Starters,Chicken Livers,115,"Flash pan-fried, peri sauce",livers.jpg
Mains,Tomahawk Steak,650,"1kg, 35-day aged",Tomahawk.jpg
```
**Excel:** save the sheet as **CSV (UTF-8)** first (native xlsx parsing would need the `xlsx` package — documented, not bundled).

## What it validates / detects
| Check | Behaviour |
|---|---|
| Required columns | errors if `category`/`name`/`price` header missing |
| Missing fields | row-level error for missing name/category/price |
| **Price validity** | strips currency/commas (`R1,250.00`→1250); **non-numeric (e.g. "notaprice") is an ERROR** (not silently 0) |
| **Duplicate detection** | same name within a category → warning |
| **Missing image detection** | image not found in `Images/` → warning; no image → "will use fallback" |
| Category validation | flags empty / unusually long categories |
| **Import report** | counts (rows, categories, dups, missing images, errors, warnings) + row-level detail |
| Normalized output | writes `<menu>.normalized.json` (category → items), ready to load or import via the owner console |

**Errors block import; warnings don't.** Exit code 1 if any error.

## Validation done this phase (real run)
A sample CSV with a duplicate, a missing image, and a bad price produced:
```
categories : 3 (Starters, Mains, Drinks)
duplicates : 1     (Beef Biltong in Starters)
missing images : 3
ERRORS : 1   →  ✗ row 6 (Bad Price Item): invalid price "notaprice"
RESULT: ✗ has ERRORS — fix and re-run before importing.
```
**Defect found + fixed during this phase:** the first version stripped non-numerics and turned `"notaprice"` into `0` silently; now it correctly **errors**. (Step 8: fix only defects.)

## How it fits onboarding
1. Owner exports their menu to CSV (or builds it from the template above).
2. `npm run menu:import menu.csv` → fix any ERRORS, review warnings (dups, missing images).
3. Prepare media for flagged items ([MEDIA-OPTIMIZER.md](MEDIA-OPTIMIZER.md)).
4. Load via `--apply` or import the normalized JSON through the owner console ([../phase-07/MENU-MIGRATION.md](../phase-07/MENU-MIGRATION.md)).
5. Verify totals: a test order's VAT/service math matches the configured rates.

## Safety
- Dry-run default; `--apply` uses the existing menu service (no backend bypass, Rule 3).
- Read-only on the filesystem except the normalized JSON it writes next to the CSV.
