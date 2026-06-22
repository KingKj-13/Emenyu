# Trump — Architecture

Accurate as of Phase 1 cleanup (2026-06). Replaces the older root architecture
docs, which described a Groq/LLM-based AI that never matched the code.

## Stack
- **Frontend:** React 19 + TypeScript SPA (Vite). Source in `client/src/`, build in `client/dist/` (gitignored).
- **Backend:** Node ≥18, Express 5, modular MVC. Entry `server/server.js`.
- **Database:** PostgreSQL via Prisma (schema at repo-root `prisma/`). JSON-file fallback for orders/tables/menu.
- **Realtime:** Socket.IO at path `/Trump/socket.io`.
- **Process manager:** PM2 (`ecosystem.config.js`), single fork instance.

## Request flow
Everything is mounted under `/Trump` (also `/trump`). `server.js`:
1. `createRequestLogger` → structured JSON access logs with a request id.
2. `configureSecurity` → helmet, CORS allowlist, compression, general + auth rate limits, optional HTTPS redirect/HSTS.
3. Body parsers, health routes (`/healthz`, `/readyz`).
4. Role-guarded HTML pages (`admin.html` / `waiter.html` / `owner.html`).
5. Static serving of `client/dist` and the site base dir.
6. Auth routes, then feature route groups (menu, deals, kitchen, push, ratings, reservations, uploads, analytics, waiter-API, orders) each gated by `auth.requireRoles([...])`.
7. SPA fallback: extension-less `/Trump/*` paths return `client/dist/index.html`.

## Configuration
`createConfig(baseDir)` in `server/utils/helpers.js` reads all `TRUMP_*` env vars and
returns one config object injected into every controller/service (no global singleton).
In production it **refuses to boot** without a strong session secret, an allowed origin,
per-role account passwords, and rejects empty/known-weak passwords. See [ENVIRONMENT.md](ENVIRONMENT.md).

## Services (`server/services/`)
- `fileService` — menu/orders/tables/carts persistence (Prisma primary, JSON fallback; **dual-write**).
- `prismaMenuService` / `prismaOrderService` / `prismaAuthService` — Postgres data access.
- `accountService` — accounts, PBKDF2 hashing, seeding (seed-only-when-missing; never reset on boot).
- `socketService` — all Socket.IO rooms/events (guest↔waiter cart sync, waiter calls, admin feed).
- `aiService` — local deterministic recommendations/chat (see [AI.md](AI.md)).
- `nlg/` — local template wording layer for the waiter app (no external LLM).
- `mediaEnrichmentService` — optional stock-image lookup (Pexels/Pixabay) if keys set.
- waiter services — `guestService`, `opportunityService`, `waiterAnalyticsService`, `serviceRecoveryService`, `floorService` (all deterministic, Prisma-derived).

## Auth & sessions
Cookie-based, stateless: an HMAC-SHA256-signed `trump_session` token validated each
request against the Postgres user record. `sessionInvalidBefore` gives server-side
logout/invalidation. Passwords are PBKDF2 (120k iterations). Role hierarchy
`owner > manager > waiter > kitchen`. Default accounts are seeded from env **only when
missing** and never reset on startup.

## Persistence model (known trade-off)
Orders/carts are written to **both** Postgres and JSON files; reads prefer Postgres and
fall back to JSON. This is a deliberate legacy-compatibility bridge and a divergence
risk — the target end-state is Postgres-only. Treat Postgres as source of truth.

## Realtime (Socket.IO)
Single in-process instance (no Redis adapter). Key events: `joinTable`/`syncCart`/
`updateCart` (guest↔waiter), `joinAsWaiter`/`incomingWaiterCall`/`managerCallWaiter`,
`joinAdmin`. Horizontal scaling requires a shared adapter (see audits).

## What is intentionally NOT here
- No external AI/LLM provider (Groq/Anthropic/OpenAI) — removed in Phase 1.
- No demo mode / showcase dishes / demo media — removed in Phase 1.
- No payments, no multi-tenant `Restaurant` model yet (single-tenant per process).
</content>
