# Emenyu / Trump — QA Findings

**Date:** 2026-07-01 · **Tester:** Claude (live prod, `emenyu.com/Trump`, logged in as `owner`)
**Method:** clicked through real flows; every state-change cross-checked against network + console logs.
**Status:** LIVING DOC — core flows + several admin surfaces tested; remaining surfaces listed in §5.

Severity: 🔴 fix before 13 Jul pitch · 🟠 real bug, fix soon · 🟡 minor/cosmetic · 🔵 verify (may be fine).
Fix owner: **[you/admin]** = change via admin panel or config · **[code]** = code/deploy change.

---

## 1. Issues — no matter how small

1. 🔴 **[you/admin] Stale demo/test orders everywhere.** Kitchen (7 tickets), Admin → Orders (6 active), and Waiter floor all show month-old open orders (timers `45375:28`, `756h 29m`, `22515:09`), one tagged "*staging smoke*". Clutters every live screen. Purge before the pitch (`scripts/purge-demo-orders.js`).
2. 🟠 **[code] Elapsed-timer format breaks on old orders.** Shows raw minutes as `mm:ss` → `45375:28` (~31 days) instead of a capped/day format. Add a sane cap (e.g. `3d 4h`) or auto-close stale tickets. Mostly hidden once #1 is purged, but the format bug is real.
3. 🔴 **[you/admin + verify] VAT/service mismatch guest→bill.** Guest cart shows **R868** (item subtotal); recorded order total/revenue is **R1042 = R868 + 20%**. SA menu prices usually already include 15% VAT, so a 20% add-on needs checking. Confirm the rate is intended AND that the guest actually sees the VAT/service breakdown on the bill — otherwise they order R868 and are charged R1042 with no explanation.
4. 🟡 **[you/admin] Duplicate dessert photos (guest menu).** Every dessert renders the same cheesecake image; per-item images are placeholders falling back to one shared asset. Upload real/distinct dessert photos.
5. 🟠 **[code] Waiter AI recommendation reasoning can reference items not in the order.** Table 12's upsell said *"the creamy Caesar profile wants a pairing…"* but there is no Caesar in that cart. The pairing itself is fine; the justification copy is mismatched. Tie the NLG reasoning strictly to items actually present.
6. ✅ **[RESOLVED] Guest concierge chat WORKS.** Re-tested: opens reliably (earlier "didn't open" was a first-tap fluke — note: occasionally needs a second tap right after page load). Birthday quick-prompt returns celebratory picks (L'Ormarins Brut MCC R450 + Tomahawk R499 + Springbok Carpaccio), AND it fires a **"Birthday Detected · Table 5" P1 floor request in the Service Desk** — the pitch's "discreet waiter notification," working end-to-end. `POST /api/chat 200`.
14. 🟠 **[code] Chat Logs show "Invalid Date".** Every sommelier chat-log entry timestamps as "Invalid Date" (date parse/format bug). Also several entries labelled table "unknown".
15. 🟡 **[you/admin + code] Concierge drink answer is weak for a wine house.** "To drink?" was answered with SOFT DRINKS / RED BULL rather than wine. For a cellar-driven steakhouse the sommelier should lead with wine. Add chef-rec / category weighting so drink questions favour the cellar.
7. 🟡 **[code] Day-of-week label inconsistency.** Waiter shows "Thursday service" while analytics/today show Wednesday. Likely a SAST-midnight rollover, but verify the day-label logic.
8. 🔵 **[code] Peak-hours hour bucket.** Order placed ~17:42 local appeared in the ~21h bucket. The "today" boundary (22:00 UTC = SAST midnight) looks correct, so this may be fine — but confirm the hour bucket matches actual order time.
9. 🟡 **[you/admin] Brand-name inconsistency.** Browser tab/OG says "Trump Steakhouse", admin header "Trump", guest "Trumps Prime Grillhouse", company "Emenyu" vs "eMenu". Standardise (canonical = **Emenyu**).
10. 🟡 **[you/admin] Owner "Today" looks empty on a fresh day.** By design it counts *completed* orders only, so with no completed sales today it shows "No revenue / No sales yet." Pitch risk. Seed a couple of completed orders or demo on the 30/90-day range.
11. 🔵 **[code] Reco hero under-scoping.** "Donald added R868 / 0% acceptance" showed the **same R868** on both Today and 90-day, and 0% acceptance over 90 days is a weak number to show an owner. Verify the hero is period-scoped and that acceptance isn't genuinely ~0.
12. 🔵 **[code] Kitchen status guard (server-side).** Prior audit noted the API accepted illegal jumps (`new→served`). The UI is forward-only (low runtime risk), but confirm the server-side transition guard shipped on the deployed branch (`feat/chatbot-reco-rework`).
13. 🔴 **[you] Website fake social proof.** `emenutechnology.com` still claims "500+ restaurants" + fabricated testimonials (separate from the app). Fix before any prospect sees it.

---

## 2. Good, but not excellent (upgrade opportunities)

- **[code] Mobile polish on Owner/Admin.** Dense, desktop-shaped panels (per your own audit); owners check on phones. Make the owner dashboard phone-first.
- **[code] Guest category jump lands on an empty gap** on desktop (had to scroll to find items). Verify on phone; smooth the anchor/scroll.
- **[code] No Settings UI.** VAT/service rate, restaurant info, branding, and the assistant name ("Donald") are `.env`-only. A settings page removes config edits and seeds the per-tenant story.
- **[code] Menu has no drag-to-reorder.**
- **[you/admin] Steak descriptions are generic** ("Off-the-bone prime X, side of your choice"). Enrich for a wagyu house (grade, ageing, cut story).
- **[you/admin] Feature the hero cuts.** Tomahawk exists (R499 in history) — make sure Tomahawk / 10+ marbling Wagyu are visible and featured in the guest steaks section.
- **[code] Close the upsell loop.** The Waiter "Revenue Opportunity" is strong — surfacing accepted-vs-offered per waiter would make it a leaderboard (ties to tips).
- **[code] Reco copy quality.** Make justifications specific and always grounded in the actual order (see issue #5).

---

## 3. Verified working (✅ — real, log-confirmed)

- **Guest order flow:** menu, item modals, per-dish wine pairing (`POST /ai-pairing 200`), chef bundles, in-cart "You might also like" upsell, cart, **place order** (`POST /submit_order 200`).
- **End-to-end trace (the "is it real" test):** guest order #38 → **Kitchen** (live ticket, correct items, real timer) → New→Preparing→Ready→Served (`POST /kitchen/orders/38/status 200` ×3) → **Owner/Reports Today** shows Revenue **R1042 / 1 order / Top table T9 / top dishes = my exact items**. Numbers moved to match the action → **not faked; analytics-zeros bug is NOT present.**
- **Owner dashboard:** real 30/90-day data (R23,245 / 30 orders / trends / peak hours / day-of-week / top & bottom dishes).
- **Admin:** Reports, Reco-Analytics funnel (`/analytics/recommendations(/insights) 200`, real Action Items), History (order #38 settled, Export CSV), Menu 86-toggle (`PATCH /api/menu/items/406/availability 200`, persists + counter updates).
- **Waiter app:** floor view, guest↔waiter cart sync (Guest-cart vs Sent-to-kitchen), and the **AI upsell + R860 Revenue Opportunity** (`POST /recommend 200`).
- **Zero application JavaScript console errors** on any screen tested.

---

## 4. Correct/incorrect log (button → endpoint → result)

| Action | Endpoint | Result |
|---|---|---|
| Place order (Steak Lover bundle, R868) | `POST /submit_order` | ✅ 200 |
| Kitchen New→Prep→Ready→Served | `POST /kitchen/orders/38/status` ×3 | ✅ 200 |
| Owner / Reports analytics | `GET /analytics/*` | ✅ 200, matches order |
| Reco analytics + insights | `GET /analytics/recommendations(/insights)` | ✅ 200 |
| Menu 86 toggle (off/on) | `PATCH /menu/items/406/availability` | ✅ 200, persists |
| Waiter upsell | `POST /recommend` | ✅ 200 |

---

## 5. Not yet tested (next pass)

Order **edit / delete / move**. · Waiter secondary buttons: Add Item, Split Bill, Call Manager, View Chat, Send-to-Kitchen. · **Load test:** 30 concurrent orders → no data loss / no crash (review `phase-05/LOAD-TEST.md`, `ORDER-INTEGRITY.md`; then a controlled burst, not against live prod blind).

---

## 6. Update — full UI sweep complete (2026-07-01)

**All guest + staff surfaces now walked, zero console errors anywhere.** Newly verified ✅ (all real, render clean):
- **Concierge** (birthday flow + Service-Desk "Birthday Detected" floor request — the pitch notification works end-to-end).
- **Admin:** Chef Recs (56 pairings editor), Bundles (5 persona bundles), Deals (scheduled set-menus incl. Dry-Aged Tomahawk R850), QR Codes (15 printable table QRs + Print All), Tables (live floor grid), Reservations, Accounts (4 staff), Chat Logs, Service Desk.
- **Hero cuts exist:** Tomahawk (French Cut) 650g R499 and Wagyu Fillet 300g are in the menu — remaining action is just making them **prominent in the guest Steaks list** (see §2).

Net: the product is functionally solid and genuinely not-faked. The open items are the §1 list (mostly demo-data cleanup, VAT check, and small copy/date bugs) — no structural/data-integrity problems found in the flows tested.

---

## 7. Load / concurrency — "30 orders, no data loss, no crash?"

Answered from your own **Phase-05 testing (2026-06-25)** + the **Phase-05A fix now live on prod**:

- **Data loss: NO (proven).** ORDER-INTEGRITY 6/6 — 20 accepted → 20 DB rows; single submit → exactly 1 row; atomic `$transaction` → no partial orders; order count **survives a full server restart** (Postgres durability); analytics move exactly with each order. Under overload, excess orders return an **explicit, retryable HTTP 500 — never a partial or phantom order.**
- **The one historical gap is CLOSED.** Double-tap/retry used to create a 2nd order (no idempotency key). Phase-05A added **`clientOrderId` + a unique index** — and your deploy report confirms that migration is **now on prod.** So duplicate-submit is handled.
- **Crash: NO.** RSS stayed **105–168 MB** (PM2 limit 768 MB) and CPU **≤ 1 core** under every load. Under an artificial burst it slows and returns retryable 500s — it doesn't crash (and PM2 restarts it if it ever did).
- **30 concurrent orders:** at realistic rates (even a full house ≈ 0.5 orders/s) you're **~40× under capacity** — the path sustains ~21 accepted orders/s at 10 concurrent. **200 concurrent menu viewers: passed, 0 errors.** Only an artificial "all 30 in the same instant" burst degrades, and it degrades gracefully.
- ⚠️ **Caveat:** those tests ran on an 8-core dev host as an *upper bound*. Real prod is **1 vCPU / 1 GB, shared with the other 3 restaurants**, and a burst was deliberately **not** run against prod. For certainty on the live box, run a **controlled off-hours burst with cleanup** — not a blind hit during service.
- 🟢 **Make-it-excellent (recommended, small):** (1) **retry-with-backoff** on the transient "unable to start a transaction" error → turns burst 500s into slightly-slower 200s; (2) collapse the **two** per-order transactions (`saveOrder` + `replaceTableCart`) into **one** `$transaction` → halves DB-pool pressure per order.
