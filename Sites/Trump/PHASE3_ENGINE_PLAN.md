# Phase 3 — Smart Donald + one shared recommendation brain (STEP 1: proposal only)

**Date:** 2026-06-19 · **Branch:** `feat/chatbot-reco-rework` · **Runtime:** fully local, **zero LLM** (rules + the Phase-2 tags + curated NLG). Local-only; gated; nothing built yet.

> **Premise (verified in code).** The shared engine already exists: `aiService.recommend()` is the one brain (chef-first → co-occurrence → pairings → course-completion → popular → `rotationService` variety → R1–R7 category safety), and `aiPairing` (cards), `cartRecommendations` (waiter) and `chat` all call it. Phase 3 does **not** add a second engine — it adds an **intent layer** and a **shared copy layer** around it, teaches it to use the Phase-2 `metadata.tags`, and unsilos the good NLG. `rotationService` stays exactly as-is.

---

## The five real gaps (each maps to a build item)

| # | Gap (confirmed in code) | Fix |
|---|---|---|
| 1 | **Intent-blind.** `chat()` routes by ad-hoc keyword `if/else` ([aiService.js:351-412](server/services/aiService.js#L351)); attribute intents are only a scoring nudge in `scoreSearch` ([:289-300](server/services/aiService.js#L289)); **no occasion, no swap, no off-topic.** | `intentClassifier.js` → real intents driving the engine |
| 2 | **Tags unused.** Phase-2 `metadata.tags` flow through `buildMenuContext` (spread from `metadata`) but nothing reads them. | tag-aware match source in `recommend()` |
| 3 | **No memory / no cart in chat.** `chat()` never reads `payload.history`; `ChatPanel` sends `history` but **not** `cart` ([ChatPanel.tsx:66-67](client/src/components/chat/ChatPanel.tsx#L66)). | `chatSession.js` + ChatPanel sends cart |
| 4 | **Good copy siloed.** `nlg/templateNlgProvider` (varietal notes, dish hooks) is used **only** by `waiterApiController` ([:79-168](server/controllers/waiterApiController.js#L79)); customer cards/chat use the bland `aiService.pairingReason` ([:729](server/services/aiService.js#L729)) / `buildSuggestionReply`. | `reasonComposer.js` — one copy layer for all surfaces |
| 5 | **No waiter "ordered-together".** Co-occurrence exists inside `recommend()` (`addPeopleAlsoOrdered`) but isn't a first-class, counted, waiter-only rec. | `marketBasket.js` + waiter-only endpoint |

Plus: rebrand **"Trump AI" → Donald** ([ChatPanel.tsx:113,119](client/src/components/chat/ChatPanel.tsx#L113)) via an `assistantName` **server config** (today it's only a client constant — we add the server→config→client pipeline).

---

## Architecture — one brain, two new layers

```
              ┌─────────────── intentClassifier (NEW) ───────────────┐
  message ──▶ │ attribute · occasion · pairing · swap · cart · info · off-topic │
              └───────────────┬───────────────────────────┬──────────┘
                              │ intent + slots             │ off-topic → decline
                              ▼                            ▼
   chatSession (NEW) ──▶ aiService.recommend()  ◀── cart, anchor (from history)
   (anchor/last course)      │  candidate sources, now incl. TAG-MATCH + OCCASION-ARCHETYPE
                              │  → rotationService (variety) → R1–R7 safety   [UNCHANGED]
                              ▼
                     reasonComposer (NEW, wraps templateNlgProvider)
                              │  one voice, rotated, tag-true
        ┌─────────────────────┼──────────────────────────┬────────────────────┐
        ▼                     ▼                          ▼                    ▼
  Customer chat        Customer cards (aiPairing)   Waiter upsell      Waiter ordered-together (NEW)
  (Donald voice)       (ItemModal)                  (cartRec)          marketBasket — counts + why
```

**Single source of truth for copy:** `aiService.pairingReason`, `cartRecReason`, `cartRecScript`, `buildSuggestionReply` are **retired**, replaced by `reasonComposer` calls. Cards, chat and waiter then read identically well.

---

## File list

**New (server/services):**
- `intentClassifier.js` — extends `chatbotNlu`; maps a message → `{ type, slots:{protein,spice,flavour,dietary,occasion}, anchorRef, swap }`. Attribute/dietary slots resolve against `tags`; occasion via an archetype map (football→sharing+beer, date→steak+red, celebration→bubbles+signature, quick→burger/single).
- `reasonComposer.js` — the one copy layer; wraps `nlg/templateNlgProvider` (promoted from waiter-only) + the chef `reason` (Tier-1 authored wins) + tag-true Tier-2 generation; rotation-aware (reuses `rotationService` seed) so a reason never repeats back-to-back.
- `chatSession.js` — builds lightweight per-turn context from `payload.history` (anchor dish, last course, last recommendation) so "seafood **instead**" / "a wine **for it**" resolve. No persistence.
- `marketBasket.js` — waiter-only co-occurrence over order history → `{ item, count ("9 tables also ordered this"), why (flavour bridge from tags) }`. Never customer-facing.

**New (scripts):** `chat-validate.js` (`chat:validate`) — offline intent test set (table of `message → {expectedIntent, matchPredicate}`), runs like `reco:validate`.

**Modified (server):**
- `aiService.js` — `chat()` routes via `intentClassifier` + `chatSession`; `recommend()` gains a **tag-match source** and an **occasion-archetype source** (high band, below chef); copy delegates to `reasonComposer`; reads `cart` + `history`; off-topic → in-character decline.
- `controllers/aiController.js` + `routes/*` — new `POST /api/waiter/ordered-together` (role-guarded, waiter+).
- `controllers/waiterApiController.js` — surface ordered-together.
- `utils/helpers.js` (`createConfig`) — `assistantName` from `TRUMP_ASSISTANT_NAME` (default `Donald`); add a small `GET /api/config` (public, returns `{assistantName}`) so the client stops hardcoding.

**Modified (client):**
- `components/chat/ChatPanel.tsx` — send `cart`; render header/welcome from `assistantName`.
- `services/api.ts` — `chat()` payload includes `cart`; fetch `assistantName` from `/api/config`.

---

## How each surface plugs into the one brain

| Surface | Endpoint | Flow |
|---|---|---|
| **Customer chat** | `/api/chat` → `aiService.chat` | intentClassifier → info→knowledge · attribute/occasion→tag-aware `recommend` · pairing/swap→`chatSession` anchor + `recommend` · off-topic→decline. Copy via `reasonComposer` in Donald's voice. Sends cart+history. |
| **Customer cards** | `/api/ai-pairing` → `aiPairing` | `recommend([item])` → `reasonComposer` (varietal-aware; replaces bland `pairingReason`). |
| **Waiter upsell** | `/api/recommend` / `cartRecommendations` | `recommend(cart)` → `reasonComposer.upsellScript`. |
| **Waiter ordered-together** *(new)* | `/api/waiter/ordered-together` | `marketBasket(history)` → counted social-proof + flavour why. **Waiter UI only.** |
| Variety layer | — | `rotationService` unchanged, beneath `recommend()`. |

---

## Acceptance tests (the spec) — `npm run chat:validate` + manual

1. "something spicy" → `tags.spice ≥ 2` dishes · 2. steak+red on screen, "actually something fishy" → seafood **+ a crisp white** (not the red), via session swap · 3. "what's good? watching the football" → sharing food **+ a beer** with a reason · 4. cart has carpaccio → "you've got the carpaccio — add… / keep it light with…" (cart-aware) · 5. "seafood instead" then "a wine for it" resolve via memory · 6. every pairing explains itself in Donald's voice with a real *why* · 7. replies are a sentence or two · 8. "Apple's stock price" → in-character decline. Each becomes a `chat:validate` row.

---

## Phasing (gated commits, local only)

- **3A — Tags + copy (both surfaces depend on it).** `intentClassifier` (attribute/dietary/occasion), tag-match source in `recommend()`, `reasonComposer` (unsilo NLG; retire bland templates). *Done when:* "spicy"/"light"/"veg" hit real tag matches; every pairing yields a tag-true line (no "Goes well with this dish"); an authored chef reason renders verbatim in **both** card and chat.
- **3B — Donald: memory + cart + occasion + guardrail + rebrand.** `chatSession`, cart from ChatPanel, occasion archetypes, off-topic decline, `assistantName` pipeline. *Done when:* acceptance tests 2–8 pass.
- **3C — Waiter ordered-together + final unification.** `marketBasket` waiter-only rec; point all surfaces at `reasonComposer`; delete dead template code. *Done when:* card/chat/waiter copy for the same pairing come from one place; no duplicated reasoning logic.

---

## 3A — implemented (2026-06-20)

Built and validated locally (against `emenyu_local`, which carries the Phase-2 tags). Prod untouched; runtime stays fully local/offline.

- **`intentClassifier.js`** — message → `{type, slots}` (attribute/dietary/occasion/pairing/swap/recommendation/info/offtopic) on top of `chatbotNlu`; plus a pure `tagScore(tags, slots)` shared with the validator.
- **`reasonComposer.js`** — one copy layer: Tier-1 chef reason verbatim → Tier-2 offline NLG (varietal notes/dish hooks) + tag flavour-bridge → never-blank category default. Wired into `aiPairing` (cards); the old bland `aiService.pairingReason` is **deleted**.
- **`aiService.recommend()`** — new tag-match source (band 200+, below chef, above algorithmic) gated on intent slots; occasion archetype drink (football→beer, celebration→sparkling); **hard dietary filter** so a vegetarian/vegan request never surfaces meat.
- **`aiService.chat()`** — new attribute/dietary/occasion branch routes through the tag-aware engine with an intent-shaped lead.
- **`server.js`** — `nlgService` built before `aiService` and injected (one shared NLG instance).
- **`chat:validate`** (`scripts/chat-validate.js`) — 24/24; `reco:validate` unchanged at 41/41.

Live spot-check: "something spicy" → spice-2 dishes; "anything light" → salads/sushi lead; "vegetarian options" → no meat; "watching the football" → beer + sharing plates; ribeye card pairings read tag-true and never blank.

**Deferred to 3B/3C as planned:** session memory + swap resolution, cart-from-ChatPanel, full occasion polish, off-topic decline, Donald rebrand (3B); waiter "ordered-together" + pointing the waiter upsell at `reasonComposer` and deleting `cartRecReason` (3C). Hero pairings (you supply) seed Tier-1 next.

## 3B — implemented (2026-06-21)

Donald now has memory, cart-awareness, a guardrail and his name. Validated on `emenyu_local`; prod untouched; fully local/offline.

- **`chatSession.js`** — per-turn context from `payload.history` + cart (anchor dish, last wine). No persistence.
- **Swap** — `intent.type==='swap'` ("actually something fishy") picks the new dish from tags, re-pairs it, and **switches a carried-over red for a crisp white** (still whites first), naming the switch.
- **Cart-aware** — ChatPanel sends the cart; the recommendation lead becomes "you've got the **{cart item}** — add **{x}**, or keep it light with **{y}**."
- **Memory** — `buildPairingReply` resolves "a wine for it" from the anchor and returns a colour-appropriate, wine-only pour.
- **Off-topic decline** — `intent.type==='offtopic'` → a warm in-character reply (no suggestions), never a random menu match.
- **Donald rebrand** — `assistantName` from `TRUMP_ASSISTANT_NAME` (default Donald) in `createConfig`; public `GET /api/config`; `ChatPanel` reads header/welcome from it (was "Trump AI").
- **Branch precedence fix** — an occasion/attribute intent now beats the generic "what's good" keyword, so "what's good, watching the football" → sharing plates **+ a beer**.
- **Tests** — `chat:validate` 30/30 (added off-topic + session-memory rows); `reco:validate` 41/41; client `tsc --noEmit` clean. Live acceptance run: tests 2–5, 8 all pass.

**Deferred to 3C:** waiter-only "ordered-together" market-basket rec; point the waiter upsell at `reasonComposer` and delete `cartRecReason`/`cartRecScript`. Hero pairings (you supply) still seed Tier-1.

## 3C / Commit A — authored hero pairings (2026-06-21)

The chef's curated dish × varietal sommelier lines now drive the drink the engine recommends and the reason every surface shows. Local-only; offline.

- **`heroPairings.js`** — loads `trump_hero_pairings.json` (52 dishes × varietal). `dishFor` (protein-gated, most-specific token match — KINGKLIP FILLET never becomes a beef "Fillet"), `reasonFor` (source dish × target bottle's varietal), `bottlesOfVarietal`, `archetypeFor` (occasions). **52/52 dishes mapped to menu items, 0 misses.**
- **`reasonComposer`** — new Tier-1a: authored hero → Tier-1b chef per-pair → Tier-2 NLG → never-blank. One reason per dish × varietal, applied to any bottle of that varietal.
- **`recommend()`** — `addHeroPairings` boosts the in-stock bottles of a hero dish's varietals (band 1200, above the legacy chef-rec table) under **one rotation group per dish**, so rotationService rotates across Cabernet ↔ Shiraz and the bottles within. Every result's reason is now composed through the one `reasonComposer` (anchored to the cart's primary food dish) — cards, chat and waiter read identically.
- **Occasions** — `addTagMatches` occasion archetype rebuilt from the authored `occasions` block (football → sharing plates + Castle, celebration → bubbles, date → Cab/Pinot, group → platter); `intentClassifier` gained a `group` occasion.
- **Verified live:** Ribeye card/Donald/waiter all → a real in-stock Cabernet (Neil Ellis) with the authored line, one source. Football → Castle + sharing plates. Non-hero kingklip → tag-true Tier-2 (no regression). `chat:validate` 38/38, `reco:validate` 41/41.

## 3C / Commit B — waiter "ordered-together" + final unification (2026-06-21)

- **`marketBasket.js`** — waiter-only co-occurrence over real order history → `{ item, count, countLabel ("9 tables also ordered this"), why (tag flavour bridge) }`. Never customer-facing.
- **`POST /api/waiter/ordered-together`** — new, `waiter+` role-guarded; `aiService.orderedTogether`. Surfaced in `CartRecScreen` as its **own panel**, distinct from the AI upsell.
- **Final unification** — `cartRecReason` and `cartRecScript` **deleted**; the waiter upsell now reads the composed `reasonComposer` reason (authored hero → chef → Tier-2). The card's `script`/`note` is gone. One copy source across cards, Donald and the waiter — no duplicated reasoning logic, no bland templates left.
- **Verified live:** ordered-together for a ribeye → TOKARA "5 tables also ordered this" + sides with flavour whys; waiter upsell → the authored hero line, no `script`. `chat:validate` 38/38, `reco:validate` 41/41, client `tsc --noEmit` clean.

**Phase 3 complete** (3A `43ec7cb`, 3B `dff179b`, 3C-A `3ea3d9e`, 3C-B this commit). One shared brain — chef-first → authored hero → tag-aware → co-occurrence → pairings → rotation → R1–R7 safety — feeds Donald (chat), the customer cards, the waiter upsell and the waiter-only ordered-together, all in one voice, fully local.

## Open questions for your review
1. **Donald rebrand pipeline** — OK to add `TRUMP_ASSISTANT_NAME` (default `Donald`) server config + a small public `/api/config` so the client stops hardcoding? (Alternative: keep it a client-only constant.)
2. **Waiter "ordered-together"** — confirm it's a **new, separate** waiter-only panel (counted social proof), distinct from the existing cart upsell — not a merge.
3. **Retire the bland copy** — OK to fully replace `aiService.pairingReason` / `cartRecReason` / `buildSuggestionReply` with `reasonComposer` (vs. keeping them as fallback)?
4. **Tier-1 reasons** — seed a *handful* of hand-authored hero pairings to lock Donald's voice (you supply), and let Tier-2 generate the long tail from tags? (Same approach we agreed for Phase 2 low-confidence: authored-first, never bulk-generated filler.)
