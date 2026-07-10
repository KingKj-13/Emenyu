# Emenyu — Trumps Prime Grillhouse
## End-to-End QA & Demo-Readiness Report

**Tested:** https://emenyu.com/Trump/Table1 (live production)
**Date:** 5 July 2026
**Method:** Live black-box testing as customer, waiter, manager/owner, and kitchen — no code or commit review.
**Scope covered:** Customer ordering + chatbot + recommendations, order submission (one real test order, approved), Waiter app, Owner/Admin console, Kitchen display, and mobile-readiness signals.

---

## Executive summary

This is an ambitious, genuinely impressive product. A guest can scan a table QR, browse a 439-item menu, get chef-curated wine pairings, chat with an AI concierge ("Donald"), and order — and that order flows in real time into the waiter app, the owner's live-orders board, and a kitchen display, advancing through New → Preparing → Ready → Served. The whole loop works. The visual language (dark, gold, Cormorant Garamond serif) is legitimately premium and consistent across all four surfaces.

The gap is **polish, not capability**. A handful of highly visible defects — a broken item-detail modal layout, nonsensical time counters everywhere in the operational views, recommendation-acceptance analytics stuck at 0%, and grammar errors in the waiter's AI script — are exactly the things a discerning fine-dining owner notices in a live demo. None of them block the core flow; all of them look unfinished.

**Overall demo-readiness score: 72 / 100.**
**Confidently demo to a Michelin-level owner today: NO** — but it is close. The must-fix list is short and surface-level (see final section).

---

## 1. Critical bugs

**C1 — Time counters are computed incorrectly across every operational view.**
- Kitchen tickets show ages like `51060:52`, `50848:34` (50,000+ hours ≈ 5.8 years) with red "overdue" flame icons on *every* card.
- Waiter table cards and the table-detail header show `TIME SEATED 843h 50m` / `776h 49m`.
- The Alerts Center shows `OVERDUE 5450m` (~90 hours).
- **Proof this is a real calculation bug, not just stale test data:** the order I placed minutes earlier displayed a ticket age of `39213:51` in the kitchen's New Orders, then `214:38` after moving to Preparing. A minutes-old ticket cannot be 39,000 hours old.
- **Impact:** time-based prioritization is the whole point of a KDS and a waiter alert queue. As-is, urgency signalling is meaningless — every ticket looks maximally late. For a Michelin kitchen demo this is the single most damaging visible defect.

---

## 2. High-priority bugs

**H1 — Item-detail modal layout collapses (customer app).**
On the guest item modal, the quantity stepper renders on top of the price, and the dish description overlaps the "Special requests / dietary notes" field. Reproduced on multiple items (Firecracker Chicken Wings, Ernie Els Major Series). This is the primary "add to cart" interaction every guest touches. Function still works (quantity and price math are correct), but it reads as broken. *Borderline critical for a polished demo.*

**H2 — Recommendation acceptance/conversion tracking reads 0% everywhere.**
Reco Analytics shows a proper funnel over **1,593 events**, yet every one of its 25 action items reads "X impressions, **0% acceptance**" (Cape Malva Pudding 86/0%, Chicken Trinchado 74/0%, Pina Colada 71/0%…). The Owner dashboard's "Donald added to your tickets" card echoes this: "R868 · 4 orders generated · **0% acceptance**." Impressions/clicks record but accepts/orders never attribute. The analytics are therefore misleading and can't demonstrate upsell ROI — a metric an owner cares about most.

**H3 — VAT and service appear to be added on top of menu prices (verify intent).**
Cart math: Subtotal R714 → VAT (15%) R107 → Service (5%) R36 → Total R857. South African menu prices are legally VAT-**inclusive**, so adding 15% on top would overcharge guests. If prices are intended VAT-exclusive this is by design — but it should be confirmed, because it's a compliance/billing risk. (Reports totals reconcile as tax-inclusive, so there may also be an internal inconsistency between surfaces.)

**H4 — Waiter AI upsell script has broken grammar.**
The waiter recommendation reads: *"I see you have **the your** order — many guests pair it with our TOMAHAWK 850g – 900g. Pairs naturally with **the this** dish."* Duplicated articles ("the your", "the this") and the "Pairs naturally with the this dish" sentence is repeated twice. Waiter- and guest-facing; undermines the premium tone instantly.

---

## 3. Medium-priority bugs

- **M1 — "Confidence" is not shown on waiter recommendations.** It's on the feature checklist and appears in the concept, but no confidence score/indicator is displayed on the table recommendation card. Expected Value ("Revenue Opportunity / Potential Additional Revenue") *is* present.
- **M2 — Owner "Today" shows R0 revenue / 0 orders** despite active tables and a just-placed order. Analytics apparently count only settled orders, and tables are never closed (see C1), so live-day revenue never populates. Confusing for an owner glancing at "today."
- **M3 — Revenue Opportunity total doesn't reconcile.** Listed upsells 699 + 225 + 175 = 1,099, but "Potential Additional Revenue" shows **R1,214**.
- **M4 — Donald ROI card is internally inconsistent** ("R868 added" but "0% acceptance / 4 orders generated").
- **M5 — Heavy single-page DOM.** The entire menu (~439 cards, 800+ buttons) renders at once with no virtualization → image pop-in/flicker, a multi-second blank screen when switching to Drinks, and general render jank.
- **M6 — Waiter shift/clock-in state isn't persisted.** Every navigation back to the waiter app returns to the "Who's on the floor?" clock-in screen; an active shift is lost on refresh.
- **M7 — Guest count shows 0 on tables with active spend** (e.g., Table 1: "GUESTS 0 · CURRENT SPEND R714").

---

## 4. Low-priority improvements

- **L1 — Google Fonts stylesheet returned HTTP 503** on load. Served from cache this time, but a hard failure would degrade the whole typography (its main premium signal). Consider self-hosting fonts.
- **L2 — Waiter→Admin access is a silent redirect.** A logged-in waiter hitting `/Trump/admin.html` is bounced to the waiter home with no "insufficient permissions" message.
- **L3 — Two analytics surfaces disagree.** Owner Dashboard (90-day: R24,287 / 31 orders) and Admin → Reports (7-day: R1,042 / 1 order) use different windows and metrics; worth unifying or cross-labelling to avoid "which number is right?"
- **L4 — Menu card internal alignment is uneven** (e.g., short-description cards like Beef Biltong push the Add button higher than neighbours).
- **L5 — Landing splash doesn't scroll** (appears intentional; noting for completeness).

---

## 5. UI / UX improvements

- Fix the item-modal overlap (H1) — highest-visibility guest fix.
- Add a **search box on the menu page itself**; today search lives only inside the hamburger nav, easy to miss on a 439-item menu.
- Replace image pop-in with skeleton loaders (or eager-load above-the-fold media) so the premium photography doesn't flash in.
- Show a skeleton, not a blank screen, when switching categories (Drinks).
- Surface a subtle "added to cart" toast — currently the only feedback is the header badge, which is easy to miss.
- Consider a clearer permissions message instead of the silent waiter→admin redirect.

---

## 6. Performance issues

- **Customer menu is the heavy spot.** Rendering the full catalogue at once (no virtualization) plus continuous motion animations produced repeated multi-second renderer stalls during testing, blank-on-switch to Drinks, and image unload/reload flicker on scroll. Virtualizing the list and deferring off-screen media would be the highest-impact fix.
- **Staff apps are snappy.** Waiter, Owner/Admin console, and Kitchen display all responded quickly with no stalls (much lighter DOM).
- **Network is clean** — menu/auth/analytics API calls returned 200s; only the Google Fonts CSS 503 stood out.

---

## 7. Recommendation issues

- **Chef-curated pairings are a genuine strength.** The Ribeye → *Ernie Els Major Series* pairing came with a real sommelier note ("Marbled and char-grilled, the ribeye wants a wine with backbone — Cabernet's firm tannin and blackcurrant depth…"), and the admin exposes 56 curated pairings with priority, season, rotation groups, guest-facing reasons, and category-safety rules ("never wine + cocktail, no dessert → starter"). This is excellent and clearly why the curated cases shine.
- **Automatic/fallback recommendations are weaker and sometimes off-category** — e.g., some secondary wine suggestions for cured beef (Beef Biltong) skewed toward sweet/white wines.
- **Acceptance tracking is broken (H2)** — so recommendation quality can't currently be measured or optimized from the data.
- **Confidence indicator missing on the waiter side (M1).**

---

## 8. Chatbot ("Donald") issues

- **Wine and beer queries are strong** — "suggest a wine" returned Warwick The First Lady with a tappable card; "beer" returned menu-matched Castle Lager, Carling Black Label, Loxtonia ciders. Fast, on-brand, real SA products.
- **Champagne query underperformed** — it surfaced a *sparkling* (La Motte Vin de Joie) rather than the actual Moët & Chandon / Veuve Clicquot / Dom Pérignon / Armand de Brignac that exist in the Drinks → Champagne section.
- **Dessert query was weakest** — it led with a R295 sparkling wine as "Chef's Pick," with the actual dessert (Duo of Ice Cream) buried below, plus unrelated chicken/chips cards.
- **Off-menu handling is poor** — "Do you have pizza?" returned "closest matches: Sirloin, Rump, Ribeye" instead of gracefully saying pizza isn't available.
- **Cart context over-influences answers** — chicken-related upsells leaked into unrelated drink/dessert queries.

---

## What works well (for balance)

- End-to-end order lifecycle verified live: guest order → waiter live cart → owner live-orders → kitchen New/Preparing/Ready/Served, all in real time.
- Cart is solid: add / quantity / remove / line totals / VAT+service breakdown / tip presets / contextual "You might also like" upsells / **server-side persistence** across refreshes.
- Owner dashboard is rich (revenue trend, peak hours, day-of-week, top/bottom dishes, covers, avg/cover, top table) with working date ranges.
- Menu management (439 items, availability toggles, per-item image + video slots), Chef Recs builder, Accounts/role management, and a proper KDS with sound all function.
- Accessibility basics are in place (buttons carry descriptive `aria-label`s).
- Mobile-ready foundation: `viewport-fit=cover` meta, responsive breakpoints at 480/560/760px, large touch targets, and a mobile bottom-nav pattern in the waiter app.

---

## 9. Overall demo-readiness score: 72 / 100

| Dimension | Score |
|---|---|
| Visual design | 9 / 10 |
| Premium feel | 8 / 10 |
| Ease of use | 7 / 10 |
| Animations / motion | 7 / 10 |
| Responsiveness (layout) | 7 / 10 |
| Speed / performance | 6 / 10 |
| Recommendation quality | 7 / 10 |
| Waiter experience | 7 / 10 |
| Admin/owner experience | 8 / 10 |
| Customer experience | 7 / 10 |

The foundation and feature ambition would score ~85; visible defects pull demo-readiness down to **72**.

---

## 10. Would you confidently demo this to a Michelin-level restaurant owner?

**NO — not in its current state.** It is genuinely close, and the reasons are all surface-level and fast to fix, but a fine-dining owner evaluates on polish and every one of these is visible within the first few minutes of a hands-on demo:

1. The **item modal looks broken** (overlapping price/quantity/description) — and it's the first thing a guest taps.
2. The **kitchen and waiter time counters read "51060:52" / "843h"** — an operator will immediately distrust the whole ops layer.
3. The **AI upsell script says "the your order… the this dish"** — a grammar error in the flagship AI feature.
4. The **recommendation analytics show 0% acceptance everywhere** — the ROI story falls apart under questioning.
5. **VAT appears added on top of menu prices** — a fine-dining owner will ask about this immediately.

**The good news:** none of these are architectural. Fix these five (plus the font 503 and the "Today = R0" reconciliation) and this flips to a confident **YES** — the underlying product is already demo-worthy in scope, design, and end-to-end function. Recommended sequence: (1) timers, (2) item-modal layout, (3) VAT logic confirmation, (4) reco-acceptance tracking, (5) NLG script strings.

---

### Testing notes / limitations
- One real test order (3× Flash Pan Fried Chicken Livers, Table 1) was placed with permission and driven through to "Served — Complete," so it has been cleared from the live boards. Pre-existing test tickets (Chicken Trinchado on Tables 1/2/12, etc.) and long-open test tables remain and are yours to clear.
- True sub-480px mobile rendering could not be visually validated: the automation browser stayed locked to a 1500px render viewport (window resize didn't change the CSS viewport). Mobile-readiness above is inferred from viewport meta, media-query breakpoints, and touch-target sizes; a final pass on a real device or Chrome DevTools device mode is recommended.
- No code, commits, or implementation were inspected, per instructions.
