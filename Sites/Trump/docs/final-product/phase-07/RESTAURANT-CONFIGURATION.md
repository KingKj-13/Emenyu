# RESTAURANT-CONFIGURATION.md — Configuring a Restaurant on Trump

**Audience:** the operator setting up the first restaurant. The *procedures* below are **real and verified against the code**; the *values* (restaurant name, menu, tables, hours) are **filled in from the real restaurant** (see [CUSTOMER-ONBOARDING.md](CUSTOMER-ONBOARDING.md) intake). **No values are invented here.**

> RC1 is operated for **one** restaurant (`restaurantId` defaults to `trump`). Multi-restaurant is Phase 06+ ([../operations/KNOWN-LIMITATIONS.md](../operations/KNOWN-LIMITATIONS.md) §13).

---

## Configuration map (where each thing lives)
| Item | Where set | Default / note |
|---|---|---|
| Restaurant id | `TRUMP_RESTAURANT_ID` (env) | `trump` |
| App name | `TRUMP_APP_NAME` (env) | `emenuy-trump` |
| Public origin | `TRUMP_PUBLIC_ORIGIN` / `TRUMP_ALLOWED_ORIGINS` (env) | **must be the real prod origin** (validated at boot) |
| Base path | `TRUMP_PUBLIC_BASE_PATH` (env) + client `BASE_PATH` | `/Trump` (must match) |
| **VAT** | `TRUMP_VAT_RATE` (env) | **0.15 (15%)** |
| **Service charge** | `TRUMP_SERVICE_RATE` (env) | **0.05 (5%)** |
| Max tip multiple | `TRUMP_ORDER_MAX_TIP_MULTIPLE` (env) | 2 |
| **Currency** | displayed as **"R" (ZAR)** in the client | **not env-configurable** — see note ↓ |
| Menu / categories / media | owner console (or `menu:migrate`) | [MENU-MIGRATION.md](MENU-MIGRATION.md) |
| Tables | DB `Table` rows / owner setup | valid ids `table1…table30` (validator range) |
| QR codes | generated from table ids | [QR-DEPLOYMENT.md](QR-DEPLOYMENT.md) |
| Accounts / permissions | `.env` seed + owner console | roles owner>manager>waiter>kitchen |
| Rate limits | env (RC1 defaults) | general 3000 / public-write 300 per 15 min |

## Step-by-step

### 1. Restaurant profile (env → `Trump/.env`)
```bash
TRUMP_RESTAURANT_ID=trump
TRUMP_APP_NAME="<Restaurant display name>"
TRUMP_PUBLIC_ORIGIN="https://emenyu.com"
TRUMP_PUBLIC_BASE_PATH=/Trump        # must equal client BASE_PATH
```
After any `.env` change: `npm run env:check` then `npm run pm2:restart`.

### 2. Taxes & currency
```bash
TRUMP_VAT_RATE=0.15        # 15% — set to the restaurant's actual VAT
TRUMP_SERVICE_RATE=0.05    # 5% service — set to 0 if the restaurant doesn't add one
TRUMP_ORDER_MAX_TIP_MULTIPLE=2
```
Totals are **recomputed server-side** from these rates on every order (client-supplied prices are never trusted).
> **Currency note (honest):** the UI formats money as **"R" (South African Rand)**; there is **no environment switch for currency**. A different currency requires a small client formatting change (`client/src/lib/menuUtils.ts`) + rebuild — that is a **code change, out of RC1 scope** ([../operations/KNOWN-LIMITATIONS.md](../operations/KNOWN-LIMITATIONS.md)). Confirm the pilot restaurant uses ZAR, or schedule the change before go-live.

### 3. Opening hours
> **Honest note:** there is **no enforced opening-hours / scheduling feature** in RC1. "Opening hours" is an **operational** concept (when staff log in and run service), not a system lock. Record the hours in [CUSTOMER-ONBOARDING.md](CUSTOMER-ONBOARDING.md) and in the staff routine; the system is available whenever the server is up.

### 4. Tables
- Create the restaurant's tables as `Table` rows (`table1…table30`). Tables are also auto-created on first order, but pre-create them so QR codes resolve cleanly.
- Verify each table id you'll print a QR for actually exists / resolves.

### 5. Menu, categories, media
Use the owner console (recommended for a brand-new menu) or the import script — full procedure in [MENU-MIGRATION.md](MENU-MIGRATION.md). Verify: every item has a name + price; sold-out items hidden; images/video present.

### 6. Accounts & permissions
- Seed strong role passwords in `.env` (`TRUMP_OWNER/MANAGER/WAITER_USER/PASS`, `TRUMP_KITCHEN_PASS`); `npm run env:check`.
- `npm run auth:audit` → **0 weak**; `auth:rotate` if any. Create per-person accounts in the owner console.
- Confirm the `admin/123456789` backdoor stays **suspended**.

## Verify EVERY configuration item (tick before go-live)
- [ ] Restaurant name shows correctly; public origin correct; base path matches client.
- [ ] VAT + service rates correct → place a test order, confirm the total math.
- [ ] Currency confirmed ZAR (or change scheduled).
- [ ] Opening hours recorded (operational).
- [ ] Tables exist + resolve; QR for each table opens the right table ([QR-DEPLOYMENT.md](QR-DEPLOYMENT.md)).
- [ ] Menu complete (names/prices/categories/media); sold-out hidden.
- [ ] Accounts created per person; `auth:audit` = 0 weak; permissions correct (each role sees only what it should).
- [ ] Rate limits at RC1 values; bypass OFF.
- [ ] `npm run env:check` clean; app boots; `/readyz` ready.

**Record the actual configured values for this restaurant in [CUSTOMER-ONBOARDING.md](CUSTOMER-ONBOARDING.md) §config.**
