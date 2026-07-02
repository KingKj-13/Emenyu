# LEGACY-MIGRATION-PLAN.md — Phase 01 Steps 2, 5, 6

**Date:** 2026-06-24. Covers the **route audit** (Step 2), **waiter** legacy verification (Step 5), and **owner** legacy verification (Step 6). The actual route migration (Step 4) is **on hold** behind the Step 3 gate (`MISSING-FEATURES.md`).

---

## Step 2 — Route audit: `/admin.html` vs `/Admin`

Source: `server/server.js` and `server/controllers/orderController.js`.

| Route | Method | Auth middleware | Roles | Serves | Notes |
|---|---|---|---|---|---|
| `/admin.html` (+ `/Trump/admin.html`, `/trump/admin.html`) | GET | `auth.requirePage(['owner','manager'])` | owner, manager | **`res.sendFile('admin.html')`** → vanilla admin (`orderController.serveAdminPage`) | **LIVE vanilla admin** — the retirement target |
| `/Admin` (React Router) | GET (SPA) | client-side `ProtectedRoute roles=['owner','manager']` + SPA fallback serves `client/dist/index.html` | owner, manager | React `AdminPage.tsx` | The intended single source of truth |
| `/admin` (+ aliases) | GET | `auth.requirePage(['owner','manager'])` | owner, manager | `orderController.serveAdminPage` (per `orderRoutes.js`) → same vanilla file | Bare `/admin` also lands on vanilla |

**Auth/role parity:** Both `/admin.html` and `/Admin` enforce **owner + manager**. Server-side `requirePage` (redirect to login) guards the HTML route; the SPA route is guarded client-side by `ProtectedRoute` AND server-side by the same `requirePage` on the `/admin` path that serves the SPA shell. **No auth or role change is needed for migration** — that satisfies the Phase 01 constraint "Authentication must remain unchanged. Roles must remain unchanged."

### Planned migration (Step 4) — DO NOT EXECUTE until gate cleared
Mirror the pattern already used by `serveWaiterPage` (which serves the SPA and only falls back to the legacy HTML on send error):

1. Change `orderController.serveAdminPage` to send `client/dist/index.html` (the React SPA), optionally with an initial-tab hint, **keeping the same `requirePage(['owner','manager'])` guard** on `/admin.html`, `/admin`.
2. `/admin.html` then loads React `/Admin` — URL preserved, auth preserved, roles preserved.
3. Verify React `/Admin` covers all daily operations (requires Gaps #1, #4 closed; #3 decided).
4. Only after that: remove vanilla admin assets (see `SAFE-DELETE-LIST.md` Group A).

**Precondition:** `MISSING-FEATURES.md` Gaps #1 and #4 closed (and #2/#3 decided). **Blocked today.**

---

## Step 5 — Waiter legacy verification

Files: `waiter.html`, `frontend/scripts/waiter-app.js` (65 KB), `frontend/styles/waiter.css`.

| Check | Finding |
|---|---|
| Production route serving `waiter.html`? | `/waiter.html` → `waiterController.serveWaiterPage` **serves the React SPA** (`client/dist/index.html`); `waiter.html` is used **only as an error fallback** if `sendFile` of the SPA fails (`waiterController.js:24-26`). |
| React waiter coverage | `/Waiter` route → `WaiterPage.tsx` (30 KB) + `pages/waiter/*` + `WaiterContext` + Waiter V2 workflow (`waiter-v2.css`). This is the actively developed waiter app. |
| Runtime dependency on vanilla waiter | **None** in the normal path. Only the `sendFile` error fallback references `waiter.html`. |
| Conclusion | **Vanilla waiter is effectively retired.** Safe to remove after dropping the one-line fallback in `serveWaiterPage`. **No parity gap** — React Waiter (V2) is the superset. |

**Action (gated on approval):** remove the `waiter.html` fallback branch in `serveWaiterPage`, then delete `waiter.html` + `waiter-app.js` + `waiter.css`. Risk: LOW (see `SAFE-DELETE-LIST.md` Group A2).

---

## Step 6 — Owner legacy verification

Files: `owner.html`, `frontend/scripts/owner.js`, `frontend/styles/owner.css`.

| Check | Finding |
|---|---|
| Production route serving `owner.html`? | `/owner.html` → **302 redirect to `/Trump/Owner`** (`server/server.js:281-285`). The HTML file itself is **never served**. |
| React owner coverage | `/Owner` route → `OwnerDashboard.tsx`. |
| Runtime dependency on vanilla owner | **None.** The file is unreferenced; only the redirect route exists (and should be kept/repointed). |
| Conclusion | **Vanilla owner is retired.** The three files are dead. **No parity gap.** |

**Action (gated on approval):** delete `owner.html` + `owner.js` + `owner.css`; **keep** the `/owner.html → /Owner` redirect route. Risk: LOW (see `SAFE-DELETE-LIST.md` Group A3).

---

## Net assessment

- **Waiter and Owner:** parity already exists; vanilla is retired in practice; deletion is LOW risk (pending approval per Rule 1).
- **Admin:** parity **NOT met** (4 gaps); route migration and asset deletion are **blocked** until gaps are closed/decided.
- **No authentication or role changes** are required anywhere in this plan — migration is a pure serve-target swap.
