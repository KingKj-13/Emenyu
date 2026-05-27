# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this repo is

Emenyu is a multi-restaurant SaaS platform. Four restaurants are implemented: **Trump** (production-grade modular Node.js), **Greek**, **Imli**, and **AlPescatore** (all legacy monolithic Express + vanilla JS). Trump is the primary codebase; the other three are reference/demo sites.

The shared Prisma schema (root `prisma/`) supports all restaurants via a `restaurantId` field, but only Trump actively uses PostgreSQL. The legacy sites still use JSON file storage and MongoDB.

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

# One-time data migrations (legacy sites)
npm run menu:migrate:greek
npm run menu:migrate:imli
npm run menu:migrate:alpescatore
```

### Legacy sites

Each of Greek/Imli/AlPescatore has its own `server.js`. No build step. Just `node server.js` inside the site directory.

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
      pages/               ← MenuPage, LoginPage, CheckoutPage, etc.
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

**Auth pattern**: `createRoleAuth(config, accountService, logger)` returns an `auth` object with `auth.requirePage(roles)` (redirects to login) and `auth.requireRoles(roles)` (returns 403 JSON). Session is cookie-based (express-session backed by an in-memory map on AccountService). Account data lives in PostgreSQL via PrismaAuthService.

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

### AI / recommendations

`server/services/aiService.js` wraps external LLM calls. Endpoints:
- `POST /Trump/api/ai-pairing` — per-item food + drink pairings (used in ItemModal)
- `POST /Trump/api/recommend` — cart-level suggestions (used in waiter order view)
- `POST /Trump/api/chat` — customer chatbot

### Analytics API

Four endpoints, all require manager/owner role:
- `GET /Trump/api/analytics/summary` — revenue, order count, avg, top table
- `GET /Trump/api/analytics/items` — top items by quantity/revenue
- `GET /Trump/api/analytics/tables` — per-table revenue
- `GET /Trump/api/analytics/hours` — 24h distribution

All accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` query params.

### Legacy sites (Greek/Imli/AlPescatore)

Each is a single `server.js` (1000–1200 LOC) + monolithic HTML files. Menu data is in `food/*.json`. Python chatbot is spawned as a child process (`josh_enterprise/`). No TypeScript, no build step. Do not attempt to apply Trump's architecture patterns to these sites — keep changes local and minimal.

---

## Key conventions

**URL namespace**: Everything for Trump runs under `/Trump` (capital T). The React SPA's `BASE_PATH` constant in `client/src/constants/api.ts` must match.

**Static asset paths**: Images at `/Trump/Images/<filename>`, videos at `/Trump/Video/<filename>`. The `resolveImage` / `resolveVideo` functions in `imageResolver.ts` are the single source of truth — don't hardcode paths elsewhere.

**Role hierarchy**: `owner > manager > waiter > kitchen`. Owner-only features use `requirePage(['owner'])`. Admin panel accepts `['owner', 'manager']`.

**React build is required** after any changes to `client/src/`. The server serves `client/dist/` — editing source files without rebuilding has no effect in production. Run `cd Sites/Trump/client && npm run build`.

**No dist in git**: `client/dist/` is gitignored. Build must be run locally before deploy (or on the server after pull).

**Env bootstrap**: Running `node Sites/Trump/scripts/bootstrap-env.js` generates all secrets and writes `Sites/Trump/.env`. The root `.env` holds only `DATABASE_URL` for Prisma.
