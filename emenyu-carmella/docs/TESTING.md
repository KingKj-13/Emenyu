# Testing — Carmella by Sir Gaspard

## What was actually tested this session

No browser automation tool was available in this environment (no Playwright/Puppeteer/screenshot MCP tool connected to this session) — **no visual/browser verification was performed.** Every claim below is either an API/curl-level test, a build-artifact inspection, or a static typecheck. This should not be treated as equivalent to a real click-through in a browser before the demo.

### Backend — verified live (curl against locally-running processes)

- Health checks, static asset serving (client bundle + images, both full-res and thumbnail), SPA fallback routing — Trump, Demo, Carmella.
- Auth: real login (`carmella-owner`) + session cookie + `/api/auth/me`; role-gated 401/302 on protected routes.
- `GET /api/config`: correct `assistantName`/`assistantPersona`/`currentDayPart` for Carmella.
- `GET /api/menu`: correct chapter/section/item structure, item counts (190), `story`/`intro` fields present and populated.
- `POST /api/chat`: Gaspard voice responding in-character, day-part-aware, allergy-acknowledging.
- `POST /api/ai-pairing`: curated pairings correct after the AD-007 fix (verified before/after).
- `GET /api/menu/bundles`: correct pricing after the variant-fallback fix (verified before/after).
- Dual-case admin/waiter/kitchen page routes (`/Admin`, `/admin`) resolve identically.

### Frontend — verified via build artifacts only, NOT in a browser

- `npx tsc --noEmit` clean (exit 0) after every round of client changes.
- Compiled CSS bundle inspected directly: confirmed `[data-tenant=carmella]` and `[data-theme=golden|morning]` rules present with the correct hex values (post-minification, unquoted attribute selectors).
- Compiled JS bundle inspected directly: confirmed `RESTAURANT_ID`/`BASE_PATH` build-time constants correctly baked in as literal `"carmella"`/`"/Carmella"` strings, and `document.documentElement.dataset.tenant` assignment present.

**Not verified**: that the theme actually *looks* right rendered in a real browser at 360–430px widths in all three day-parts (an explicit acceptance criterion in the original design brief), that the variant selector is usable/tappable on a real touchscreen, that the story-line/intro text doesn't overflow or clip anywhere, that the "book" viewer's stale chapter icons look acceptable rather than broken. **Recommended: a real click-through in a browser before Monday**, especially the day-part visual check across all three modes.

## Regression testing discipline

Every shared-code change in this build was followed by a combined Trump + Demo + Carmella smoke pass before moving to the next major piece (per the explicit instruction to verify continuously). This caught one real regression mid-session: the shared-schema migration was initially applied to `emenyu_local` and `emenyu_carmella` but missed `emenyu_demo`, which broke Demo's `GET /api/menu` outright. Found and fixed within the same session because the regression pass ran Demo's menu endpoint, not just its health check.

## Data-integrity checks run

- Image-to-item reconciliation: 201 images referenced in the JSON, 201 present on disk, 0 missing, 0 orphaned (script-verified, not eyeballed).
- Import idempotency: re-ran `import-menu.js` twice, confirmed identical row counts both times (no duplication).
- Pairing reference integrity: 0 unmatched pairing sources, 0 unmatched pairing targets across all 39 imported pairings.

## What a proper pre-demo test pass should add

1. Open `/Carmella/Table1/menu` in an actual browser, at each of the three day-parts (can force-test by temporarily adjusting server time or the `DayPart` window boundaries), at 360px and 430px widths.
2. Click through: add an "Amy's Choice" variant + its add-on to cart, verify the cart line name/price is correct.
3. Run the Gaspard prompt pack's full 10-case eval checklist manually against the live chat (2 are known-incomplete — see `AI_ENGINE.md`).
4. A real Lighthouse mobile run against the built `Sites/Carmella/client/dist/`.
5. Full order flow: cart → submit → waiter sees it → kitchen status updates → guest sees status bar — this exercises Socket.IO, which was not directly tested this session beyond confirming the socket path mounts correctly.
