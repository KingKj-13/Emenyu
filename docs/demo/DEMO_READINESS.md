# Demo Readiness — Michael (sommelier / restaurateur / vineyard owner)

**Audited:** 2026-07-31 against live production `https://emenyu.com/Trump`
**Verdict: NOT READY TODAY — but very close. One switch is off, and two pairings will end the meeting if he taps them.**

Everything below was observed against the live site or the live API, not inferred from code.

---

## The headline

You already have the product your pitch describes. Someone built `server/config/trumpDemoJourney.js` — a curated three-journey engine with chef recommendation → side → **wine pairing** → dessert, plus a free-drink make-good with fraud protection. It is genuinely good work and it maps almost exactly onto the story you wrote.

**It is switched off in production right now.**

```
GET https://emenyu.com/Trump/api/settings
→ {"curatedDemoMode":false}
```

If you demo today, Michael gets the generic algorithmic path, not the curated journey. Your entire narrative rests on a feature flag that is currently `false`.

---

## P0 — will break the demo

### 1. `curatedDemoMode` is off
Turn it on in the admin panel before the meeting, and confirm the endpoint returns `true`. Re-verify on the morning of — a server restart re-reads `fileService.js`, where the default is `false`.

### 2. The kingklip pairing is a sommelier-killer
```
KINGKLIP FILLET (R365)  →  MEERLUST RED (R395)
reason: "Bold red — built to stand up to grilled beef."
```
A bold red on a delicate line-fish, justified with copy that says *"grilled beef"* on a fish dish. Michael will spot this in about two seconds, and he will be right. This one card can end the meeting.

Good news: I swept 26 seafood and sushi items and this is the **only** catastrophic miss. The rest are genuinely well-judged — Klein Constantia, Springfield Life of Stone, Fryer's Cove, Nederburg against sushi and shellfish are pairings a sommelier would nod at. Fix the one and the category is defensible.

Note the curated journey already pairs kingklip correctly (Diemersdal Sauvignon Blanc, "lifts the fish instead of competing with it"). The bad pairing only appears if he browses off-script — which he will, because you're going to hand him a phone and tell him to explore.

### 3. Video is the weakest part of your story
```
438 menu items:  1 real matched video  ·  151 generic fallback  ·  286 none
```
Your beat is *"click the burger, a video plays, ooo this is how they make their burger."* In reality the bacon and cheese burger plays `Video/demo/steak-grill.mp4` — a generic clip that is not that dish. Every steak, every starter, every dessert on the demo path plays one of four stock fallbacks. **Wines have no video at all.**

Michael owns a restaurant. He knows what his own food looks like. A generic clip attached to a named dish reads as a mock-up, and once he thinks "mock-up" he re-evaluates everything else you showed him.

Two honest options — pick one, do not wing it:

- **Cut the video beat.** Lead with the pairing intelligence instead. This is the stronger demo for *this specific buyer* anyway: he cares more about whether the wine advice is right than whether there's a video.
- **Shoot one real video** for the single hero dish you will put in front of him. One authentic 8-second clip of the actual ribeye beats 151 stock clips, and you can say truthfully: "this is your dish, filmed in your kitchen — that's the deployment."

Do **not** show him a stock video and let him assume it's real. He may become a customer; that is a lie you would have to unwind later.

---

## P1 — will cost you credibility, not the meeting

### 4. Wine prices ignore the dish price
```
SPRINGBOK CARPACCIO   R175  →  DOM PERIGNON BLANC  R5,500   (31× the dish)
RAINBOW ROLL - VEG     R75  →  FRYER'S COVE          R340   (4.5×)
RAINBOW ROLL (×3)     R119  →  FRYER'S COVE          R340   (2.9×)
```
The Dom Pérignon suggestion on a R175 starter is the one that stings. Michael sells wine for a living — he will read this as an engine with no commercial judgement, and he'd be right. Cap the default pairing at roughly 1.5× the dish price, with the expensive bottle available as a deliberate "make it an occasion" upgrade rather than the default.

This is also, handled well, a *selling* moment: "the ceiling is yours to set — you know your list better than any algorithm does."

### 5. Stock photography throughout
Every image is `mediaSrc: "pexels"`. Fine as a placeholder, but pair it with the video problem and the overall impression is "demo," not "product." Same fix as #3: a handful of real shots of the hero path.

### 6. `HALF CHICKEN` price is `null` in the journey config
`trumpDemoJourney.js` line 96 carries a `// CONFIRM PRICE` flag. The live menu says **R199**. If that journey runs, a null price could render as `R null` or break the cart total. One-line fix.

### 7. Category tiles break at tablet width
At ~760px the labels overflow their tiles ("Sushi & Sashimi" runs past the edge). Fine at phone width, fine at desktop. Only matters if you ever show this on an iPad.

---

## What is genuinely strong — lead with these

- **The wine reasoning is real.** Ribeye → Tokara: *"Marbled and char-grilled, the ribeye wants a wine with backbone — Cabernet's firm tannin and blackcurrant depth stand right up to all that richness."* That is a defensible, sommelier-grade sentence. Burger → Constitution Road Shiraz on smoky bacon and pepper is sound. This is your best asset with this buyer, and you were planning to lead with a burger video instead.
- **The wine list is credible South African.** Meerlust, Tokara, Klein Constantia, Kleine Zalze, Diemersdal, Springfield, Fryer's Cove. A vineyard owner will recognise every one — and may know some of the winemakers personally.
- **The three-outcome model is already built, not just argued.** `rewardService` + `ENJOYED_THRESHOLD = 2`: accept 2+ recommendations → thank-you; accept fewer → automatic free-drink QR with single-redeem, expiry, and staff-side fraud copy. Your pitch claims "we can manage this so it won't get abused" — you can open the code and show him. Do that.
- **"Not sure what to order?" chef bundles** (Steak Lover R868, Fish Lover R910, Vegetarian R668) already render on the menu landing and look good.
- **The menu is deep and real** — 438 items, all with images, correct prices, proper categories.

---

## Waiter app — audited (signed in as `kj`, Head Waiter)

### The best screen in the product, and it has a fatal bug

Table 5 → AI Recommendation panel shows exactly the pitch you're trying to make, quantified:

```
AI RECOMMENDATION                                    SUGGESTED
HAUTE CABRIÈRE CHARDONNAY PINOT NOIR
[Confidence 92%]  [EV R271]
[ Professional ] [ Traditional ] [ Luxury ]     ← three tone registers
+R295                                    [ + Add To Cart ]

Revenue Opportunity
Current Spend                                        R3 220
HAUTE CABRIÈRE CHARDONNAY PINOT NOIR                  +R295
Potential Additional Revenue                          R295
```

Confidence score, expected value, a script the waiter reads aloud in three registers, and the revenue delta computed live. **This is your pitch, on screen, in the staff tool.** It is far more persuasive to an owner than any guest-side animation.

**But the copy it generates is indefensible in front of a sommelier:**

> *"I noticed you've gone with the LE RICHE. If you're open to a recommendation, I'd definitely pair it with our HAUTE CABRIÈRE CHARDONNAY PINOT NOIR. It's a solid, easy match for the haute cabrière chardonnay pinot noir, you really can't go wrong with it."*

Three failures in one paragraph:

1. **It pairs a wine with a wine.** Le Riche is a Cabernet (R420). The system is recommending a second bottle as a "pairing" for the first. That is not a pairing; that's just selling more wine. The table has 2× Wagyu Ribeye and a Wagyu Fillet sitting in the cart — the actual food — and the engine ignored all of it.
2. **The reason is circular — a visible template bug.** *"a solid, easy match for the haute cabrière chardonnay pinot noir"* — it's recommending the wine as a good match for **itself**. The template has substituted the recommended item into the slot meant for the guest's dish.
3. **The language is empty.** *"you really can't go wrong with it," "one of my favourite combinations."* A sommelier wants weight, acid, tannin, structure. This is filler, and he will hear it as filler.

This is a P0. Do not open the waiter app in front of Michael until the pairing source is constrained to food-in-cart → beverage, and the reason template is fixed.

### Other waiter findings

- **P1 — stale demo data everywhere.** Table 5 shows `TIME SEATED 163h 4m` (nearly 7 days). Table 12 shows `14h 55m`, `0 guests`, and `R125` simultaneously. A table that has been seated for a week says "test environment" louder than anything you can say over it. Clear these before the meeting. **Table 7 is clean and empty** — keep it that way.
- **P2 — R1 discrepancy.** Table header reads `R3 221`; the Revenue Opportunity panel reads `R3 220`. An owner who reconciles books for a living may well spot it.
- **Good — the role guard works.** Navigating to `admin.html` as a waiter correctly bounced back to `/Trump/Waiter`. Worth showing Michael deliberately: staff can't see the money screens.
- **Good — Chat Center "Guest Signals"** auto-tags `Allergy Alert`, `Vegetarian Guest`, `Birthday dessert approved` from guest messages. The allergy detection is a genuinely strong operator feature and a good answer to "what else does this do?"
- **Good — table strip statuses**: `BIRTHDAY OPPORTUNITY`, `FOOD READY`, `NEEDS ATTENTION`, `ACTIVE`, `EMPTY` across 20+ tables.

## Kitchen Display — audited

Layout is genuinely restaurant-grade: three colour-coded columns (NEW ORDERS / PREPARING / READY), big touch targets, `LIVE` badge, sound toggle, per-ticket table number and order number.

**P0 — the ticket timers are broken.**
```
TABLE 11  #86   9776:31
TABLE 2   #82   9803:31
TABLE 5   #83   9789:31
```
On a kitchen display the timer *is* the product — it drives ticket priority. These read ~9,800. Michael will look straight at it.

This is almost certainly the same root cause as the empty "Today" dashboard below: the seeded orders carry broken timestamps, so elapsed time computes as nonsense **and** nothing falls inside a "today" window. One bug, two symptoms — fix the seed timestamps and both screens come right.

**P1 — no bar/drinks routing.** Wine and drinks are firing to the *kitchen*: `L'ORMARINS BRUT CLASSIQUE`, `RUSTENBURG`, `LE RICHE`, `NEDERBURG`, `3× AMERICANO COFFEE`, `SOFT DRINKS`. In a real restaurant these go to the bar and the pass, not the grill. Michael runs a restaurant *and* is a sommelier — wine routing is precisely his domain, and "why is my wine order on the grill screen?" is a question you do not want to be answering live. Related: the coffee is on the same ticket as the mains, so there's no course firing either.

Be ready to say: *"drinks routing is a station config — it's on the roadmap, not built."* Don't improvise.

## Owner Dashboard — audited

**P0 — the default view says your product earns R0.**

The dashboard opens on **Today**, and Today is completely empty:
```
🍷 YOUR SOMMELIER ADDED TO YOUR TICKETS
R 0
0 orders generated · 0% acceptance · R 0/impression

Revenue R0 · Orders 0 · Avg order R0 · Covers — · Avg/cover — · Top table —
Revenue trend:  "No revenue in this period."
Peak hours:     "No orders yet."
Top dishes:     "No sales yet."
```

Eight empty states on one screen — while the kitchen display shows five live tickets and the waiter app shows R3,346 on the floor. **The dashboard contradicts the rest of the app**, which reads as broken rather than as "quiet day."

And the single headline metric that proves your entire value proposition reads **R0, 0% acceptance**. If Michael taps one thing on this dashboard, it will be this. Never let him land on Today.

**The 30-day view, by contrast, is the best screen in the product:**
```
🍷 YOUR SOMMELIER ADDED TO YOUR TICKETS
R 5 214
8 orders generated · 1% acceptance · R1/impression · +27% over non-AI revenue

Revenue R24 438 · 24 Orders · R1 018 avg order · 45 Covers · R543 avg/cover
Top table: Table 2 — R3 692
Revenue trend / Peak hours / By day of week — all populated
Top dishes:    #1 FIRECRACKER CHICKEN WINGS (400g)  7× R700
Bottom dishes: #1 LAMB CHOPS 4's 500g              1× R399
```

*This* is the screen to show him. It answers the owner's real question — what did the guidance actually add — in rands, next to a menu-engineering top/bottom split he'll recognise from his own P&L.

**P0 — but the acceptance number is wrong and it destroys the claim.**
It reports **1% acceptance** alongside **8 orders generated out of 24 total orders**. Eight of twenty-four is 33%, not 1%. The metric is almost certainly dividing accepted-orders by *impressions* (counted per render, so the denominator inflates every time a card paints).

Michael will do that arithmetic in his head, and "1% acceptance" sitting next to "+27% over non-AI revenue" reads as two numbers that can't both be true. Either fix the calculation or remove the acceptance figure and lead with the rand value. Do not walk in with a metric you'd have to explain away.

**P2 — the Owner page froze the renderer** on first load (30s screenshot timeout, recovered after ~10s). Watch for a slow first paint; pre-load this tab before the meeting.

## Still outstanding

- Place a **live end-to-end order** through Table 7 with `curatedDemoMode` on, and confirm the upsold side **replaces** rather than duplicates, and that it reaches kitchen/waiter within a couple of seconds
- Confirm the reward QR issues and can only be redeemed once
- Verify everything on an actual iPhone

---

## Fix order, given 3–7 days

| | Fix | Effort |
|---|---|---|
| 1 | Turn on `curatedDemoMode`, verify the endpoint | minutes |
| 2 | Fix the kingklip → Meerlust Red pairing | ~30 min |
| 3 | Set `HALF CHICKEN` price to 199 | 1 line |
| 4 | Cap default pairing price ratio (~1.5× dish) | half a day |
| 5 | Decide: cut the video beat, or shoot one real hero clip | your call |
| 6 | Full dry run on your iPhone, twice, start to finish | 1 hour |

Item 6 is not optional. Everything above was tested at desktop width — the browser would not resize (`window.innerWidth` stayed 1666 regardless), so **no claim in this report has been verified on a phone.** Michael will be holding an iPhone. Walk the entire path on your own device before you walk into that room.
