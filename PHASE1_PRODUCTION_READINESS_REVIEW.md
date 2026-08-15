# Production Readiness Review — Trump Restaurant, Phase 1 (Recommendation Brain)

**Reviewer role:** Independent Principal Engineer (did not implement Phase 1)
**Scope:** The 11 files declared in the Phase 1 change set (recommendationScoring.js [new], aiService.js, opportunityService.js, intentClassifier.js, chatSession.js, recommendationRules.js, waiterApiController.js, client types, two validate scripts).
**Method:** Static review of current code vs. `backups/phase3-baseline`, cross-checked against the two validation harnesses and the React client that calls these APIs.
**Constraint:** Live/dynamic testing was NOT possible this session — the sandboxed terminal is down (EXDEV mount failure) and the dev server is still running the pre-Phase-1 build. All findings below are from code inspection and are marked where a runtime test is needed to confirm.

---

## 1. Executive Summary

**Production Readiness Score: 58 / 100**

The architecture is sound and the headline claim holds: there is exactly **one** Recommendation Brain (`recommendationScoring.js`), it is pure/deterministic/testable, and the old duplicate probability heuristic in `opportunityService` was correctly deleted. Core transactional flows (ordering, checkout, cart, kitchen, auth) are **not touched** by any Phase 1 file, so regression risk to the money path is low.

However, this phase is **not ready to demo as an AI showcase**, for four reasons:

1. **An allergy-safety feature that can fail open.** The "hard allergy exclusion" is a substring match between the guest's stored allergy words and item text, and it *keeps* allergen items when every candidate matches. In fine dining this is a liability and a credibility landmine.
2. **The dessert-promotion / "priority" feature does not actually do what the brief says** — it is mathematically dominated by price and is "proven" only by a test that feeds the engine confidence values it can never produce.
3. **The "don't repeat an ignored suggestion" feature is dead in the real client** — the browser sends chat history in a shape that makes the cooldown永 evaluate to "nothing ignored," yet a unit test passes because it hand-builds a different history shape.
4. **None of the new intelligence is rendered in the UI.** Confidence, expected value, replacement and occasion are API-only. There is nothing to show on screen without opening DevTools.

Nothing here crashes, and every change is additive/backward-compatible. But the features that are the *point* of the phase are variously unsafe, ineffective, invisible, or silently non-functional — and a green test suite is masking two of those. That combination is why the score is a 58 and the recommendation is to hold.

---

## 2. Critical Issues (MUST fix before any demo/deploy)

### C1 — Allergy "hard exclusion" fails open (SAFETY)
`recommendationScoring.isAllergyMatch()` (lines 56–67) matches by `haystack.includes(term)` where `term` is the guest's raw allergy word. Two independent failure modes:

- **Vocabulary mismatch → allergen slips through.** Guest allergy stored as `"shellfish"` will **not** match an item named *"Garlic Prawns"* unless the item's `allergens`/`searchText` literally contains the substring `"shellfish"`. Safety is entirely dependent on the menu data using the *exact same words* as the guest record. Mismatched vocabulary silently fails open.
- **All-match fallback → allergens shown deliberately.** `aiService.js` lines 1261–1263: `const safeKept = finalKept.filter(!allergyMatch); if (safeKept.length) finalKept = safeKept;`. If *every* surviving candidate matches the allergen, the filter is discarded and the allergen items are returned. This directly contradicts the summary's claim that "an allergy/avoid match never surfaces, regardless of how well it otherwise scores."

The unit test (`phase3-validate.js` lines 264–269) only checks `isAllergyMatch()` on two hand-picked items whose text already contains the allergy word — it never exercises the fail-open fallback or a vocabulary mismatch. **This is the single biggest blocker.** For a premium fine-dining pitch, an allergy feature that can recommend an allergen must not ship.

### C2 — Occasion prompt hijacks unrelated replies (DEMO-VISIBLE)
`aiService.chat()` lines 601–611 prepend *"Are you celebrating something tonight?"* to `responseData.reply` on **every** branch whenever the last cart line is sparkling/Champagne — including hours questions, allergy answers, and the off-topic decline. Result: *"Are you celebrating something tonight? Ha — that one's a little beyond my table…"* This is a non-sequitur that a restaurant owner will notice immediately in a demo. The prompt must be gated to recommendation/pairing branches, not blanket-prepended.

---

## 3. High Priority Issues (SHOULD fix)

### H1 — "High-value dessert outranks low-value wine" is not real; priority is not enforced
Re-rank key is `finalScore = expectedValue × tierWeight` (`recommendationScoring.js` line 154). `tierWeight` ranges only 0.7–1.0, while `expectedValue` scales with price (often 5–10× across items). With the fixture in `phase3-validate.js` the promoted dessert weight computes to **0.75** vs wine **1.0** — a 0.05 nudge that cannot overcome a price gap. The "proof" in `phase3-validate.js` lines 295–299 hand-feeds confidences of `0.05` and `0.8`, but `baseConfidence()` has a **floor of 0.5** and never emits 0.05. With real confidences the R450 wine (EV ≥ 225) buries the R55 dessert (EV ≤ 44) every time. Net: the requested strict priority **Wine → Main → Side → Dessert** is not implemented as a priority, and dessert promotion is cosmetic. Either enforce tier as a real ordering key or stop advertising the capability.

### H2 — "Ignored suggestion" cooldown is dead in production (false-green test)
`chatSession.hasNewerUserMessageSince()` (lines 35–41) only returns true when history ends with a message *after* the last assistant turn. But the client (`ChatPanel.tsx` lines 70–74) builds `history` from the **stale `messages` closure** *before* the new user turn is appended (`setMessages` is async), and sends the current turn separately as `message`. So the history the server sees always ends with the last **assistant** message → `hasNewerUserMessageSince` is always false → `ignoredNames` is always `[]`. The feature never activates. The unit test `chat-validate.js` lines 103–109 hand-builds a history array ending in a *user* message — a shape the client never produces — so it passes. Requested behavior ("ignored recommendations are respected / no recommendation spam") does not work end-to-end. Fix the client to include the current turn, or derive "ignored" from the separately-sent `message`, and change the test to use the real payload shape.

### H3 — Replacement logic is scoring-only, flags too eagerly, and can go negative
- **No execution.** Nothing in the order flow performs a swap. Accepting a "replacement" recommendation adds a full-price line, so the reported `netRevenueIncrease`/`expectedValue` (the *delta*) corresponds to no actual action. The metric under-states the real bill change.
- **Over-flagging.** `aiService.js` lines 1238–1243 mark **every** same-kind beverage candidate as `isReplacement` when any same-kind drink is in the cart — not genuine upgrades. It is "same kind present," not "upgrade."
- **Negative EV.** `netRevenueIncrease` (scoring line 101–105) is `candidatePrice − targetPrice`, which is **negative** for a cheaper same-kind pour. `opportunityService` (lines 53–61) will then report `hasOpportunity: true` with `potentialBill < currentBill`, i.e. coach the waiter to "swap" to a cheaper wine at negative expected value. Clamp at the source and suppress non-positive-EV replacements.

### H4 — Heuristic confidence is presented to staff as an empirical statistic
`waiterApiController.postCoach()` line 112–114 renders: *"Guests ordering like this take the {name} about {confidence×100}% of the time."* `confidence` is a source-tier heuristic (0.5–0.92), not an observed take-rate. Telling waiters — and, in a demo, owners — a fabricated "% of the time" is indefensible if anyone asks "is that a real number?" Relabel as a confidence indicator, or compute an actual historical take-rate.

---

## 4. Medium Priority Issues (can fix shortly after)

- **M1 — Fragile occasion trigger.** `celebratoryOccasionPrompt` (aiService 619–633) only fires when the sparkling wine is the *last* cart element (`cart[cart.length-1]`); adding anything after it suppresses the prompt. It also won't recognise an occasion already stated in a *prior* turn (only checks the current turn's intent plus whether it literally asked before).
- **M2 — Partly-dead `occasionDetail`.** `business_dinner` and some `sports_night` phrasings (e.g. "match night") set `occasionDetail` but not the coarse `occasion`, so `intent.type` never becomes `occasion`/`attribute`, so `intentLead()` (aiService 1001–1002) never runs for them. Those lead-ins are unreachable.
- **M3 — `this.logger` is never assigned** in the `AiService` constructor (lines 351–377). Every `this.logger?.debug?.(…)` in the file (cache-refresh failure, cache-warm failure) is a silent no-op. Cache/DB failures are swallowed with zero observability. (Note: `reco_safety_dropped` in `recommendationRules` uses a *different*, injected logger and does work.)
- **M4 — Cache resilience & cluster coherence.** On sustained producer failure the stale entry keeps a past `expiresAt` and resets `refreshing=false` each call, so **every** request spawns a fresh background refresh (a refresh storm against the DB/FS during an outage). Under PM2 cluster mode, `invalidateCaches()` only clears the worker that handled the write — other workers serve stale menu/recs for up to the 30s TTL, so a menu/price edit mid-demo can show inconsistently.
- **M5 — Redundant / un-primed compute.** `findReplacementTarget` runs twice per beverage candidate (flag at 1241 + inside `scoreCandidate` at 144). `warmCaches()` does not prime `tierWeights`, so the first post-boot recommendation pays the O(orders) attach-rate scan inline.

---

## 5. Low Priority Improvements

- **L1** Beverage-kind logic is duplicated in three places (`classifier.beverageKind`, `recommendationScoring.beverageKindOf`, `recommendationRules.bevKindOf`). Consolidate to the classifier.
- **L2** `itemsInText`/`normalizeName` substring matching can false-positive on short item names embedded in longer words (affects anchor and ignored detection).
- **L3** One `intentLead` string (aiService line 998) uses a non-ASCII curly apostrophe while its siblings use ASCII — cosmetic inconsistency.
- **L4** `guestAdjustedConfidence` makes favourite and VIP boosts mutually exclusive (early return), so a VIP's favourite gets +0.15, not +0.20. Minor, but likely unintended.
- **L5** Naming/phase confusion: this work is called "Phase 1," but the scripts and backups are "phase3" (`phase3-validate.js`, `backups/phase3-baseline`). This will bite whoever does a rollback under pressure.
- **L6** All new fields (confidence/EV/replacement/occasion) are declared in client types but never rendered — see §7.

---

## 6. Architecture Feedback

**Strong.** The core design decision — a single, pure scoring module consumed by both `aiService.recommend()` and `opportunityService` — is correct and cleanly done:

- **Single source of truth: CONFIRMED.** `recommendationScoring.js` is the only place confidence, expected value, replacement, and tier weights are computed. `opportunityService` reads them off the best candidate (lines 51–63) instead of recomputing; its old lookup-table probability is gone. No duplicate EV or confidence math exists.
- **Dependency injection** is respected (config/logger/services passed in; no new singletons).
- **Testability** is good at the unit level — the pure functions are exercised directly with no DB/server.
- **Chef-first invariant preserved:** chef candidates are partitioned out and pinned ahead of the re-ranked tail (aiService 1275–1279).

**Weaknesses.** (a) `scoreCandidate` returns both API-facing fields and an internal `finalScore`, mixing surface and ranking concerns. (b) The "brain" scores candidates but does **not** own priority in the way the spec describes (H1). (c) `isReplacement` is set in the pipeline by a heuristic that doesn't match the "upgrade" language (H3). (d) Integration is untested — every failure in §2–§4 lives in the seams *between* the well-tested pure functions and the pipeline/client that calls them.

---

## 7. Performance Feedback

Caching strategy is reasonable: menu context, admin/chef recs, popularity, and tier weights are memoized with a 30s stale-while-revalidate TTL, and the popularity `resolveName` memo (aiService 1607–1616) is a genuine improvement that keeps the O(orders) scan off the hot path. Concerns, in order:

1. **Refresh storm on failure** (M4) — unbounded background refreshes while a dependency is down.
2. **Cluster cache divergence** (M4) — per-worker caches + single-worker invalidation.
3. **Cold-start spike** (M5) — `tierWeights` not primed; first request pays for it.
4. **Double replacement computation** (M5) — minor CPU waste per beverage candidate.

No N+1 query patterns were introduced; the new DB read (`guestService.getGuestIntel`) is a single bounded `findMany take:60` behind waiter auth.

---

## 8. Security Feedback

Low incremental risk. No new endpoints; all API changes are additive optional fields. No new injection surface — every new operation is local string/array manipulation, no SQL string-building, no eval, no template injection. Authorization is unchanged: guest intel flows only through the existing waiter-authed routes (`getTableIntel`, `postCoach`).

Two things to watch, neither a Phase-1 regression but both now more prominent:
- `getTableIntel` returns full guest intel (allergies, notes, lifetime spend, VIP) to the client. Confirm the waiter/manager route guard is intact (it is pre-existing; Phase 1 didn't change it).
- The **correctness** of the allergy filter (C1) is effectively a safety-security issue for this domain even though it isn't an exploit.

---

## 9. Recommendation Brain Review (against the brief's checklist)

| Requirement | Verdict | Notes |
|---|---|---|
| Only ONE Recommendation Brain | ✅ Pass | `recommendationScoring.js` only |
| No duplicate recommendation logic | ✅ Pass | opportunityService reads, doesn't recompute |
| No duplicate Expected Value calc | ✅ Pass | single `scoreCandidate` |
| No duplicate confidence calc | ✅ Pass | single `baseConfidence`/`guestAdjustedConfidence` |
| Priority Wine → Main → Side → Dessert | ⚠️ Partial | encoded as a 0.7–1.0 prior, dominated by price; not a real priority (H1) |
| EV = replacement **delta**, not full price | ✅ Pass (math) | `netRevenueIncrease` returns +R45 for R210→R255; verified in test lines 271–281 |
| EV replacement — full behavior | ⚠️ Risk | no swap execution; over-flags; negative for downgrades (H3) |
| Dessert weighting | ⚠️ Ineffective | computed (~0.75) but negligible vs price (H1) |
| Occasion detection | ⚠️ Partial | classification works; trigger fragile + some details dead (C2, M1, M2) |
| Guest-aware scoring | ⚠️ Mixed | favourite/VIP boosts work; **allergy exclusion unsafe (C1)** |
| Recommendation explanations | ✅ Pass | reasonComposer unchanged, never blank |

**Chatbot checks:** Champagne → celebration prompt fires (but misfires across branches, C2). Beer → burger and White wine → seafood pairings are pre-existing and unchanged. "No recommendation spam / ignored respected" — **fails in the real client (H2)**.

**Waiter AI checks:** source/confidence/EV/reason are wired through from the single brain (good). Professional/luxury/casual tone lead-ins are pre-existing. "Friendly" tone does **not** exist as a distinct option (it maps to `casual`). Live updates depend on cart-change refetch (unchanged).

**Admin:** no duplicate calculations; unchanged, reads existing analytics. ✅

---

## 10. Go / No-Go Recommendation

### ⛔ DO NOT DEPLOY (yet)

This is a narrow, fixable hold — not a rewrite — but it is a hold. The blocking reasons:

1. **C1 (allergy fail-open)** is a safety and liability issue that is explicitly part of what the phase intends to demo to fine-dining owners. It must be corrected before it is shown to anyone.
2. **C2 (occasion prompt hijacking replies)** is directly visible in a demo and will read as broken.
3. **H2 + the false-green tests** mean the validation suite is currently *green while shipping a dead feature and an unsafe fallback*. Until the tests exercise the real client payload shape and the fail-open path, "all checks passed" cannot be trusted as a deploy gate.

**What turns this into a GO WITH MINOR FIXES:**
- Make the allergy exclusion a true hard filter (normalise vocabulary / map allergy → ingredient synonyms; **never** fall back to showing an allergen — return empty and defer to the waiter).
- Gate the celebration prompt to recommendation/pairing branches only.
- Fix the client to include the current turn in `history` (or re-derive "ignored" from `message`), and update `chat-validate` to the real payload shape.
- Clamp/suppress negative-EV replacements; stop labelling heuristic confidence as an empirical "% of the time."
- Either enforce tier priority as a real ordering key or drop the dessert-promotion claim.

**Reassuring context for the decision:** none of the above touches ordering, checkout, cart, kitchen, or auth — those flows carry low regression risk from this phase. The fixes are concentrated in `aiService.js` (occasion gating, allergy fallback), `recommendationScoring.js` (negative-EV clamp), one client file (`ChatPanel.tsx`), and the two test scripts. This is a few hours of focused work, not a redesign.

---

### Appendix — What still needs a *runtime* test (blocked this session)
The following can only be confirmed with the server running the new build (which needs the sandbox terminal or a manual `cd Sites/Trump && node server.js` restart):
1. Re-rank ordering on a real cart (does a plausible item actually lead?).
2. `reco_safety_dropped` volume after the R4 change (watch for a spike).
3. First-request cold latency for `tierWeights`.
4. End-to-end occasion prompt behavior with the real client cart payload.
5. That the new API fields appear on `/api/recommend`, `/api/cart-recommendations`, `/api/waiter/coach` (DevTools → Network).
