# Chatbot Validation Report (Phase 3, Task 9)

**Method:** the NLU layer ([`chatbotNlu.js`](../../server/services/chatbotNlu.js)) is
deterministic and pure, so the `normalized` / `tokens` / `intent` columns below are **real
output** captured on 2026-06-06 (also asserted in `npm run reco:validate`). The *route* column
traces [`aiService.chat()`](../../server/services/aiService.js), which selects a reply branch
from the normalized text. Full reply strings additionally need the running server + menu in
Postgres; the routing that determines the reply is shown here.

## Pipeline

`chat()` → `chatbotNlu.normalize()` (lowercase → punctuation strip → per-token typo map →
conservative edit-distance correction → filler removal) → knowledge-intent check → intent
routing. Recommendation phrasings collapse to one intent via `isRecommendationIntent()`
(synonyms + phrase regex).

## Required test phrases

| Input | Normalized | Tokens | Rec-intent | Route in `chat()` | Outcome |
|---|---|---|:--:|---|---|
| `whats good here` | `whats good here` | `[whats, good]` | **true** | `isRecommendationIntent` → `recommend()` | Top chef/popular recommendations |
| `wats gud here` | `whats good here` | `[whats, good]` | **true** | `isRecommendationIntent` → `recommend()` | Top chef/popular recommendations |
| `stake` | `steak` | `[steak]` | false | mentioned-item / `scoreSearch('steak')` | Steak dishes |
| `stak` | `steak` | `[steak]` | false | mentioned-item / `scoreSearch('steak')` | Steak dishes |
| `veg options` | `vegetarian options` | `[vegetarian, options]` | false | dietary branch (`includes('vegetarian')`) → `buildDietaryReply` | Vegetarian-friendly items |
| `something spicy pls` | `something spicy please` | `[something, spicy]` | false | `scoreSearch` (spicy boost) | Spicy dishes |
| `im hungry lol` | `im hungry lol` | `[hungry]` | false | `scoreSearch` → empty → popular fallback | Popular dishes + guidance |

Corrections applied (real): `wats→whats`, `gud→good`, `stake→steak`, `stak→steak`,
`veg→vegetarian`, `pls→please`. Fillers stripped from tokens: `here`, `im`, `lol`.

## Why this fixes the Phase 2 audit defects

The Phase 2 [chatbot audit](../phase2/06-chatbot-audit.md) proved three failures live. Each is
now handled:

- **"whats good here" → two tequilas + snails.** Root causes were the intent-gate gap and
  `here`→`herencia` substring matching. Now `isRecommendationIntent("whats good here")` is
  **true** (phrase regex `what'?s good`), so the message routes to `recommend()` — the
  chef-first, safety-filtered engine — instead of free-text search. `here` is a filler and is
  dropped from `tokens`, so it can never substring-match a menu item.
- **"wats gud here" → not understood.** The typo map corrects `wats→whats`, `gud→good`, giving
  the same normalized phrase and the same recommendation route. (Was: no spell-correction.)
- **"stake" / "stak" → not understood.** Corrected to `steak`; routes to steak dishes.

## Synonym coverage (one intent)

`isRecommendationIntent` resolves all of these to the recommendation intent
(asserted in the harness): `what's good here`, `whats good here`, `best dish`, `most popular`,
`signature dish`, `chef recommendation`, `what do you recommend`, `must try`. The synonym set
also includes `popular / best / signature / recommended / favourite / standout / famous`.

## Knowledge intents (Task 6)

Before recommendation routing, `chat()` checks
[`knowledgeService.detectIntent`](../../server/services/knowledgeService.js) for
`hours / specials / allergens / policies`, answered from `data/knowledge.json` + the live menu
+ deals (no external AI). Examples: "what time do you close" → today's hours;
"do you allow corkage" → corkage policy; "gluten free options" → items that don't list gluten
(always deferring to the waiter to confirm).

## Harness excerpt (`npm run reco:validate`)

```
4. Chatbot NLU (typos + synonyms → one intent)
  PASS  intent: "what's good here" → recommendation
  PASS  intent: "whats good here" → recommendation
  PASS  intent: "best dish" → recommendation
  PASS  intent: "most popular" → recommendation
  PASS  intent: "signature dish" → recommendation
  PASS  intent: "chef recommendation" → recommendation
  PASS  intent: "what do you recommend" → recommendation
  PASS  intent: "must try" → recommendation
  PASS  typo: "stake" → "steak"
  PASS  typo: "stak" → "steak"
  PASS  typo: "vegitarian" → "vegetarian"
  PASS  typo: "chiken" → "chicken"
  PASS  typo: "desert" → "dessert"
  PASS  typo phrase: "wats gud here" → "whats good …"
  PASS  typo phrase: "wats gud here" → recommendation intent
  PASS  chat-speak: "im hungry lol" strips fillers
  PASS  chat-speak: "something spicy pls" keeps "spicy"
```

## Live transcript (optional)

With the server running and the menu seeded, exact reply strings can be captured:

```bash
curl -s -X POST http://localhost:3012/Trump/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"wats gud here","tableId":"table1"}'
```
