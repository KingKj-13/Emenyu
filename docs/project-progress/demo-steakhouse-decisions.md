# Demo Steakhouse — decisions log (for KJ review)

Per instruction: proceeding without stopping to ask, picking the recommended option at every judgment call, and logging them here instead. Nothing below is a question I'm blocked on — it's a record of calls I made so you can review/override anything after the fact.

The full architecture rationale (why a second process, why nginx does the prefix rewrite instead of a server-side refactor, etc.) is in the plan file the session approved: `C:\Users\kshit\.claude\plans\glittery-imagining-melody.md`. This log only covers judgment calls made *during* implementation that weren't already spelled out there.

## Backend

- **Q: Fork the AI knowledge/hero-pairing JSON files (trump_hero_pairings.json, knowledge/*.json) per tenant, or leave them shared?**
  A: Left shared (demo process reads Trump's real files via `__dirname`-relative paths, unchanged). Checked the actual content: the only "Trump" text is in internal matching keys (dish names like `"Trumps Salmon Sashimi"`) and one metadata field, never in the user-facing reason/note strings. Since the demo's seeded menu items use different generic names, these entries simply won't fuzzy-match and the AI falls back to generic reasoning — no visible branding leak, and this avoids a much larger module-load-time refactor (aiService.js loads `SPECIAL_WORDS`/`UPSELL_TIMING` as top-level constants at require-time, not per-instance). Trade-off: if you ever name a demo item something that coincidentally matches one of Trump's real hero-pairing dish keys (e.g. literally "Salmon Sashimi"), it'll surface Trump's real sommelier note for that dish. Low probability given the generic names used (Wagyu Steak, Ribeye, Tomahawk, Fillet, etc.).

- **Q: How to stop the demo process's account-seeding step from touching Trump's real `owner`/`manager`/`waiter`/`kitchen`/`admin` accounts (the `User` table has no restaurantId column — usernames are global)?**
  A: Two layers: (1) demo `.env` sets unique usernames (`TRUMP_OWNER_USER=demo-owner` etc., and made the previously-hardcoded `admin` username configurable via `TRUMP_ADMIN_USER` too — it wasn't overridable before, which was itself a latent collision risk even before this task). (2) The auto-login bypass means these accounts are never actually used for real login anyway. (3) Went further than originally planned: the demo Admin's "Staff" tab does **not** call the real `accountService`/Postgres `User` table at all — it's backed by a small in-memory mock (`server/utils/helpers.js`, `demoAccounts()`), so a demo visitor creating/editing/suspending "staff" can never see or touch Trump's real account list. Resets on process restart.

- **Q: Auto-login role for the demo — one fixed role, or per-surface?**
  A: Single fixed `role: 'owner'` for every request on the demo process. Checked: `owner` is present in every `requireRoles([...])` allow-list actually used (admin, waiter-page, owner-page guards), so one role covers all three public surfaces without needing per-route logic.

## Client

- **Q: Trump's LandingPage.tsx h1 says "Trumps" but AdminPage.tsx's brand div says "Trump" (no s) — same underlying brand, inconsistent literal text already existed in the codebase. When both become one build-time constant, which spelling wins?**
  A: Didn't collapse them into one identical string (would've changed Trump's real rendered text either on the landing page or the admin sidebar). Kept two constants (`BRAND_NAME` default `'Trump'`, `LANDING_BRAND_NAME` default `'Trumps'`) driven by the *same* env var, so Trump's build is byte-identical to before, and the demo build (which sets that one env var) renders "Demo Steakhouse" consistently in both places.

- **Q: The "Mains" tile on the landing page and the steaks category's icon lookup key off the literal string `"Trumps Premium Steaks"` — the actual live MenuCategory.title, not just cosmetic text. Rename it too, or leave it?**
  A: Made it a build-time constant (`MAINS_CATEGORY_TITLE`, default unchanged) used consistently everywhere it's referenced (LandingPage nav link, chapters.ts apiKey + title, MenuPage icon map). This one had to change for the demo build (set to whatever the demo's steaks category is actually named), otherwise the "Mains" tile would 404 into an empty section. Trump's default value is untouched.

## Not yet decided (will need a human call, not a recommended-default one)

- Exact live prod nginx syntax (pulling the current config via SSH before finalizing the snippet — the backed-up copy in the repo may be stale after later hardening phases).
- Whether/when to actually push the PM2 app + nginx block to production (per standing instruction to confirm before touching shared/production infra — not skipping this one).
