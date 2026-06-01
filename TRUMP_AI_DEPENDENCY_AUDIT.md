# Trump — Anthropic & AI Functionality Audit

**Date:** 2026-06-01 · **Scope:** `Sites/Trump/` only · **Audit only — no code changed.**
External projects ignored (none are imported by Trump). Cross-checked: the Trump Node server contains **no** `spawn`/`child_process`/`python` references, so the Python AI artifacts in the folder are dormant (see §7).

---

## 0. Bottom line

**Yes — Trump already operates with zero external AI providers, by default.**

- The **entire guest-facing "AI"** (chat, recommendations, pairings) is **100% local deterministic logic** in `aiService.js`. It makes **no external call**.
- The **only** external AI provider in the codebase is **Anthropic**, used **only** to *re-word* (not decide) waiter-app lines. It is **off unless** `TRUMP_LLM_PROVIDER=anthropic` **and** `TRUMP_LLM_API_KEY` are set.
- There is **no Anthropic SDK / npm package** — it's a hand-rolled `fetch` to `https://api.anthropic.com/v1/messages` in a single file. Nothing to uninstall.
- Whenever Anthropic is absent, misconfigured, slow, or failing, an **always-on local template provider** produces the wording. A 3-failure circuit breaker also trips it off automatically.

**To guarantee zero external AI:** leave `TRUMP_LLM_PROVIDER` / `TRUMP_LLM_API_KEY` unset (the default). No code change required.

---

## 1. The Anthropic dependency, specifically

| Attribute | Finding |
|---|---|
| Package / SDK | **None.** No `@anthropic-ai/sdk` in `package.json`. Raw `fetch`. |
| Call site | `server/services/nlg/llmNlgProvider.js:7,50` → `https://api.anthropic.com/v1/messages` |
| Auth header | `x-api-key: TRUMP_LLM_API_KEY`, `anthropic-version: 2023-06-01` (`:55-56`) |
| Model | `TRUMP_LLM_MODEL` (default `claude-opus-4-8`) (`helpers.js:186`) |
| Enabled when | `provider === 'anthropic' && apiKey && fetch && healthy` (`llmNlgProvider.js:34`) |
| Default state | **Disabled** — `TRUMP_LLM_PROVIDER` is unset in `.env.example` |
| Role | **Wording only.** It receives an already-made decision + a template draft and returns one polished sentence. It never selects items, prices, or pairings. |
| Failure handling | Timeout (`TRUMP_LLM_TIMEOUT_MS`, default 6000ms) + AbortController; any error/non-200 → returns `null` → template used; 3 consecutive failures trip `healthy=false` (`:85-90`) |
| Data sent externally | The structured decision object + draft line (menu item names/prices, tone). No card/payment data. Sent only when enabled. |

---

## 2. AI files — full table (the 7 requested columns)

### 2.1 Core engine (guest-facing) — all local

| File | Purpose | Prod? | Optional/Required | External API? | Breaks if removed | Replaceable with local logic? |
|---|---|---|---|---|---|---|
| `server/services/aiService.js` | Deterministic chat, recommend, pairing, cart-recommendations engine (keyword scoring, popularity, course completion) | **Yes** | **Required** (core) | **No** | Guest chat, recommendations, item pairings, waiter cart-recs & sommelier seed all stop | **Already local** — nothing to replace |
| `server/config/trumpDemo.js` | `DEMO_MODE` showcase data + journeys consumed by `aiService` | **Yes** (active) | Optional (demo content) | **No** | `aiService` `require`s it → would throw unless refs removed; showcase injection disappears, recs fall back to real menu | Already local data |
| `server/controllers/aiController.js` | HTTP handlers: chat / ai-pairing / recommend / cart-recommendations / chat-history | **Yes** | **Required** | **No** | Those 5 endpoints 404/500 | N/A (thin wrapper) |

### 2.2 NLG "wording layer" (waiter-app) — local-first, Anthropic optional

| File | Purpose | Prod? | Optional/Required | External API? | Breaks if removed | Replaceable with local logic? |
|---|---|---|---|---|---|---|
| `server/services/nlg/nlgService.js` | Orchestrator: always runs template first, optionally enhances via LLM; never blocks | **Yes** (waiter) | **Required** for waiter wording | **No** (delegates) | Waiter pitch/coach/sommelier/recovery lines lose their phrasing seam | Yes — it *is* the local-first seam |
| `server/services/nlg/templateNlgProvider.js` | **Always-on, offline** hospitality copy generator (wine notes, dish hooks, upsell scripts) | **Yes** | **Required** (default + fallback) | **No** | All waiter wording breaks (or only LLM remains) | **This is the local replacement** already |
| `server/services/nlg/nlgProvider.js` | Abstraction/contract: `KINDS`, `TONES`, `NlgProvider` base, `normalizeTone` | **Yes** | **Required** (imported by all NLG) | **No** | NLG layer fails to load | N/A (interface) |
| `server/services/nlg/llmNlgProvider.js` | **Anthropic** wording enhancer | Only if configured (**default No**) | **Optional** | **Yes** (Anthropic) | **Nothing** if unconfigured; if configured, output silently falls back to templates | Yes — template provider already covers it |

### 2.3 Waiter "AI" features — deterministic, wording via NLG

| File | Purpose | Prod? | Optional/Required | External API? | Breaks if removed | Replaceable with local logic? |
|---|---|---|---|---|---|---|
| `server/services/opportunityService.js` | Deterministic "best next action"/upsell prob. from `aiService.recommend` | **Yes** | Required (coach/intel) | **No** | Table coach & intel lose the suggestion + probability | Already local |
| `server/services/serviceRecoveryService.js` | Deterministic recovery triggers (delay → actions); wording via NLG | **Yes** | Optional (feature) | **No** | `/waiter/recovery` returns nothing | Already local |
| `server/services/waiterAnalyticsService.js` | Deterministic per-waiter analytics/leaderboard (Prisma) — feeds "AI coach" framing | **Yes** | Required (waiter analytics) | **No** | Performance/leaderboard/shift-report empty | Already local |
| `server/services/guestService.js` | Guest CRM intel (not AI/LLM) | **Yes** | Optional | **No** | Guest intel panel empty | Already local |
| `server/controllers/waiterApiController.js` | Orchestrates coach/sommelier/ask/recovery/intel using `aiService` + `nlgService` | **Yes** | Required (waiter AI) | **No** directly (NLG may call Anthropic if enabled) | Waiter AI endpoints break | N/A (orchestration) |

### 2.4 Route registration (mounts AI endpoints)

| File | Purpose | Prod? | Required? | External? | Breaks if removed |
|---|---|---|---|---|---|
| `server/routes/orderRoutes.js:21-25` | Mounts `/api/chat`, `/api/ai-pairing`, `/api/recommend`, `/api/waiter/cart-recommendations`, `/api/chat-history` | Yes | Required | No | Guest + cart AI endpoints unrouted |
| `server/routes/waiterApiRoutes.js:16-19,34` | Mounts `/waiter/coach`, `/sommelier`, `/ask`, `/waiter/recovery`, `/waiter/nlg-status` | Yes | Required (waiter AI) | No | Waiter AI endpoints unrouted |

### 2.5 Client consumers (call Trump's own origin only)

| File | Purpose | External API? | Breaks if AI removed |
|---|---|---|---|
| `client/src/constants/api.ts:9-11,45-46` | Endpoint constants: `recommend`, `chat`, `aiPairing`, `coach`, `cartRecommendations` | No (relative) | — |
| `client/src/services/api.ts:39-48,124-133,274-278` | Typed client methods for the above | No | Calls fail if endpoints gone |
| `client/src/components/chat/ChatPanel.tsx` | Customer chatbot UI → `/api/chat` | No | Chat panel dead |
| `client/src/components/cart/CartRecommendations.tsx` | Cart upsell cards → recommend / cart-recs | No | No cart recs |
| `client/src/components/menu/PairingModal.tsx`, `ItemModal.tsx` | "Pairs with" → `/api/ai-pairing` | No | No pairings shown |
| `client/src/pages/waiter/AICoachScreen.tsx` | Waiter coach/sommelier UI | No | Coach screen empty |
| `client/src/components/waiter/VoiceAssistant.tsx` | Voice Q&A → `/api/ask`; uses **browser** `SpeechRecognition` + `speechSynthesis` (local, no external speech API) | No | Voice ask degrades to text |
| `client/src/config/trumpDemoConfig.ts`, `client/src/lib/demoMedia.ts` | Client mirror of demo showcase data | No | Demo media resolution only |

---

## 3. AI endpoints (HTTP)

| Method · Path | Handler | Engine | External AI? | Auth |
|---|---|---|---|---|
| POST `/api/chat` | `aiController.chat` | `aiService` (local) | No | public |
| POST `/api/ai-pairing` | `aiController.aiPairing` | `aiService` (local) | No | public |
| POST `/api/recommend` | `aiController.recommend` | `aiService` (local) | No | public |
| POST `/api/waiter/cart-recommendations` | `aiController.cartRecommendations` | `aiService` (local) | No | waiter+ |
| GET `/api/chat-history` | `aiController.getChatHistory` | file store (local) | No | admin |
| POST `/api/waiter/coach` | `waiterApi.postCoach` | opportunity (local) + NLG | Only if Anthropic enabled | waiter+ |
| POST `/api/sommelier` | `waiterApi.postSommelier` | `aiService` (local) + NLG | Only if Anthropic enabled | waiter+ |
| POST `/api/ask` | `waiterApi.postAsk` | `aiService.chat` (local) | No | waiter+ |
| POST `/api/waiter/recovery` | `waiterApi.postRecovery` | recovery (local) + NLG | Only if Anthropic enabled | waiter+ |
| GET `/api/waiter/table/:id/intel` | `waiterApi.getTableIntel` | local + NLG (pitch) | Only if Anthropic enabled | waiter+ |
| GET `/api/waiter/nlg-status` | `waiterApi.nlgStatus` | reports template vs LLM | No | waiter+ |

> Every endpoint returns a complete, useful response with Anthropic disabled — the only difference is whether the prose was template-generated or LLM-polished.

---

## 4. AI environment variables (Trump)

| Var | Read at | Purpose | Required? | In `.env.example`? |
|---|---|---|---|---|
| `TRUMP_LLM_PROVIDER` | `helpers.js:184` | Must equal `anthropic` to enable LLM | No (default off) | **No** (undocumented) |
| `TRUMP_LLM_API_KEY` | `helpers.js:185` | Anthropic API key | No | **No** |
| `TRUMP_LLM_MODEL` | `helpers.js:186` | default `claude-opus-4-8` | No | **No** |
| `TRUMP_LLM_TIMEOUT_MS` | `helpers.js:187` | LLM call timeout (default 6000) | No | **No** |

No other AI provider env vars exist in Trump. (`PEXELS_API_KEY` / `PIXABAY_API_KEY` are **image search**, not AI — see §6.)

---

## 5. AI dependencies (npm)

**None.** `package.json` AI-relevant deps = **0**. No `@anthropic-ai/sdk`, no `openai`, no LLM client. The Anthropic call is built on the Node global `fetch`. Removing external AI requires **no dependency change**.

---

## 6. Adjacent (not AI providers, noted for completeness)

| File | What | External? | AI? |
|---|---|---|---|
| `server/services/mediaEnrichmentService.js` | Stock-image search (Pexels/Pixabay) for menu photos | Yes (`PEXELS_API_KEY`/`PIXABAY_API_KEY`) | **No** — image search, not AI/LLM. Also effectively dead: only invoked by a `node-cron` job whose dependency is missing (`server.js:340`) |
| `client/src/components/waiter/VoiceAssistant.tsx`, `data/Voice.html` | Speech in/out via **browser** Web Speech API | No | Local browser capability, no external service |

---

## 7. Dormant AI artifacts inside the Trump folder (present, NOT wired)

These live under `Sites/Trump/` but are **not imported or spawned** by the Trump Node runtime (verified: no `spawn`/`child_process`/`python` refs in `server/`). They are leftover legacy and do not affect production:

| Path | What | Wired into Trump runtime? |
|---|---|---|
| `Sites/Trump/josh_enterprise/` | "JOSH" Python NLU/chatbot package (+ README mentioning optional Ollama) | **No** |
| `Sites/Trump/stt.py`, `Sites/Trump/tts.py` | Python speech-to-text / text-to-speech scripts | **No** |
| `Sites/Trump/data/Voice.html` | Standalone browser speech demo page | **No** (static file) |

---

## 8. Can Trump run with zero external AI providers? — Verdict

**Yes, unconditionally, with no code change.**

1. Guest AI (chat/recommend/pairing) is already fully local and never calls out.
2. Waiter NLG defaults to the local template provider; Anthropic is opt-in and degrades gracefully.
3. No AI SDK/package to remove; disabling = not setting two env vars.

**Residual external (optional, non-AI) calls** you may also want off for a fully air-gapped deploy: Pexels/Pixabay image enrichment (`PEXELS_API_KEY`/`PIXABAY_API_KEY` — already off by default and effectively dead), YouTube embeds for menu videos (`imageResolver.ts:406`), and the hardcoded QR domain `emenyu.com/Trump` (`AdminPage.tsx:790`). None are AI.

**How to verify at runtime:** call `GET /api/waiter/nlg-status` — with Anthropic unconfigured it reports `provider: "template"`, `llmAvailable: false`. That confirms zero external AI in use.

---

*No files were modified. This is an audit only.*
</content>
