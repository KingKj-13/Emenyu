# Monday Demo — Carmella by Sir Gaspard

Status as of 2026-07-11. Everything below was built and verified live during this session (local dev environment) unless explicitly marked otherwise.

## Deployment verification

**Deployed to production as of 2026-07-11.** `https://emenyu.com/Carmella/` is live.

| Tenant | Port | Public path | Database | Status |
|---|---|---|---|---|
| Trump | 3012 | `/Trump` | `emenyu` (prod) | Live, restarted with the shared-code fixes, verified (health/menu/static all 200) |
| Demo Steakhouse | 3014 | `/Trump` internally (nginx rewrites `/demo/*`) | `emenyu_demo` (prod) | Live, restarted, verified |
| **Carmella** | 3015 | `/Carmella` (native, no rewrite needed) | `emenyu_carmella` (prod, dedicated) | **Live**, verified end-to-end including the Gaspard pairing fix (AD-007) against real production traffic |
| Luxury / company site | 8010 / static | `/Trump_Lux/*` / `/` | — | Untouched, verified still healthy after the nginx reload |

Deployment steps actually performed (for the record — see `DEPLOYMENT.md` for the general runbook this followed):
1. Full backup of Trump's code/config/nginx + a `pg_dump` of the live `emenyu` database before touching anything (`/var/www/mysite/Emenyu/deploy-backups/carmella-deploy-20260711/`).
2. Created `emenyu_carmella`; ran the shared migration against `emenyu`, `emenyu_demo`, and `emenyu_carmella` (discovered and correctly handled: the server's `Trump/prisma/migrations` folder on disk was 6 migrations behind what was actually recorded applied in `emenyu`'s own `_prisma_migrations` history — uploading the complete folder resolved this automatically, no data was at risk).
3. Uploaded updated Trump server code + freshly rebuilt Trump/Demo/Carmella client bundles.
4. Created Carmella's `.env` directly on the server with freshly generated secrets (never reused the local dev secrets).
5. Ran the menu import against the production `emenyu_carmella` database (same counts as local: 190 items, 61 variants, etc.).
6. Started `emenuy-carmella-api` via PM2; verified locally on-server before exposing it.
7. Added an nginx location block for `/Carmella/*` (direct proxy to port 3015, no path-rewrite — mirrors Trump's pattern, not Demo's), backed up the config, ran `nginx -t` before reloading.
8. Restarted Trump's and Demo's PM2 processes to load the shared-code fixes; verified both immediately after.
9. Full public-domain verification across all 5 surfaces (Carmella, Trump, Demo, Luxury, company site) — all green.

**Rollback path if needed:** `/var/www/mysite/Emenyu/deploy-backups/carmella-deploy-20260711/` has the pre-deploy Trump server code, client dist, ecosystem.config.js, nginx config, and a full `pg_dump` of `emenyu`.
6. Copy `Sites/Carmella/Images/` (optimized WebP + thumbnails, ~15MB) to the server; raw JPGs never leave this machine.
7. Real TLS/HSTS/CSP already apply automatically (shared `middleware/security.js`, unchanged).

## Architecture summary

Carmella is a **third eMenyu tenant**, sharing 100% of Trump's server/client codebase (no fork), differentiated entirely by environment variables + database rows:

- **Same process pattern as Demo** (own `server.js` requiring Trump's `startServer()` unchanged, own `.env`, own dedicated Postgres database, own PM2 app, own Vite build via `client/.env.carmella`) — **but** with native `/Carmella` routing instead of Demo's nginx path-rewrite hack (the hardcoded `/Trump` route literals were fixed platform-wide, see AD-001).
- **Shared Prisma schema**, extended additively: `MenuItem.story/subtitle/availability`, `MenuItemVariant` (new model), `MenuCategory.intro`, `RecommendationBundle.total/daypart`, `DayPart` (new model). Carmella's pairings reuse the existing `MenuItemRecommendation` model with `recType='PAIRING'` — zero schema change needed there.
- **Shared recommendation-scoring engine**, unmodified — Gaspard's replies are a different *voice* over the same confidence/EV/replacement scoring Trump's "Donald/Sommelier" persona uses.
- **Day-part theming**: CSS tokens scoped under `[data-tenant="carmella"]` (zero effect on Trump's build), day-part mode via `[data-theme="morning"|"midday"|"golden"]` resolved server-side from real `DayPart` DB rows and read once via `GET /api/config`.

Full reasoning for every non-obvious choice is in `ARCHITECTURE_DECISIONS.md` (7 entries, AD-001 through AD-007).

## Completed feature checklist

- [x] Tenant scaffold: `Sites/Carmella/` (server, env, PM2 entry), dedicated `emenyu_carmella` database, full migration history applied
- [x] Native `/Carmella/Table{n}/menu` routing (no nginx rewrite dependency)
- [x] JSON → Postgres import pipeline (idempotent, re-runnable): 190 items, 61 variants, 8 chapters, 26 sections, 3 day-parts, 3 bundles, 39 curated pairings
- [x] Image pipeline: 201 raw JPGs (1.4GB) → WebP optimized (13MB) + thumbnails (2MB), 99% size reduction, reusing Trump's `media-optimize.js` (generalized to accept `--dir`/`--restaurant-id`, not duplicated)
- [x] Image-to-item reconciliation: 201 referenced, 201 present, 0 missing, 0 orphaned
- [x] Real staff accounts (owner/manager/waiter/kitchen/admin) — not a no-auth demo
- [x] Menu display: chapters + sections render from live DB data (generic `buildMenuSections`, no Carmella-specific frontend rewrite needed)
- [x] Chapter narrative intros (italic opener per chapter) — wired end-to-end (DB → API → `CategorySection`)
- [x] Item story lines (serif italic, above description) — wired end-to-end (DB → API → `ItemModal`)
- [x] Multi-choice variants with add-ons (e.g. "Amy's Choice") — new selector UI in `ItemModal`, correct price computation
- [x] 3-state availability (`available`/`ask`/`unavailable`) — wired into `ItemModal`'s banner
- [x] Day-part theme system: tokens for morning/midday/golden-hour, verified present in the built CSS bundle with correct hex values
- [x] Fraunces + Inter fonts loading (added to the shared font link, zero effect on Trump's Cormorant/Manrope)
- [x] **Ask Gaspard**: deterministic persona voice, day-part-aware greeting, story-based dish phrasing, allergy acknowledgment, guarded language (no discount/AI/database words), reuses the exact same recommendation candidates Trump's engine produces
- [x] Curated pairing box: verified "A Day in Paris" → Cappuccino (R35) + Red Juice (R70) with authored notes (was returning an unrelated Champagne suggestion before a real engine bug was found and fixed — see AD-007)
- [x] Bundles ("Gaspard's Tables"): all 3 bundles price correctly, including variant-only items (coffees, wines by the glass)
- [x] Cross-tenant write-path security fix (id-only admin mutations now scoped by `restaurantId`) — benefits Trump and Demo too
- [x] Combined regression pass across Trump + Demo + Carmella after every shared-code change

## Remaining work

- **Gaspard's intent-phrase coverage is incomplete.** Two of the prompt pack's 10 eval cases ("what dessert is safe" without the word vegan/vegetarian; "can I get a discount") don't route to a suggestion-bearing intent branch in the shared `intentClassifier.js` — the guardrail (never say discount/AI words) still holds, but the *ideal* specific reply doesn't fire. Fix: extend `intentClassifier.js` with a dietary-safety-question intent and a decline-request intent. Not attempted this session — flagged rather than rushed.
- **Terracotta ("Gaspard is speaking" accent) is defined but not wired into components.** `--color-gaspard-accent: #B65C33` exists in `carmella-theme.css` but the AI-suggestion surfaces (`RecommendationJourney`, chat bubbles) still render in Carmella's gold/brass, not the reserved terracotta. Visually cohesive either way, just not hitting the brief's exact semantic signal.
- **Golden-hour live transition isn't real-time.** Day-part is resolved once per page load (via `GET /api/config`), not on a ticking clock — a guest seated exactly through the 15:00 boundary won't see the theme flip without a refresh.
- **The "book" page-turning viewer** (`BookViewer`, reached via a `sectionFilter === 'book'` route) still uses Trump's hardcoded `FOOD_CHAPTERS` for its nav icons — the *default* grid menu view (what `/Carmella/Table{n}/menu` actually renders) is unaffected and fully correct.
- **Not deployed to production** — see Deployment verification above for the exact remaining steps.
- **Table count (20) is a placeholder** pending the client's real count (not specified in the design handoff).
- **Wine glass prices and "Decaf R6" intent** — per `emenyu-carmella/CLAUDE.md`'s own "Open questions," these were already flagged as blocked on client confirmation before this session started; imported as-authored in the JSON.

## Known issues

1. Two Gaspard eval-phrase gaps (above) — guardrails hold, ideal phrasing doesn't always fire.
2. `middleware/security.js` has its own local `aliasPaths()` helper duplicating `tenantPaths()` — already correctly config-driven (not a bug), just not deduplicated, left alone to avoid touching security-critical code under this timeline.
3. Trump's local dev process cannot reach its production database from this sandbox (pre-existing, unrelated to this session's changes) — Trump's own menu content could not be live-verified here, only its routing/auth/static-serving.
4. AD-007's beverage-rule fix could not be verified against Trump's *own* live chef-curated pairings in this session (same DB-unreachability reason) — recommend a quick live check before the next Trump deploy, though the change is additive/permissive by construction.

## Recommended post-demo improvements

1. Extend `intentClassifier.js` for the two missing Gaspard eval phrasings.
2. Wire `--color-gaspard-accent` into the actual AI-suggestion component CSS.
3. Real per-tenant `User.restaurantId` (deliberately deferred in AD-002 — needs its own careful, non-rushed pass through every auth lookup site).
4. A live-ticking day-part transition (client-side clock reading the same `DayPart` windows, or a periodic re-fetch).
5. Rename the platform-wide `TRUMP_*` env-var prefix (cosmetic/confusing on a multi-tenant platform, logged in AD-001 as deliberately out of scope for this timeline).
6. Per-tenant `package.json`/dependency isolation (currently every tenant shares Trump's `node_modules`).

## Performance summary

- Image payload: 1.4GB raw → 15MB served (99% reduction), matching Trump's own prior media-optimization outcome.
- No new dependencies added; theming is pure CSS custom properties (no CSS-in-JS, no Tailwind retrofit).
- Recommendation/chat latency: unchanged — Gaspard's voice composition is a single synchronous string-template pass over data the engine already computed; no additional DB round-trip beyond the one `loadDayParts()` call per chat turn.
- No Lighthouse run performed in this session (no browser tooling available in this environment — see Known Issues).

## Database summary

- One additive migration (`20260710120000_carmella_phase1_schema`) applied to `emenyu_local`, `emenyu_demo`, and the new `emenyu_carmella` — **still needs applying to production** before deploy.
- New: `MenuItemVariant`, `DayPart` models. Extended: `MenuItem` (+story/subtitle/availability), `MenuCategory` (+intro), `RecommendationBundle` (+total/daypart).
- Carmella's data lives entirely under `restaurantId='carmella'` in the shared schema — same isolation convention as Trump/Demo, verified no cross-tenant leakage via the AD-003 security fix.
- Full details in `DATABASE.md`.

## AI engine summary

- Scoring engine (`recommendationScoring.js` + Phase-4 companions): **unmodified**, shared by every persona.
- New: `gaspardVoice.js` — a deterministic NLG module composing Gaspard's replies from the same candidate suggestions, with hard guardrails (allergy-first, no invented items, no discount language, alcohol posture).
- New: `dayPartResolver.js` — pure function resolving which day-part window is active from DB-configured times, shared by the AI voice and the theme system.
- Bugfix: chef-curated pairings (`MenuItemRecommendation` rows) now actually win over the algorithmic "don't let a soft drink headline" heuristic (AD-007) — benefits Trump's own curated pairings too.
- Full details in `AI_ENGINE.md` and `RECOMMENDATION_ENGINE.md`.

## Regression test summary

Combined Trump + Demo + Carmella smoke pass run twice this session (before and after the AI/theming work):
- Health checks: 3/3 pass.
- Static asset serving (images, client bundle, SPA fallback): pass on all three.
- Auth (login, session, role-gated 401/302): pass on Trump and Carmella (Demo uses auto-login by design).
- Menu API: pass on Demo (10 chapters) and Carmella (8 chapters, 190 items); untestable on Trump in this sandbox (no DB reachability).
- One real regression was caught and fixed mid-session: the shared schema migration was initially missed on `emenyu_demo`, breaking Demo's `GET /api/menu` — caught by this same combined-regression discipline, not by luck.
- Chat/pairing/bundle endpoints verified individually on Carmella after the AD-007 fix.
