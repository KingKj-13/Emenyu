# Chatbot (Donald) + Recommendation Intelligence/Copy — Audit & Proposal

**Date:** 2026-06-17 · **Branch:** `feat/chatbot-reco-rework` (off `feat/management-ui-phase0-1`) · **Scope:** `Sites/Trump/` — the chatbot + the recommendation reasoning/copy shared by the customer journey cards and the waiter upsell. **Audit + propose only; nothing built.**

**Architecture rule honoured:** everything proposed is **fully local** — rules + lexicon/NLP + curated content. No LLM, no external API. The off-topic guardrail is *free*: a rules engine that only knows the menu declines everything else by construction.

> **⚠️ Read this first — scope is Trump's tenant only (corrected 2026-06-19).** An earlier draft of this doc counted the **entire shared `MenuItem` table — 851 items / 174 categories across all four tenants** — and mistook other tenants' sections (e.g. Imli's `TANDOORI STARTER`, `Madras Terminal`) for Trump's menu. **Corrected:** Trump's own menu is **439 items across 87 categories** (`restaurantId='trump'`) — a coherent SA steakhouse + full bar, including a deliberately Trump-branded sushi section. Reads are tenant-scoped, so this is what customers actually see; the other tenants (al_pescatore 143, greek 125, imli 144) are correctly isolated, not contamination. Full evidence: [MENU_CONTAMINATION.md](MENU_CONTAMINATION.md). `chefPick` and `popular` are set on **0 items**. Inference-first tagging is still mandatory. **Every count below is now scoped to `restaurantId='trump'`, and every enrichment/bootstrap pass must filter by tenant or it will tag four restaurants at once.**

---

# STEP 1 — Current state

## Donald (the chatbot)

**Frontend** — [ChatPanel.tsx](client/src/components/chat/ChatPanel.tsx):
- Sends `POST /api/chat` with `{ message, history, tableId }` ([:66-67](client/src/components/chat/ChatPanel.tsx#L66)). It **does send the conversation `history`**, but **never sends the cart**.
- Branded **"Trump AI"** ([:113](client/src/components/chat/ChatPanel.tsx#L113), [:119](client/src/components/chat/ChatPanel.tsx#L119)) — *not* "Donald" (the journey cards use `ASSISTANT_NAME='Donald'`; chat is inconsistent).
- Renders the reply + suggestion cards (shared `RecommendationCard variant="compact"`).

**Backend** — [aiController.chat](server/controllers/aiController.js#L4) → `aiService.chat(req.body)` → [aiService.chat()](server/services/aiService.js#L328).

**How it parses input** — [chatbotNlu.normalize](server/services/chatbotNlu.js#L91): lowercase → strip punctuation → per-token slang/typo map (`TYPO_MAP`) → conservative edit-distance correction against a **40-word lexicon** → filler removal. Then `aiService.chat()` routes by **keyword/branch checks** in order: deals/special → knowledge intent → category question → "pair/go with" → combo → recommendation → wine → dietary → mentioned-item → fuzzy `scoreSearch` → popular fallback.

**Intent awareness — partial and shallow:**
- ✅ "Recommendation" intent is well-covered (`isRecommendationIntent` + synonyms: "what's good", "best", "signature"…).
- ⚠️ **Attribute intents are not first-class.** "Something spicy"/"light" only get a **scoring nudge** inside `scoreSearch` ([aiService.js:289-300](server/services/aiService.js#L289)) — there's no "spicy intent → filter to spicy-tagged dishes." "Vegetarian" routes to a dietary branch that filters by allergen/keyword, not a real veg tag.
- ❌ **No occasion intent.** "I'm here to watch the football" has no handler → falls through to generic popular/search. No football/date/celebration/quick-bite archetypes.
- ❌ **No swap/context handling.** "Actually I want seafood instead" is treated as a fresh query; it can't know what *instead* replaces, and won't swap the steak's red wine for a white.

**Session memory — NONE.** The frontend sends `history`, but **`aiService.chat()` never reads `payload.history`** (confirmed — the only `history` reference in the service is order history). So follow-ups like "a wine **for it**" can't resolve "it". Donald is effectively stateless per turn.

**Cart-awareness in chat — NONE.** `aiService.chat()` *can* read `payload.cart`, but `ChatPanel` doesn't send it, so cart-aware cross-sell ("you've already got the carpaccio — add…") never fires in chat. (It exists only in the waiter `cartRecommendations` and the journey card, via a different path.)

**Knowledge** — [knowledgeService](server/services/knowledgeService.js): answers hours / policies / FAQs / specials / allergens from a small static [knowledge.json](data/knowledge.json) (hours, 7 policies, 3 FAQs). The "learning" files (`data/learned_qa.json`, `unknown_questions.json`, `brain_memory.json`) are **empty/dormant** — vestigial from the retired legacy bot.

**Off-topic guardrail — NONE (soft only).** There is no explicit off-topic intent. "Apple's stock price" / "write me code" fall through to `scoreSearch` (may return random menu matches) or the generic popular fallback ([aiService.js:404](server/services/aiService.js#L404)) — a menu deflection, not the in-character decline you want.

## Menu data model

[`MenuItem`](../../prisma/schema.prisma) (Postgres; `loadMenu()` is DB-only via `prismaMenuService`):
- Real columns: `name, description, price, calories, allergens, **spice**, category(→title/parent), chefPick, popular, sourceTitle, **metadata Json?**`.
- **`course`/`categoryType` and `beverageKind` are NOT stored** — derived at runtime by `categoryClassifier` from category + name.
- The flexible **`metadata Json?`** is populated on every row (import/media data) — it's the natural home for new tags **without a migration**.

**Real coverage (439 items, `restaurantId='trump'`):**

| Attribute | Items with it | % |
|---|---|---|
| `spice` set (🌶️ / 🌶️🌶️) | 48 | 11% |
| `allergens` (protein/dietary tokens) | 165 | 38% |
| description > 10 chars | 293 | 67% |
| **`chefPick`** | **0** | **0%** |
| **`popular`** | **0** | **0%** |
| `metadata` present (media keys) | 439 | 100% |
| Categories (24 root + 63 sub) | 87 | — |

**Note on `allergens`:** in Trump's tenant this field is **not** "Contains: …" prose — it holds comma-separated **protein/dietary tokens** (`Beef` 46, `Gluten` 45, `Vegetarian` 41, `Seafood` 37, `Egg` 20, `Vegan` 18, `Chicken` 15, `Pork` 12, `Lamb` 7, `Nuts` 2). That's a clean protein + dietary signal for the bootstrap.

**Missing for the target behaviour:** structured **flavour, protein/category-type (stored), dietary (veg/vegan), occasion/mood**, and for drinks **type / body / sweetness**. None of these exist as queryable fields today.

## Tagging effort (the key practical question)

439 items is still **beyond comfortable hand-tagging** — but the data is unusually **bootstrap-friendly**:
- **87 descriptive category names** are a goldmine: `CABERNET SAUVIGNON` → red / cabernet / full-body; `SAUVIGNON BLANC` → white / crisp / light; `VEGETARIAN` → dietary veg; `SIGNATURE SEAFOOD` / `SASHIMI` → seafood; `Cocktails`, `BEERS LOCAL`, `Sides` → drink/occasion archetypes. *(All within Trump's tenant — an earlier draft cited other tenants' Indian sections in error.)*
- The **`spice` field (11%)** and **`allergens` protein/dietary tokens (38%)** give protein/dietary/heat signals.
- **67% have descriptions** → keyword inference for flavour/protein.

→ A **category→tags map + name/description/allergen keyword inference** can auto-tag the large majority on a first pass; you then refine the long tail by hand. Inference-first is essential here, not a nicety.

## Pairing reasons (curated content)

- **Storage already exists:** `MenuItemRecommendation.reason` (per chef pairing), editable in the Admin **chef-recs** tab.
- **Coverage is the problem:** **32 chef-recs, all with a reason, but only 7 distinct reasons** — heavily templated/repeated. Real samples: *"Crisp white — a classic match for seafood." · "Bold red — built to stand up to grilled beef." · "A light side to balance the plate." · "The sweet finish guests remember."* These come from the **seed script's** templated `reason` params ([seed-chef-recommendations.js:75-81](scripts/seed-chef-recommendations.js#L75)). **Zero genuinely-authored, dish-specific sommelier prose exists yet.**

## Where the bland / repeated copy comes from (exact traces)

- **Customer cards + chat pairing reasons →** [`aiService.pairingReason()`](server/services/aiService.js#L729): returns `"Goes well with this dish."` (MAIN fallback), `"Full-bodied red — pairs beautifully with grilled beef."` (**same line for every steak → the repeated wine copy you saw**), `"Crisp white — a classic match for seafood."`, etc. This feeds `aiPairing` → the ItemModal journey cards and chat suggestions. (Chef-rec `reason` overrides when present — but that's the 7 templated strings.)
- **Waiter upsell →** [`cartRecReason` / `cartRecScript`](server/services/aiService.js#L479) — also templated one-liners.
- **Chat reply prose →** [`buildSuggestionReply`](server/services/aiService.js#L791): *"I would steer you toward X, Y. Tap a dish card…"*.
- **The GOOD copy already exists but is siloed:** [`templateNlgProvider`](server/services/nlg/templateNlgProvider.js) has **varietal tasting notes** (`flavorNotes`: cabernet → "blackcurrant and cedar with a firm, structured finish" [:24](server/services/nlg/templateNlgProvider.js#L24)) and **dish hooks** ([:39](server/services/nlg/templateNlgProvider.js#L39)) — but it's wired **only into the waiter NLG**, never the customer cards or chat. **This silo is half the bug.**

## Rotation engine

[`rotationService`](server/services/rotationService.js) is confirmed a **pure selection/variety layer**: a seeded, priority-weighted reorder *within* rotation groups. It chooses *which* of a group's members fills a slot for variety; it does not decide *what* to recommend nor write copy. **It stays exactly as-is** — we enrich *what's* recommended and *how it's described* around it.

---

# STEP 2 — Proposed rework (fully local, one shared brain)

Legend: ✅ exists · ⚠️ partial · ❌ build.

**One brain, two surfaces.** Introduce a single **`recoEngine` + `reasonComposer`** that Donald (chat), the customer journey cards (`aiPairing`), and the waiter upsell all call. No second copy of the matching/reasoning logic. `rotationService` stays the variety layer beneath it.

### 1. Menu enrichment (tags in `metadata`, no migration) — ❌
A normalized tag block on each item, written to `metadata.tags`:
```
metadata.tags = {
  course, protein:[…], spice:0-3, flavour:[rich|fresh|smoky|creamy|citrus|sweet|umami…],
  dietary:[vegetarian|vegan|halal-able|gluten-free…], occasion:[sharing|date|quick|celebration|football…],
  // drinks:
  drinkType:[red|white|rosé|sparkling|beer|cocktail|spirit|soft|hot], body:[light|medium|full], sweetness:[dry|off-dry|sweet]
}
```
- **Bootstrap pass (script):** a `category→tags` map + keyword inference from name/description/`allergens`/`spice` produces a first pass for the bulk of 851 items. Surfaced + refinable in the existing **menu CRUD / chef-pairing editor** (not a parallel system).
- **No schema migration** — `metadata` already exists on every row.

### 2. Intent + occasion engine (local) — ❌
A classifier that maps a message to one of: **attribute** (spicy/light/seafood/veg…), **occasion** (football/date/quick/celebration), **pairing/swap**, **cart cross-sell**, **info** (hours/policies), or **off-topic**.
- Synonym **lexicon** (extends `chatbotNlu`), with optional **light local embeddings** for fuzzier matching (still no LLM).
- **Occasion → archetype map:** football/sharing → wings/nachos/burgers/pizza/platters + cold beer; date/celebration → signature cuts/sushi + sparkling/wine + dessert; quick → burger/single plate + soft; veg → veg tag.
- **Session context** (see #6) so swaps/follow-ups resolve.

### 3. Curated-reasons store — two tiers, authored-first — ⚠️ (storage exists)
- **Tier 1 — hero / chef-curated → human-authored.** Keep `MenuItemRecommendation.reason` as the store; improve the Admin editor for it; **seed only a handful of genuinely good exemplars** (which you supply) to lock the voice/format. **Do NOT bulk-generate these** — that's how we got the 7 templated strings.
- **Tier 2 — long-tail → attribute-aware generation** from the real tags ("the crisp white's acidity lifts the delicate seafood"), **never generic filler**, each **override-able** by an authored line in the editor.
- One **`reasonComposer`** surfaces both **identically in chat and on cards**, with **controlled rotation** (reuse `rotationService`'s seed) so a reason never repeats back-to-back.

### 4. Response composer — Donald's voice — ❌
Short, texty, warm; parameterised by `{intent, matchedItems, reason}` with enough template variety to never read canned. **Persona defined once**, reused for chat replies *and* card copy. Promote the siloed `templateNlgProvider` copy (varietal notes, dish hooks) into this shared composer so customers get the waiter-grade prose. *(You'll help nail the persona + voice.)*

### 5. Cart-awareness — ⚠️→❌
- **Fix `ChatPanel` to send the cart** (one-line change) so chat is cart-aware.
- Engine reads order contents to bias cross-sell and write the "you've already got X — add Y / keep it light with Z" line, or ask one narrowing question.

### 6. Session memory — ❌
Backend must **use `payload.history`** (already sent by the frontend): keep lightweight per-session context (last recommended dish, last course, current "anchor" item) so "seafood **instead**" knows what it replaces and "a wine **for it**" knows the dish. No persistence needed beyond the turn window.

### 7. Guardrail — ⚠️→✅ (nearly free)
Unmatched/off-topic → an explicit **in-character decline** ("That's outside what I can help with — I'm here for the menu and your table."). Because the engine only knows the menu, this is unbreakable; I'll note a few explicit off-topic patterns (stock/price, "write code", general knowledge) for a graceful, friendly reply.

### 8. Rebrand chat → **Donald** — ❌
Header + welcome use `ASSISTANT_NAME` (consistent with the cards).

---

# STEP 3 — Phasing, "done-when", and the intent test set

Your instinct is right; the data confirms the order:

**Phase A — Enrichment + reasons (both surfaces depend on it).**
- Tag schema in `metadata` + **bootstrap script** over the 851 items (category map + keyword inference); surface/refine in the menu CRUD + chef-pairing editor.
- Curated-reasons: improve the admin reason editor; build the **`reasonComposer`** (Tier-1 authored → Tier-2 attribute-aware, rotated); seed a few exemplars.
- *Done when:* most items have inferred tags an editor can refine; a pairing with no authored reason still yields an attribute-true line (no "Goes well with this dish"); an authored hero reason renders verbatim in **both** card and chat.

**Phase B — Intent/occasion engine + Donald's composer + memory + guardrail.**
- Intent/occasion classifier + archetype map; session context from `history`; response composer (persona); send cart from chat; off-topic decline; rebrand to Donald.
- *Done when:* the acceptance tests below pass.

**Phase C — One brain, two surfaces.**
- Replace `aiService.pairingReason` / `cartRecReason` call-sites with the shared `reasonComposer`; point the customer cards + waiter upsell at the same engine. Retire the bland templates.
- *Done when:* card copy, chat copy and waiter copy for the same pairing are sourced from one place and read equally well; no duplicated reasoning logic.

**Guardrail + tests throughout.**

### Acceptance tests (the spec)
1. "something spicy" → spicy-tagged dishes · 2. steak+red on screen, "actually something fishy" → seafood dish **+ a crisp white** (not the red) · 3. "what do you recommend? watching the football" → sharing food + beer with a reason · 4. cart has carpaccio → "you've got the carpaccio — add the chicken-liver mains, or keep it light with a pasta" · 5. "seafood instead" then "a wine for it" resolve via memory · 6. every pairing explains itself in Donald's voice with a real "why" · 7. replies are a sentence or two · 8. "Apple's stock price" → in-character decline.

### Intent test set (reco:validate-style) — `npm run chat:validate`
A table of `message → { expectedIntent, expectedMatchPredicate }`, runnable offline like the existing [reco:validate](scripts/) (41/41). Seed cases:

| message | expected intent | expected match |
|---|---|---|
| "something spicy" | attribute:spice | item.tags.spice ≥ 2 |
| "anything light?" | attribute:light | tags.body=light OR course=STARTER/salad |
| "vegetarian options" | attribute:dietary | tags.dietary∋vegetarian |
| "I want something fishy instead" (anchor=ribeye) | swap:protein=seafood | tags.protein∋seafood; drink swap→white |
| "what wine for it" (anchor=ribeye) | pairing:drink | drinkType=red, body=full |
| "here to watch the football" | occasion:football | tags.occasion∋sharing AND a beer |
| "celebrating a birthday" | occasion:celebration | signature cut/sushi + sparkling |
| "quick bite before a movie" | occasion:quick | burger/single plate |
| "we've got the carpaccio, what next" (cart=carpaccio) | cart:crosssell | complementary main/keep-light option |
| "what's Apple's stock price" | off-topic | decline (no menu match attempted) |
| "wats gud" | recommendation | popular/chef picks |

New synonyms/occasions are added as rows → matching stays verifiable and regression-safe.

---

*Audit + proposal only — no code changed. Awaiting go-ahead before any build. Local only; nothing pushed or deployed.*
