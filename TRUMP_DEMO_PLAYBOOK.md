# Trump's Prime Grillhouse — Demo Playbook
**Prepared:** 2026-07-22 · **Demo date:** 2026-07-23 · **Venue:** Table 1, `https://emenyu.com/Trump/Table1`

Everything in this playbook is reconstructed from what actually exists in the codebase (`demo trump rule.md`, `Sites/Trump/server/services/scriptedDemoChains.js`, `Sites/Trump/server/utils/helpers.js`, `Sites/Trump/deployment/deployment trump.md`) — nothing here is invented. Where the codebase doesn't specify something (e.g. a scripted waiter/kitchen/admin walkthrough), that's stated explicitly rather than guessed.

---

## 1. Demo Preparation Checklist

Do these, in order, before the client arrives:

- [ ] **Confirm production is running the correct code.** Authentication was found bypassed on the local branch (see the separate recovery report) and has been restored locally. Before relying on production tonight, confirm the server is running code from at or after the last verified-good deploy — do **not** push tonight's local branch to production without review.
- [ ] **Confirm `TRUMP_SCRIPTED_DEMO_ENABLED` on the production server.** This flag controls whether the six rehearsed recommendation chains fire (see §2). It is **off by default** and unset in the local `.env` — it must be explicitly set on whichever server backs the demo URL.
- [ ] **Decide on `TRUMP_SCRIPTED_DEMO_TABLE`.** Leave unset (chains apply to every table) unless the restaurant may be serving real walk-in diners at the same time — in that case set it to `table1` so real tables keep the live algorithmic engine untouched.
- [ ] **Restart/reload the Trump PM2 process** after any `.env` change (`pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env`), then confirm health: `curl -fsS https://emenyu.com/healthz` and `/readyz`.
- [ ] **Do one full live rehearsal of Scenario 1** (below) against Table 1 before the client arrives. This is the single most valuable check available — it confirms the scripted chain fires, confirms every item name/price on screen, and catches any menu drift no amount of code reading can substitute for.
- [ ] **Do not run** `Sites/Trump/scripts/seed-demo-restaurant.js` — it seeds stale, inconsistent prices unrelated to the live menu.
- [ ] Have your own owner/manager login credentials ready (they live in the server's `.env` / the `accounts.json` fallback / Postgres `User` table — not reproduced here). Authentication is real and enforced; there is no login-free shortcut for Trump by design.
- [ ] Print or have on-screen: this playbook and the original `demo trump rule.md`.

## 2. Required Environment Variables

From `Sites/Trump/server/utils/helpers.js` and `Sites/Trump/deployment/deployment trump.md`:

| Variable | Purpose | Recommended value for tomorrow |
|---|---|---|
| `TRUMP_SCRIPTED_DEMO_ENABLED` | Turns on the six hardcoded recommendation chains | `true` |
| `TRUMP_SCRIPTED_DEMO_TABLE` | Optionally restricts the chains to one table (normalized via lowercase/alphanumeric-only matching) | Unset (all tables) or `table1` if real service is also happening |
| `TRUMP_SESSION_SECRET` | Signs the session cookie | Already set in production — do not change |
| `TRUMP_PUBLIC_ORIGIN` / `TRUMP_ALLOWED_ORIGINS` | CORS / cookie origin | Already set — do not change |
| `TRUMP_OWNER_PASS` / `TRUMP_MANAGER_PASS` / `TRUMP_WAITER_PASS` | Seed default account passwords (only used if accounts are missing) | Leave as-is |
| `TRUMP_PUBLIC_BASE_PATH` | Route prefix | `/Trump` (already set) |
| `TRUMP_DEMO_AUTO_LOGIN_ROLE` / `TRUMP_DEMO_AUTO_LOGIN_USERNAME` | The safe, gated no-login demo mode | **Leave unset for Trump** — this is the mechanism Demo Steakhouse uses; Trump is meant to show real login |

## 3. Required Accounts

Real staff accounts (owner/manager/waiter/kitchen) via `PrismaAuthService`, with a `data/accounts.json` fallback — per root `CLAUDE.md`. No demo-only accounts exist for Trump (that pattern is reserved for the Demo Steakhouse tenant). Use your own known credentials.

## 4. Required Tables

**Table 1** (`table1` internally, per `getCanonicalTableId()`). No other table is referenced anywhere in the demo script or the scripted-chain code.

## 5. Required URLs

| Surface | URL |
|---|---|
| Customer menu (the demo) | `https://emenyu.com/Trump/Table1` |
| Waiter dashboard | `https://emenyu.com/Trump/Waiter` |
| Admin panel | `https://emenyu.com/Trump/Admin` |
| Owner dashboard | `https://emenyu.com/Trump/Owner` |
| Kitchen display | `https://emenyu.com/Trump/Kitchen` |
| Health checks | `https://emenyu.com/healthz`, `/readyz` |

---

## 6. Demo Sequence — Customer Actions & Expected AI Output

Source: `demo trump rule.md`, cross-verified against `scriptedDemoChains.js` (which implements these exact chains, gated by `TRUMP_SCRIPTED_DEMO_ENABLED`) and, where possible, against the live production menu API. **How the interface works:** tap an item's `Add` button to add it; open the cart (cart icon top-right, or the gold cart bar) to see the `YOU MIGHT ALSO LIKE` carousel — the first card is badged `CHEF'S PICK`. Tap `+` on it to accept; the engine then surfaces the next `CHEF'S PICK`. Rhythm: **Add item → open cart → read the CHEF'S PICK aloud → tap `+` → repeat.**

Price-verification status: ✅ = confirmed exact match against the live production menu API; ⚠ = confirmed to exist by exact name via a DB-derived export, but current price not independently confirmed — verify with the Scenario 1 live rehearsal (checklist §1).

### Scenario 1 — The Steak & Red Wine Experience
*The classic steakhouse guest who starts with a glass of red.*

| Step | Action | Item | Price | Talking point |
|---|---|---|---|---|
| 1 | Tap `Drinks` → `PINOTAGE` → Add | TRUMPS | R225 ⚠ | Starts the chain |
| 2 | Open cart, read CHEF'S PICK, tap `+` | RIBEYE 380g | R369 ✅ | "A bold, dark-fruit Pinotage is built for a well-marbled cut — the flagship dry-aged ribeye matches its weight." |
| 3 | Tap `+` | THREE PEPPERCORN SAUCE | R49 ✅ | "The house steakhouse sauce — peppercorn lifts a ribeye without fighting the tannins in the red." |
| 4 | Tap `+` | SAUTÉED MUSHROOMS WITH FRESH HERBS | R69 ⚠ | "An earthy, umami side that echoes the wine's savoury notes." |
| 5 | Tap `+` | DEATH BY CHOCOLATE CAKE | R119 ⚠ | "A rich red wine and a decadent chocolate dessert is a textbook close." |
| 6 | Tap `+`, then stop | IRISH COFFEE | R99 ⚠ | "A warm, spiked coffee to finish the evening." |

**Final cart: R930.** Why it works on stage: opens on the exact "drink-first" pattern and builds a complete steakhouse table from one glass of wine.

### Scenario 2 — Seafood & White Wine Experience
*The guest who eats light and orders from the sea.*

| Step | Item | Price | Talking point |
|---|---|---|---|
| 1 (trigger) | GARLIC LEMON CALAMARI | R145 ✅ | — |
| 2 | DIEMERSDAL (Sauvignon Blanc) | R260 ⚠ | Creamy calamari wants an acidic, citrus-driven white |
| 3 | KINGKLIP FILLET | R365 ✅ | Premium line-fish, natural main after a seafood starter |
| 4 | SIDE GREEN SALAD | R99 ⚠ | Keeps a fish plate elegant rather than heavy |
| 5 | CAPE MALVA PUDDING | R115 ⚠ | Warm South African signature dessert |
| 6 (stop) | CAPPUCCINO | R45 ⚠ | Simple coffee to close |

**Final cart: R1,029.** Proves the engine knows *white* belongs with seafood, not red.

### Scenario 3 — Burger & Craft Beer Experience
*The relaxed, casual diner.*

| Step | Item | Price | Talking point |
|---|---|---|---|
| 1 (trigger) | BACON AND CHEESE BURGER | R219 ✅ | — |
| 2 | CORONA | R65 ⚠ | A burger's natural partner is an ice-cold beer |
| 3 | ONION RINGS | R65 ⚠ | The quintessential burger side |
| 4 | FIRECRACKER CHICKEN WINGS (400g) | R175 ✅ | A shareable "just one more thing" |
| 5 | CHOCOLATE BROWNIE | R115 ⚠ | Familiar, crowd-pleasing dessert |
| 6 (stop) | DOM PEDRO | R99 ⚠ | South African after-dinner classic |

**Final cart: R738.** Contrast against the fine-dining scenarios — beer not wine, wings not carpaccio.

### Scenario 4 — Date Night Fine Dining
*A couple sharing a special evening.*

| Step | Item | Price | Talking point |
|---|---|---|---|
| 1 (trigger) | CRISPY RICE | R195 ✅ | — |
| 2 | DA LUCA ROSÉ PROSECCO | R350 ⚠ | Shareable starter sets a celebratory tone |
| 3 | FILLET 260g | R329 ✅ | Most refined, tender cut on the grill |
| 4 | MUSHROOM TRUFFLE BUTTER | R49 ✅ | A small luxury that reads as "special" |
| 5 | CREAMED SPINACH | R65 ⚠ | Classic steakhouse side to share |
| 6 | DEATH BY CHOCOLATE CAKE | R119 ⚠ | One dessert, two forks |
| 7 (stop) | DOM AMARULA | R115 ⚠ | Creamy, indulgent nightcap |

**Final cart: R1,222.** The longest chain — seven items from one starter; shows the engine "reading the room" as romantic and premium.

### Scenario 5 — Business Dinner
*Professionals — refined, classic, no fuss.*

| Step | Item | Price | Talking point |
|---|---|---|---|
| 1 (trigger) | BEEF BILTONG | R155 ✅ | — |
| 2 | KLEINE ZALZE VINEYARD SELECTION (**Shiraz**, R295 — not the R255 Chenin Blanc of the same name) | R295 ⚠ | Confident red for the middle of a business table |
| 3 | T-BONE 500g | R329 ✅ | Substantial, classic steakhouse cut |
| 4 | ONION RINGS | R65 ⚠ | Easy shared side |
| 5 | CAPE MALVA PUDDING | R115 ⚠ | Local signature, warm finish |
| 6 (stop) | AMERICANO COFFEE | R39 ⚠ | Straight black — unfussy close |

**Final cart: R998.** Shows tasteful, measured upselling — not just maximizing price. ⚠ **Note:** two menu items share the name "KLEINE ZALZE VINEYARD SELECTION"; the code disambiguates by price (R295). If this scenario surfaces the R255 Chenin Blanc instead, the underlying prices have drifted — worth confirming in the rehearsal.

### Scenario 6 — Celebration Dinner
*A group celebrating — big, generous, sharing. The closing "wow" scenario.*

| Step | Item | Price | Talking point |
|---|---|---|---|
| 1 (trigger) | MOËT & CHANDON BRUT | R1,950 ⚠ | Signals a celebration |
| 2 | THE KING, QUEEN PLATTER | R649 ⚠ | Showpiece sharing centerpiece |
| 3 | 6 QUEEN PRAWNS | R309 ✅ | Turns it into a full surf-and-turf spread |
| 4 | SIDE GREEN SALAD | R99 ⚠ | Balances a rich, meat-heavy feast |
| 5 | TRIO OF ICE CREAM | R119 ⚠ | Shareable, celebratory sweet |
| 6 (stop) | DOM PEDRO | R99 ⚠ | Crowd-pleasing after-dinner treat |

**Final cart: R3,225.** Recommended as the closing scenario — the biggest-ticket path on the menu.

### Global engine rules (from `scriptedDemoChains.js` / `demo trump rule.md`)
1. Never recommends an item already in the cart.
2. Every `CHEF'S PICK` is an addition, never a cheaper replacement.
3. Follows dining order: drink/starter → main → sauce/side → dessert → coffee/after-dinner.
4. Matches drink to protein: red → beef/steak, white → seafood, beer → burger, sparkling/Champagne → celebration.
5. Stops cleanly after the closing coffee/after-dinner item — no suggestion appears once a chain completes.

## 7. Waiter, Kitchen & Admin — What's Available to Show

**No specific scripted walkthrough exists in the codebase for these three surfaces** — only the six customer journeys above are authored as a script. What follows is what the application actually contains, for you to narrate live rather than read from a script:

- **Waiter** (`/Trump/Waiter`): live floor view of tables, the same cart/recommendation engine from the waiter's side, "Send to Kitchen," shift management, guest insights, revenue-opportunity panel.
- **Kitchen** (`/Trump/Kitchen`): live order queue, status updates (received → cooking → ready).
- **Admin** (`/Trump/Admin`): menu management (items, categories, availability), chef-curated pairings, deals/specials, analytics dashboards (AI performance, revenue, top items, customer journey), staff accounts, audit trail, live chat/AI-sommelier logs.
- **Owner dashboard** (`/Trump/Owner`): the same analytics surfaced with an owner-level lens — live floor status, top waiter, category splits, AI-uplift figures.

If the pitch calls for proving ROI, the Admin "AI Performance" and "Reco Analytics" tabs are the most direct, codebase-backed way to do that live.

## 8. Backup Plan If a Feature Fails

Grounded directly in this audit's findings — these are the specific, known ways something could visibly hiccup, and what to do:

| If this happens | Likely cause | What to do |
|---|---|---|
| The `CHEF'S PICK` card doesn't appear after adding an item | The recommendation fetch has no visible loading/error state — it can silently fail on a slow connection | Wait a few seconds, or add the next scripted item anyway — the fetch retries on the next cart change. Don't narrate it as broken; continue naturally. |
| The recommendation shown doesn't match this playbook | `TRUMP_SCRIPTED_DEMO_ENABLED` is off, or a menu item's name/price has drifted from what `scriptedDemoChains.js` expects | The live algorithmic engine is well-built for exactly these categories (wine/protein/dessert pairing rules) and will still produce a *plausible* suggestion — keep narrating the logic ("notice it matched red wine to the steak") rather than the exact scripted wording. |
| "Place Order" seems to hang | No client-side request timeout exists on order submission | Wait — do **not** tap it a second time. A known gap means a duplicate order can be created if the first request actually succeeded after a network hiccup. |
| A login prompt appears unexpectedly on Admin/Waiter | Expected behavior — authentication is real and enforced (as restored in this session) | Log in with your own credentials; this is by design, not a bug. |
| Any page shows a generic error | Server error responses are deliberately generic (no stack traces) | Refresh; if it persists, switch to narrating from this playbook while it's investigated. |

---

*This playbook was reconstructed entirely from `demo trump rule.md`, `Sites/Trump/server/services/scriptedDemoChains.js`, `Sites/Trump/server/utils/helpers.js`, and `Sites/Trump/deployment/deployment trump.md`. No menu content, pricing, or feature claim in this document was invented.*
