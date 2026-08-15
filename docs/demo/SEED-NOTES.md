# SEED-NOTES — Trump Preview Tenant Demo Data

**Batch:** `demo_20260804` · **Target tenant:** `trump-preview` (fallback: `trump`, tag-scoped) · **Generator:** `Sites/Trump/scripts/seed-demo-preview.js` · **Seed:** `20260804` (fixed, reproducible) · **Status:** generated to local file, dry-run only — **not yet written to any database**.

---

## What this data is, in one paragraph you can read aloud

*"Everything you're looking at on this screen is simulated — ninety days of orders we generated using your actual menu and your actual prices, so you can see what your dashboard will look like once it's live. No guest ever placed these orders. The volumes and the AI-acceptance rate are our best illustrative assumptions, not measurements of your restaurant. Your real numbers, once we run this for you, are what will actually replace them."*

---

## The number that matters most — read this section aloud, don't paraphrase it

**This dashboard shows what R15-per-cover looks like, assuming roughly one in five guests accepts a suggestion. It is an illustration of the assumption, not evidence for it. The 30-day trial is what turns it into evidence.**

We picked an 18% acceptance rate *because* it's the rate that produces your R15/cover pitch (R15 ÷ ~R85 average suggested item ≈ 17–18%). That means the simulation cannot validate the R15 claim — it can only show you what it would look like if the claim were true. **Production data today, for comparison: 12 accepted out of 1,341 impressions = 0.9% acceptance**, across low-traffic pre-launch testing. The gap between 0.9% and 18% is exactly what the 30-day trial exists to close. Say that gap out loud before Michael has to work it out himself.

---

## Headline figures (bold, so you know exactly what's on screen before you walk in)

| Metric | Value |
|---|---|
| Period | 90 days, **2026-05-07 → 2026-08-04** |
| **Average covers/day** | **~147** (target was ~140; natural day-to-day variance landed it here) |
| **Average check per cover (all-in, incl. VAT/service/tip)** | **~R586** |
| **Total revenue, 90 days** | **~R7.75M** |
| **Estimated monthly revenue** | **~R2.58M** |
| Suggestion acceptance rate (emergent, capped at 18-20%) | **18%** |
| Average order value — accepted vs not accepted | R2,516 vs R1,663 (**+51%**) |
| **Revenue per cover, accepted-suggestion value ÷ all covers** | **~R12.88** |
| Top 5 dishes by revenue | RUMP 400g, SIRLOIN 350g, TOMAHAWK (FRENCH CUT) 650g, RIBEYE ON THE BONE, RIBEYE 380g |
| Busiest day (of the generated 90) | 2026-06-19, 243 covers, ~R147k |
| Quietest day | 2026-06-08, 83 covers, ~R44k |

## Check-value calibration — the honest gap, explained

The original proposal targeted a blended **R475/cover**. The model, run at your originally-approved attachment rates (starter 65%/40%, dessert 35%/15%, wine 55%/20%, drink 60%/70%, coffee 25%/35%), landed at **R672/cover** — measured, not assumed. Diagnosing why: mains alone, at your approved 90–95% attach rate, already contribute **~R300/cover before anything else**, and VAT (15%) + service (5%) + average tip (~4%) add another ~24% on top of the whole bill. That combination leaves very little room under a R475 ceiling for starters, wine, dessert and coffee at rates that still read as "most guests order a starter, wine matters most" — the shape you asked for.

We trimmed attach rates down from the original proposal (dinner starter 65%→45%, wine 55%→38%, dessert 35%→22%, etc. — full rates in the generator script) rather than keep cutting toward R475, because going further would have meant starter/wine attachment low enough to stop looking like a fine-dining floor. **Final settled figure: ~R586/cover, ~R2.58M/month** — about 23% above the original target, still a materially more modest number than the first (unrevised) pass's R729/R3.4M, and still defensible as "illustrative volumes on your menu" rather than a number that reads as inflated. If R586 still reads too high for what you want to walk in with, the lever to pull is covers/day (currently ~147), not attach rates — cutting covers doesn't distort the per-guest ordering pattern the way further attach-rate cuts would.

## The (a) vs (b1) uplift split — and why (a) is now unusable

Two uplift measures were computed, per your instruction, from the actual generated data:

- **(a) Accepted vs non-accepted average order value: +51%.** This number is **not usable** and should not be said aloud. It's inflated by a mechanical artifact: because the AI-suggestion decision is modeled **per guest** (matching how the real product works — suggestions are device-aware, one per guest session, not one per table), a large party has many independent chances for *at least one* guest to accept. An 8-top has roughly an 80% chance that someone at the table accepts something, purely from having 8 rolls of the dice — and large parties already spend far more per order regardless of any AI suggestion. (a) mixes "this order is bigger because eight people ordered" with "this order is bigger because AI worked," and the two are not separable in this metric. This is a stronger version of the mechanical-inflation problem flagged in the original brief — worse than expected, and worth knowing before anyone tries to use it.
- **(b1) Revenue per cover — accepted-suggestion value ÷ all covers in the period: ~R12.88.** This is the metric that matters, per your instruction, because it dilutes across every guest including the ones who declined — the same way a real average-check comparison against Michael's POS baseline would. It landed close to, but not exactly at, the R15 implied by 18% × ~R85: the difference is that not every cover is suggestion-eligible (only covers that ordered a main, ~92% weighted), and not every eligible cover sees an impression (88% of those). **~R12.88/cover is the number to say, not R15** — close enough to the pitch to support it, honest enough that Michael's own arithmetic will check out if he does it live.

## The by-the-glass finding — a standalone talking point about his business

**The Trump menu has no by-the-glass wine pricing.** Every wine on the list is bottle-only (R195–R1,100+). This forced the AI-suggestion pool for this seed toward cheaper items — enhancements (~R49), sides (~R55–99), desserts (~R99–119) — averaging ~R85–90, because a bottle commitment is too large an ask for a one-tap upsell.

**The arithmetic worth raising with him directly, whether or not he buys anything:** a guest unwilling to commit to a R450 bottle will often take a R95 glass. Structurally, the single highest-value up-sell on a grillhouse wine list — the glass pour — cannot exist on his menu today. If by-the-glass pricing existed at even 3–4 wines, the suggestion pool average would likely rise from ~R85–90 toward R110–130 (assuming a typical glass price ~20–25% of the bottle), which — using the same (b1) arithmetic — would move the per-cover uplift proportionally higher for the *same* 18% acceptance rate, no engine change required. This is advice about his wine list, not a software finding.

## Model assumptions (full list)

- **Table layout — invented for this demo, confirm with Michael during onboarding.** 78 tables: 75 main floor (40×2, 24×4, 8×6, 3×8 = 248 seats) + 3 private dining rooms (Private Dining 1: 24, books 20–28; Private Dining 2 & 3: 14 each, books 12–16) = 300 seats. No room/zone concept exists in the schema — private rooms are plain `Table` rows with `metadata.roomType = 'private_dining'`.
- **Day-of-week shape:** Mon quietest, Fri/Sat strongest dinner, Sun strong lunch/quiet dinner — see multiplier table in the generator script header.
- **Party size:** 2-top 45%, 3-top 12%, 4-top 28%, 6-top 10%, 8-top 5% (floor only). Private-room bookings modeled separately, ~60% of Fri/Sat nights.
- **Winter skew (SA winter, May–Aug):** wine selection 65% red / 35% white+rosé; +20% relative weight on hearty mains (oxtail, lamb shank, ribs, game); −20% on chilled starters (sashimi, cold rolls); +15% on warm starters (wings, calamari, chicken livers).
- **AI suggestion mechanic:** per-cover (per-guest), not per-order — matches the real product's device-aware/split-by-device design. Eligible = cover ordered a main. 88% impression rate among eligible covers. Acceptance 18% base ± dinner/party-size adjustments, hard-capped at 23% (never above your 20% instruction with margin for run-to-run variance). Accepting writes **both** a `RecommendationEvent(eventType:'accepted', value:<real price>)` **and** a real `OrderItem` at that price — nothing assigned after the fact, everything computed from real menu items.
- **Randomness:** fixed PRNG seed `20260804` (mulberry32) — this exact run is reproducible. ±15–30% daily jitter on top of the day-of-week means. Busiest/quietest days above are genuine extremes the seed produced, not hand-placed.
- **Status:** all seeded orders are `status:'history'` except 10 `status:'active'` orders on the final day (2026-08-04), for floor/waiter-view realism. Active orders are excluded from revenue analytics by the app itself (`analyticsController.js` filters `status:'history'`), so they don't affect any figure above.

## Production schema drift — flagged, not fixed tonight

Production's `RecommendationEvent` table is missing at least the `deviceId` column declared in `prisma/schema.prisma` (confirmed 2026-08-04 before DB access was lost; `tableId` status unconfirmed). The seed writer avoids referencing either column on insert. **This is a real operational gap — a migration was written but never applied to production — and should be resolved as a post-meeting item, not tonight.**

## Rollback

See `Sites/Trump/scripts/rollback-demo-preview.js` and `ROLLBACK.md`. One command removes the entire batch and nothing else; a full JSON backup is written before any delete.
