# Admin Guide — Carmella by Sir Gaspard

Carmella's admin panel is the exact same React admin app Trump uses (`AdminPage.tsx` and its tabs) — no Carmella-specific admin UI was built, because none was needed: every tab is already generic over whatever restaurant's data the logged-in session belongs to.

## Logging in

URL: `emenyu.com/Carmella/Admin` (or `/Carmella/login` first if not authenticated).

Seed accounts (owner/manager only see the Admin tabs; rotate these passwords before going live — see `DEPLOYMENT.md`):
- `carmella-owner` — full access
- `carmella-manager` — full access except account management
- `carmella-admin` — same as owner (legacy default-admin convention, matches Trump's pattern)

## What's the same as Trump

Orders, history, accounts, reservations, tables, deals, analytics/reports, staff operations (shifts, table ownership, notifications, audit trail), AI Performance / Chef Intelligence / Customer Journey panels — every one of these reads `restaurantId`-scoped data automatically; there is nothing to configure differently for Carmella.

## What's Carmella-specific to know

- **"Chef Recs" tab is where Carmella's curated pairings live.** The 39 pairings imported from `carmella-menu-data.json`'s `pairings` map show up here as recommendations with `recType: PAIRING` — editable exactly like Trump's chef-curated recommendations. Adding a new pairing here (rather than re-running the JSON import) is the correct way to adjust Carmella's live pairing logic going forward without touching the source JSON.
- **"Bundles" tab is "Gaspard's Tables."** The 3 imported bundles (A Morning in Paris, The Mediterranean Table, The Celebration Table) are editable here. Bundle line-item prices were computed at import time from each item's real price (falling back to its cheapest variant price for coffees/wines-by-the-glass) — editing a bundle here lets you override that.
- **Menu items now have `story`/`subtitle`/`availability` fields** in the edit form (via `PATCH /api/menu/items/:id`) alongside the existing name/price/description fields. `availability` accepts `available`/`ask`/`unavailable` (a superset of the old available/unavailable toggle) — set an item to `ask` for anything the kitchen needs to confirm same-day (matches the "Ceviche in Lima," "Naples Aubergine," "Assini," "Fruit Tarts" items already flagged this way in the source data).
- **Menu items can have variants.** Multi-choice items (Amy's Choice, Mademoiselle Benedict, wines by the glass, etc.) show their variant list; each variant has its own name/price/image and an `isAddon` flag. Variant management isn't yet exposed as a dedicated admin UI in this build — variants were imported from the JSON directly; editing them today requires either re-running the import script or a direct database edit. See `FUTURE_ROADMAP.md`.
- **Assistant name shows "Gaspard"** (not Trump's "🍷 Your Sommelier") throughout the admin UI wherever the assistant name is displayed — this is purely `config.assistantName`, no admin action needed.

## Re-importing menu data

If the source `emenyu-carmella/data/carmella-menu-data.json` changes (new items, corrected prices, updated stories):
```bash
cd Sites/Carmella
node scripts/import-menu.js
```
This is a full wipe-and-rebuild of Carmella's menu/pairings/bundles/day-parts (not incremental) — any admin edits made directly in the UI since the last import will be overwritten. Treat the JSON as the source of truth for bulk content; use the admin UI for day-to-day tweaks between imports.
