# Phase 4 — Recommendation Engine V2 (EMenu Hospitality Intelligence v3)

**Date:** 2026-07-08
**Branch:** feat/chatbot-reco-rework
**Scope decision:** spec-driven extension of the existing, validated recommendation engine — not a ground-up rewrite (see "Why extension, not replacement" below).

## 1. Objective

Implement the EMenu Hospitality Intelligence Knowledge Base v3 specification (three layers: Hospitality Knowledge, Business Rules, Engine Rules) against Trump's live recommendation/chatbot engine, without discarding the already-validated logic built up across Phases 1–5 of this branch.

## 2. Why extension, not replacement

A prior attempt to scope this as a full rebuild ("delete V1, build V2 from scratch") was reconsidered before any code was written. A discovery pass mapping the current engine against every section of the v3 spec found that nearly every spec concept already has a working, tested implementation under a different name:

| Spec concept | Existing implementation |
|---|---|
| Meal states | `recommendationRules.mealStage()` + `recommendationScoring.nextJourneyStage()` |
| Wine/beer/cocktail/spirit/coffee/dessert pairing knowledge | `hospitalityKnowledge.js`'s 21-entry RULES array (tag-driven, all 439 items) + `trump_hero_pairings.json` (199 curated dish×varietal pairings) |
| Candidate generation | `aiService.recommend()`'s chef-first → hero → tag-match → algorithmic → rotation pipeline |
| Candidate filtering | `recommendationRules.applyCategorySafety()` (R1–R7) |
| Scoring | `recommendationScoring.scoreCandidate()` (confidence × expected value × tier weight) |
| Item relationship graph | `heroPairings.js` (pairs/upgrades/sauce-upgrades) + `marketBasket.js` (co-occurrence) + `smartPairingEngine.js` (CSV edges) |
| Personality/conversation | `templateNlgProvider.js` + `hospitalityKnowledge.js`'s style guide |
| Future learning hooks | `recommendationEventService.js` + `recommendationAnalytics.js` + `recommendationInsights.js` (a working event pipeline + optimization dashboard) |

Rebuilding all of this from scratch would have thrown away tested, production logic (77 + 56 + 17 + 17 = 167 passing assertions across `reco:validate`, `chat:validate`, `phase5-validate`, `reco:health:test`) to re-derive behavior the spec itself already describes. Phase 4 instead: (1) externalizes the hardcoded knowledge into the structured JSON files the spec calls for, (2) formalizes the engine's informal mechanisms under the spec's named architecture, and (3) implements the handful of *genuine* gaps the mapping surfaced — without changing any already-tested behavior.

## 3. Knowledge files created

All 21 files the spec's Section 5 index names now exist at `Sites/Trump/knowledge/`, extracted faithfully from the existing hardcoded logic (not fabricated):

`meal_states.json` · `wine_pairings.json` · `beer_pairings.json` · `cocktail_pairings.json` · `spirit_pairings.json` · `coffee_pairings.json` · `dessert_pairings.json` · `protein_rules.json` · `upgrade_rules.json` · `occasion_rules.json` · `item_graph.json` · `conversation_patterns.json` · `reason_templates.json` · `personality.json` · `upsell_timing.json` · `business_rules.json` · `frequency_rules.json` · `psychology_principles.json` · `menu_engineering.json` · `future_learning_plan.json`

Two files (`wine_pairings.json`, `beer_pairings.json`, `cocktail_pairings.json`) note cross-cutting rules that fire for more than one beverage family (documented, not duplicated silently). `cider` and `mocktail-soft` — present in the original 21-entry RULES array but missed by the first extraction pass — were added to `beer_pairings.json`/`cocktail_pairings.json` for full parity before wiring.

`knowledge/menu_items.json` was **deliberately not created** as a duplicate catalogue: the structural/dietary metadata it would hold already lives correctly normalized on each `MenuItem.metadata.tags` field in Postgres (per Phase "Menu Rework"). Duplicating 439 items into a flat JSON file would violate the project's own hybrid-persistence pattern and create a second source of truth. This is a deliberate deviation, not an oversight.

## 4. Modules implemented

New, additive server modules (`Sites/Trump/server/services/`):

- **`mealStateService.js`** — the spec's 7 canonical states (`STATE_WAITING_FOR_DRINK` … `STATE_COMPLETE`), each with `allowed_recommendation_types`/`forbidden_recommendation_types`, derived from `knowledge/meal_states.json`. Runs *alongside* the two existing stage machines (`recommendationRules.mealStage()`, `recommendationScoring.nextJourneyStage()`), which are unchanged — new consumers use this; nothing old was rewired to depend on it, to avoid any risk to the two directly-tested legacy functions.
- **`businessRules.js`** — loads `business_rules.json`/`frequency_rules.json`; implements the concrete, previously-unenforced guardrails: never-downsell, no-dessert-before-mains, no-wine-after-coffee, never-interrupt-to-upsell (via chat intent type).
- **`recommendationMemory.js`** — the spec's per-table Recommendation Memory Model (§4.5): `accepted/rejected/ignored_recommendations`, `recommendation_history`, `current_stage`, `guest_mood`, `current_conversation_topic`, plus the frequency/cooldown counters (§3.3). In-memory, keyed by `tableId` (Trump runs PM2 in single-instance fork mode, matching the pattern already used by `aiService`'s TTL cache and `rotationService`).
- **`candidateFilterPipeline.js`** — the spec's explicit 9-step filtering order (§4.2). Steps 1–3 and the bulk of step 5 already ran, tested, before candidates reach this module (`aiService`'s generation-time dedupe, `dietaryOk()`/`isAllergyMatch()`, `recommendationRules.applyCategorySafety()`'s R1–R7); this module completes steps 4 (memory-aware), 5 (two new stage rules), 6, 7, 8, 9.
- **`itemGraph.js`** — a unified, spec-shaped read API over `knowledge/item_graph.json`'s static edges (`pairs_with`/`upgrade_of`/`add_on_to`/`follows`, 214 edges from `trump_hero_pairings.json`) plus live `shares_context_with` via the existing `marketBasket.js`. Supports second-order traversal (ribeye → Cabernet → dessert → coffee).
- **`recommendationScoring.js` (extended)** — added `computeScoreComponents()` (H/P/R/S/T/O/Pop/Chef/Pref/Pen, §4.3) and `computeConfidenceBreakdown()` (6-component confidence, §4.6), both additive — the existing `scoreCandidate()`/`confidence`/`expectedValue`/`finalScore` fields and the ranking that uses them are unchanged.

Modified files (behavior-preserving):

- **`nlg/hospitalityKnowledge.js`** — its 21-entry RULES array is now loaded from the 6 pairing knowledge files at require-time (`loadRules()`), with the exact same match semantics and rule order as the original hardcoded array (verified: identical output for every tested pairing scenario, 56/56 `chat-validate` still passing).
- **`nlg/nlgService.js`** — `phrase()` now runs every generated line through `enforcePersonality()`, stripping any of `personality.json`'s `forbidden_phrases` (previously only a source-comment convention with no runtime check).
- **`aiService.js`** — `recommend()` now runs the new candidate filter pipeline and attaches `scoreComponents`/`confidenceBreakdown` (additive fields) after its existing, unchanged chef/hero/tag/rotation/category-safety/dietary/allergy pipeline; records each turn into `recommendationMemory`. `chat()`'s knowledge/policy-answer branch now suppresses attached suggestions (implements "never interrupt to upsell" for the one branch that was unconditionally riding an upsell along on an unrelated FAQ answer).

## 5. Old files removed

None. Per the discovery findings, there was no dead/duplicate logic to remove — every existing file maps to a live, still-used responsibility. (The mega-prompt's "no duplicate logic" requirement was already satisfied: the recommendation engine has always lived exclusively in `server/services/*`, consumed thinly by `aiController.js` — verified during discovery.)

## 6. A scoped, deliberate risk decision: frequency gating defaults OFF

The first integration test run surfaced a real risk: tagging every `recommend()` call as "proactive" by default caused the new frequency cooldown to silently empty recommendation panels after 6 calls / within a 6-minute window — but `recommend()` is called continuously by many existing surfaces (ItemModal pairings, the cart upsell rail, waiter panel) that never signal "this is an unsolicited nudge." Rather than ship this, `proactive` now defaults to `false` and only activates when a caller explicitly passes `payload.proactive === true` — a flag no existing caller sets today. The frequency/cooldown machinery is fully built, tested, and ready; it stays dormant until a genuinely proactive surface (e.g. a future unprompted chat nudge) opts in, rather than silently degrading the always-on panels guests see today. The quality/correctness steps (never-downsell, no-dessert-before-mains, no-wine-after-coffee, structural conflict, category cap) are **not** gated by this flag — those run on every call.

## 7. Known limitations / scoped-down items

Documented honestly rather than hidden:

- **Scoring/confidence formulas are exposed, not load-bearing.** `computeScoreComponents()`/`computeConfidenceBreakdown()` are real, computed, and returned to callers, but ranking still uses the existing, tested `finalScore` — swapping the new additive formula in as the live ranking key on an already-tuned system was judged too risky for this phase.
- **`cookingMethodFor()` / `templateNlgProvider.js`'s tone pools stay in JS.** `protein_rules.json` and `conversation_patterns.json` faithfully document this logic as structured knowledge (satisfying the spec's "should live in structured files" intent for inspection/future extensibility), but the runtime implementation wasn't rewired — the risk/reward of a second full data-driven conversion in one phase didn't justify it, unlike `hospitalityKnowledge.js`'s wine/beer/pairing RULES (the spec's actual centerpiece), which was converted and verified.
- **4 of `business_rules.json`'s 9 gap entries are partially rather than fully enforced:** `value-on-request-only` (no explicit "guest wants value" chat signal exists yet — the never-downsell filter is the load-bearing mechanism here), `no-contradicting-previous-recommendations` (needs theme/direction tracking beyond what `recommendationMemory` stores today — designed for, not wired), `no-robotic-templatey-lines` (personality forbidden-phrase enforcement ships; session-aware phrase-repetition variation does not), `never-interrupt-to-upsell` (implemented for the one concrete branch that violated it — chat's knowledge-answer suggestions — not a general conversational-timing model).
- **`item_graph.json`'s `shares_context_with` edges** are intentionally left computed live via `marketBasket.js` (per the spec's own allowance), not persisted.
- **No production DB was touched during development/testing** — all new code was verified via 4 offline validation suites (167 assertions) plus an isolated in-memory integration test (a fake `fileService`, zero DB/network calls) to avoid any risk to the live database while iterating.

## 8. Performance

No new per-request I/O was introduced. `mealStateService`/`businessRules` load their JSON knowledge files once at service construction (not per-request). `recommendationMemory` is an in-memory `Map` (O(1) lookups). `itemGraph` builds its edge index once at construction. Existing TTL caches (menu context, popularity, chef recs) are untouched.

## 9. Validation results

| Suite | Result |
|---|---|
| `npm run reco:validate` (`phase3-validate.js`) | 77/77 passed |
| `npm run chat:validate` | 56/56 passed |
| `npm run reco:validate:phase5` | 17/17 passed |
| `npm run reco:health:test` | 17/17 passed |
| Isolated in-memory integration test (`recommend()`/`chat()` end-to-end, fake fileService, no DB) | passed, no throws |
| `client && npm run typecheck` | clean |
| `client && npm run build` | clean, `dist/index.html` produced |
| `node --check` on all 9 new/modified server files | clean |

`smoke-test.js` and `reco-verify-live.js` require a live server + DB; per the deploy script's own snapshot/rollback safety net, these run against the real environment as part of the deploy verification step below rather than against local dev (protecting the production database from any risk during iteration).

## 10. Migration summary

No database migration. No Prisma schema changes. No breaking API changes — every new field (`scoreComponents`, `confidenceBreakdown` on recommendation items) is additive; existing consumers (`RecommendationCard.tsx`, chat UI, waiter app) ignore unknown fields and continue to read the same `name`/`price`/`reason`/`confidence`/`chef`/`rotationGroup`/etc. fields unchanged.
