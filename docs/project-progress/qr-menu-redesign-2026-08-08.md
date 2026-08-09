# Trump QR-menu redesign — 2026-08-08

From an ordering system to a premium multilingual digital menu.
**Production application and production database are unchanged.**

---

## 1. What was found

| Area | State before |
|---|---|
| Customer QR menu | React 19 SPA, no login required already; cart, checkout, AI chatbot, order-status ticker, rating prompt |
| Admin | React SPA behind HMAC-cookie session auth, 23 tabs, PostgreSQL-backed |
| Waiter app | 1,328-line React page + 27 server API routes + socket floor state |
| Kitchen app | React page + 5 order-status routes |
| Chatbot | Local deterministic engine (no external LLM); `ChatPanel` in the menu |
| Cart / orders | `CartContext` + 6 components + socket cart sync + `submit_order` |
| Analytics | Order/revenue based (`RecommendationEvent`, 71k rows) — measures conversion |
| Media | One `imagePath` + one `videoPath` per item. No galleries |
| i18n | None. Single-language English content and UI |
| Cow selector | Standalone prototype in `Test cow/`, unintegrated |
| Deployment | rsync to `/var/www/mysite/Emenyu/Trump`, PM2 `emenuy-trump-api` :3012, nginx `/Trump/` |

Live on the same box: Demo (`/demo/` :3014), Carmella (`/Carmella/` :3016),
Trump_Lux (`/Trump_Lux/` :8010, Python/uvicorn), company website at `/`.

---

## 2. Backup (verified, not assumed)

`backups/production/` — dump 3.78 MB, media 96 MB / 1779 files.

Restored into a throwaway database and compared with live production:
**37/37 tables, every row count identical** (diffed), 11 FKs, 99 PKs, 132 indexes,
0 orphaned rows, 17 users intact, and the real menu query returned 439 items —
matching `/Trump/api/menu` exactly.

Secrets never left the server: no `.env` was downloaded, and `data/accounts.json`
was excluded from the media archive.

Feature archives: `backups/removed-features/20260808T085154Z/`
(waiter + kitchen + chat + cart source, 42 files; original `schema.prisma`).

---

## 3. Database — additive only

New tables: `Translation`, `MediaAsset`, `CowCut`, `CowCutItem`, `ViewEvent`.
Migration `prisma/migrations/20260808140000_qr_menu_redesign` — 22 statements,
**zero** DROP / TRUNCATE / DELETE / column changes.

> **Trap caught.** `prisma migrate diff` emitted a `DropTable` prologue for six
> tables that exist in production but not in the Prisma schema — including
> `alembic_version` and `LuxuryItemContent`, which belong to the **live**
> Trump_Lux Python service. Applying it as generated would have stranded that
> service's migration history. The prologue was removed and the reason recorded
> in the migration file so a regeneration cannot silently reintroduce it.

Applied to: local `emenyu_dev`, staging `emenyu_restore_test`.
**NOT applied to production** — awaiting approval.

---

## 4. What changed

### Removed from the guest experience
Cart, checkout, quantity controls, order submission, order-status ticker,
post-meal rating prompt, AI chatbot, recommended-order strip, swipe-to-add.
Dish detail now ends with the price and "Speak to your waiter to order".

### Customer authentication
There was never a customer login; verified none exists anywhere in the guest
flow. **Admin authentication is untouched** — `/Admin` still redirects to login.

### Waiter + kitchen
Client apps deleted from the build. Server routes answer **410 Gone**, gated by
`TRUMP_WAITER_APP_ENABLED` (default `false`).

Server modules were **kept on disk deliberately**: `rewardController`,
`aiService`, `demoLiveTicker`, `orderValidationService` and
`recommendationScoring` all import them, and deleting the files would break
admin features the restaurant is keeping. Gating the routes achieves the same
outcome for any user and reverses with one environment variable.

**No waiter data was deleted** — `WaiterAssignment` (15,645), `WaiterTask`,
`Shift` (2,236), `Guest` (952) and all order history remain.

### Localization — 14 locales
`en af de fr nl it es pt-BR zh-Hans ja ko hi ru ar`

- UI strings: typed catalogues, so a missing key is a compile error
- Menu content: translated **server-side** via `?locale=`, with **per-field**
  English fallback. Verified: a row translating only an Arabic *name* returned
  the Arabic name and the English description
- **No invented menu translations** — `Translation` ships empty
- RTL for Arabic incl. a bidi fix (`dir="auto"`) so English dish names inside an
  RTL page keep their punctuation on the correct side
- Script-aware fonts for CJK, Devanagari, Arabic, Cyrillic
- Language gate on first scan (native names lead, search, live preview) plus an
  in-app switcher in the header slot the cart vacated

### Cow / butchery
Assets **21.9 MB → 1.24 MB** WebP. Cuts, media and cut→item links now come from
the database (12 cuts, 42 links, 11 cut photographs), with the client's built-in
chart as the fallback for an uncurated tenant. No Add-to-Cart: a row opens the
dish.

### Analytics — attention, not conversion
`POST /api/engagement` stores anonymous events: menu/category/item/cut views,
video play + completion, language selection, dwell time, coarse device type.
`sessionId` is per-sitting and dies with the tab; **0 PII columns** verified.

Admin gains a **Guest Engagement** tab: headline tiles, most/least viewed dishes,
cuts explored, language distribution (computed, never hardcoded), video
completion rates, and an hour-of-day histogram.

---

## 5. Tests

| Suite | Result |
|---|---|
| TypeScript + build | clean |
| Client behaviour (mock harness) | **30/30** |
| Full stack — real server + copy of production DB | **11/11** |
| Live staging via SSH tunnel | **30/30** |

Verified: no login, no cart affordance on any guest screen, no chatbot, gate
shown once, RTL/CJK with zero horizontal overflow, mid-menu language switching,
admin still authenticated, engagement events reaching Postgres with measured
dwell.

**Bugs found and fixed along the way**
1. `/rump/i` matched "T‑**RUMP**‑S SALAD" — this restaurant's name is a trap for
   unanchored cut matching. All patterns are now word-boundary anchored.
2. `sendBeacon` with a string is delivered as `text/plain`; `express.json()`
   skips it and the body arrives empty — total silent data loss. Only the
   Blob-with-JSON-type form works.
3. `loadMenu` needed database ids, but the admin **save** path round-trips the
   same payload back into the database — ids would have persisted as item
   metadata. Split into two cache slots.
4. Express 5 requires **named** wildcards; a bare `/api/waiter/*` throws at
   registration and takes the server down on boot.
5. `Modal` had no `role="dialog"` (pre-existing accessibility gap).

---

## 6. Staging deployment

`trump-staging`, PM2 :3013, database `emenyu_restore_test`.

> **Staging had been broken for ~52 days.** Its database did not exist, and its
> `DATABASE_URL` pointed at the public IP while PostgreSQL binds to `127.0.0.1`
> — hence 92 restarts. The database was rebuilt from the verified production
> backup and the host corrected in staging's own `.env` (production's was not
> touched). Both staging env files were backed up first.

Deployed: `server/`, `client/dist/`, `prisma/`, seed script. Not deployed:
`.env`, `data/`, `orders/`, `history/`, `tables/`, `uploads/`, `node_modules`.

Verified live on staging: menu 25 categories / 439 dishes, `?locale=` working,
12 cuts with media and linked dishes, engagement capture writing rows,
`/healthz` + `/readyz` 200, waiter/kitchen 410, admin 302 to login.

---

## 7. Production status

| | |
|---|---|
| Application | **unchanged** |
| Database | **unchanged** — 37 tables, 851 items, no new tables |
| PM2 restarts | unchanged (135) |
| `.env` | never read, never written |

---

## 8. Content management (added after the first pass)

Admin gains a **Media & Languages** tab covering everything the client asked to
be editable without a deploy:

- **Galleries** — add photos/videos to a dish or a cut, reorder them, choose
  which one leads, remove them. Media URLs are validated: `javascript:`,
  `data:` and protocol-relative URLs are refused, because these strings end up
  in a `src` attribute on a guest's device. "Featured" is exclusive per entity
  and enforced in a transaction; deleting the hero promotes the next asset.
- **Translations** — per dish and per cut, for all 13 non-English locales, with
  a coverage bar per language. A blank field DELETES the row rather than storing
  `""`, so it falls back to English instead of blanking the dish out. English is
  refused as a translation locale: it lives on the item and is the fallback.
- **Butchery cuts** — edit name, alternate convention, texture, description and
  cooking methods; link and unlink dishes; both sides are checked to belong to
  the same restaurant before a link is written.

Every edit invalidates the per-locale menu cache, so an owner's change is live
rather than up to a minute stale.

**Video engagement** now emits from the media element. The dish video is muted,
autoplaying and *looping*, so `onEnded` never fires — completion is detected at
the end of the first pass instead, and each event fires at most once per open.

## 9. Performance on the floor tablet

The original brief asked for GPU/render performance, touch, landscape and asset
budgets. Those were asserted but never *measured*, so `tests/perf-butchery.js`
now measures them on an iPad-Pro-11 profile under **4x CPU throttling** — a
development laptop is nothing like the device this runs on.

The first run failed three budgets. What the profiling actually found:

1. **The flier was scaled UP ~3.8x during the flight.** The element was laid out
   at the region's size and transformed up to the landing size, so the browser
   re-rasterised a 1400px photograph at increasing resolution mid-flight — a
   250ms stall. Inverted to the FLIP form: the flier is laid out at its landing
   box and only ever scales *down* toward 1. **p95 66.7ms (~15fps) → 16.8ms
   (~60fps).**
2. **The settle overshot to `scale(1.08)`**, i.e. above layout size, which
   re-rasterised again at the end of every flight. It now eases from 0.92 up to
   exactly 1 — visually the same, and never above 1.
3. **`CowChart`'s `memo()` was defeated by an inline arrow prop**, so all ~44 SVG
   paths reconciled on every parent render. Hoisted into a `useCallback`.
4. **The idle warm-up fetched all eleven cut photographs**, including cuts with
   nothing on the menu. It now warms only cuts that have dishes, most-stocked
   first, yielding between decodes and standing aside entirely while a cut is in
   flight. **Route weight 1359 KB → 813 KB.**
5. Animating `filter: drop-shadow(...)` per frame was also removed — the shadow
   is set once. (This turned out not to be the main cost, but per-frame filter
   work has no business in a transform/opacity animation.)

Final, throttled 4x: **11/11 within budget** — 60fps p95 during the lift-off,
55fps average, 813 KB route, 16 MB heap, no horizontal overflow on a phone,
touch tap selects. The one-off first-open cost (compositor layer creation plus
first raster, ~250ms throttled) is measured separately and documented rather
than hidden in an average.

## 10. Test suites

Moved into `Sites/Trump/tests/` with a README, so they survive and can be re-run:

| Suite | Protects against |
|---|---|
| `guest-experience.js` (30) | ordering/chatbot/login creeping back; RTL or CJK breaking layout |
| `full-stack.js` (11) | localization silently falling back; events not reaching Postgres; PII in the event table |
| `content-admin.js` (20) | unsafe media URLs; a blank translation blanking a dish; edits landing on the wrong dish |
| `perf-butchery.js` (11) | the animation dropping below ~30fps on the floor tablet; route weight creeping up |

## 11. Closing the guest-side gaps (2026-08-09)

An audit of my own work found three things built on the server but never wired
to the guest app. Worth stating plainly because an earlier report of mine had it
backwards: the cut data was described as "coming from the database" when in fact
only the *server* read it — the guest chart was still using its built-in
catalogue, so **an owner's edit did not reach a guest**.

1. **Guest butchery now reads the database.** `useButcheryCuts` layers curated
   cuts over the shipped catalogue, **per cut**: a restaurant that has curated
   three primals gets its three and the catalogue for the rest. A curated cut
   *replaces* the name-matched dish list rather than merging with it — an owner
   who removed a link meant to remove it. Curated cut photographs also take
   precedence over the shipped plates, and extra cut media renders as a strip in
   the panel.
2. **Dish galleries are shown.** `ItemGallery` fetches an item's media, skips
   the featured asset the modal already displays, and renders nothing at all
   when there is no extra media — so a single-photo dish looks exactly as before.
3. **The three dead event types now fire.** `CATEGORY_VIEW` on real visibility
   (an IntersectionObserver at 35%, once per mount — the whole menu mounts at
   once, so mount-time emission would have scored every chapter identically),
   `PHOTO_VIEW` from the gallery, and `SEARCH` on a settled query rather than
   per keystroke. The admin dashboard's **Categories** card could previously
   never populate.

The suites were extended to cover the *guest-visible* result rather than the
write: `full-stack.js` now edits a cut as an owner, loads the guest butchery in
a browser, and asserts the edited copy is on screen.

Totals: guest-experience **32**, content-admin **23**, full-stack **12**,
perf **11** — 78 checks, all passing locally and on staging.

## 12. Outstanding

1. **Cleanup approval** — see `production-cleanup-audit-2026-08-08.md`.
   ≈6.2 GB recoverable; disk at 79%.
2. **Production migration** — prepared and verified on three databases
   (local dev, staging, plus a restore-verification database), not applied.
3. Existing-system integration: no external POS/booking integration is
   configured anywhere in the codebase or environment. Nothing to connect to
   yet — the architecture is ready (menu, media and translations are all
   API-addressable and id-stable) but there is no counterparty.
