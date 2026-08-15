# Architecture — eMenyu Platform (post-Carmella)

## Tenant model

eMenyu today runs **three tenants** on one codebase, one process per tenant:

| Tenant | Directory | Port (dev) | Database | Auth |
|---|---|---|---|---|
| Trump (Prime Grillhouse) | `Sites/Trump/` | 3012 | `emenyu` (prod) / `emenyu_local` (dev) | Real staff accounts |
| Demo Steakhouse | `Sites/Demo/` | 3014 | `emenyu_demo` | No-auth (`TRUMP_DEMO_AUTO_LOGIN_ROLE`) |
| Carmella by Sir Gaspard | `Sites/Carmella/` | 3015 | `emenyu_carmella` | Real staff accounts |

Every tenant's `server.js` is a ~20-line file that loads its own `.env` then calls `require('../Trump/server/server').startServer(path.resolve(__dirname))` — **there is only one server codebase** (`Sites/Trump/server/`). `startServer(baseDirOverride)` builds a fresh `config` object from that tenant's own environment via `createConfig()`, and every controller/service is constructed with that config injected — no global singleton, no shared mutable state between tenants (they're separate OS processes).

## What actually varies per tenant

Everything is either an env var or a database row scoped by `restaurantId`:

- **Identity**: `TRUMP_RESTAURANT_ID`, `TRUMP_BRAND_NAME`, `TRUMP_ASSISTANT_NAME`, `TRUMP_ASSISTANT_PERSONA`.
- **Routing**: `TRUMP_PUBLIC_BASE_PATH` (e.g. `/Carmella`) — as of this build, this env var **actually drives every route mount** (see below); it used to be silently ignored.
- **Data**: `DATABASE_URL` (a dedicated database per tenant) + `restaurantId`-scoped rows in the shared schema.
- **Media**: `TRUMP_MEDIA_DIR` (defaults to the tenant's own directory; Demo overrides it to read Trump's images read-only, Carmella has its own).
- **Client build**: `client/.env.<tenant>` (Vite build-time `VITE_*` vars) produces a separately-built `dist/` per tenant from the exact same `client/src/`.

## Routing (AD-001)

Before this build, ~21 route registrations across `server.js` and 14 route files hardcoded the literal strings `/Trump`/`trump`, while `config.publicBasePath` was computed but never actually used. This meant a second tenant (Demo) could only get a differently-named public URL via an nginx path-rewrite (`/demo/* → /Trump/*` internally) — the Node process itself never knew it wasn't Trump.

Fixed with one shared helper, `tenantPaths(config, path, { includeBare })` in `server/utils/helpers.js`, used everywhere a route used to hardcode aliases. Carmella mounts natively at `/Carmella` — no rewrite trick. See `ARCHITECTURE_DECISIONS.md` AD-001 for the full list of files touched and the regression test that verified nothing changed for Trump.

## Directory layout (Carmella)

```
Sites/Carmella/
  server.js              ← 20 lines, requires Trump's server.js
  .env                   ← tenant identity, real accounts, dedicated DB
  ecosystem entry        ← in Sites/Trump/ecosystem.config.js (shared file)
  scripts/
    import-menu.js       ← idempotent JSON -> Postgres importer
  Images/                ← optimized WebP (tracked) + raw JPGs (gitignored)
    optimized→promoted to Images/*.webp directly
    thumbnails/*.webp
  client/dist/           ← built by `vite build --mode carmella` (gitignored)
```

## Frontend architecture

One React 19 + TypeScript SPA (`Sites/Trump/client/src/`), rebuilt once per tenant with different `VITE_*` constants baked in at build time (`client/src/constants/api.ts`). Almost every component consumes menu data generically (whatever `GET /api/menu` returns, grouped by whatever chapter/section titles the database has) rather than a hardcoded category list — this is *why* Carmella's real "chapters" (The Morning Pages, The Global Table, …) already render correctly in the default grid menu view without any new frontend chapter-config file.

Two genuinely new frontend surfaces were added this build (both tenant-agnostic, not Carmella-only):
- A variant selector in `ItemModal` (radio group for base choices + checkboxes for add-ons) — renders only when `item.variants` is present.
- A day-part `data-theme` attribute set once at app boot from `GET /api/config`, consumed by CSS scoped under `[data-tenant="carmella"]`.

See `DESIGN_SYSTEM.md` and `COMPONENT_LIBRARY.md` for detail.

## AI/recommendation architecture

See `AI_ENGINE.md` and `RECOMMENDATION_ENGINE.md`. Summary: one scoring engine, swappable persona voice on top.

## Non-goals of this build

- **Not a runtime multi-tenant router.** Each tenant is still its own OS process — a request never crosses tenant boundaries at the HTTP layer. This was a deliberate choice (AD-006): Socket.IO rooms, rate-limiters, and in-memory caches all currently assume single-tenant-per-process, and rebuilding that assumption was judged out of scope/risk for this timeline.
- **Not a rewrite of Trump.** Every change to shared code was additive or a targeted bugfix, verified not to change Trump's existing behavior (see the regression notes in `ARCHITECTURE_DECISIONS.md`).
