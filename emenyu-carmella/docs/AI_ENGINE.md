# AI Engine — Personas, Chat, and NLG

## There is no external LLM

Every tenant's AI is fully local and deterministic — no Anthropic/OpenAI/Groq calls, confirmed in the root `CLAUDE.md` and unchanged by this build. This is a **deliberate platform property**, not a gap: it means zero API cost, zero latency variance, zero content-safety review surface, and zero outbound network dependency for the guest-facing chat experience.

## Two layers, one engine

```
┌─────────────────────────────────────────┐
│  SCORING (recommendationScoring.js       │  ← identical for every persona
│  + Phase-4 companions)                   │     see RECOMMENDATION_ENGINE.md
│  confidence / expected-value /           │
│  replacement / candidate filtering       │
└───────────────┬───────────────────────────┘
                │  suggestions[] (real menu items, already ranked/filtered)
                ▼
┌─────────────────────────────────────────┐
│  PERSONA VOICE (per tenant)              │  ← this is what differs
│  Trump: templateNlgProvider.js /         │
│         inline aiService.chat() strings  │
│  Carmella: gaspardVoice.js               │
└─────────────────────────────────────────┘
```

The scoring layer never changes per persona. A persona's job is purely to decide **how to talk about** suggestions the scoring layer already produced — never to pick different items, never to invent one.

## Persona selection

`config.assistantPersona` (env var `TRUMP_ASSISTANT_PERSONA`, default `'template'`) — checked once, at the end of `aiService.chat()`, after every existing intent-routing branch and exclusion filter has already finalized `responseData.suggestions`:

```js
if (this.config?.assistantPersona === 'gaspard') {
  responseData = { ...responseData, reply: gaspardVoice.composeReply({ message, suggestions, dayPart, isFirstTurn }) };
}
```

This is the entire integration surface. No other part of `chat()`'s ~600-line intent-routing tree was touched.

## Gaspard (`server/services/nlg/gaspardVoice.js`)

Deterministic, template-based, reuses the real `suggestions` array (including each item's authored `story` text, which already flows through the scoring layer's `publicItem()` serialization). Behaviors:

- **Day-part aware greeting** on the first turn of a session (`isFirstTurn`), sourced from the tenant's real `DayPart` rows via `dayPartResolver.js`.
- **Story-first phrasing**: `"the {name} — {story}"`, falling back to `description` when no story is authored.
- **Allergy/dietary acknowledgment** (hard rule 1): detects allergy/nut/gluten/vegan/vegetarian/shellfish mentions in the message and always acknowledges before suggesting anything.
- **Availability caveat**: an item with `availability === 'ask'` gets "I'll gladly check with the kitchen" appended inline, never a flat refusal.
- **Alcohol posture**: any WINE/COCKTAIL/BEER suggestion gets an offer to find its non-alcoholic equivalent, never assumes the guest wants alcohol.
- **Guarded language**: a defensive regex strip removes "AI/algorithm/recommendation engine/database/discount/% off/promo/best value/limited time/hurry" if any of those ever slipped in via an item's own description — mirrors the existing `nlgService.js`'s `enforcePersonality()` pattern.
- **At most two dishes per reply**, per the design brief's hard rule.

Verified live (`/Carmella/api/chat`):
- `"what do you recommend"` → `"Golden hour. I'd pour my attention toward the Iron Fillet — Herb-crusted, wine-finished, quietly serious., and the Calamari in Nice — Sun-kissed, lemon-laced, unmistakably Riviera.."`
- `"I have a nut allergy, what dessert is safe?"` → correctly acknowledges the allergy first.

### Known gaps (see `MONDAY_DEMO.md` for the full list)
- Two of the prompt pack's 10 eval phrasings ("what dessert is safe" without an explicit vegan/vegetarian keyword; "can I get a discount") don't reach a suggestion-bearing intent branch in the shared `intentClassifier.js` — the guardrail still holds (no forbidden words ever appear), but the ideal specific reply doesn't always fire. This is a pre-existing classifier-coverage gap inherited from Trump, not something Gaspard's composer can fix on its own.
- `{item:ID}` tappable-chip markup from the prompt pack was deliberately **not** implemented literally — the existing `suggestions` array already renders as tappable cards below the reply text (the same UI Trump's chat already uses), which delivers equivalent guest-facing functionality without inventing a new inline-markup parser.

## Day-part engine (`server/utils/dayPartResolver.js`)

A pure function, no I/O: given a tenant's `DayPart` rows (`{slug, name, from, to, ...}`, HH:MM local time — `process.env.TZ` is pinned to `Africa/Johannesburg` at server startup, so `Date` getters are already SAST) and the current time, returns which window is active. Shared by `GET /api/config` (for the frontend theme) and `gaspardVoice.js` (for the greeting) — one implementation, not duplicated.

## Waiter-facing NLG (unchanged)

`server/services/nlg/templateNlgProvider.js` + `nlgService.js` — a **separate** system from the customer chat, generating waiter-app copy (table pitches, upsell scripts, sommelier notes). Not persona-swapped in this build; Carmella's waiter app uses the same wording layer Trump does. `nlgProvider.js`'s abstract `NlgProvider` base class exists for exactly this kind of pluggability but has never had a second concrete implementation — a real `LlmNlgProvider` (if a future tenant needs genuine free-form conversation) would plug in here.
