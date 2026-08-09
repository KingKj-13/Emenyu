# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this repo is

> **Redesigned 2026-08-08.** Trump's guest app is a **premium multilingual
> digital menu**, not an ordering system. There is no cart, no checkout, no
> customer login and no chatbot: guests read, explore the butchery chart, and
> order through their waiter. See
> `docs/project-progress/qr-menu-redesign-2026-08-08.md`.

Emenyu is a restaurant SaaS platform. **Trump** (production-grade modular Node.js) is the only active restaurant. Three legacy reference sites (**Greek**, **Imli**, **AlPescatore** — monolithic Express + vanilla JS) were retired 2026-07-05; see `docs/project-progress/` for the retirement report. Their code and production data were fully backed up before removal.

The shared Prisma schema (root `prisma/`) supports multiple restaurants via a `restaurantId` field, but only Trump is deployed and only Trump actively uses PostgreSQL.

---

## Commands

### Trump site (primary)

```bash
# Start server (production)
cd Sites/Trump && node server.js

# PM2 (production process manager)
cd Sites/Trump && npm run pm2:start      # first start
cd Sites/Trump && npm run pm2:restart    # zero-downtime reload
cd Sites/Trump && npm run pm2:logs       # tail logs
cd Sites/Trump && npm run pm2:stop

# React frontend
cd Sites/Trump/client && npm run dev     # dev server (Vite, HMR)
cd Sites/Trump/client && npm run build   # production build → client/dist/
cd Sites/Trump/client && npm run lint    # ESLint

# Environment setup (first time or after .env wipe)
cd Sites/Trump && node scripts/bootstrap-env.js

# Health / env validation
cd Sites/Trump && node scripts/healthcheck.js
cd Sites/Trump && node scripts/validate-env.js
```

### Database (root level)

```bash
# Validate Prisma env
npm run env:check

# Run pending migrations
npx prisma migrate deploy --schema prisma/schema.prisma

# Regenerate Prisma client after schema changes
npx prisma generate --schema prisma/schema.prisma
# (or from Trump site: npm run prisma:generate)

# One-time data migrations (Trump)
npm run auth:migrate
npm run menu:migrate
npm run orders:migrate
```

---

## Architecture

### Trump site structure

```
Sites/Trump/
  server/
    server.js              ← main Express app, mounts everything
    controllers/           ← thin request handlers, no business logic
    routes/                ← route registration functions
    services/              ← all business logic (DB, sockets, AI, media)
    middleware/            ← security, request logging
    utils/                 ← config creation (createConfig), role auth (createRoleAuth), logger
  client/                  ← React 19 + TypeScript SPA (Vite)
    src/
      lib/imageResolver.ts ← all image/video path resolution logic
      constants/api.ts     ← BASE_PATH = '/Trump'
      services/api.ts      ← typed API client
      components/menu/     ← ItemModal, PairingModal, menu cards
      components/butchery/ ← CowMeatSelector, CowChart, ButcheryTeaser, cutCatalog
      components/language/ ← LanguageGate (first scan), LanguageSheet, LanguagePicker
      components/content/  ← ContentPanel (admin media/translation/cut editor)
      components/analytics/← EngagementPanel (admin guest-engagement dashboard)
      i18n/                ← 14 locales; locales.ts + one catalogue per language
      lib/engagement.ts    ← anonymous view/dwell/video capture, batched + beacon
      pages/               ← MenuPage, ButcheryPage, LandingPage, AdminPage, LoginPage
  frontend/
    scripts/
      admin.js             ← vanilla JS admin panel
      waiter-app.js        ← vanilla JS waiter panel
      owner.js             ← vanilla JS owner panel
    styles/
      admin.css / waiter.css / owner.css
  admin.html / waiter.html / owner.html   ← served as HTML pages with auth guards
  Images/    ← static food/drink images (served at /Trump/Images/)
  Video/     ← static food videos (served at /Trump/Video/)
  Video/demo/ ← 4 fallback videos (steak-grill, seafood, pasta, dessert)
```

**Request flow**: All routes are mounted under `/Trump` (or `/trump` — both work). The React SPA is served from `client/dist/` via static middleware and handles its own routing via React Router. HTML pages (`admin.html`, `waiter.html`, `owner.html`) are served by explicit Express routes with role-based auth guards (`requirePage`). Static assets (Images/, Video/) are served directly.

**Config pattern**: `createConfig(basePath)` in `server/utils/helpers.js` reads all `TRUMP_*` env vars and returns a single config object passed to every controller/service constructor. There is no global config singleton — everything is injected.

**Auth pattern**: `createRoleAuth(config, accountService, logger)` returns an `auth` object with `auth.requirePage(roles)` (redirects to login) and `auth.requireRoles(roles)` (returns 403 JSON). Sessions are stateless: an HMAC-SHA256-signed token in the `trump_session` cookie, validated on each request against the user record in PostgreSQL (a per-user `sessionInvalidBefore` timestamp enables server-side logout/invalidation). There is no in-memory session store. Account data and PBKDF2 password hashes live in PostgreSQL via PrismaAuthService, with a `data/accounts.json` fallback. Default accounts are seeded from env only when missing and are never reset on startup.

### Prisma / database

Schema is at `prisma/schema.prisma` (root). Trump's server runs `prisma generate` pointed at that root schema. The `restaurantId` field on every model defaults to `"trump"` for backward compatibility.

**Hybrid persistence**: Trump uses Postgres as primary, with a `FileService` JSON fallback for orders/tables/history in `orders/`, `history/`, `tables/` directories. New code should write to Postgres; JSON files are kept for legacy compatibility only.

### Media resolution (React client)

All image and video URLs flow through `client/src/lib/imageResolver.ts`:
- `resolveImage(item)` — keyword matching against `KEYWORD_MAP`, then `CATEGORY_IMAGE_MAP`, then `/Trump/Images/Tomahawk.jpg`
- `resolveVideo(item)` — exact name match against `LOCAL_OPTIMIZED_VIDEO_MAP` (55 entries), then category demo fallback
- `isDrinkItem(item)` — drinks never get videos
- Both functions prepend `BASE_PATH` (`/Trump`) to relative paths

### Real-time (Socket.IO)

All socket logic lives in `server/services/socketService.js`. The socket path is `/Trump/socket.io`. Key rooms/events:
- `joinTable` / `syncCart` — guest ↔ waiter cart sync
- `joinAsWaiter` / `incomingWaiterCall` / `managerCallWaiter` — waiter notification flow
- `joinAdmin` — admin receives all events
- `updateCart` — bidirectional cart updates

### Localization (14 locales)

Codes: `en af de fr nl it es pt-BR zh-Hans ja ko hi ru ar`.

**UI strings** live in `client/src/i18n/messages/<locale>.ts`, typed against
English so a missing key is a compile error. **Menu content** is translated
server-side: `GET /Trump/api/menu?locale=de` applies `Translation` rows and
falls back to English **per field**. English is never stored as a Translation
row — the `MenuItem`/`MenuCategory` column is the source of truth.

Adding a 15th language = one entry in `locales.ts` + one catalogue. No schema
change, no migration.

Arabic is RTL: direction is set on `<html dir>`, and menu content carries
`dir="auto"` so English dish names inside an RTL page keep their punctuation on
the correct side.

### Butchery (the cow chart)

The chart's **geometry** (traced SVG paths, label placement) is presentation and
lives in `client/src/components/butchery/cutCatalog.ts`. The **content** (cut
copy, media, which dishes come off which primal) lives in the database
(`CowCut`, `CowCutItem`, `MediaAsset`) and is editable from the admin panel.
`GET /Trump/api/butchery/cuts` serves it; a tenant that has not curated its cuts
falls back to the client catalogue plus name-matching rules in `cutMenuMap.ts`.

Chart artwork is in `client/public/butchery/` (WebP, 1.24 MB total).

### Guest analytics

`POST /Trump/api/engagement` — anonymous, unauthenticated, always 202 so
analytics can never break a guest's menu. Stores item/category/cut views, dwell
time, video play/complete, language selection. The only identifier is a random
per-sitting `sessionId` held in `sessionStorage`; **no PII is stored**.

Admin reports: `/api/analytics/engagement{,/timeline,/least-viewed}`
(owner/manager only), surfaced in the **Guest Engagement** tab.

> `sendBeacon` MUST be given a `Blob` with `type: 'application/json'`. A bare
> string is sent as `text/plain`, `express.json()` ignores it, and every queued
> event is silently lost.

### AI / recommendations

`server/services/aiService.js` is a fully local, deterministic recommendation
engine. It makes **no external LLM/API calls**. The customer chatbot was removed
in the 2026-08-08 redesign; `POST /Trump/api/chat` and the pairing/recommend
endpoints remain for the admin and pairing views:
- `POST /Trump/api/ai-pairing` — per-item food + drink pairings (used in ItemModal)
- `POST /Trump/api/recommend` — cart-level suggestions (no longer called by the guest app)

### Analytics API

Four endpoints, all require manager/owner role:
- `GET /Trump/api/analytics/summary` — revenue, order count, avg, top table
- `GET /Trump/api/analytics/items` — top items by quantity/revenue
- `GET /Trump/api/analytics/tables` — per-table revenue
- `GET /Trump/api/analytics/hours` — 24h distribution

All accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` query params.

---

## Key conventions

**URL namespace**: Everything for Trump runs under `/Trump` (capital T). The React SPA's `BASE_PATH` constant in `client/src/constants/api.ts` must match.

**Static asset paths**: Images at `/Trump/Images/<filename>`, videos at `/Trump/Video/<filename>`. The `resolveImage` / `resolveVideo` functions in `imageResolver.ts` are the single source of truth — don't hardcode paths elsewhere.

**Role hierarchy**: `owner > manager > waiter > kitchen`. Owner-only features use `requirePage(['owner'])`. Admin panel accepts `['owner', 'manager']`.

**Guests are never authenticated.** A QR scan leads to a language choice and
then the menu. Do not add a customer login, account or session concept — that
is the product decision, not an oversight.

**Waiter + kitchen apps are retired.** Their client code is deleted; their
server routes answer `410 Gone` unless `TRUMP_WAITER_APP_ENABLED=true`. The
server modules are deliberately still on disk because `rewardController`,
`aiService`, `demoLiveTicker`, `orderValidationService` and
`recommendationScoring` import them. **No waiter data was deleted** — order,
shift, assignment and guest history are all retained.

**React build is required** after any changes to `client/src/`. The server serves `client/dist/` — editing source files without rebuilding has no effect in production. Run `cd Sites/Trump/client && npm run build`.

**No dist in git**: `client/dist/` is gitignored. Build must be run locally before deploy (or on the server after pull).

**Env bootstrap**: Running `node Sites/Trump/scripts/bootstrap-env.js` generates all secrets and writes `Sites/Trump/.env`. The root `.env` holds only `DATABASE_URL` for Prisma.
