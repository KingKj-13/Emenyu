# RESTAURANT-SETUP-WIZARD.md — Phase 09 (FRP1) Step 1

**Tool:** `scripts/setup-wizard.js` · **alias:** `npm run setup:wizard` · **Status: ✅ built + dry-run validated.**
**Purpose:** turn one config file into a restaurant's env + tables + accounts, so onboarding isn't manual `.env` editing. Reduces setup time + error risk (Rule 3). One restaurant only (Rule 1: ≤50 tables, ≤5 managers, ≤20 waiters — enforced).

---

## Usage
```bash
node scripts/setup-wizard.js --config restaurant.json            # DRY-RUN: plan + generated credentials
node scripts/setup-wizard.js --config restaurant.json --apply    # write env + create tables + extra staff
```
**Default is dry-run** (no writes). `--apply` writes a `.env.wizard` file (you review + merge into `Trump/.env`), creates `Table` rows, and creates extra staff accounts beyond the 4 default roles.

## Config file (`restaurant.json`)
```json
{ "name": "My Bistro", "vatRate": 0.15, "serviceRate": 0.05, "tables": 12,
  "branding": { "appName": "My Bistro" },
  "owner": { "username": "owner" }, "managers": ["mgr1", "mgr2"],
  "waiters": ["sam", "alex", "jo"], "kitchen": { "username": "kitchen" } }
```

## What it configures
| Item | How |
|---|---|
| Restaurant name / branding | `TRUMP_APP_NAME` |
| VAT / service charge | `TRUMP_VAT_RATE` / `TRUMP_SERVICE_RATE` |
| Tables | creates `table1…tableN` rows (so QR codes resolve) |
| Owner + default manager/waiter/kitchen | sets `TRUMP_*_USER/PASS` (server seeds them on boot) with **strong random passwords** |
| Extra managers/waiters | creates accounts via the account service (`--apply`) |
| Credentials | generated, printed **once** — hand to staff privately |

## Validation done this phase (real dry-run)
```
=== Restaurant Setup — Demo Bistro ===
  VAT / service : 15.0% / 10.0%
  tables        : 12 (table1…table12)
  default roles : owner=owner, manager=mgr1, waiter=sam, kitchen=kitchen
  extra staff   : 3 (mgr2:manager, alex:waiter, jo:waiter)
  -- generated credentials (hand to staff privately; shown ONCE) --
     owner    owner        <strong random>
     …7 accounts total, each with a strong random password…
```
Rule-1 limits enforced (rejects >50 tables / >5 managers / >20 waiters). Strong random passwords (no defaults).

## After `--apply` (the safe sequence)
1. Review `.env.wizard`; merge the keys into `Trump/.env`.
2. `npm run env:check` → restart (`npm run pm2:restart`).
3. `npm run auth:audit` → expect **0 weak** ([../operations/PASSWORD-ROTATION.md](../operations/PASSWORD-ROTATION.md)).
4. `npm run qr:generate -- --tables 1-N --base <prod>/Trump --verify` ([QR-GENERATOR.md](QR-GENERATOR.md)).
5. Load the menu ([MENU-IMPORT-TOOLS.md](MENU-IMPORT-TOOLS.md)).

## Safety
- Dry-run by default; `--apply` writes to `.env.wizard` (not directly over `.env`) so you review before merging.
- Does not touch core workflow code (Rule 2) — it only sets config + seeds tables/accounts via existing services.
- Credentials are random + shown once; never logged.

## Constraints (honest)
- **Interactive prompts not included** — config-file driven (deterministic + repeatable + scriptable). A future interactive front-end is optional.
- Branding beyond the app name (logos/colors) is set in the owner console / theme, not here.
