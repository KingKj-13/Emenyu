# Future Roadmap

Ordered roughly by leverage (platform-wide benefit first), not urgency — see `MONDAY_DEMO.md` for what's actually blocking the demo (nothing on this list is).

## Near-term (next tenant or next Carmella iteration)

1. **Extend `intentClassifier.js`** with a dietary-safety-question intent and a decline-request intent — closes the two known Gaspard eval-phrase gaps (`AI_ENGINE.md`). Small, isolated, benefits Trump's chatbot too.
2. **Wire `--color-gaspard-accent` into the AI-suggestion components** (`RecommendationJourney`, chat message bubbles) so "Gaspard is speaking" actually renders in the reserved terracotta rather than gold. Purely a CSS class change in 2-3 component files.
3. **A live-ticking day-part transition.** Currently resolved once per page load. Either a lightweight client-side timer re-checking the same `DayPart` windows (reuse the exact boundary data already fetched, don't re-derive it), or a periodic `GET /api/config` re-fetch.
4. **Variant admin UI.** Variants are fully modeled and imported but have no dedicated admin editing surface yet — today, changing one means re-running the JSON import or a direct DB edit.
5. **A real Lighthouse + browser click-through pass** before the next demo — this session had no browser tooling available (see `TESTING.md`); the design brief's mobile-perf and visual acceptance criteria are unverified, not failing.

## Platform-wide (worth doing regardless of the next tenant)

6. **`User.restaurantId`.** Deliberately deferred in this build (AD-002) because of how many live auth call sites it touches. Worth its own careful, unhurried pass: add the column, find every `findUnique`/session-lookup keyed on bare `username`, update each to include `restaurantId`, test the full login/session path end-to-end before shipping. Unlocks non-prefixed usernames for every future tenant.
7. **Rename the `TRUMP_*` env-var prefix.** Cosmetic but genuinely confusing on a platform with 3+ tenants (`TRUMP_BRAND_NAME=Carmella by Sir Gaspard` reads oddly). Large, invasive, cross-cutting (config code, docs, deploy scripts, PM2 configs, secrets) — logged as debt in AD-001, not attempted here since it has no functional payoff for any specific tenant.
8. **Per-tenant `package.json`/dependency isolation.** Every tenant currently runs out of Trump's `node_modules`. Fine for now; would matter the moment a future tenant needs a different dependency version than Trump.
9. **A canonical tenant-string manifest.** The branding-sweep pattern (grep for hardcoded tenant strings, add a `VITE_*` override) is manual and has already missed instances twice historically (Demo's build). A single enumerated list of "these N strings/keys must be tenant-parameterized," checked against automatically, would catch this class of bug before a new tenant ships rather than after.
10. **Compound foreign keys for cross-tenant referential integrity.** `MenuItem.categoryId`, `MenuItemRecommendation.sourceItemId/targetItemId`, `RecommendationBundleItem.itemId` are plain `Int` columns, not `(restaurantId, id)` compound FKs — referential integrity across tenants currently depends on application-code discipline, not the schema itself (noted in AD-002/AD-003).
11. **Decide Gaspard's long-term architecture.** This build shipped Gaspard as a second deterministic persona reusing the existing template-based engine (AD-005) — a deliberate, documented choice given the timeline and the platform's zero-LLM design. If the client wants the prompt pack's full free-form conversational depth, that's a distinct, separately-scoped project: a first-ever `LlmNlgProvider` behind the existing (currently unused) `NlgProvider` abstraction, with its own cost/latency/safety review — not a weekend add-on to the current build.

## Explicitly out of scope, by design

- A runtime multi-tenant HTTP router (each tenant stays its own process — AD-006's reasoning still holds: Socket.IO rooms, rate-limiters, and in-memory caches all assume single-tenant-per-process).
- Rewriting `heroPairings.js` for Carmella's data shape — its wine-varietal domain model doesn't fit, and Carmella's curated-pairings tier already covers the need without it.
