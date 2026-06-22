# Trump — AI / Recommendations (local, no external providers)

As of Phase 1, Trump makes **zero external AI/LLM calls**. There is no Groq,
Anthropic, or OpenAI integration, and no API key is required for any
recommendation, chat, pairing, or waiter-coaching feature.

## Customer-facing engine — `server/services/aiService.js`
Fully deterministic. It loads the live menu and scores candidates from multiple
signals: admin-defined pairings, "people also ordered" (from order history),
perfect/food pairings by dish type, course completion (starter/main/wine/dessert),
and popularity. Endpoints:

| Endpoint | Returns |
|---|---|
| `POST /Trump/api/chat` | Conversational reply + suggestions from the real menu |
| `POST /Trump/api/recommend` | Cart-level recommendations |
| `POST /Trump/api/ai-pairing` | Food + drink pairings for one dish |
| `POST /Trump/api/waiter/cart-recommendations` | Waiter upsell suggestions |

It also honours exclusions ("no seafood", "without cheese") and dietary queries.

## Waiter wording — `server/services/nlg/`
The waiter app (coach / sommelier / service-recovery / table pitch) phrases lines
with `templateNlgProvider.js` — a local, offline hospitality-copy generator
(wine tasting notes, dish hooks, upsell scripts). `nlgService.status()` reports
`{ provider: "template", llmConfigured: false, llmAvailable: false }`.

## What was removed in Phase 1
- `nlg/llmNlgProvider.js` (Anthropic Messages API integration) and the `TRUMP_LLM_*` config.
- `config/trumpDemo.js` + `demoMediaService.js` and all showcase/journey/event injection (fictional dishes that were surfaced as top recommendations).

## Reliability
No network dependency, no API quotas, no latency from a third party. The engine
degrades gracefully when order history is sparse (falls back to popularity and
heuristic scoring). Quality is bounded by the real menu data and order history,
not by an LLM.

## Adjacent (not AI)
- Voice input/output in the client uses the **browser** Web Speech API (local).
- `mediaEnrichmentService` can fetch stock photos from Pexels/Pixabay if keys are set — this is image search, not AI, and is off by default.
</content>
