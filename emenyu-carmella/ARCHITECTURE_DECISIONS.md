# Architecture Decisions — Carmella Build (eMenyu Platform v2)

This log records every significant architectural decision made while building **Carmella by Sir Gaspard** as the reference implementation for the next generation of the eMenyu platform. Carmella is not a one-off restaurant build: any structural improvement made here is meant to benefit every future tenant (Trump included), while restaurant-specific *content* (menu, copy, persona, theme) stays isolated per tenant.

Each entry follows: Previous implementation → New implementation → Why → Benefits → Risks → Future considerations.

Findings below come from a 6-subsystem audit of the live Trump codebase (2026-07-10) plus direct reading of `prisma/schema.prisma`, `Sites/Demo/` (the prior second-tenant precedent), and the Carmella design handoff in this folder.

---

## AD-001 — Tenant routing: fix hardcoded `/Trump` literals instead of repeating the nginx-rewrite hack

**Previous implementation:** A "tenant" is an OS process (`createConfig(baseDir)` in `Sites/Trump/server/utils/helpers.js`), env-driven and already basePath-aware in principle — `config.publicBasePath` is read from `TRUMP_PUBLIC_BASE_PATH`. But the actual Express route mounts in `server.js` (~16 occurrences) and 5 other server files (`orderController.js`, `waiterController.js`, `orderRoutes.js`, `helpers.js`) hardcode the literal strings `/Trump` / `/trump`, and ~14 route files each reimplement their own `[bare, /Trump/x, /trump/x]` alias array instead of calling one shared helper. `config.publicBasePath` is silently unused by the real routing. Demo Steakhouse's URL (`emenyu.com/demo/*`) exists only because nginx rewrites it onto the Node process's internal (and unchanged) `/Trump/*` routes — the app itself still believes it is Trump.

**New implementation:** Add one shared `tenantPaths(config, path)` helper in `server/utils/helpers.js` that builds `[path, `${config.publicBasePath}${path}`, `${config.publicBasePath.toLowerCase()}${path}`]`, and replace every hardcoded `/Trump`/`trump` literal and every duplicated local `alias()` function with it. React Router's `basename` also switches from a literal string to the `BASE_PATH` build constant it already almost uses everywhere else.

**Why:** This is the single highest-leverage fix in the entire audit — it removes ~14 duplicated blocks of the same logic *and* is the only way `/Carmella/Table{n}/menu` can be served natively rather than through another nginx rewrite hiding a widening gap between the public URL and the app's internal self-image. Repeating the Demo pattern a third time was explicitly the thing the audit flagged as "worked for a low-stakes demo, don't repeat for a reference implementation."

**Benefits:** Every future tenant gets true native routing for free. Removes a latent footgun (`config.publicBasePath` silently doing nothing). Net reduction in code (one helper replaces ~14 duplicates).

**Status: implemented and regression-tested (2026-07-10).** `tenantPaths(config, path, { includeBare })` added to `helpers.js`; every hardcoded `/Trump`/`trump` literal replaced across `server.js` and 12 route files (`analyticsRoutes`, `recommendationAnalyticsRoutes`, `recommendationBundleRoutes`, `menuRoutes`, `dealRoutes`, `kitchenRoutes`, `pushRoutes`, `ratingRoutes`, `reservationRoutes`, `uploadRoutes`, `waiterApiRoutes`, `operationsRoutes`, `authTokenRoutes`, `orderRoutes`), plus three incidental hardcoded-path bugs found and fixed while in these files: `orderController.js`'s `redirectRoot()` was hardcoded to `/Trump/table1` regardless of tenant; `pushService.js`'s three notification payloads hardcoded `url: '/Trump/Waiter'` (would have deep-linked every tenant's push notifications to Trump's waiter app); `requestLogger.js`'s health-check log-suppression list was hardcoded to `/Trump/healthz`/`/Trump/readyz`. `middleware/security.js`'s own local `aliasPaths()` helper was left as-is — it was already correctly config-driven (only a comment mentioned "Trump"), just a separate implementation of the same idea; noted as a dedup opportunity in `FUTURE_ROADMAP.md` rather than risking a change to security-critical CSP/rate-limit code under this timeline. Verified live: started Trump locally (`node server.js`, port 3012) and confirmed identical behavior at bare, `/Trump/`, and `/trump/` paths for health checks, favicon, static client/media, all API routes, the dual-case `Admin`/`admin`/`Waiter`/`Kitchen` page routes, the auth-guarded 401/302 responses, and the previously-flagged `/Trump/api/push/vapid-key` endpoint.

**Risks:** This touches shared route-registration code that Trump's live, revenue-generating process depends on. Mitigated by: (a) the change is mechanical (string literal → variable) with no behavioral branching, (b) Trump's own `.env` sets `TRUMP_PUBLIC_BASE_PATH=/Trump`, so its resolved paths are byte-identical before and after, (c) required regression check — start Trump locally post-change and hit representative routes at `/Trump/*` before this is considered done.

**Future considerations:** The `TRUMP_*` env-var prefix itself (`TRUMP_RESTAURANT_ID`, `TRUMP_BRAND_NAME`, …) is a confusing leftover for a multi-tenant platform — logged as platform debt, not fixed now (large, invasive, cross-cutting rename with no functional payoff for Carmella specifically).

---

## AD-002 — Database: extend the shared Prisma schema in place, not a parallel schema

**Migration implication caught by regression testing (2026-07-10):** because this is a *shared* schema, the additive migration must be applied to every database that runs it — not just Carmella's. A combined Trump/Demo/Carmella regression pass after this migration landed found Demo's dedicated `emenyu_demo` database had NOT received it (`prisma migrate deploy` was only run against `emenyu_local` and the new `emenyu_carmella`), causing `GET /api/menu` to fail outright on Demo with `column "MenuCategory.intro" does not exist`. Fixed by running `prisma migrate deploy` against `emenyu_demo` (clean, no drift, unlike `emenyu_local`'s Luxury-adjacent state — see below). **Lesson for future shared-schema migrations: enumerate every tenant database explicitly, don't assume "local dev" means one database.** Production still needs this same migration applied before Carmella (or this fix) can go live there.

**Previous implementation:** Single shared `prisma/schema.prisma`, every operational model tagged `restaurantId String @default("trump")`. `MenuItem` has no `story`/`subtitle`/variant/addon support and only a boolean `available`. `MenuCategory`'s parent/child tree already resembles a chapter→section structure but has no narrative `intro` field. `RecommendationBundle` has no `daypart` filter or fixed `total` override. `MenuItemRecommendation` (source/target/reason) is structurally close to a pairings-with-note model but isn't one yet. `User` has no `restaurantId` at all — usernames must be globally unique across every tenant, worked around twice already (env-var indirection for Trump's admin account, an in-memory account mock for Demo).

**New implementation:** Additive migration on the existing schema: `story`, `subtitle`, and an `availability` field on `MenuItem` (keeping the existing boolean for Trump's admin UI); a net-new `MenuItemVariant` model (itemId FK, name, price, imagePath, isAddon); `intro` on `MenuCategory`; a net-new `DayPart` model (restaurantId, slug, name, fromTime, toTime, greeting, leadChapters/gaspardChips/suggestStrip as Json); `total`/`daypart` on `RecommendationBundle`; Carmella's pairings reuse the existing `MenuItemRecommendation` model with a new `PAIRING` recType value and its existing `reason` field as the note — **zero schema change needed for pairings**, just an app-level convention.

**Reconsidered and reverted: `User.restaurantId`.** I initially drafted adding `restaurantId` to `User` with a compound-unique `(restaurantId, username)`, replacing the current global-unique `username`. On reflection this is materially riskier than the rest of this migration: every `findUnique`/session-lookup call site keyed on `username` alone (login, cookie-session validation in `createRoleAuth`, account CRUD, and the native waiter app's auth) would need to be found and updated to pass `restaurantId` too, across code the live Trump tenant's authentication depends on right now. That's a wide, auth-critical refactor to rush on a 3-day timeline, and the downside of getting it wrong (locking out Trump's real staff) vastly outweighs the upside of "proper" tenant-scoped accounts this week. **Decision: keep global-unique usernames as the standing design for now** — Carmella gets real (non-mock) staff accounts using distinct, prefixed usernames (e.g. `carmella-owner`, `carmella-manager1`), the same convention already used for Demo's seed accounts, just with real passwords/sessions instead of Demo's no-auth bypass. Documented here rather than silently worked around, per the audit's own suggested fallback.

**Why:** Every remaining gap (story/subtitle/availability/variants/chapters/dayparts/bundle fields/pairings) has an existing model shape close enough that a parallel/forked schema would be pure duplication — duplication directly contradicts "benefits every future restaurant." The `User` gap is real but its proper fix has a blast radius (live auth) that doesn't match this week's risk budget.

**Benefits:** One migration serves Trump, Demo, Carmella, and every future tenant identically for everything except accounts. Closes a real security gap in the same pass (see AD-003). Zero risk to Trump's live authentication.

**Risks:** Schema changes touch the one Postgres database Trump's production traffic depends on. Mitigated by: additive-only changes (no column removals, no type changes on existing columns), applied first against the local dev database (`emenyu_local`), never against `DATABASE_URL` pointing at production without an explicit, separate confirmation step.

**Future considerations:** Revisit `User.restaurantId` as its own deliberately-scoped project (not bundled into a feature deadline) once there's time to find and update every username-keyed lookup and test the auth path end-to-end. Also revisit whether Carmella's pairings outgrow being mixed into `MenuItemRecommendation`'s chef-rec rotation/season machinery — reuse was chosen here, but a dedicated model is a cheap fallback if the AI layer finds the mixing awkward.

---

## AD-003 — Fix cross-tenant write-path isolation gap (independent security fix)

**Previous implementation:** `prismaMenuService.js`'s `toggleItemAvailability`, `updateItemMedia`, `updateChefRecommendation`, and `deleteChefRecommendation` all mutate rows using `where: { id }` alone — no `restaurantId` check. `MenuItem.id` and `MenuItemRecommendation.id` are global autoincrement sequences shared across every tenant's rows in the same tables. An authenticated admin session on any one tenant's process could mutate another tenant's row by guessing/knowing its numeric id.

**New implementation:** Every one of these update/delete calls gets `restaurantId: this.restaurantId` added to its `where` clause.

**Why:** This was a latent, already-exploitable gap discovered incidentally while auditing for Carmella — it predates Carmella and affects Trump/Demo today, just never triggered because nobody had reason to pass a foreign id. It becomes materially more likely to matter the moment a third tenant's rows share these tables.

**Benefits:** Closes a real IDOR-style cross-tenant data leak. Small, mechanical, low-risk change.

**Risks:** Minimal — this narrows an existing query, it cannot make a previously-working same-tenant request fail (the row already belonged to `this.restaurantId` in every legitimate call site).

**Future considerations:** None of `MenuItem.categoryId`, `MenuItemRecommendation.sourceItemId/targetItemId`, or `RecommendationBundleItem.itemId` are compound-FK'd to `(restaurantId, id)` — referential integrity across tenants still depends on application-code discipline, not the schema. Worth a dedicated pass later; out of scope for Carmella's Monday timeline.

**Status: implemented (2026-07-10).** `toggleItemAvailability`, `updateItemMedia`, `updateChefRecommendation`, and `deleteChefRecommendation` in `prismaMenuService.js` now use `updateMany`/`deleteMany` scoped by `(id, restaurantId)`, matching the pattern `updateItem()` already used elsewhere in the same file.

---

## AD-004 — Theming: tenant-scoped token layer + `data-theme` day-part attribute, Trump's tokens untouched

**Previous implementation:** Trump has exactly one static theme — CSS custom properties in `client/src/index.css` (`:root`), no `ThemeProvider`, no React theme context, no `data-theme` switching, no Tailwind. Demo Steakhouse set no precedent (it reused Trump's compiled theme verbatim). Carmella's own interactive prototype (`design/carmella-prototype.html`) already implements a working 3-mode `data-theme="morning"|"midday"|"golden"` toggle driven by a simple `getDaypart(hour)` function — proving the pattern works, just not yet in the real app.

**New implementation:** A tenant-scoped stylesheet loaded only under Carmella's build (Trump's `index.css` stays byte-for-byte unchanged), using the exact palette from the build brief (`--gaspard-green`, `--terracotta` reserved exclusively for AI-suggestion UI, etc.). A day-part resolver (pure function of restaurant-local SAST time, config-driven cutover hours from `carmella-menu-data.json`'s `dayparts` block) sets a `data-theme` attribute on a top-level wrapper, propagated via a new lightweight React context.

**Why:** Reuses a pattern already validated in the design reference rather than inventing a new mechanism, and satisfies Carmella's own non-negotiable ("Trump tenant must be pixel-identical, no shared-theme leakage") by construction — Trump's stylesheet is never touched.

**Benefits:** Zero new dependencies (no Tailwind/CSS-in-JS retrofit). Spacing/radius/shadow/z-index tokens stay shared/brand-agnostic; only color and font tokens are tenant-specific. Future tenants get a working day-part-theme pattern to copy instead of re-deriving one.

**Risks:** None to Trump (isolated stylesheet, isolated route). Carmella-side risk is cosmetic only (wrong mode at the wrong hour) — cheap to fix.

**Future considerations:** The audit also surfaced pre-existing Trump-only token drift (a handful of `rgba(200,165,85,X)` literals not migrated to `var(--color-gold-rgb)` during the July 10 unification pass, plus a stale pre-rebrand RGB value in `waiter-theme.css`). Logged as platform tech debt in `FUTURE_ROADMAP.md`, not fixed inline — unrelated to Carmella's Monday scope.

---

## AD-005 — AI persona: Gaspard ships as a second deterministic persona reusing the existing scoring engine, not a live LLM integration

**Previous implementation:** Trump's recommendation engine cleanly separates into a **scoring layer** (`recommendationScoring.js` + Phase-4 companions — pure functions over tags/prices/cart/history, zero dish names or copy, already reusable as-is) and a **presentation layer** (`templateNlgProvider.js`, `hospitalityKnowledge.js`, `reasonComposer.js` — a deterministic, 100%-offline intent-classifier + template-composer; root `CLAUDE.md` documents this as a deliberate design choice: "no external LLM/API calls"). The persona **name** is already cleanly config-injected (`config.assistantName`), but persona **voice/guardrails/day-part briefs** don't exist as a distinct, swappable layer — they're smeared across hardcoded template branches. `emenyu-carmella/design/gaspard-prompt-pack.md`, by contrast, is written as a literal LLM system prompt (free-text generation, `{{TEMPLATE_VARS}}`, an `{item:ID}`/`{action:*}` protocol) — it presumes a real model call that does not exist anywhere in this codebase today.

**New implementation:** Build "Ask Gaspard" as a second `GaspardNlgProvider`-style module (mirroring the pattern the waiter app's `NlgProvider` interface already half-establishes), calling the *same* `recommendationScoring.js`/pipeline functions Donald uses, with Gaspard's own tag-driven copy, day-part briefs, and hard guardrails (allergies-first, no invented items, no discount language) implemented as deterministic rules rather than free-form generation. `hospitalityKnowledge.js`'s `KNOWLEDGE_DIR` and `nlgService.js`'s `PERSONALITY_FILE` get threaded through `config` (mirroring `heroPairings.js`'s existing injectable-`file` pattern) so Carmella loads its own knowledge/personality files instead of Trump's.

**Why — this is the one decision with a real product tradeoff, stated plainly:** Building the prompt pack's literal free-form conversational design would mean this codebase's *first-ever* live LLM integration, on a 3-day timeline, with no existing safety/cost/latency review process. Given the stated Monday priority order (stability > performance > UI > AI > animation > docs), and that CLAUDE.md already documents zero-LLM as an intentional platform property, a deterministic persona is the responsible default: it reuses proven infrastructure, ships reliably, and still delivers the pairing logic, day-part awareness, allergy-first guardrails, and `{item:ID}` chip protocol from the prompt pack — just via authored templates and tag rules instead of live generation. Gaspard's *voice* will be less flexible/conversational than the prompt pack's ideal, especially on open-ended guest questions outside the anticipated intents.

**Benefits:** Reuses the entire scoring engine unmodified (no duplicated recommendation logic — directly satisfies "reuse the Recommendation Brain, improve it, don't replace it"). Ships reliably by Monday. Fixes a real pre-existing debt in the same pass (`hospitalityKnowledge.js`/`nlgService.js`'s hardcoded paths, `signatureFor()`'s hardcoded Trump-name regex, `templateNlgProvider`'s non-tag-driven dish-name matching).

**Risks:** Gaspard will occasionally fall back to a generic reply on guest questions outside its authored intents/tag rules, where the prompt pack's literal design would have handled them gracefully via free generation. This is the direct cost of the decision and should be visible in the Monday demo script (steer the walkthrough toward the 10 eval-checklist cases, which a deterministic system is built to pass).

**Future considerations:** If the client wants genuine open-ended conversational depth post-Monday, revisit as a deliberate, separately-scoped project: building a real `LlmNlgProvider` behind the existing (currently unused) `NlgProvider` abstraction, with its own cost/latency/safety review — not something to retrofit under a deadline.

---

## AD-006 — Deployment pattern: keep process-per-tenant, drop the nginx-rewrite dependency

**Previous implementation:** Demo Steakhouse's precedent: a second PM2 process requiring Trump's `server.js` unchanged, differentiated by env vars, with its own dedicated database — sound in shape, but relying on nginx to rewrite its public path onto the Node process's internally-hardcoded `/Trump/*` routes (see AD-001), no day-part theme precedent, no schema extension precedent (reused Trump's models untouched), and a manual/reactive brand-string sweep that missed instances twice.

**New implementation:** `Sites/Carmella/` follows the same process-per-tenant shape (own `server.js` requiring Trump's `startServer()` unchanged, own `.env`, own dedicated database, own PM2 app in `ecosystem.config.js`, own Vite build via `client/.env.carmella`) — but sits on top of AD-001's native-routing fix instead of an nginx hack, and gets its own tag/knowledge directory per AD-005 instead of relying on generic-name collision-avoidance.

**Why:** The deployment topology itself was never the problem — it's proven and reusable. The problems were all downstream of the two shortcuts (hardcoded internal routes, no persona-swap seam) that AD-001 and AD-005 already fix.

**Benefits:** Third tenant stood up with zero Trump code forked. Every future tenant repeats this same recipe.

**Risks:** None beyond AD-001/AD-002/AD-005's own risk sections, which this decision depends on.

**Future considerations:** No per-tenant `package.json`/dependency isolation exists yet (Demo and Carmella both run out of Trump's `node_modules`) — acceptable for now, logged as platform debt if a future tenant needs different dependency versions than Trump.

---

## AD-007 — Recommendation engine bugfix: chef-curated pairings now actually bypass the beverage-headline rule

**Previous implementation:** `recommendationRules.js`'s `applyCategorySafety()` runs four beverage-safety rules (R1 cap, R2 one-primary, R3 no-secondary-headline, R4 already-in-cart) on every beverage candidate. A `chef === true` bypass already existed for the *stage* rules (R5: no starter mid-meal, no second main) — but was missing entirely from the beverage rules. Verified live: importing Carmella's 39 curated pairings (e.g. "A Day in Paris" → Cappuccino/Red Juice) and testing `/api/ai-pairing` returned neither — R3 ("a soft/hot beverage must not headline unless closing") silently dropped both, and the reply fell back to suggesting Champagne instead, with generic template reasoning instead of the curated note. This is a real bug in the shared engine, not a Carmella-only issue: any tenant's admin-curated chef pairing that happens to be a non-primary beverage (coffee, juice, soft drink) was silently overridden by an algorithmic diversity heuristic.

**New implementation:** Added `!chef` to R1 (beverage cap) and R3 (secondary-headline, water-headline). R2 (never two primary beverages) and R4 (don't re-suggest a kind already on the table) stay enforced regardless of chef status — those protect basic table-setting sanity, not algorithmic diversity, so a curated pairing shouldn't override them either.

**Why:** The candidate-scoring code's own comment already documents the intended invariant — "Chef recommendations keep their existing 'always wins' position" (aiService.js, right before the final chef/non-chef re-rank) — R3 lacking the bypass was an implementation gap against that stated design, not an intentional restriction. R3 itself ("lead with wine, not coffee") is a steakhouse-appropriate upsell heuristic that does not generalize: Carmella pairing a croissant with a cappuccino is exactly correct, not a diversity violation to suppress.

**Benefits:** Fixes pairing quality/explainability for Carmella (a core stated priority) *and* closes a latent bug that would have silently undermined Trump's own admin-curated chef pairings for any non-wine/cocktail beverage — benefits every tenant, not just Carmella, exactly the kind of shared-engine improvement this build is meant to surface. Verified live before/after: pairing box for "A Day in Paris" now returns Cappuccino (R35) + Red Juice (R70) with their authored notes; bundle `morning-in-paris` (which references the same items) now also prices correctly.

**Risks:** Narrowly scoped — only changes behavior for candidates already flagged `chef: true` (Trump's Phase 3 admin-curated `MenuItemRecommendation` rows and Carmella's imported pairings), a small, deliberately-curated set. Could not verify against Trump's live chef-recommendation data in this session (local Trump dev process has no reachable database — see known issues in `MONDAY_DEMO.md`), so this should get one live check against Trump's real admin-curated pairings before the next Trump deploy, even though the change is additive/permissive (it only ever *keeps* a candidate that was previously dropped, never drops one that was previously kept).

**Migration implications:** None — pure application-logic change, no schema/data migration involved. Also discovered and fixed in the same pass: `dbItemToJson()`'s price now falls back to the cheapest non-addon variant price when an item has no base price (Carmella has 34 such items — coffees, wines by the glass) so cards/pairings/bundles never show a bare R0; the Carmella import script's bundle-item price lookup got the same fallback.
