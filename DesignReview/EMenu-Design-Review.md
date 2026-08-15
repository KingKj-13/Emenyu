# EMenu (Trumps Prime Grillhouse) — Design Review
**Reviewer:** Lead Product Design · **Date:** 2026-07-03 · **Scope:** 29 screens across Customer (mobile), Waiter (tablet), Kitchen (KDS), Admin (desktop)
**Mandate:** Improve 20–30% while preserving the existing identity, IA, navigation, and functionality. No redesign.

---

## 1. Overall UX Score: 6.4 / 10

The foundation is genuinely strong: a disciplined navy/gold palette, a confident serif display face, dark-theme consistency across all four surfaces, and an IA that maps cleanly to how a restaurant actually runs. This looks like a real product, not a template. What separates it from an 8.5 is execution detail: numeral typography that fights data legibility, four different currency formats, broken/placeholder imagery, minimal empty/loading states, no undo on destructive actions, and visible data-sync mismatches between portals.

| Pillar | Score | One-line verdict |
|---|---|---|
| Typography | 6 | Beautiful display serif; old-style numerals misused for data |
| Spacing | 6.5 | Generally generous; cart and admin menu list are cramped/inefficient |
| Visual hierarchy | 6 | Good page-level; weak at row level (KDS quantities, tab tiers) |
| Color usage | 7 | Disciplined navy/gold; KDS blue intrusion, red used for non-destructive edit |
| Icon consistency | 5 | Emoji mixed with line icons; duplicate bells; three overlapping nav icons |
| Shadows & cards | 7 | Consistent elevation language; some cards are empty boxes |
| Micro-interactions* | 5.5 | Statics suggest minimal transition design; spinner-only loading |
| Accessibility | 5 | Multiple sub-4.5:1 text pairs; small touch targets; color-only status |
| Loading states | 4 | Single spinner; no skeletons; no progressive images |
| Empty states | 4.5 | Present but inert — no action, no personality |
| Perceived speed | 5 | Manual Refresh on "live" screens; no optimistic UI signals |
| Customer psychology | 7 | Bundles, chef's picks, social proof all present — good instincts |
| Waiter efficiency | 6 | Jump-to-table is great; stepper ergonomics and ambiguous states cost taps |
| Kitchen readability | 5.5 | Strong column model; ticket anatomy wrong for a line cook |
| Admin productivity | 6 | Rich IA; menu list density and number formatting slow real work |

*Scored from static screens; animation/transition quality assumed minimal where not evidenced.

---

## 2. Screen-by-Screen Critique

### CUSTOMER (mobile)

**01 · Landing**
- Works: This is the best screen in the product. "WELCOME TO / Trumps / PRIME GRILLHOUSE" lockup, the "TABLE 3 · SCAN · ORDER · SAVOUR" context pill, and the tinted category tiles are premium and confident. Clear primary CTA ("Browse the Full Menu").
- Fix: Category tile gradients vary in saturation (Wine purple is stronger than Set Menu green) — normalize tint strength. Icon strokes vary slightly in weight. Tile text baseline alignment drifts between one-line and two-line titles (Sushi & Sashimi pushes its subtitle down).
- Note: Files 01 and 02 are identical screenshots — if Landing and Restaurant Home are genuinely one screen, remove the duplicate from the flow map.

**02 · Restaurant home** — Same capture as 01. See above.

**03 · Categories drawer**
- Works: Quick Access tiles + collapsible sections + search + dietary filters is a genuinely good IA for a 439-item menu.
- Fix: Emoji icons (🦞🥩🍖) on Signature Seafood/Premium Steaks/Pork & Ribs clash with the line icons used everywhere else — replace with gold line glyphs. Dietary filter pills are exclusion-phrased ("No Beef", "No Egg") mixed with inclusion ("Vegan Only") — group visually or the logic reads muddled. Drawer lacks a scrim gradient at the scroll edge, so "Lamb" clips mid-letter with no scroll affordance.

**04 · Menu grid**
- Works: Chef-pairing bundles ("The Sushi Lover", full-order price, one-tap add) are a real revenue feature, well placed above the fold. Price-per-course breakdown inside the bundle card is excellent psychology (anchors R628 as reasonable).
- Fix: Two stacked tab tiers both render as gold pills ("Starters" appears twice, vertically stacked, both highlighted) — differentiate tier two as text-with-underline so it can't read as a duplicate. Unselected top tabs (Mains, Dessert, Drinks) are so dark they read disabled. "Not sure what to order?" heading is dark red on navy — fails contrast, and it's the section's anchor line. Bell FAB + AI FAB stack over content and will occlude the last card's Add button on scroll.

**05 · Item detail modal**
- Works: Full-bleed hero, serif title, allergen line, and the "DONALD RECOMMENDS" cross-sell panel with an italic sommelier-style note — this is the fine-dining moment done right.
- Fix (high impact): No visible Add-to-Cart above the fold — the primary conversion action requires scrolling past recommendations. Pin a sticky footer CTA (qty stepper + "Add · R115"). The recommendation panel suggests the same dish being viewed ("Flash Pan Fried Chicken Livers" recommending itself) — exclude current item from the model. Hero image is a red-wine glass for a chicken-liver dish — enforce image↔dish integrity in menu management. Spice level shown as chili emoji in a pill — swap for drawn glyphs. "Contains: Chicken, Gluten" should be chips with icons, tied to the dietary filter system.

**06 · AI assistant (Donald)**
- Works: Suggested prompts are exactly right ("I'm celebrating a birthday…", "What's the best steak…"). Bottom-sheet pattern is correct. Persistent cart bar below the sheet keeps commerce context.
- Fix: Prompt chips are flat light-gray — the only off-palette surface in the customer app; restyle as navy chips with gold hairline borders. The floating X close button collides with product cards behind the sheet. Send button icon is a paper plane rotated oddly (optical alignment). Sheet opens over the menu with no scrim dimming, so two gold "Starters" pills + the sheet compete.

**07 · Cart**
- Works: Quantity steppers, per-item notes, line totals, tip presets, "You might also like" rail, and a clear PLACE ORDER — the commercial anatomy is complete and ordering feels safe.
- Fix: Cross-sell kicker labels truncate ("COCKTAIL STARTI…", "PEOPLE ALSO ORI…") — shorten labels or let them wrap; truncated persuasion text is worse than none. Two of three cross-sell cards have no image (empty navy blocks). Always-open "Add note…" fields add ~56px per item — collapse to a "+ Note" affordance. Trash icon floats detached below the stepper at ~20px — small target, ambiguous ownership; align it to the item row. Line totals (R 230) are tiny and right-orphaned.

**08 · Checkout**
- Near-duplicate of 07 with the tip row engaged (5% selected). If checkout is the cart sheet, that's fine for dine-in — but then the tip module deserves stronger hierarchy: selected state is dark-with-gold-border while "No tip" is the same visual weight; make selection unmistakable. Consider 10% as the anchored middle option (5/10/15/Custom) — a 5% anchor under-tips relative to full-service norms and costs staff real money.
- "View Bill" as a quiet secondary under PLACE ORDER is correct and discreet — good fine-dining instinct.

**09 · Loading**
- A lone spinner + "Loading menu…" on empty navy. Replace with skeleton cards mirroring the menu grid (shimmering navy blocks), keep the brand header, and preload category tabs — perceived speed is the cheapest premium signal available. FABs render before content exists — hold them until load completes.

**10 · Order confirmation**
- Works: "Your waiter has been notified" is the single most reassuring sentence in a dine-in flow. Correct message.
- Fix (highest-impact customer screen): The moment of success renders as a thin-ringed circle containing the literal text "OK" — this is where a checkmark draw-on animation + subtle gold particle flourish belongs. No order summary, no ETA, no order number, no "add more items" CTA — the celebration screen is also the natural re-order surface, and right now it's a dead end. The empty two-thirds of the screen should show: items placed, estimated prep time, waiter first name, and a "Browse desserts" nudge.

**11 · Empty cart**
- "Your cart is empty" + ghost bag icon, with a full-width "View Bill" button as the only action. An empty cart offering the bill is a logic inversion. Primary CTA should be "Browse the menu" (gold), with View Bill demoted. Add one line of brand voice ("Your table awaits its first course").

### WAITER (tablet)

**01 · Login**
- Works: Clean card, gold focus ring on username, correct hierarchy, "STAFF PORTAL" label. Shared staff shell is fine.
- Fix: The logo mark here (square outlined glyph) differs from the customer-facing circled-T — one brand, one mark. For shift reality, waiters need a PIN pad / quick user-switch, not username+password each time; keep passwords for first login of the day, PIN for re-auth.

**02 · Tables + table detail**
- Works: "Jump to table" search, horizontally scrollable numbered table rail with status captions, stat trio (Guests / Time seated / Current spend), current cart with per-item kitchen status, bottom tab bar. The bones of a fast floor tool.
- Fix: Old-style serif numerals sabotage data: "R3 816" and table numbers with descenders read as words, not figures ("Ro" for R0 on the Home screen is the smoking gun). Use lining tabular numerals for ALL data; keep the serif for headings. GUESTS shows 0 on a 25-minute, R3 816 table — prompt for covers when a table opens; per-cover analytics depend on it. Two bell icons sit adjacent in the header (one filled gold, one outline) — merge into one with a badge. Cart shows what looks like the same three items twice — if these are separate order rounds, group by round with timestamps ("Round 1 · 14:03"); undifferentiated repetition reads as a bug. "Send To Kitchen" button floats mid-list while every visible item already says "Sent to kitchen" — show it only when unsent items exist, else render a quiet "All items sent ✓" state. EMPTY captions in the table rail are near-invisible at arm's length.

**03 · Active orders (Home)**
- Works: "NEXT BEST ACTION — Floor clear" is a superb concept — an opinionated staff home screen. Stat cards + assigned tables grid is the right dashboard.
- Fix: "Ro" (R0) everywhere — the numeral problem at its worst. Empty-value dashes and zeros dominate; when floor is clear, collapse the table grid into compact rows and let NEXT BEST ACTION suggest something useful ("Check table 12's reservation at 19:30"). "Open table" ghost links are small for a moving waiter — full-row tap targets.

**04 · Order details** — Identical capture to 02 (the table-detail view is the order detail). Same critiques; additionally, there's no per-item void/comp affordance visible, and no way to see who ordered what for seat-level service.

**05 · Add items**
- Works: Search with live count ("Search 439 items"), category chips, three-column density, gold prices, Done exit. Fast in principle.
- Fix: Nearly every thumbnail is a broken/placeholder block (only Mussels renders) — at minimum ship monogram placeholders (dish initial on tinted navy) instead of broken-image squares. The "+" targets are ~24px hairline ghosts — a rushing waiter needs 44px filled buttons, and tapping should flash a confirmation (count badge on Done). Category chips here (Burgers, Pizza, Pasta) don't match the customer taxonomy (Starters/Mains/Dessert/Drinks) — same menu, two mental models. No running total or item-count feedback visible while adding.

**06 · Split bill**
- Works: Equally / By item / Custom is exactly the right model. Per-guest rows with equal shares, print receipts action. The R795-each result card is good math theater.
- Fix (bug-level): The entire modal renders dimmed — as if the overlay scrim covers the modal itself; the only legible element is the gold "Equally" tab. If that's a z-index/opacity defect, it's a ship-blocker for this flow. Guest-count stepper splits "−" and "+" to opposite screen edges (~1300px apart) — two-handed operation for a one-thumb task; group the stepper. Old-style numerals again ("R795" reads "R79ς" at glance). "PRINT SPLIT RECEIPTS" is the only exit visible — where's per-guest payment capture (card/cash/QR per share)?

### KITCHEN (KDS)

**01 · Login** — Same staff portal. Same PIN critique, doubly so with wet/gloved hands. Consider a dedicated "station mode" that stays signed in with a supervisor PIN for sign-out.

**02 · Queue**
- Works: Three-column NEW/PREPARING/READY with color-coded headers and counts, elapsed timers with urgency color (green→amber→red), left-edge urgency borders, full-width action buttons, sound toggle, LIVE badge. The operational model is right.
- Fix (kitchen readability is the point): Quantity is the most important token on a ticket and it's rendered smallest — "×2" in small gray, right-aligned. Flip the line to lead with quantity: "2× FLASH PAN FRIED…" bold white. No order numbers — expo can't call "43's up"; add #ID + placed-at time. Price (R 636.00) is noise on a KDS — cooks don't bill; remove it and reclaim the space for notes/allergens, which are entirely absent (the customer app collects per-item notes; the kitchen never sees them — the single worst cross-app gap). Urgency is encoded by color alone — add a flame/clock glyph for color-blind cooks under heat lamps. All six tickets say TABLE 3 — seed believable demo data before sales demos.

**03 · Preparing**
- Works: Ticket carries its timer into the column; "Mark Ready ✓" amber button is unambiguous.
- Fix: Timer shows time-since-placed (24:53) but not time-in-state; a cook needs "how long has this been on my station" — show both (placed 24:53 · preparing 9:41). Column headers could carry summed load ("PREPARING · 1 ticket · 4 plates").

**04 · Ready**
- Works: "Served — Complete ✓" green terminal action; color journey blue→amber→green is legible at distance.
- Fix: A READY ticket at 24:54 and climbing red should scream — the dying pickup is the most expensive failure on the pass; add a pulsing state + expo alert when READY exceeds ~3 min. Who runs the food? Show waiter/section on the ticket so the pass can call the runner.

**05 · Completed**
- The screen shows completion by absence — the ticket simply vanishes; there is no Completed rail, history, or recall. One fat-fingered "Served — Complete" and the ticket is unrecoverable. Add a collapsed "Completed (last 10)" drawer with RECALL, plus a 5-second undo snackbar after the terminal tap. This is the KDS's biggest functional gap.

### ADMIN (desktop)

**01 · Login** — Same portal, appropriate here. Password manager compatibility and 2FA for owner accounts are the asks.

**02 · Owner dashboard**
- Works: Time-range chips, KPI row (Revenue/Orders/Avg order/Covers/Avg per cover/Top table), revenue trend, peak hours, day-of-week, top/bottom dishes — the right six questions answered on one screen. "Donald added to your tickets" attribution card is a smart retention hook for the AI feature.
- Fix: "R 25254" — no thousands separator on the flagship number (waiter shows "R3 816", analytics "R5834" — three formats in one product; standardize "R 25 254" ZA-style everywhere, with tabular lining figures). The Donald card leads the page with "R 0 · 0% acceptance" — when attribution is zero, swap in setup guidance ("Donald hasn't upsold yet — check Chef Recs are enabled") instead of headlining a failure. Peak-hours chart switches to blue-gray while adjacent charts are gold — one accent per data language. Top dish is Castle Lite (a beer) by count while #3 Tokara at R2370 (7×) dwarfs it in revenue — default the ranking to revenue, or show both columns; count-ranked lists mislead owners.

**03 · Live orders**
- Works: Sidebar IA (Service / Menu & Offers / Insight / Operations) is genuinely excellent — it mirrors how an owner thinks. Ticket cards with itemized prices and timestamps are clean.
- Fix: Header says "5 active tickets" while the covers pill says "0 live covers" — contradictory at a glance (covers unset because waiter never logged guests — the data chain from waiter → admin is visibly broken). "table3" lowercase here vs "TABLE 3" (kitchen) vs "Table 3" (waiter) — one entity, three renderings. Complete and Delete sit adjacent with equal weight; Delete on a live order needs a confirm + reason (void/comp/mistake) and an audit trail — right now it's a one-click revenue eraser. A "Live" page with a manual Refresh button undermines the KDS's real-time promise — same socket, same behavior.

**04 · Menu management**
- Works: Category grouping, availability pills, per-item media management, bulk-select checkboxes, item count, prominent New item.
- Fix (biggest admin time-sink): Every item consumes two full rows (item + MEDIA sub-row) → 439 items ≈ 878 rows of scrolling. Collapse media into a thumbnail-left layout with tiny image/video status dots; row height drops ~55%. The edit (pencil) icon is red — red is spent on destructive; edit should be neutral/gold (this exact pencil-red repeats on every row, teaching users that editing is dangerous). No search or category filter visible on a 439-item list — the waiter's Add Items screen has search; the owner's editing surface doesn't. Checkboxes exist but no bulk-action bar appears (bulk 86, bulk price, bulk category) — availability toggling at service time is the #1 job here. "Available" pill is a status and (presumably) a toggle — make its tappability explicit.

**05 · Reports / Analytics**
- Works: Revenue-by-table horizontal bars with values, top-items ranked list, KPI row, time ranges. Real insight density.
- Fix: Time-range sets differ from dashboard (Today/7/30/**All Time** vs Today/7/30/**90 days**) — unify. Same separator problem ("R 25254"). Top-items ranked by count again (Castle Lite #1). Bars are all the same gold — tint the top performer or add an average marker so the eye gets an anchor. No export/print anywhere — owners live in exports. Peak hours chart clips at the fold with no scroll cue.

**06 · Tables (Live floor)**
- Works: Clean grid, live-sync pill, manager-override affordance noted in the subtitle.
- Fix: Fifteen identical "Empty" cards with three words each — a floor view that shows no floor. Even keeping the grid (no redesign), encode state on the card: occupancy color edge, covers, seated time, current spend, assigned waiter — the waiter app already renders exactly this on its table cards; borrow that anatomy verbatim. "0 active carts" here vs "5 active tickets" on Orders — same sync break. "Live sync" pill + manual Refresh button on the same header is self-contradicting.

**07 · Accounts**
- Works: Role badges, active/suspended states with color, Activate/Suspend single-action buttons, clean rows, clear Add account CTA. Honestly close to done.
- Fix: "suspended" in lowercase red text vs "active" in green — pill-ify both to match the system's status language. No last-active timestamp, no per-role permission summary, no PIN reset — the three things an owner actually does here. Demo account (@demo_waiter_tmp) visible in production UI — hide behind a dev flag.

---

## 3. Prioritized Improvements (Highest ROI first)

1. **Lining tabular numerals for all data** (Waiter, Admin, KDS). The old-style serif figures make money and table numbers genuinely misreadable ("Ro" for R0). Keep the serif display for headings — this preserves identity while fixing the #1 legibility tax. *Effort: low. Impact: entire staff surface.*
2. **One currency format everywhere:** "R 25 254" (space separators, no decimals unless cents matter, tabular alignment). Today there are four formats across four portals. *Effort: low.*
3. **Kitchen ticket anatomy:** quantity-first bold lines, order # + placed-at, remove prices, surface item notes & allergens, time-in-state, RECALL/undo for completed tickets. The KDS currently drops customer notes on the floor — this is a food-safety-adjacent defect, not polish. *Effort: medium. Impact: highest operational.*
4. **Item modal sticky Add-to-Cart** + exclude self from recommendations. The single conversion point of the customer app is below the fold. *Effort: low. Impact: direct revenue.*
5. **Order confirmation moment:** checkmark animation, order summary, ETA, waiter name, "browse desserts" re-order path. Turns the emotional peak into a revenue surface. *Effort: low-medium.*
6. **Fix the split-bill modal contrast defect** (whole modal renders scrimmed) and group its stepper controls. This flow handles money in front of guests — it must be flawless. *Effort: low (likely a bug).*
7. **Destructive-action safety:** confirm + reason + audit on admin Delete; 5s undo on KDS Complete; keep Complete/Delete visually unequal. *Effort: low.*
8. **Placeholder image system:** monogram-on-tint placeholders wherever photography is missing (waiter Add Items is ~95% broken thumbnails); enforce image↔dish match in menu management. *Effort: low-medium.*
9. **Skeleton loading + progressive images** on customer menu; kill the lone spinner; hold FABs until content lands. *Effort: medium. Impact: perceived speed = perceived premium.*
10. **Admin menu list compaction** (thumbnail row, media status dots, search/filter, bulk-action bar). Cuts the owner's most frequent task time roughly in half. *Effort: medium.*
11. **Icon system unification:** replace emoji (drawer categories, spice chilis) with gold line glyphs; merge the waiter's duplicate bells; un-red the edit pencil. *Effort: low.*
12. **Real-time parity:** the KDS is live; admin "Live orders" and "Tables" should consume the same socket — remove manual Refresh from anything labeled live. *Effort: medium.*
13. **Empty states with a next action:** empty cart → "Browse the menu"; clear floor → next-best-action suggestion; admin zero-states → setup guidance (esp. the Donald R 0 card). *Effort: low.*
14. **Tip architecture:** 10% anchored middle (5/10/15/Custom or ZA-appropriate ladder). *Effort: trivial. Impact: staff income.*
15. **Contrast pass to WCAG AA:** "Not sure what to order?" red-on-navy, gray "Sent to kitchen" metadata, EMPTY rail captions, unselected tabs that read as disabled. *Effort: low-medium.*

## 4. Cross-App Inconsistencies

1. **Brand name drift:** "Trumps Prime Grillhouse" (customer) · "TRUMPS Staff Portal" (staff login) · "Trump Owner Console" (admin sidebar) · "Trump Steakhouse" (browser title). Pick one legal name and one display name.
2. **Logo mark:** circled-T (customer landing) vs square outline glyph (staff portal).
3. **Table entity casing:** "TABLE 3" (kitchen) / "Table 3" (waiter) / "table3" (admin).
4. **Currency:** "R 628" · "R3 816" · "R 636.00" · "R 25254" · "R5834" — five renderings of one currency.
5. **Menu taxonomy:** customer tabs (Starters/Mains/Dessert/Drinks) vs waiter Add-Items chips (adds Burgers/Pizza/Pasta/Seafood/Specials) — same catalog, different categories.
6. **Accent semantics:** customer/waiter/admin are gold-primary; KDS actions are blue/amber/green with gold absent. A utilitarian KDS palette is defensible — but blue appears nowhere else in the system; consider navy-tinted buttons or at least reserve blue exclusively for KDS "new".
7. **Red's meaning:** urgency (KDS timers), destructive (Delete), and… editing (admin pencil) and "suspended" text. Red must mean one thing.
8. **Status pipeline mismatch:** Kitchen models New→Preparing→Ready→Served; admin Live Orders offers only Complete/Delete; waiter shows only "Sent to kitchen". One order lifecycle, three vocabularies — waiters can't answer "is it ready?" without walking to the pass.
9. **Data sync:** admin says "0 live covers" and "0 active carts" while showing 5 active tickets and while the waiter app shows Table 3 active at R3 816 with 25m seated; waiter GUESTS=0 on a spending table. Some of this is missing cover-entry discipline (a UX fix), some looks like state propagation.
10. **Numerals:** customer app uses sans lining figures for prices (correct); waiter/admin headline data uses old-style serif figures (incorrect for data).
11. **Time ranges:** dashboard (Today/7/30/90 days) vs reports (Today/7/30/All Time).
12. **Live behavior:** KDS auto-live vs admin manual Refresh on "Live" pages.

## 5. Production-Readiness Score: 6 / 10

Ships-and-works, but not yet trust-it-in-a-Friday-rush. What blocks a higher score: the split-bill contrast defect (money flow), no undo/recall on KDS terminal actions, delete-without-confirm on live orders, kitchen never seeing item notes/allergens, visible cross-portal sync mismatches, ~95% broken thumbnails on waiter Add Items, and demo/test artifacts (all tickets TABLE 3, @demo_waiter_tmp) in the UI. None of these are architectural — all are closable within the roadmap below.

**Gate list for "production-proud" (8+):** split-bill fix · KDS notes/allergens/undo · delete confirmation + audit · numeral/currency standardization · placeholder image system · live-sync parity · AA contrast pass · seeded demo data.

## 6. Implementation Roadmap

**Phase 1 — Week 1–2 · "Stop the bleeding" (all low-effort, high-trust)**
Split-bill modal defect · numerals + currency standardization · KDS quantity-first lines, remove prices, add order # · destructive-action confirms + KDS undo · duplicate bell merge · edit-pencil color · tip ladder · empty-state CTAs · self-recommendation exclusion · truncated cross-sell labels.

**Phase 2 — Week 3–4 · "Feel premium"**
Sticky Add-to-Cart on item modal · confirmation-screen moment (animation + summary + reorder path) · skeleton loading + progressive images · placeholder monogram system · icon unification (emoji → line glyphs) · contrast pass · FAB choreography · AI chip restyle.

**Phase 3 — Month 2 · "Operational trust"**
KDS notes/allergens/time-in-state/recall drawer + READY-aging alerts · real-time parity on admin Live Orders + Tables (retire Refresh) · admin table cards borrow waiter anatomy (covers/time/spend/waiter) · cover-count prompt on table open · order-lifecycle vocabulary unified across portals (waiter sees Preparing/Ready) · round-grouping in waiter cart · menu-list compaction with search + bulk actions.

**Phase 4 — Month 3 · "Compete with Toast"**
Split-bill payment capture per guest (card/QR/cash) · PIN quick-switch for staff · revenue-ranked analytics + export · Donald zero-state setup flows + acceptance analytics · brand lockup consolidation (one name, one mark) · micro-interaction layer (add-to-cart flight, ticket column transitions, table-state pulses) · accessibility audit to AA with color-blind-safe urgency glyphs.

---
*Review based on 29 static captures; interaction/animation notes are inferred where motion could not be observed. Two capture pairs were duplicates (Customer 01/02, Waiter 02/04).*
