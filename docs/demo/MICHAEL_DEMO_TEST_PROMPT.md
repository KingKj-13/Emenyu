# Michael Demo — Verification & Hardening Prompt

**Purpose:** paste the block below into a fresh Claude session (Cowork, with the Emenyu folder mounted and Claude-in-Chrome connected). It tells Claude exactly what to test, what to fix, and what to hardcode so the guided-upsell story is reproducible on demand.

**Context for you (KJ), not for the prompt:** meeting is 3–7 days out. Scope approved = audit + fix + hardcode in `Sites/Trump`. Menu items in the story are illustrative — Claude must read the real menu and map the story onto items that actually exist. Wine beat is in.

---

## THE PROMPT

> You are my senior technical co-founder on Emenyu, an AI-powered digital restaurant platform. The codebase is mounted; read `CLAUDE.md` at the repo root first for architecture. The only live restaurant is **Trump**, served under the `/Trump` URL namespace.
>
> ### The situation
>
> In 3–7 days I am demoing to **Michael** — an expert sommelier who owns a restaurant and a vineyard. He is not a naive prospect: he knows food, he knows wine, and he has been sold to before. I will ask him to role-play as a hungry customer at his own table and think out loud while he orders.
>
> The demo lives or dies on one thing: **a scripted, guided upsell path that works flawlessly, on his phone, on the first try, with no dead ends.** The claim I am making is not "look at my software" — it is "guiding a guest's choices raises the average table bill without discounting."
>
> ### Your job, in order
>
> **Phase 1 — Establish ground truth (do not skip, do not assume).**
>
> 1. Open `https://emenyu.com/Trump/Table7` in a **420×900 mobile viewport** — Michael will use a phone, so every judgement must be made at phone size, never desktop.
> 2. Read the actual menu: categories, item names, prices, which items have images, which have videos. Cross-check against `Sites/Trump/client/src/lib/imageResolver.ts` (`KEYWORD_MAP`, `CATEGORY_IMAGE_MAP`, `LOCAL_OPTIMIZED_VIDEO_MAP` — 55 video entries) and the seeded menu data. **Report the real inventory before proposing any script.** My story used a R180 burger, R10 fries, R15 onion rings, R30 Coke and a R45 mocktail — those were placeholders. Tell me what actually exists.
> 3. Walk the complete guest journey end to end and screenshot every step: QR landing → browse → open an item → video playback → add to cart → whatever recommendation fires → cart → checkout → order confirmation. Do it as a real user, not by reading code.
> 4. Log **every** defect with severity: broken images, missing/slow videos, layout breaks at 420px, tap targets under 44px, spinners over 2s, console errors, socket failures, anything that requires a back-button.
> 5. Time the cold load on a throttled connection. If first meaningful paint is over ~3s on mobile, that is a demo-killer — flag it as P0.
>
> **Phase 2 — Test whether the guided-upsell mechanic actually exists.**
>
> The story I want to tell has five beats. For each one, determine whether the product does it **today**, does it **partially**, or **not at all**. Be blunt — I would rather hear "this doesn't exist" now than find out in front of Michael.
>
> | # | Beat | What must happen |
> |---|------|------------------|
> | 1 | **Video reveal** | Guest taps a hero food item, a short prep/beauty video plays inline, autoplay + muted, no buffering stall |
> | 2 | **Side swap upsell** | On add-to-cart, a recommendation offers a *better* side at a slightly higher price, with a human reason. Accepting it **replaces** the default side, not adds a second one. Bill moves by a few rand, not a big jump |
> | 3 | **Drink pairing via chat** | An unprompted chat message arrives suggesting a specific drink for what is already in the cart — this must feel like a surprise, because Michael will not have opened the chat |
> | 4 | **Wine beat (new)** | At least one item offers a genuine wine pairing with a defensible tasting rationale. This is the credibility moment with a sommelier |
> | 5 | **Bill delta** | The cart total visibly moves from a baseline to a guided total, and the delta is legible on screen |
>
> Relevant code: `server/services/aiService.js` (deterministic, local, keyword + order-popularity + course-completion scoring — no external LLM), `server/services/nlg/templateNlgProvider.js` (wording), endpoints `POST /Trump/api/ai-pairing`, `POST /Trump/api/recommend`, `POST /Trump/api/chat`, sockets in `server/services/socketService.js` at path `/Trump/socket.io`.
>
> **Critical constraint on the wine beat:** the recommendation engine is keyword-based, not a sommelier. Michael will instantly identify a bad pairing and the entire demo dies on that one moment. Do not let a generated pairing reach him unreviewed. For every item on the demo path, the pairing text must be **hand-curated and defensible** — the varietal, the reason (acidity, tannin, fat, char, sweetness), and the price. Show me the exact pairing copy for approval before it ships.
>
> **Phase 3 — Make the demo path deterministic.**
>
> Once you know what is real, hardcode/seed whatever is needed so the five beats fire **identically every time**, on any device, with no network dependency on anything flaky. Prefer seeding real data and pinning recommendation rules over faking UI. Anything that is genuinely faked, list explicitly in a "DEMO SCAFFOLDING" section so I never accidentally claim it as shipped capability. Rules:
> - Never fabricate a capability I would have to walk back later. Michael may become a customer; a lie compounds.
> - Prefer "this is configured for your menu" over "this is magic AI." Configurable is credible; magic invites interrogation.
> - Pin the demo table (Table7 or a dedicated demo table) so other traffic cannot pollute the cart or order feed mid-demo.
> - Ensure the demo is **repeatable** — I need a one-command reset so I can run it twice, or run it again for the next prospect.
>
> **Phase 4 — Staff-side verification.**
>
> With credentials I supply, verify the order Michael places actually flows through: admin (`admin.html`), waiter (`waiter.html`), owner (`owner.html`), and the kitchen view. Roles are `owner > manager > waiter > kitchen`. Confirm in real time (Socket.IO) that:
> - the order appears in the kitchen/waiter view within a couple of seconds
> - the upsold items appear correctly, with the swap reflected (not duplicated)
> - the analytics endpoints (`/Trump/api/analytics/summary`, `/items`, `/tables`, `/hours`) reflect the order — Michael as an owner will care far more about this screen than the guest screen
> - nothing on these screens is broken, empty, or embarrassing at the resolution I will show it at
>
> Flag anything an owner would find alarming: no data, wrong totals, confusing labels, missing filters.
>
> **Phase 5 — Deliverables.**
>
> Produce, as files in the repo:
> 1. `DEMO_READINESS.md` — verdict (ready / ready-with-caveats / not ready), full defect list by severity, and honest gaps.
> 2. `DEMO_RUNSHEET.md` — the exact run of show: what Michael taps, what he should see, what I say at each beat, and a recovery line for each failure mode ("if the video stalls, say X and move on").
> 3. `DEMO_SCAFFOLDING.md` — everything hardcoded or seeded, and how to revert it.
> 4. A reset script so the demo can be run repeatedly.
>
> **Rules of engagement:** Do not tell me it works because the code looks like it should. Every claim must come from something you actually observed in the browser at 420px wide. If a beat cannot be made to work reliably in the time available, say so and propose cutting it — a three-beat demo that never stumbles beats a five-beat demo that breaks once. React changes require `cd Sites/Trump/client && npm run build` before they appear in production; never report a frontend fix as done without rebuilding and re-verifying in the browser.

---

## Notes on your pitch — read before the meeting

You asked me to challenge you. Four things in the narrative will not survive contact with Michael.

**1. The arithmetic is stated wrong, and the numbers are yours, not his.**
R20 × 100 guests = R2,000 **per day**, which is ~R60,000 **per month** — you wrote it in a way that reads as R60,000/day. Michael will catch that instantly and it will cost you the room. Worse: never bring your own covers number. Ask him. *"How many covers on a Friday? And what's your average bill per head?"* Then do his arithmetic in front of him, out loud, on his numbers. A figure he supplied is a figure he cannot argue with.

**2. Never say "x% to y%" for repeat customers.** You do not have that data and he will ask where it came from. With zero paying clients, the honest position is stronger: *"I can't tell you what this does to your repeat rate — nobody's run it in your restaurant yet. What I can show you is the mechanism, and you can judge whether it would work on your guests."* Sophisticated buyers trust the person who admits the limits of their evidence.

**3. Drop the "no game."** The traffic/car-screen technique works on cold consumer sales. Michael is a restaurant owner and a sommelier — he has been pitched by POS reps, delivery platforms, and booking systems for years. Manufactured questions with a predetermined answer will read as technique, and the moment he clocks it, everything you say afterwards gets discounted. Your actual advantage is that he is a genuine expert: let him critique the product. *"Tell me where this pairing is wrong."* Real curiosity from you, real expertise from him — that builds far more trust than a rhetorical trap, and his critique is free product research.

**4. The "free drink beats your CAC" argument speaks the wrong language.** Restaurant owners think in food cost percentage and covers, not customer acquisition cost. A comped mocktail costing R8 to pour against a R45 menu price is the framing that lands. And be careful with the R50-off-on-R400 idea in front of a vineyard owner — he will immediately price the margin hit and may conclude you are just discounting, which is exactly the thing you told him you were replacing.

**One thing your story gets exactly right:** the three-outcome frame (no change / upsell works / upsell misses but wins goodwill) is genuinely good, because it makes the downside case explicit before he has to raise it. Keep it. Just tighten outcome 3 — "they don't like it but come back" needs a concrete mechanism attached, otherwise it sounds like wishful thinking.

**The sommelier-specific risk, stated plainly:** the pairing engine is deterministic keyword matching, not a wine brain. One clumsy pairing in front of Michael and the credibility of the entire product collapses in a single sentence. Every pairing he can possibly reach must be hand-written and defensible. Consider framing it to him as a feature, not a limitation: *"the pairings aren't invented by a machine — they're yours, configured once, then delivered to every table consistently."* That is a sommelier's dream, not a threat to his expertise. Positioned wrong, this product tells him a computer knows wine better than he does, and he will hate it. Positioned right, it scales *his* palate to every guest who sits down.

---

## What I still need from you

1. **Credentials** — owner/manager, waiter, and kitchen logins for the Trump site so Phase 4 can run. Paste them here or drop them in a file in the repo and tell me the path.
2. **Is Table7 safe to modify?** Or should I build a separate pinned demo table so live traffic can't collide with the demo?
3. **Which device is Michael using** — his own phone, or one you hand him? If it is yours, I can pre-warm the cache and eliminate the cold-load risk entirely.
4. **Do you have real prep videos for Trump's actual menu**, or only the 55 mapped optimised videos plus 4 demo fallbacks? The video beat only lands if the video matches the dish he tapped.
5. **What does Michael's restaurant actually serve, and what is on his wine list?** If I can seed the demo with items adjacent to his own menu, the wine beat goes from impressive to personal.
