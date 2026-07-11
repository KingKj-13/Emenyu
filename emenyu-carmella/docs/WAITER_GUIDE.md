# Waiter Guide — Carmella by Sir Gaspard

Carmella's waiter app is the exact same React waiter surface Trump's staff use — no Carmella-specific waiter UI was built, none was needed.

## Logging in

URL: `emenyu.com/Carmella/Waiter`.

Seed accounts: `carmella-waiter` (floor staff), `carmella-kitchen` (kitchen display only). Owner/manager accounts can also access the waiter view.

## What's the same as Trump

Live floor view, table intel, AI coach/upsell suggestions, workflow task alerts, chat-center, birthday/celebration approvals, shift start/end, table ownership (assign/transfer/takeover), performance/leaderboard, guest profiles — every feature works identically, all reading Carmella's own `restaurantId`-scoped data.

## What's different in practice (not different code — different content)

- **Suggestions reference real Carmella dishes and Carmella's curated pairings** — the same recommendation engine Trump's waiter app uses, now scored against Carmella's tagged menu (vegetarian/vegan/contains-nuts/seafood/spicy tags carry through automatically).
- **Table count is currently 20** (a placeholder pending the client's real number — see `MONDAY_DEMO.md`).
- **The customer-facing chat assistant is "Gaspard,"** not "Donald"/"Sommelier" — if a guest mentions something Gaspard said in chat, that's the same deterministic engine as the waiter app's own coach suggestions, just phrased in Gaspard's voice for the customer (see `AI_ENGINE.md`). The waiter-facing coach/sommelier wording itself is unchanged (still the existing `templateNlgProvider.js` voice, not Gaspard-specific — Gaspard's persona was scoped to the customer chat only in this build).
- **Variant items** (Amy's Choice, wines by the glass, coffees) — when a guest orders one via the customer app, the cart line already shows the specific variant chosen (e.g. "Amy's Choice — Ham and cheese") plus any add-ons, so the waiter/kitchen ticket is unambiguous without needing new waiter-app logic.

## Order flow

Identical to Trump: cart → guest submits → waiter/kitchen sees the order → kitchen updates status → guest sees the live status bar. Not independently re-tested for Carmella in this session beyond confirming the socket path mounts correctly (`/Carmella/socket.io`) — see `TESTING.md` for what still needs a real click-through.
