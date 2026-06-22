# Task 5 — Recommendation UI Audit & Migration Plan

**Audit + plan only — NO UI changes in this phase.** Goal: standardize every
recommendation surface on one premium recommendation-card design.

## 1. Component inventory (recommendation surfaces)

| Component | Surface | Layout today | Image | Price | Source/Reason | Quick-add | Styling |
|---|---|---|:--:|:--:|:--:|:--:|---|
| [CartRecommendations.tsx](Sites/Trump/client/src/components/cart/CartRecommendations.tsx) | Guest cart "You might also like" | image strip card | ✅ | ✅ | source tag | ✅ (+) | CSS module |
| [ChatPanel.tsx](Sites/Trump/client/src/components/chat/ChatPanel.tsx) | Chatbot suggestion cards | image card | ✅ | ✅ | source tag | ❌ (opens item) | CSS module (own) |
| [PairingModal.tsx](Sites/Trump/client/src/components/menu/PairingModal.tsx) | Item → wine/drink pairings | **text-only** card | ❌ | ❌ | reason text | ❌ | CSS module |
| [RecommendedOrders.tsx](Sites/Trump/client/src/components/menu/RecommendedOrders.tsx) | Menu "Not sure what to order" | **persona bundle** card | ✅ (per course) | ✅ | persona blurb | add-all | CSS module |
| [CartRecScreen.tsx](Sites/Trump/client/src/pages/waiter/CartRecScreen.tsx) | Waiter upsell screen | **inline-styled** card | ❌ | ✅ | reason + script + uplift | ✅ | inline styles + `w-*` theme |

To confirm during implementation (not fully read this phase): `ItemModal.tsx` (hosts the
PairingModal entry point), `AICoachScreen.tsx` (waiter opportunity surface — likely a
second inline-styled card), and `MenuCard.tsx` (shows `chefPick`/`popular` badges, not a
rec card but shares the visual language).

## 2. Old vs new/premium

- **New / premium (target direction):** the **guest image card** in
  `CartRecommendations` — thumbnail, source chip, name, price, quick-add — is the most
  complete and on-brand. `ChatPanel`'s card is the same idea but a **separate, duplicated**
  implementation.
- **Old / off-pattern:**
  - `PairingModal` — text-only, no imagery/price/add (visually inconsistent with the rest).
  - `CartRecScreen` (and likely `AICoachScreen`) — **inline styles**, no shared component,
    waiter-only theme; hard to keep consistent.
  - `RecommendedOrders` — a distinct (and demo-data-backed, see F8) bundle pattern.

**Net:** ~5 recommendation renderings, ≥3 distinct card implementations, 2 styling
systems (CSS modules vs inline `w-*`). No shared card component exists.

## 3. Target: one `<RecommendationCard>` + thin variants

Propose a single component with variants rather than five bespoke cards:

```
<RecommendationCard variant="compact" | "detailed" | "waiter" />
  props: name, price?, image?, sourceTag?, reason?, script?, upsell?,
         onOpen?, onAdd?, theme="guest" | "waiter"
```

| Variant | Used by | Shows |
|---|---|---|
| `compact` | guest cart strip, chat suggestions | image, source chip, name, price, quick-add |
| `detailed` | pairing modal | image + name + price + **reason** (upgrades the text-only card) |
| `waiter` | waiter cart-rec / coach | name, reason, **script**, **uplift** tag, add — themed `w-*` |

`RecommendedOrders` stays a distinct **bundle** component but composes
`RecommendationCard` for each course thumbnail, so the atom is shared.

The card must be **theme-able** (guest CSS-module tokens vs waiter `--w-*` variables) via a
`theme` prop / CSS custom properties, since the waiter app uses a separate palette.

## 4. Migration plan (phased — execute in a later phase)

1. **Extract** `RecommendationCard` (+ CSS) from the strongest existing card
   (`CartRecommendations`), with the three variants and theming. Pure presentational; no
   data/logic changes. Add a Storybook-style demo page or visual check.
2. **Migrate guest surfaces:** point `CartRecommendations` and `ChatPanel` suggestion
   cards at `variant="compact"`. Delete the duplicated chat card CSS. (Two surfaces, one
   card.)
3. **Upgrade PairingModal** to `variant="detailed"` so pairings gain imagery + price while
   keeping the chef/pairing reason. (Closes the biggest visual inconsistency.)
4. **Migrate waiter** `CartRecScreen` (+ `AICoachScreen`) to `variant="waiter"`, replacing
   inline styles with the themed card. Verify against the `w-*` palette.
5. **Bundles:** once the Task 2 `RecommendationBundle` table exists, repoint
   `RecommendedOrders` at DB data and have each course use `RecommendationCard`; retire
   the hardcoded `recommendedOrders.ts` (F8).
6. **Regression pass:** visual check on guest menu/cart/chat and waiter screens at mobile
   widths; confirm image fallbacks and quick-add still work.

## 5. Risks / notes

- **Two themes:** guest (dark/gold module CSS) vs waiter (`w-*` variables). The shared
  card must not hardcode colors — drive via CSS custom properties.
- **Quick-add semantics differ:** guest adds to cart; waiter adds to the order + records
  an `UpsellEvent`. Keep those as injected `onAdd` handlers, not baked in.
- **No behavioural change intended** — this is purely presentational consolidation;
  recommendation *content* changes come from Tasks 2–4.
- Reiterating scope: **no components are modified in Phase 2.**
