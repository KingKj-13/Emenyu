# ROUTE-MIGRATION.md — Phase 01B Step 2

**Date:** 2026-06-24. **Goal:** make React the served admin UI; retire the vanilla admin route. Auth, roles, and URLs preserved.

---

## Pre-migration reality (empirically confirmed, local)

A page-serving probe (owner cookie, `redirect: manual`) showed the **vanilla admin was live at both URLs**, and React admin was *not actually served anywhere*:

| URL | Before |
|---|---|
| `/Trump/Admin` | **VANILLA** admin.html (20868 b) — `serveAdminPage` → `sendFile('admin.html')` |
| `/admin.html`, `/Trump/admin.html` | **VANILLA** admin.html |
| `/Trump/Waiter` | REACT-SPA (already migrated) |

Root cause: `serveAdminPage` (used by the `/Trump/Admin` route in `orderRoutes.js` **and** the `/admin.html` route in `server.js`) sent the vanilla file. The React `AdminPage.tsx` was built but never reached. Phase 01A is what made switching safe.

## Why not literally "serve the SPA at /admin.html"

React Router uses `basename="/Trump"` (`client/src/main.tsx`). The SPA only routes correctly when the URL starts with `/Trump`. Serving `index.html` at `/admin.html` would mismatch the basename → render nothing → fall through to `/table1`. So `serveWaiterPage`'s pattern (serve SPA) is correct **only at `/Trump/Admin`**, and a `.html` URL must **redirect**. This matches the existing `owner.html → /Trump/Owner` precedent.

## Changes made

| File | Change |
|---|---|
| `server/controllers/orderController.js` | `serveAdminPage` now serves the SPA `client/dist/index.html` (mirrors `serveWaiterPage`). Drives `/Trump/Admin`, `/Trump/admin`. |
| `server/server.js` | `/admin.html`, `/Trump/admin.html`, `/trump/admin.html` → `302` redirect to `${publicBasePath}/Admin`, keeping `requirePage(['owner','manager'])`. |
| `server/server.js` | `/waiter.html` → `302` redirect to `/Trump/Waiter` (was serving SPA shell at a `.html` URL → blank). |
| `server/controllers/waiterController.js` | `serveWaiterPage` drops the `waiter.html` fallback (SPA-only). |

Auth middleware and role sets are **unchanged** (`requirePage(['owner','manager'])` for admin; `['owner','manager','waiter']` for waiter).

## Post-migration verification (empirical, local, owner + no-auth)

| URL | owner | unauthenticated |
|---|---|---|
| `/Trump/Admin` | **200 REACT-SPA** | 302 → `/Trump/login?next=/Trump/Admin` |
| `/admin.html` | 302 → `/Trump/Admin` | 302 → `/Trump/login?next=/admin.html` |
| `/Trump/admin.html` | 302 → `/Trump/Admin` | 302 → `/Trump/login?next=/Trump/admin.html` |
| `/Trump/Waiter` | 200 REACT-SPA | 302 → `/Trump/login?next=/Trump/Waiter` |

**Result:** React is now the served admin UI. Old `admin.html` bookmarks still work (redirect, not 404). Auth/roles unchanged. ✅
