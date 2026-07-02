# AUDIT-FRONTEND.md — Phase 00 Frontend Audit

**Scope:** `Sites/Trump/client/` (React SPA), `Sites/Trump/frontend/` (vanilla), root `*.html`. **Date:** 2026-06-24.

---

## 1. Summary

The customer-facing and staff-facing UI is the **React 19 + TypeScript SPA** in `client/`, built with Vite and served from `client/dist/` under `/Trump`. Routing is client-side (React Router) with role-gated routes (`ProtectedRoute` in `App.tsx`). The legacy vanilla frontend (`frontend/`) is **mostly retired** — except the **admin panel (`admin.html`), which is still served live**.

**Verdict: React can and should be the single source of truth.** Three of the five surfaces are already React-only or React-default. Only the admin surface still has a live vanilla competitor.

---

## 2. Build / serving model

- **Build:** `cd client && npm run build` → `client/dist/` (gitignored; must be built on each deploy).
- **Serve:** `server/server.js` mounts `express.static(client/dist)` at `/Trump` and `/trump`, then an SPA fallback (`serveSpa`) returns `index.html` for any extension-less `/Trump/*` path.
- **Base path:** `client/src/constants/api.ts` `BASE_PATH = '/Trump'` must match server `publicBasePath`.
- **Code splitting:** Admin, Owner, Waiter, Kitchen, Reservation pages are `lazy()`-loaded; customer pages (Menu, Landing, Login) are eager.

---

## 3. UI-MAPPING

| UI | Route(s) | Role gate | React implementation | Vanilla implementation | Source of truth today |
|---|---|---|---|---|---|
| **Customer** | `/:tableId` (landing), `/:tableId/menu`, `/:tableId/book`, `/:tableId/drinks`, `/:tableId/setmenu` | none (QR guest) | `LandingPage`, `MenuPage`, `ItemModal`, `CartDrawer`, `ChatPanel`, `BookViewer`, `PairingModal`, `RecommendedOrders` | `frontend/pages/menu.html` + `ui.js`, `book.js`, `cart.js`, `filters.js` | **React** (vanilla orphaned, not routed) |
| **Owner** | `/Owner` | `owner` | `OwnerDashboard.tsx` | `owner.html` + `frontend/scripts/owner.js` | **React** (vanilla = 302 redirect to `/Owner`) |
| **Manager** | `/Admin` (shared) | `owner`,`manager` | `AdminPage.tsx` | `admin.html` + `admin.js` | **Split** — React `/Admin` is primary, but `admin.html` still served |
| **Admin** | `/Admin`, `/admin.html` | `owner`,`manager` | `AdminPage.tsx` (109 KB) | `admin.html` (20 KB) + `frontend/scripts/admin.js` (61 KB) | **DUPLICATED & LIVE** |
| **Waiter** | `/Waiter` | `owner`,`manager`,`waiter` | `WaiterPage.tsx` (30 KB) + `pages/waiter/*`, `WaiterContext`, `styles/waiter-v2.css` | `waiter.html` + `waiter-app.js` (65 KB) | **React** (vanilla = error fallback only) |
| **Kitchen** | `/Kitchen` | `owner`,`manager`,`kitchen` | `KitchenPage.tsx` | *(none)* | **React only** |
| **Login** | `/login`, `/Login` | none | `LoginPage.tsx` | `frontend/pages/login.html` + `login.js` | **React** |
| **Reservation** | `/reserve` | none | `ReservationPage.tsx` | part of `book.js` | **React** |

### How each is served (server routes)
- `admin.html` → `orderController.serveAdminPage` → `res.sendFile('admin.html')` — **vanilla, live** (`server/server.js:270`).
- `waiter.html` → `waiterController.serveWaiterPage` → sends SPA `index.html`, falls back to `waiter.html` only on send error (`server/server.js:275`).
- `owner.html` → `res.redirect('/Trump/Owner')` (`server/server.js:281`).
- everything else `/Trump/*` extensionless → SPA `index.html`.

---

## 4. React client structure (active)

```
client/src/
  App.tsx                 ← routes + ProtectedRoute role gating
  context/                AppContext, CartContext, MenuContext, FavoritesContext, WaiterContext (13 KB)
  pages/                  Landing, Menu, Login, Admin(109KB), OwnerDashboard, Waiter(30KB), Kitchen, Reservation
    waiter/               Waiter V2 workflow sub-pages
  components/             menu/ cart/ chat/ filters/ book/ layout/ reco/ ui/ waiter/
  services/               api.ts (typed client, 16 KB), socket.ts, storage.ts
  lib/                    imageResolver.ts (single source for image/video paths), recoAnalytics.ts, menuUtils.ts
  hooks/                  useAuth, useCart, useFilters, useSocket, useFavorites, …
  constants/              api.ts (BASE_PATH), recommendedOrders.ts (offline bundle fallback), waiter.ts, config.ts
  types/                  auth, cart, menu, socket, waiter
  styles/                 waiter-theme.css, waiter-v2.css
```

Observations:
- **`AdminPage.tsx` is 109 KB / single file** — by far the largest component; a maintainability risk (see AUDIT-BACKEND oversized note; same pattern client-side). Should be decomposed into tabs/sub-components.
- `client/src/constants/recommendedOrders.ts` is a hardcoded fallback for DB-backed bundles (Phase 5) — kept intentionally for offline.
- `imageResolver.ts` is correctly the single source of truth for media paths.
- Auth state via `useAuth` hook hitting `/api/auth/me`; role redirects centralised in `ProtectedRoute`.

---

## 5. Can the vanilla UI be retired?

**Yes, with one real task.** Status by surface:
- Customer, Owner, Waiter (effectively), Kitchen, Login, Reservation — **already React-served**; vanilla files are orphaned or fallback-only and can be deleted with negligible risk.
- **Admin — the blocker.** `admin.html` is still the live admin panel via `serveAdminPage`. Before deleting `frontend/`, confirm React `/Admin` (`AdminPage.tsx`) has full feature parity with `admin.js` (menu CRUD, chef-recs, bundles, deals, analytics, account management, media enrichment), then switch `serveAdminPage` to serve the SPA (mirror what `serveWaiterPage` already does) and remove the vanilla admin assets.

**Recommended end state:** React SPA is the only UI. `serveAdminPage`/`serveWaiterPage` both serve `client/dist/index.html`; `frontend/` and root legacy `*.html` removed.

---

## 6. Frontend production concerns (non-UI-parity)

- **Build required on deploy** — `client/dist/` is gitignored. A deploy that forgets `npm run build` serves stale/missing UI. Should be enforced in the deploy script (see AUDIT-DEPLOYMENT).
- **CSP coupling** — inline `<script>` hashes are recomputed from `client/dist/index.html` at server startup (`middleware/security.js`). A rebuild without a server restart can break inline scripts under CSP. PM2 reload after build mitigates; document it.
- **No client error monitoring** (no Sentry/equivalent). Customer-facing JS errors are invisible in production.
- **Two large single-file components** (`AdminPage.tsx`, vanilla `admin.js`) duplicate admin behaviour — divergence risk while both live.
