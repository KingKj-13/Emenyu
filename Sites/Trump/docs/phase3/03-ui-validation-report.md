# UI Validation Report (Phase 3, Task 7 & 9)

**Goal:** every recommendation surface renders the one premium
[`RecommendationCard`](../../client/src/components/reco/RecommendationCard.tsx) — no bespoke,
inconsistent card layouts remain.

**Evidence:** `grep -rl reco/RecommendationCard client/src` returns the six consumer files
below; `npm run build` + `npm run typecheck` are clean (2026-06-06).

## The shared component

`RecommendationCard` (premium guest style — thumbnail, source/"Chef's pick" chip, name,
reason, price, quick-add) with three thin variants driven by CSS custom properties so it reads
correctly in both the guest (dark/gold) and waiter (`--w-*`) themes:

| Variant | Layout | Used by |
|---|---|---|
| `compact` | vertical card for horizontal strips | guest cart, chatbot, item-page pairings |
| `detailed` | horizontal row + reason | item→drink/food pairing modal |
| `waiter` | rich row + script + uplift tag | waiter upsell & coach |

## Surface-by-surface migration

| Surface | File | Was | Now |
|---|---|---|---|
| Cart "You might also like" | [`CartRecommendations.tsx`](../../client/src/components/cart/CartRecommendations.tsx) | bespoke image card (CSS module) | `variant="compact"` |
| Chatbot suggestion cards | [`ChatPanel.tsx`](../../client/src/components/chat/ChatPanel.tsx) | **duplicated** card (own CSS) | `variant="compact"` |
| Item page pairings | [`ItemModal.tsx`](../../client/src/components/menu/ItemModal.tsx) (`ItemPairings`) | **text-only chips**, no image/price ("Image-2" style) | `variant="compact"` + `showReason` |
| Item → wine/drink pairings | [`PairingModal.tsx`](../../client/src/components/menu/PairingModal.tsx) | **text-only** card | `variant="detailed"` + `showReason` |
| Waiter cart upsell | [`CartRecScreen.tsx`](../../client/src/pages/waiter/CartRecScreen.tsx) | **inline-styled** card | `variant="waiter"` (note=script, uplift) |
| Waiter AI coach + sommelier | [`AICoachScreen.tsx`](../../client/src/pages/waiter/AICoachScreen.tsx) | **inline-styled** blocks | `variant="waiter"` |

That covers all six surfaces the task names: item page, cart, pairing, chatbot, waiter, upsell.

## Old layouts removed

The dead card CSS was deleted from each module (only the strip/list container classes remain):

- `ItemModal.module.css` — removed `pairChip`, `pairChipDrink`, `pairBadge`, `pairBadgeDrink`, `pairName`, `pairReason`.
- `CartRecommendations.module.css` — removed the bespoke `card`/`img`/`info`/`addBtn`/`sourceTag`/`imgPlaceholder` set.
- `ChatPanel.module.css` — removed `suggestionCard`/`cardImg`/`cardBody`/`cardName`/`cardPrice`/`cardSource`.
- `PairingModal.module.css` — removed `pairingCard`/`pairingCardClickable`/`pairingName`/`pairingReason`.

`grep -rn "styles.(suggestionCard|cardImg|pairingCard|pairChip|pairBadge|sourceTag|imgPlaceholder)" client/src` → no matches.

## Classification consumed, not re-derived

The card and its consumers use the server's authoritative `categoryType` / `beverageKind`
(stamped by `dbItemToJson`). [`imageResolver.ts`](../../client/src/lib/imageResolver.ts)
`isDrinkItem` / `isCocktailItem` / `isDessertItem` prefer those fields and only fall back to
local term-matching when absent — eliminating the duplicate client/server classification the
Phase 2 audit flagged.

## Deliberately not migrated

[`RecommendedOrders.tsx`](../../client/src/components/menu/RecommendedOrders.tsx) — the menu
"Not sure what to order?" **persona bundle**. Per Phase 2
[UI migration plan §3–§4.5](../phase2/05-recommendation-ui-migration-plan.md), this is a
distinct *bundle* component (a curated multi-course set with one add-all action), not one of
the inconsistent single-item card layouts, and its full migration is sequenced to compose
`RecommendationCard` per course **once a `RecommendationBundle` table exists** (it does not yet;
the bundle is still backed by the hardcoded `recommendedOrders.ts`, audit finding F8). It keeps
its own on-brand premium styling in the meantime. Tracked as Phase 4 follow-up.

## Build evidence

```
client/dist/assets/AdminPage-*.js   63.71 kB   (Chef Recs panel)
✓ built in ~1.3s
tsc --noEmit → exit 0
```
