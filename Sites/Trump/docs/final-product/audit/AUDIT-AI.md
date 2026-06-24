# AUDIT-AI.md — Phase 00 AI Audit

**Scope:** `services/aiService.js`, recommendation/pairing engines, `services/nlg/*`, `chatbotNlu`, `intentClassifier`, `knowledgeService`. **Date:** 2026-06-24.

---

## 1. Summary

Trump's "AI" is a **fully local, deterministic engine** — keyword/intent classification + order-popularity + course-completion + chef-curated rules scoring. **It makes no external LLM/API calls** (verified: no `axios`/`fetch`/`groq`/`openai`/`anthropic`/api-key usage in `aiService.js`). All customer-facing wording is template-generated (`templateNlgProvider.js`).

**Consequence for production safety:** the single biggest LLM risk — **free-text hallucination of fake menu items** — is **structurally impossible here**, because every suggestion is selected from the actual menu (`menuContext` / `fuzzyFindItem`). The real risk is narrower: **allergen/dietary advice is keyword-heuristic over a frequently-empty `allergens` field** and must not be presented as authoritative. The engine already hedges ("confirm with the waiter"), which is the correct posture.

**Verdict: production-safe as a *suggestion* engine; NOT a substitute for human allergen verification.**

---

## 2. Architecture

- **Endpoints:** `POST /api/chat` (customer chatbot), `POST /api/ai-pairing` (per-item food+drink pairings), `POST /api/recommend` (cart-level). Waiter variants: `/api/waiter/coach`, `/sommelier`, `/ask`, `cart-recommendations`, `ordered-together`.
- **Pipeline:** intent classification (`intentClassifier`, `chatbotNlu`) → branch (dietary / wine / deals / popular / pairing / general) → candidate selection from `menuContext` → safety rules (`recommendationRules`, R1–R7) → rotation (`rotationService`) → reason composition (`reasonComposer` + NLG) → response.
- **Grounding sources:** the live menu (Postgres via `prismaMenuService`/`fileService`), order popularity (`marketBasket`/order history), chef recommendations (`MenuItemRecommendation`), hero pairings (`heroPairings` / `trump_hero_pairings.json`), bundles, and a small curated `data/knowledge.json`.
- **NLG:** `nlg/nlgService.js` selects a provider; only `templateNlgProvider.js` (deterministic templates) is active — wording-only, never invents facts.

---

## 3. Hallucination risk

| Vector | Risk | Why |
|---|---|---|
| Inventing menu items | **None** | Suggestions are filtered/selected from `menuContext`; `fuzzyFindItem` maps user text to real items. |
| Wrong price/description | **Low** | Prices/descriptions read from the menu record, formatted by `formatPrice`. |
| Fabricated claims in prose | **Low** | Templates are fixed; no generative free text. |
| Recommending unavailable items | **Low** | Engine filters on menu data; verify it respects `available=false` consistently across all branches. |
| Over-confident dietary/allergen claims | **MEDIUM** | See §4. |

There is no generative model, so no prompt-injection or jailbreak surface on the customer chat. Input only steers which deterministic branch runs.

---

## 4. Allergy / dietary handling (the real risk)

- `buildDietaryReply` (aiService.js ~881): for vegetarian/vegan it keyword-matches `vegetarian|vegan|salad|halloumi|veg` in the item's search text; for allergens it **excludes** items whose `allergens`/searchText contain the user-named term (`beef, chicken, pork, lamb, seafood, gluten, egg, nuts`).
- **Limitations:**
  1. Filtering depends on `MenuItem.allergens` being populated — this field is **`""` by default** and is often empty/incomplete, so an unsafe item may pass the filter silently.
  2. Matching is **substring keyword** — no canonical allergen taxonomy, no cross-contamination awareness, no "contains traces of" logic.
  3. Vegetarian detection is a positive-keyword heuristic — will both miss veg dishes and (less often) mislabel.
- **Mitigation already in place (good):** when matches are thin it returns *"I do not see enough allergen-safe matches in the menu data. Please confirm with the waiter before ordering."*, and the generic fallback explicitly defers to the waiter on allergies. The bot does **not** assert safety.
- **Required posture for production:** treat dietary output as **discovery help, not medical guidance**. Add an explicit, always-on disclaimer on dietary replies, and (better) populate `MenuItem.allergens` properly + drive filtering from structured tags rather than free text.

---

## 5. Grounding strategy & knowledge source

- **Strong grounding:** the menu is the single source of truth; recommendations cannot reference anything not in the menu/orders/chef data.
- **Chef control:** `MenuItemRecommendation` lets staff curate pairings with reasons (chef-first scoring) — high-quality, auditable suggestions.
- **Popularity:** derived from real order history (`marketBasket`, order popularity) — grounded in actual sales.
- **Knowledge base:** `data/knowledge.json` is small/curated (no scraped/external content) — low misinformation risk.
- **Caching:** results cached and invalidated on menu/order/reco mutation (`invalidateCaches`) so suggestions reflect current menu/availability.

---

## 6. Recommendation quality

- Validated by repeatable scripts: `npm run reco:validate` (phase3, 41/41 per project memory), `chat:validate`, `reco:health` (+`:test`), `reco:verify:live`, `reco:bench`, `phase5-validate`. **Having deterministic, scripted quality gates is a real strength** — behaviour is testable and regressions are catchable, unlike an LLM.
- Prior, fixed defects (project history): multiple-beverage suggestions, dessert→starter mis-sequencing, "what's good" → tequila — addressed by the R1–R7 safety rules, `maxBeverages=1`, and stage enforcement (`reco.enforceStage`).
- Rotation prevents repetitive suggestions within a session/day.

---

## 7. Fallback responses

- Empty/low-confidence states return safe, waiter-deferring copy (e.g., *"the waiter can guide you by taste, budget, and allergies."*).
- Wine branch falls back to cellar selections if no scored match.
- Deals branch falls back to popular items when no active deal.
- No crash-to-stack-trace exposure observed; controllers wrap errors.

---

## 8. Is the AI production-safe?

**Yes, with two conditions:**
1. **Dietary/allergen output must carry a standing disclaimer and defer to staff** (already partially done; make it explicit and unconditional). Do not market it as allergen-safe filtering until `allergens` data is structured and complete.
2. **Set product expectations correctly** — this is a deterministic recommender, not a conversational LLM. It will not answer arbitrary questions; it routes to intents. That is *good* for reliability, but the UI copy (assistant name "Donald") should not imply open-ended AI.

No external dependency means **no API-key leakage, no cost/rate exposure, no third-party data sharing, no model-outage risk** — all positives for production.

---

## 9. Recommendations

1. Add an explicit, unconditional disclaimer to all dietary/allergen replies.
2. Populate `MenuItem.allergens` and drive dietary filtering from structured tags, not substring matching.
3. Confirm every recommendation branch filters `available=false` items.
4. Keep the validation scripts in CI so reco/chat regressions are caught pre-deploy.
5. Remove the orphaned Python recommender (`recommend.py`, `pop_recommend.py`, embeddings) to avoid confusion about which engine is live (see AUDIT-REPOSITORY / DELETE-CANDIDATES).
