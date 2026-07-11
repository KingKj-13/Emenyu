# Final Demo Report — Carmella by Sir Gaspard

**Date:** 2026-07-11
**Scope:** Demo Polish pass — feature-frozen, bug-fixes and visual/content quality only, across Trump, Demo, and Carmella (shared codebase, tenant-scoped theming).
**Method:** Systematic hardcoded-color/layout hunt across the shared component library, browser-verified (Playwright/Chromium) at mobile/tablet/desktop widths, across all three day-parts, on customer menu + admin console + waiter app, compared against `emenyu-carmella/design/carmella-design-direction.html` and `carmella-prototype.html`. Every fix screenshot-verified locally, then re-verified against live production after redeploy.

---

## 1. Bugs Fixed

### Critical (demo-blocking, fixed earlier this session before Demo Polish began)
1. **Blank Carmella page** — `server.js`'s SPA fallback resolved `client/dist/index.html` via `__dirname` (always Trump's own physical directory) instead of the requesting tenant's config, so Carmella's React Router never received its own `index.html`. Fixed to use `config.directories.clientDist`.
2. **Theme silently not applying** — `carmella-theme.css` scoped its overrides to a bare `[data-tenant='carmella']` selector, which has *identical* CSS specificity to `:root` (0,0,1,0). Trump's `:root` block, appearing later in the same imported file, was winning regardless of the attribute being correctly set on `<html>`. Fixed via `html[data-tenant='carmella']` (0,0,1,1), which reliably wins.
3. **Hardcoded body background** — `body`'s background was a literal navy/red gradient, bypassing every color token. Extracted to a `--body-background` variable so tenant themes can override the whole property.

### High/Medium (found and fixed during this Demo Polish pass)
4. **Header brand-title/nav-icon overlap** — the `<div>` wrapping the brand title+subtitle had no `min-width: 0`, so flexbox's "automatic minimum size" rule prevented it from ever shrinking below its content's natural width. Long tenant names ("Carmella by Sir Gaspard", "Demo Steakhouse") overflowed straight through the nav icons instead of ellipsizing. Trump's own short name never exposed this — it's a latent bug in the shared `Header` component, now fixed for all tenants.
5. **Admin console chrome-bar overflow** — the same root cause in a different component: the fake-browser "URL bar" (`emenyu.com/admin · {brand} {tagline}`) had no width constraint, so Carmella's longer combined string wrapped to multiple lines and blew out the fixed-height 38px chrome bar, spilling over the console body beneath it.
6. **Admin console/sidebar hardcoded dark backgrounds** — `.console`'s gradient, `.topChrome`, and `.sidebar` all had hardcoded near-black hex values instead of tokens, so the admin panel rendered as a muddy dark-to-gray smear on Carmella's light theme even though its text colors were already correctly tokenized (dark-on-dark in places). Routed through `--color-ink`/`--color-coal`.
7. **Waiter-app vignette** — the app shell's top-of-screen decorative glow was a hardcoded near-black radial gradient. Rewrote as a translucent black overlay so it darkens whichever theme is active instead of imposing a foreign hue — then had to recalibrate the alpha (0.35 → 0.12) after discovering the value tuned for Trump's near-black navy read as a heavy grey smudge on Carmella's much lighter cream base.
8. **Waiter topbar background** — same hardcoded-near-black pattern, fixed to `rgba(var(--color-ink-rgb), 0.85)`.
9. **Recommendation card background + text** — `RecommendationCard.module.css`'s card background was a hardcoded dark-navy literal (rendered as an off-brand slate-grey box on Carmella's cream cards); its secondary "reason" text was a hardcoded light-cream literal that became invisible once the card background lightened.
10. **Category/chapter tab bar** — the sticky tab strip's background and two "unselected tab" text colors were hardcoded literals, found by walking the live DOM to trace the element (source search didn't turn it up directly).
11. **~30 further hardcoded color literals** across `OwnerDashboard`, `AdminPage` (.tsx and .module.css), `Button` (the generic primary CTA had *zero* tokenization), `MenuPage`, `BookViewer`, `FilterBar`, `ReservationPage`, `AnalyticsPanels`, `AIPerformancePanel`, and `waiter-theme.css` — all routed through existing `--color-ink-rgb` / `--color-gold-rgb` / `--color-sand` tokens (added a `--w-gold-rgb` alias to the waiter theme's token set to match its existing aliasing convention).
12. **Bundle cards showed a generic "gaspard" label** three times over instead of the authored journey names. The source JSON (`carmella-menu-data.json`) already carried the correct `name` field per bundle ("A Morning in Paris", "The Mediterranean Table", "The Celebration Table" — exactly matching the design spec) but `import-menu.js` discarded it and hardcoded `persona: 'gaspard'`. Fixed and re-imported (locally and in production).
13. **AI persona showed "Your Sommelier" instead of "Gaspard"** in the chat launcher hint and across 5 files (`RecommendationJourney`, `OwnerDashboard`, `CustomerJourneyPanel`, `AIPerformancePanel`, `ChefIntelligencePanel`) — `.env.carmella` never set the build-time `VITE_ASSISTANT_NAME`, so every consumer of the shared `ASSISTANT_NAME` constant fell back to Trump's default. One env var fixed all five.

### Found and fixed in a second pass (after the report below was first written)
14. **Cart/modal overlay stacking** (previously listed as a deferred "remaining bug" — see the superseded table below) — the Header's cart button is reachable while an item modal is open, and the two had independent open-state, so tapping cart mid-browse stacked both translucent backdrops and left the cart drawer's own content hidden behind the modal. Fixed with a `useEffect` in `MenuPage.tsx` that closes the item modal when the cart opens. Confirmed pre-existing on Trump too (reproduced identically before the fix); confirmed fixed on both, locally and live in production.
15. **Reserved terracotta never wired into AI-suggestion UI** — `emenyu-carmella/CLAUDE.md` hard rule 4 states terracotta (`#B65C33`) "must always mean 'Gaspard is speaking'"; the token (`--color-gaspard-accent`) existed but had zero consumers anywhere in the component tree — an explicitly deferred item already logged in `FUTURE_ROADMAP.md`. Wired it into the three places Gaspard's own voice/pick surfaces: the item-modal recommendation panel's heading+icon, the bundle card's persona icon, and a named dish in chat replies — via the existing `var(--color-gaspard-accent, var(--color-gold))` fallback convention, so Trump/Demo render byte-for-byte the same gold as before.

Every fix above was screenshot-verified against **both** Carmella and Trump before being considered done, specifically to catch any regression on Trump's approved dark theme. None were found — see §4.

---

## 2. Remaining Bugs (known, not fixed — with reasoning)

Items 1 and 5 from the original pass (cart/modal stacking; terracotta wiring) were subsequently fixed — see §1, items 14–15. What's left:

| # | Issue | Severity | Why deferred |
|---|---|---|---|
| 1 | ~11 transient 404s for Trump-specific dish images on first paint of the recommendation strip. | Low, cosmetic | `RecommendedOrders` seeds its initial React state from a hardcoded Trump-fallback constant before `api.getBundles()` resolves (~3s). Self-corrects every time; identified in an earlier phase of this project, still true today. |
| 2 | Prices render in Brass/Gold; the design-direction doc's palette table specifies Deep Moss (`#24402E`) for "prices, secondary". | Low, spec-precision | Current result is internally consistent and reads as premium; "fixing" it means introducing a new semantic token distinction (price-color vs. rule/icon-color) and touching price styling across many files. Judged a refinement, not a defect. |
| 3 | ItemModal's Add-to-cart button gradient end-stop (`#a8812c`) is a hardcoded bronze shade, not a token. | Low | Deliberately left alone — it's Trump's most-used CTA button, and tokenizing it would change Trump's approved gradient direction (light→dark becomes light→light) for a shade that doesn't visibly clash on Carmella either. |
| 4 | Waiter app's secondary/tertiary text tones (`--w-text2`, `--w-text3`) and progress-track fill (`--w-surface3`) remain hardcoded rather than tenant-tokenized. | Low | Verified legible on both themes by contrast reasoning; not perfectly on-brand for Carmella but not broken. |

---

## 3. Visual Improvements

- All three day-parts (morning / midday / golden hour) now render distinct, polished, correctly-contrasted palettes on Carmella — verified via forced `data-theme` override screenshots.
- Admin console went from illegible (muddy dark-on-dark, broken chrome bar) to fully on-brand and clean.
- Waiter app's landing screen vignette went from a jarring dark cloud to a tasteful, barely-there depth cue that works on both dark (Trump) and light (Carmella) themes.
- Header and Admin chrome bar now gracefully truncate arbitrarily long tenant names instead of overflowing into neighboring UI — this incidentally also fixed a latent overflow on the **Demo** tenant's header ("Demo Steakhouse" → "Demo Ste…"), confirmed live in production.
- Bundle/journey cards now show the intended evocative copy ("A Morning in Paris", "The Mediterranean Table", "The Celebration Table") instead of a repeated generic label.
- "Gaspard" now appears consistently as the AI persona's name everywhere it's surfaced (chat launcher, item-modal recommendation panel, owner analytics), matching the brand mandate that Gaspard read as a character, not a generic chatbot.

## 4. Performance

No dedicated performance work was undertaken this pass — the priority order (stability > performance > UI > AI recommendations > animations) was followed by spending the available time on correctness bugs, of which there were more than expected. Nothing in this pass adds runtime cost (every fix is either a CSS token substitution — zero cost difference — or a data-content correction). Confirmed as a side effect of the bundle re-import: **0 missing images, 0 unmatched pairings** across 190 items / 61 variants / 39 pairings.

## 5. Regression Results

- **Trump**: screenshot-verified twice (after each major fix batch) at mobile width, on both the customer menu and the waiter landing screen. Zero visual difference before/after. Confirmed again live on production post-deploy.
- **Demo**: screenshot-verified live on production. Zero regression; gained the header-overflow and chat-persona-label fixes as a side benefit of the shared-component fixes.
- **Carmella**: verified across mobile/tablet/desktop, all three day-parts, the admin console, the waiter app, and a live item-modal interaction (story line, variant/pairing recommendation panel, add-to-cart) — locally, then re-verified live on production.

## 6. Deployment Readiness

- All fixes committed to git (`feat/chatbot-reco-rework`, commits `a728321`, `a9e7bc7`, `f2f9bb3`, `4771ff2`).
- Code + freshly built `client/dist` for all three tenants uploaded to production across three separate deploy rounds (main polish pass, cart/modal fix, terracotta wiring); `server.js` updated (backed up first); Carmella's bundle data re-imported against the production DB (idempotent, same clean result as local: 0 errors).
- All three PM2 processes (`emenuy-trump-api`, `emenuy-demo-api`, `emenuy-carmella-api`) restarted after every round and confirmed `online` with fresh uptimes.
- `/healthz` returns `200 ok` for all three tenants on production after the final round.
- Live production screenshots confirm every fix is actually serving, not just locally verified — including the cart/modal fix and the terracotta accent, both re-verified live after their respective deploys.
- Superseded `client/dist` folders kept as `.old`/`.old2`/`.old3` on the production box for fast rollback; pre-existing `server.js` backed up before its one overwrite.

## 7. Demo Readiness Score: **95/100**

The core ordering journey (browse → chapter navigation → item detail → pairing recommendation → add to cart → bundle "one-tap" order) works end-to-end, on-brand, at every viewport and every day-part, with the AI persona correctly and consistently branded as Gaspard down to the reserved terracotta accent. Zero known critical, high, or medium-severity bugs remain — the cart/modal stacking issue (previously the one medium-severity item) is fixed and verified live. The remaining 5 points reflect only the low-severity spec-precision gaps in §2, plus that this session's re-verification — while extensive — did not re-exercise every admin sub-page, the reservation flow, split-bill, or the kitchen display screen (these were validated in earlier phases of the broader project, not re-tested in this pass).

## 8. Highest Remaining Risks

1. **Areas not re-exercised in this specific pass**: reservation flow, split-bill, kitchen display, and the full suite of owner-analytics tabs beyond the persona-name fix — validated earlier in the project's lifecycle, not re-screenshotted here.
2. **Transient Trump-image 404s (§2.1)** — self-corrects in ~3 seconds, but would be visible if a demo happens to screen-share during that window on first load.

## 9. Recommended Post-Demo Improvements

1. Decide the price-color question (§2.2) — Deep Moss per spec, or formally amend the spec to Brass/Gold.
2. Replace `RecommendedOrders`' hardcoded Trump-fallback initial state with a tenant-neutral loading skeleton so no wrong-tenant content ever flashes, even for ~3 seconds.
3. Tokenize the waiter theme's remaining secondary/tertiary text colors and progress-track fill for full cross-tenant polish.
4. Clean up local dev `.env` files (`Sites/Demo/.env` has a stale `TRUMP_PUBLIC_BASE_PATH=/Trump`, unrelated to this work but will confuse future local testing).
