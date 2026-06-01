# Emenu — Phase 0 Complete Inventory (Audit Only, No Removals)

**Date:** 2026-06-01 · **Status:** Nothing removed or modified — this is a read-only inventory.
**Companion:** `PHASE_0_PRODUCTION_AUDIT.md` (Reports A–H, scoring, roadmap).
**Scope:** Whole repo. `node_modules`, lockfiles, and build output excluded unless noted.

Legend: ✅ = real/active · ⚠️ = conditional/opt-in · 🧪 = demo/seed/dev-only · ☠️ = security risk · 📄 = docs only

---

## 1. Demo Artifacts

### 1.1 Trump — runtime demo system (active in production)
| Item | File / location | Notes |
|---|---|---|
| 🧪☠️ `DEMO_MODE = true` (server) | `Sites/Trump/server/config/trumpDemo.js:13` | Hardcoded; no env/UI toggle. Drives all items below |
| 🧪 19 fictional showcase dishes + 5 "journeys" | `trumpDemo.js:15-47` | Tomahawk R1290, King & Queen Platter R1450, Springbok Carpaccio, etc. with hardcoded prices |
| 🧪 Showcase injection into AI | `server/services/aiService.js:318-435` (`showcaseMedia`, `buildShowcasePairing`, `addShowcaseCandidates`), called at `:452, :960, :1019` | Forces demo dishes to the **top** of recommendations/pairings/chat |
| 🧪 Event freebies ("complimentary Chocolate Lava Cake") | `trumpDemo.js:166-183` (`EVENT_META`, `detectEvent`); `aiService.js:597-624, 667-677` | Promises a free dessert on birthday/anniversary/etc. |
| 🧪 Waiter upsell scripts for demo dishes | `trumpDemo.js:71-91` (`WAITER_LINES`) | |
| 🧪 Client demo config mirror | `client/src/config/trumpDemoConfig.ts` | Same showcase data on the client |
| 🧪 Client demo-media resolver | `client/src/lib/demoMedia.ts` | |
| 🧪 Demo media service | `server/services/demoMediaService.js` | Auto-detects demo media manifest |
| 🧪 Public demo-media endpoint | `server/server.js:263` → `GET /api/demo-media` (and `/Trump`, `/trump`) | **Unauthenticated** |
| 🧪 Demo media assets | `client/public/media/trump/` (+ `README.md`) | Showcase images/videos (untracked dir per git status) |
| 🧪 Demo brand default | `server/utils/helpers.js:182` → `brandName 'Aurum & Ember'` | Not the real restaurant name |

### 1.2 Trump — demo/seed scripts (not run at runtime)
| Item | File | Notes |
|---|---|---|
| 🧪 Waiter demo seeder | `Sites/Trump/scripts/seed-waiter-demo.js` | Inserts fake waiters + random order history (see §5) |
| 🧪 Demo "polish" mutation | `Sites/Trump/scripts/apply-demo-polish.js` | One-time menu mutation (reclassify drinks, assign stock images) |
| 🧪 npm script `seed:waiter-demo` | `Sites/Trump/package.json:20` | Wrapper for the seeder |

### 1.3 Legacy sites — entire sites are demo/reference
| Item | Location | Notes |
|---|---|---|
| 🧪 Greek / Imli / AlPescatore | `Sites/{Greek,Imli,AlPescatore}/` | Monolithic Express + vanilla JS + Python chatbots; JSON/Mongo storage; reference only per CLAUDE.md |

### 1.4 Dual staff frontends (note, not strictly "demo")
- React SPA staff pages (`client/src/pages/AdminPage.tsx`, `WaiterPage.tsx`, `KitchenPage.tsx`) **and** legacy vanilla-JS panels (`frontend/scripts/admin.js`, `owner.js`, `waiter-app.js`, served via `admin.html`/`owner.html`/`waiter.html`) coexist. Two parallel implementations of the same surfaces = redundancy/drift.

---

## 2. AI Integrations

| Integration | Type | File | Status |
|---|---|---|---|
| Customer chat / recommend / pairing | **Deterministic** keyword+rule engine, **no LLM** | `server/services/aiService.js` (1,359 LOC) | ✅ active (but demo-injected, §1.1) |
| Waiter NLG wording enhancer | **Anthropic Messages API** (`claude-opus-4-8`) | `server/services/nlg/llmNlgProvider.js` → `https://api.anthropic.com/v1/messages` | ⚠️ opt-in: requires `TRUMP_LLM_PROVIDER=anthropic` + `TRUMP_LLM_API_KEY`; template fallback; 3-fail circuit breaker |
| NLG orchestration / template provider | Deterministic templates (always run first) | `nlg/nlgService.js`, `nlg/templateNlgProvider.js` | ✅ active |
| Media enrichment (image search) | Pexels + Pixabay REST | `server/services/mediaEnrichmentService.js` | ⚠️ opt-in keys; **also dead at runtime** — invoked only by a `node-cron` job whose dependency is missing (`server.js:340`) |
| Greek chatbot "JOSH 11.0" | Local Python ML, spawned child process (port 5001) | `Sites/Greek/ChatBot.py`, spawned in `Sites/Greek/server.js:1090` | 🧪 legacy |
| Greek recommender | **Groq** cloud LLM (Python, port 5002) | `Sites/Greek/recommend.py` | 🧪 legacy (see §3) |
| Imli chatbot | Local Python, spawned | `Sites/Imli/ChatBot.py`, spawn `Sites/Imli/server.js:861` | 🧪 legacy |
| AlPescatore chatbot | Local Python, spawned (port 5005) | `Sites/AlPescatore/ChatBot.py`, spawn `Sites/AlPescatore/server.js:848` | 🧪 legacy |

**Key point:** The production (Trump) "AI" makes **no model call** on the guest path. The only real model is the optional Anthropic NLG wording layer for waiters.

---

## 3. Groq Dependencies

| Location | Reality | Action implied |
|---|---|---|
| `Sites/Greek/recommend.py:10,17,220-291` | ✅ **Real** — `from groq import Groq`, `Groq(api_key=os.environ.get("GROQ_API_KEY"))`, `call_groq()` retry helper | Functional Groq dependency for Greek's recommender (Python `groq` pip package) |
| `Sites/Trump/package-lock.json:663,1190,1709` | ❌ **False positive** — `groq` substring inside base64 `integrity` hashes (e.g. `...mUYvOgroQOwY...`) | None — not a package |
| Stale docs 📄 | `FUTURE_MULTI_TENANT_PLAN.md`, `FULL_ARCHITECTURE_AUDIT.md`, `SYSTEM_FLOW_MAP.md`, `FRONTEND_BACKEND_RELATIONS.md`, `TRUMP_GREEK_COMPARISON.md`, `SERVER_RUNTIME_AUDIT.md` | Claim "Trump uses GROQ API" — **untrue in current code** |
| `Sites/Trump/**` source | None | Trump has **zero** Groq code |

**Conclusion:** Groq exists only in the legacy Greek Python recommender + the `GROQ_API_KEY` env it reads. No Groq SDK/package/call in Trump.

---

## 4. Backdoors & Auth Bypasses

| # | Backdoor | File:line | Severity |
|---|---|---|---|
| 1 | Trump `admin` account = role **owner**, password `123456789`, **force-reset every boot** | `helpers.js:152,230-236` + `accountService.js:132-145` | ☠️ Critical |
| 2 | Trump `waiter` / `kitchen` accounts, password `123456789`, force-reset every boot | `helpers.js:153-154,213-228` | ☠️ Critical |
| 3 | Prod config validator **does not check** demo-account passwords | `helpers.js:54-138` | ☠️ Critical (enables #1–2 in prod) |
| 4 | Legacy plaintext password fallback (`postgresUser.password === password`) | `accountService.js:221,235` | ☠️ High |
| 5 | Greek admin basic-auth, plaintext compare, fallback `'Kshitij'` | `Sites/Greek/server.js:65,152` | ☠️ High (legacy) |
| 6 | Imli admin basic-auth, plaintext compare, fallback `'Kshitij'` | `Sites/Imli/server.js:41,104` | ☠️ High (legacy) |
| 7 | AlPescatore admin basic-auth, plaintext compare, fallback `'admin'` | `Sites/AlPescatore/server.js:44,120` | ☠️ High (legacy) |
| 8 | Flask `debug=True` (Werkzeug debugger → RCE) in legacy chatbots | `Greek/ChatBot.py:1136`, `Imli/ChatBot.py:262`, `AlPescatore/ChatBot.py:370` | ☠️ High (legacy) |

---

## 5. Test / Seed Accounts & Data

| Item | File:line | Notes |
|---|---|---|
| Demo users `admin` (owner), `waiter`, `kitchen` | `helpers.js:213-236` (`demo:true, passwordFromEnv:false`) | Auto-created + refreshed; see §4 |
| Default `owner` / `manager` users | `helpers.js:200-212` | Passwords from env (`TRUMP_OWNER_PASS`/`TRUMP_MANAGER_PASS`) or shared fallback |
| 🧪 Seeded waiters: **Demetri, Sophia, Marcus, Lena** | `scripts/seed-waiter-demo.js:22` | Fabricated for leaderboard/analytics |
| 🧪 Seeded section tables `[5,7,12,18,21,24]` + random order history | `seed-waiter-demo.js:23,35` (`Math.random` qty/price) | Makes waiter analytics non-empty |
| 🧪 Fallback demo catalogue (if DB menu empty) | `seed-waiter-demo.js:26-32` | Dry-Aged Tomahawk R595, Reserve Cabernet, etc. |

---

## 6. Hardcoded Credentials & Secrets (literals in source)

| Value | File:line | Purpose |
|---|---|---|
| `123456789` | `helpers.js:152-154` | Trump demo admin/waiter/kitchen password fallback |
| `local-only-change-me` | `helpers.js:6` (`LOCAL_ONLY_DEFAULT_PASSWORD`) | Dev shared-password fallback (not used in prod) |
| `Kshitij` | `Sites/Greek/server.js:65`, `Sites/Imli/server.js:41` | Legacy admin password fallback |
| `admin` | `Sites/AlPescatore/server.js:44` | Legacy admin password fallback |
| `admin` (username) | `helpers.js:5` (`ADMIN_USERNAME`) | Fixed admin username |

**No** API keys, tokens, or DB passwords are hardcoded in source — those come from env (`*_API_KEY`, `DATABASE_URL`, `VAPID_*`, `TRUMP_SESSION_SECRET`). Confirm the real `.env`/secrets are not committed (check `.gitignore`).

---

## 7. External APIs / Outbound Calls

| Service | Endpoint | Caller | Auth | Status |
|---|---|---|---|---|
| Anthropic | `https://api.anthropic.com/v1/messages` | `nlg/llmNlgProvider.js:7` | `x-api-key` = `TRUMP_LLM_API_KEY` | ⚠️ opt-in |
| Pexels | `https://api.pexels.com/v1/search` | `mediaEnrichmentService.js:47` | `Authorization` = `PEXELS_API_KEY` | ⚠️ opt-in |
| Pixabay | `https://pixabay.com/api/` | `mediaEnrichmentService.js:62` | `key` = `PIXABAY_API_KEY` | ⚠️ opt-in |
| YouTube (embed) | `https://www.youtube.com/embed/<id>` | `client/src/lib/imageResolver.ts:406` | none (iframe) | ✅ used for menu videos |
| QR base domain | `https://emenyu.com/Trump` (hardcoded) | `client/src/pages/AdminPage.tsx:790` | n/a | ✅ used for table QR codes |
| Groq | Groq cloud (Python SDK) | `Sites/Greek/recommend.py:17` | `GROQ_API_KEY` | 🧪 legacy |
| MongoDB | connection (mongoose) | `Sites/Greek` (dep `mongoose ^8.16.3`) | env conn string | 🧪 legacy |
| PostgreSQL | `DATABASE_URL` | Prisma (Trump) | env | ✅ primary store |

Trump's own client makes API calls **only to its own origin** (relative `/Trump/...` paths via `client/src/constants/api.ts` `BASE_PATH`). No third-party JS keys shipped to the browser.

---

## 8. Environment Variables

### 8.1 Documented in `.env.example`
`NODE_ENV, TRUMP_APP_NAME, TRUMP_HOST, TRUMP_PORT, TRUMP_RESTAURANT_ID, TRUMP_PUBLIC_BASE_PATH, TRUMP_PUBLIC_ORIGIN, TRUMP_ALLOWED_ORIGINS, TRUMP_TRUST_PROXY, TRUMP_SESSION_SECRET, TRUMP_SESSION_COOKIE_NAME, TRUMP_SESSION_TTL_HOURS, TRUMP_OWNER_USER/PASS, TRUMP_ADMIN_PASS, TRUMP_MANAGER_USER/PASS, TRUMP_WAITER_USER/PASS, TRUMP_KITCHEN_USER/PASS, TRUMP_SECURE_COOKIES, TRUMP_HSTS_ENABLED, TRUMP_FORCE_HTTPS, TRUMP_RATE_LIMIT_WINDOW_MS, TRUMP_RATE_LIMIT_MAX, TRUMP_AUTH_RATE_LIMIT_MAX, TRUMP_BODY_LIMIT, TRUMP_URLENCODED_LIMIT, TRUMP_UPLOAD_MAX_MB, TRUMP_UPLOAD_MIME_TYPES, TRUMP_UPLOAD_EXTENSIONS, TRUMP_STATIC_CACHE_SECONDS, TRUMP_COMPRESSION_THRESHOLD_BYTES, LOG_LEVEL, PM2_*, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL`

### 8.2 Used in code but **NOT documented** in `.env.example` (config gap)
| Var | Used at | Why it matters |
|---|---|---|
| `TRUMP_LLM_PROVIDER` | `helpers.js:184` | Enables Anthropic NLG |
| `TRUMP_LLM_API_KEY` | `helpers.js:185` | Anthropic key |
| `TRUMP_LLM_MODEL` | `helpers.js:186` | default `claude-opus-4-8` |
| `TRUMP_LLM_TIMEOUT_MS` | `helpers.js:187` | |
| `TRUMP_DEMO_PASSWORD` | `helpers.js:152-154` | Overrides the `123456789` backdoor |
| `TRUMP_DEFAULT_PASSWORD` | `helpers.js:48,122` | Shared seed password |
| `STAGING_PASS` | `helpers.js:49,198` (+ legacy sites) | Shared secret/admin pass |
| `TRUMP_BRAND_NAME` | `helpers.js:182` | Real brand override |
| `TRUMP_TABLE_COUNT` | `helpers.js:181` | |
| `TRUMP_SESSION_SAMESITE` | `helpers.js:197` | |
| `TRUMP_SHUTDOWN_TIMEOUT_MS` | `helpers.js:242` | |
| `TRUMP_ALLOW_INSECURE_PRODUCTION_ORIGIN` | `helpers.js:117` | Loosens HTTPS origin check |
| `TRUMP_AUTH_POSTGRES_ENABLED` / `TRUMP_MENU_POSTGRES_ENABLED` / `TRUMP_ORDER_POSTGRES_ENABLED` | prisma services | Toggle Postgres per subsystem |
| `TRUMP_HEALTHCHECK_URL` | `scripts/healthcheck.js` | |
| `PEXELS_API_KEY` / `PIXABAY_API_KEY` | `mediaEnrichmentService.js:36-37` | Image enrichment |
| `DATABASE_URL` | Prisma (root `.env`) | Primary DB (documented separately per CLAUDE.md) |

---

## 9. Production Blockers (cross-ref to audit Report C)

1. ☠️ Backdoor accounts `admin`/`waiter`/`kitchen` = `123456789`, reset every boot (§4.1-3).
2. 🧪 `DEMO_MODE` injects fictional dishes + free-dessert promises into guest AI (§1.1).
3. No automated tests anywhere (repo-wide).
4. No payment capture / settlement.
5. Dual-write JSON+Postgres with no reconciliation (`fileService.js`).
6. No DB backup / PITR / DR runbook.
7. Demo brand + showcase defaults (`Aurum & Ember`).
8. Undocumented env (`TRUMP_LLM_*`, `TRUMP_DEMO_PASSWORD`) + missing `node-cron` dep → misconfig & dead cron.
9. Client `dist/` gitignored, manual build → stale-UI risk.
10. Single-tenant: no `Restaurant` table, `User` has no `restaurantId`.
11. Single PM2 fork + in-memory Socket.IO → no horizontal scale.
12. ☠️ Legacy sites: hardcoded admin passwords + Flask `debug=True` (RCE) (§4.5-8) — if any are internet-exposed.

---

*End of inventory. No code was changed. Removal/remediation pending your go-ahead.*
</content>
