# Phase 1 — Recommendation Brain (v1)

**Status:** Implementation complete, locally validated. **Not deployed.** Awaiting operator approval per standing instruction ("Wait for my approval before deployment. Do not begin Phase 2 automatically.").

**Branch:** `feat/chatbot-reco-rework` (uncommitted — no commit made this phase; user commits explicitly when ready).

**Scope discipline:** `luxury/` untouched. Greek/Imli/AlPescatore untouched. No credential rotation. No multi-tenant/`restaurantId` changes. No UI redesign (only TypeScript types extended; zero JSX/CSS layout changes). No Demo Mode / fake data created. No database migration.

---

## 1. Features completed

Trump's recommendation logic was already spread across ~10 cooperating services rather than duplicated — Phase 1's job was to close five concrete gaps by **extending that pipeline in place**, not building a parallel system. `aiService.recommend()` remains the single function every surface calls.

| Brief requirement | What was built |
|---|---|
| **Confidence Score** | New `recommendationScoring.baseConfidence()` — deterministic 0–1 score from the candidate's existing source tier (chef 0.92, hero 0.9, tag-match 0.8, perfect-pairing 0.72, course-completion 0.62, popular 0.5), nudged by guest-favourite match (+0.15) / VIP (+0.05). Replaces the old `opportunityService.probabilityFor()` heuristic (deleted, not duplicated). |
| **Expected Value Calculation** | `expectedValue = confidence × netRevenueIncrease`, computed per candidate inside `aiService.recommend()` and returned on every recommendation object (`confidence`, `expectedValue`, `netRevenueIncrease`). |
| **Replacement Logic** | `recommendationScoring.findReplacementTarget()` matches a candidate against the cart by `categoryType`/`beverageKind` (via the existing `categoryClassifier`). A same-role match reports **only the price delta** (verified against the brief's own example: Wine A R210 → Wine B R255 = **+R45**, not +R255); a pure add reports full price. |
| **Recommendation Priority (Wine>Main>Side>Dessert) + intelligent dessert promotion** | `tierWeights()` computes real course attach-rates from order history and sets Wine=1.0/Main=0.9/Drink=0.85/Starter=0.8/Dessert=0.7 as a base, then promotes Dessert's weight toward parity when it is measurably under-ordered vs the other courses. Final ranking = `expectedValue × tierWeight` — a prior, not a hard gate ("AI may skip stages"), so a high-EV dessert can outrank a low-EV wine. **Chef recommendations keep their pre-existing "always wins" position** — only the non-chef tail is re-ranked by this formula. |
| **Guest Analysis** | `guestService.getGuestIntel()` already existed but wasn't wired into scoring. Now `aiService.recommend()` accepts an optional `guestIntel` param: favourites boost confidence, allergies/avoids are a **hard exclusion** (never surfaced, regardless of score). |
| **Chef Recommendation Integration** | Unchanged (already the strongest existing layer) — chef candidates still score 1000+, still bypass the course-stage rule, and now also carry confidence/expectedValue like every other candidate. |
| **Recommendation Explanation** | Unchanged — `reasonComposer.pairingReason()` (hero → chef → NLG → never-blank fallback) is still the one copy source for cards, chat, and waiter. |
| **Occasion / Celebration / Birthday / Anniversary / Graduation / Business Dinner / Sports Night / Date Detection** | `intentClassifier.js` gained `OCCASION_DETAIL_MAP` — 6 specific buckets (`birthday`, `anniversary`, `graduation`, `business_dinner`, `sports_night`, `date`) plus a generic `celebration` fallback, layered **additively** on top of the existing coarse `occasion` bucket (which is unchanged, so the existing tag-match/archetype consumers are unaffected). Exposed as `slots.occasionDetail`. |
| **Chatbot uses the Brain** | `intentLead()` now gives a specific lead-in per occasion detail (e.g. "Happy birthday to someone at the table —", "Congratulations on the anniversary —"). New `celebratoryOccasionPrompt()`: when the cart's most-recently-added item is a sparkling/Champagne wine and no occasion has been stated or already asked (derived from `history`, no new state), the chat reply asks **"Are you celebrating something tonight?"** — the brief's own example, verified end-to-end. |
| **"Only one recommendation at a time, wait if ignored"** | `chatSession.build()` now derives `ignoredNames` purely from `history` (the assistant's last-turn suggestions the guest didn't add to cart and moved past) — no new persistence. `recommend()` accepts `excludeNames` and skips those for the current turn. |
| **Waiter AI consumes the Brain** | `opportunityService.getOpportunity()` no longer computes its own probability — it reads `confidence`/`expectedValue`/`netRevenueIncrease`/`replacement` straight off `aiService.recommend()`'s already-scored output. `waiterApiController.getTableIntel`/`postCoach` now fetch `guestIntel` first and pass it into `getOpportunity()`, so favourites/allergies affect the waiter's coaching too. `postCoach`'s response gained `expectedValue`/`replacement` fields. |
| **Admin** | No changes — admin already only reads what `recommendationEventService`/`recommendationBundleService` return; there was no duplicate scoring there to fix. |
| **Recommendation Lifecycle / Caching** | Unchanged, reused: `aiService._cached()` TTL + stale-while-revalidate; a new `getTierWeights()` cache entry follows the same pattern as `getPopularity()`. |
| **Shared Cart Analysis / Live Refresh** | Verified, not changed: cart is passed per-request (never cached), so every recommend() call is already live against the current (multi-guest-synced) cart. |

### A bug found and fixed along the way

Building the integration check (see Testing below) surfaced a real interaction problem: category-safety rule **R4** ("no drink → same-kind drink") was written to stop beverage *pile-up* (the original Phase-2 audit bug), but it also silently blocked a legitimate same-kind *replacement* (a wine-upgrade candidate), because R4 can't tell "adding a second wine" apart from "swapping the existing wine." Fixed in `recommendationRules.js`: candidates the engine tags `isReplacement: true` (set in `aiService.recommend()` via `findReplacementTarget()`, beverage candidates only) now pass R4 and don't consume the R1 beverage cap — but **R2 (never wine+cocktail) and R3 (no secondary headline) are still fully enforced**, replacement or not, since those protect what ends up on the table, not how it got there. Covered by 3 new regression tests (including one that intentionally proves `isReplacement` does *not* bypass R2).

---

## 2. Files modified

| File | Change | Lines |
|---|---|---|
| `server/services/recommendationScoring.js` | **New.** Confidence, replacement-aware EV, tier weights — pure functions, no candidate generation (that stays in `aiService.recommend()`). | +177 |
| `server/services/aiService.js` | `recommend()` wired to guestIntel/scoring/tier-weighted re-rank (chef-first order preserved); `chat()` wired to `excludeNames` + occasion lead-ins + cart-signal occasion prompt; `cartRecommendations()` passes guestIntel through and uses replacement-aware `upsell`. | +113/−10 |
| `server/services/opportunityService.js` | Deleted its own `probabilityFor()`; now reads confidence/expectedValue/replacement off `aiService.recommend()`'s output. | +39/−41 (net −2, but restructured) |
| `server/services/intentClassifier.js` | Added `OCCASION_DETAIL_MAP` + `slots.occasionDetail`, additive alongside the existing `slots.occasion`. | +19/−1 |
| `server/services/chatSession.js` | Added `lastAssistantSuggestions()`/`hasNewerUserMessageSince()` → `ignoredNames` in `build()`'s return. | +32 |
| `server/services/recommendationRules.js` | R4/R1 exception for `isReplacement`-tagged beverage candidates; R2/R3 untouched. | +20/−5 |
| `server/controllers/waiterApiController.js` | `getTableIntel`/`postCoach` fetch guestIntel before (not alongside) `getOpportunity()`; `postCoach` response gained `expectedValue`/`replacement`. | +17/−10 |
| `client/src/types/waiter.ts` | Additive optional fields (`confidence`, `expectedValue`, `netRevenueIncrease`, `replacement`) on `CartRec`, `SuggestedItem`, `Opportunity`, `CoachResponse`; new `RecommendationReplacement` type. | +20 |
| `client/src/components/reco/RecommendationCard.tsx` | Same additive optional fields on `RecommendationItem` — typed, **not yet rendered** (no UI redesign this phase). | +10/−1 |
| `scripts/phase3-validate.js` | New group 5 (23 checks): confidence bands, guest boost, allergy exclusion, replacement math (brief's own R210→R255 example), EV math (brief's own R22.50/R44 example), dessert promotion, R4/R2 replacement-interaction regressions. | +121 |
| `scripts/chat-validate.js` | 8 new occasionDetail checks + new group 4b (3 checks) for the ignored-suggestion cooldown. | +36 |

No changes to: `prisma/schema.prisma`, any admin controller/component, `Sites/Greek|Imli|AlPescatore`, `luxury/`, any `.css`/layout file.

---

## 3. Database changes

**None.** `confidence`/`expectedValue`/`netRevenueIncrease`/`replacement` are computed per-request and returned in the API response only — they are not persisted onto `RecommendationEvent` (that table's columns are fixed; adding to it would require a migration, which this phase deliberately avoided to stay additive). Persisting these for historical analytics/trend reporting is a natural, low-risk follow-up if a later phase wants it (a JSON-in-`metadata` approach could even avoid the migration).

---

## 4. API changes (additive only — no breaking changes, no new endpoints)

- `POST /api/recommend`, `/api/cart-recommendations`, `/api/ai-pairing`, `/api/chat` — every recommendation object now carries `confidence`, `expectedValue`, `netRevenueIncrease`, `replacement` (object or `null`) in addition to existing fields.
- `GET /api/waiter/tables/:tableId/intel` (`getTableIntel`) and `POST /api/waiter/coach` (`postCoach`) — `opportunity`/response now carries `expectedValue` and `replacement`; `probability`/`successRate` and `increase`/`expectedRevenue` are now sourced from the brain's own confidence/replacement math (previously a separate, less accurate heuristic).
- No request shape changed for existing callers — `guestIntel`, `excludeNames` are optional additions; omitting them reproduces the prior behavior exactly (verified: no guestIntel → confidence bands unaffected by the guest-boost code path, which short-circuits on `!guestIntel.present`).

---

## 5. Bugs fixed

1. **Waiter "potential uplift" reported the full new-item price even when it was a same-role swap** (e.g. suggesting a pricier wine already implicitly assumed the cheaper one wasn't already ordered) — `cartRecommendations()`'s `upsell` and `opportunityService`'s `increase`/`expectedRevenue` now report the replacement-aware delta.
2. **R4 category-safety rule blocked legitimate same-kind beverage upgrades**, not just unwanted pile-up (see "A bug found and fixed along the way" above) — found via this phase's own integration test, fixed with 3 new regression checks protecting both the fix and the original R1–R4 guarantees.

---

## 6. Known issues / limitations

- **Occasion prompt surfaces only through the customer chatbot's `reply` text** (which already renders in `ChatPanel` today) and the waiter's `cartRecommendations()` script line — there is no new dedicated UI element for it, per "Do NOT redesign UI." A future UI phase could give it a distinct visual treatment.
- **Confidence/expectedValue are not yet visually surfaced anywhere** — types are wired end-to-end so a future phase can render them without further plumbing, but no card/panel displays them yet (explicitly deferred; the brief's Phase 4 "Premium UI + Polish" is the natural place).
- **Replacement detection is same-`categoryType`/`beverageKind` matching, not dish-level intelligence** — e.g. it will treat any two WINE items as potential swaps for each other; it does not (yet) reason about which specific bottle a guest is most likely trading up from when the cart holds several wines of different kinds within the same beverage category. Acceptable for v1 given carts typically hold at most one active beverage (enforced by R1).
- **Dessert-promotion weight is recomputed from live order history each cache cycle** — on a brand-new venue with little order history, the "under-ordered" signal is weak/noisy until real order volume accrues (same cold-start caveat that already applies to the existing popularity engine).
- **Not deployed** — per standing instruction, implementation stops here pending explicit approval.

---

## 7. Testing results

| Suite | Result |
|---|---|
| `npm run reco:validate` (`scripts/phase3-validate.js`) | **68/68 passed** (was 42 before this phase; +26 new checks, including the exact +R45/R22.50/R44 worked examples from the brief) |
| `npm run chat:validate` (`scripts/chat-validate.js`) | **49/49 passed** (was 38 before this phase; +11 new checks) |
| `npm run reco:health -- --selftest` | **17/17 passed** (unaffected by this phase — confirms no regression in analytics aggregation) |
| Client `npm run typecheck` (`tsc --noEmit`) | **Clean, 0 errors** |
| Client `npm run build` (`vite build` — note: `npm run build` itself exits 1 with no output in this sandbox, a known pre-existing quirk; `node ./node_modules/vite/bin/vite.js build` gives the true result) | **Success** — 2309 modules transformed, no errors |
| Ad-hoc integration check (stub `FileService`, exercises the live, unmodified `AiService` class end-to-end — not part of the repo's test suite) | **6/6 passed**: confidence+EV present on every candidate; wine-swap reports +R45 not full price; shellfish-allergic guest never sees a shellfish dish; `chat()` runs end-to-end without throwing; Champagne cart signal triggers the occasion question; `cartRecommendations()` upsell is replacement-aware |
| `npm run reco:bench` | No regression in the CPU-path benchmarks it covers (classify/rotate/aggregate) — it does not exercise `recommend()` directly, so it's not a strong signal either way for this phase's change; the new scoring step is O(candidates × cart size), both small (~20–30 and ~5–10 respectively) |
| `npm run smoke:test` / `npm run reco:verify:live` | **Not run** — require a running server + Postgres; a dev server was already running in another console window (uptime ~32h, predates these changes) and was deliberately left alone rather than restarted without asking. See manual checklist below. |

---

## 8. Manual testing checklist (operator, against a restarted local/dev server)

- [ ] Restart the local dev server (or `npm run dev` in `client/`) so it picks up these changes, then hit `/healthz` to confirm it's up.
- [ ] Add a wine to the customer cart, then a second wine of a different bottle — confirm the recommendation strip suggests the upgrade with the *difference* reflected (check the network response's `netRevenueIncrease`, not yet shown in UI).
- [ ] Add a sparkling/Champagne wine to a fresh cart in the customer chat — send any message and confirm the reply asks "Are you celebrating something tonight?" exactly once (not on every subsequent message).
- [ ] In chat, ask "what's good here", ignore the suggestion (send an unrelated message), and confirm the next recommendation set doesn't repeat the exact same item immediately.
- [ ] As a waiter, open a table with a guest linked (favourites/allergies set) and confirm the Table Coach's suggestion respects the allergy (never suggests a shellfish dish for a shellfish-allergic guest) and leans toward a stated favourite.
- [ ] Confirm a dessert can appear as a leading suggestion when its expected value is high, even with a wine already recommended elsewhere in the session (tests the tier-weight-as-prior, not-a-gate behavior).
- [ ] Re-run `npm run reco:verify:live` and `npm run smoke:test` against the restarted server.
- [ ] Confirm the existing "DONALD RECOMMENDS" journey card, cart strip, and waiter upsell panel all still render exactly as before (no visual regression) — this phase changed no CSS/JSX.

---

## 9. Deployment checklist

- [ ] Get explicit user approval (standing instruction: do not deploy without it).
- [ ] Confirm the working tree's pre-existing uncommitted changes (media rename, in-flight component work predating this session) are handled per the user's own plan for them — this phase did not touch, stage, or interact with those files.
- [ ] Commit this phase's 11 files (10 modified + 1 new) — no DB migration to run, no `prisma generate` needed.
- [ ] Standard deploy path per `deploy-trump.sh` (rebuild client, `pm2 reload`) — no new env vars, no new npm dependencies, no schema change.
- [ ] Post-deploy: re-run `npm run reco:health`, `npm run reco:verify:live`, `npm run smoke:test` against the deployed host.
- [ ] Watch `reco_safety_dropped` debug logs briefly after deploy for any unexpected spike in R4-adjacent drops (the replacement exception is new code in a safety-critical path).
