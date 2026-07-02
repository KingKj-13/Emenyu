# CONTINUE-PHASE-01.md — Phase 01 State & Handoff

**Date:** 2026-06-24. **Phase:** 01 — Consolidation & Legacy Retirement. **Status: ⏸️ PAUSED AT STEP 3 GATE (parity not met) — awaiting approval.**

This is the authoritative "where we are / how to resume" document. The `PHASE-01-COMPLETION-REPORT.md` is **intentionally not yet written** — the phase cannot complete until the gate is cleared and the work executed.

---

## TL;DR

The audit/verification half of Phase 01 is **done**. The execution half (route migration + deletions) is **correctly blocked**: React's `/Admin` is missing **4 capabilities** that exist only in the live vanilla `admin.html`. Retiring it now would lose functionality, which Phase 01 forbids. **No code changed, no files deleted.**

---

## What was done (non-destructive)

| Step | Output | Status |
|---|---|---|
| 1 — Admin parity audit | `ADMIN-PARITY-CHECKLIST.md` | ✅ |
| 2 — Route audit | `LEGACY-MIGRATION-PLAN.md` | ✅ |
| 3 — Parity gate | `MISSING-FEATURES.md` | ✅ **GATE FIRED** |
| 5 — Waiter legacy verification | `LEGACY-MIGRATION-PLAN.md` | ✅ retired (parity OK) |
| 6 — Owner legacy verification | `LEGACY-MIGRATION-PLAN.md` | ✅ retired (parity OK) |
| 7 — Legacy folder verification | `SAFE-DELETE-LIST.md` | ✅ |
| — State/handoff | this file | ✅ |

## What was NOT done (gated / forbidden without approval)

| Step | Action | Why blocked |
|---|---|---|
| 4 — Route migration (`serveAdminPage` → SPA) | **not executed** | Step 3 gate: admin parity not met |
| 8 — Safe deletions | **not executed** | Rule 1: Approval required before Deletion |
| 9 — Regression testing | not run | nothing changed yet to test |
| 10 — Completion report | not written | phase not complete |

---

## The blocker: 4 vanilla-only admin features (see `MISSING-FEATURES.md`)

| # | Feature | Severity | Fix (no backend change) |
|---|---|---|---|
| 1 | Edit existing menu item fields (name/price/description/…) | **HIGH** | Add edit mode to React Menu tab |
| 2 | Legacy Recommendations (`/api/recommendations`) | LOW | Deprecate (confirm) |
| 3 | Live chat / waiter-call monitor | MEDIUM | Port feed OR accept Service Desk |
| 4 | Account suspend/activate + assign tables | **HIGH** | Wire `api.updateAccount` into AccountsList |

Waiter and Owner vanilla UIs **are** at parity and are retired in practice — their cleanup is unblocked (pending approval).

---

## Decision required from you

**Option A — Restore parity, then retire (recommended).**
Port Gaps #1 and #4 (mandatory) and decide #3/#2 into React `/Admin`, using endpoints that **already exist** (no schema/auth/AI/business changes). Then execute Step 4 migration + Group A deletions.
⚠️ Caveat: this adds React UI. It is *parity restoration*, not net-new features — but Phase 01 says "No new features." **I need your explicit OK** to treat parity-restoration as in-scope, or to push it to a small dedicated sub-phase.

**Option B — Split the phase.**
Defer admin retirement to "Phase 01b". Proceed **now** only with the **non-admin** safe cleanup (`SAFE-DELETE-LIST.md` S1–S7, then M1–M3), each as its own `chore(cleanup)` commit. This makes real progress without touching the blocked admin path.

**Option C — Accept functionality loss and retire anyway.** ❌ Not recommended (violates "No functionality loss allowed").

---

## How to resume (whichever option)

### If Option A (after approval to restore parity)
1. React Menu tab: add "Edit item" (reuse `NewItemModal` in edit mode or add `api.updateMenuItem`; server `POST /api/menu` / item endpoints already support it).
2. React `AccountsList`: add suspend/activate (+ assign-tables if kept) buttons → `api.updateAccount(username, { status | assignedTables })`.
3. Decide #3 (port `newChatLog` live feed) and #2 (deprecate).
4. Rebuild client (`cd client && npm run build`), then execute **Step 4** in `LEGACY-MIGRATION-PLAN.md` (swap `serveAdminPage` to serve the SPA, keep `requirePage(['owner','manager'])`).
5. Run **Step 9** regression checks (below), then execute **Group A** deletions, then write `PHASE-01-COMPLETION-REPORT.md`.

### If Option B (non-admin cleanup now, after approval)
1. Execute `SAFE-DELETE-LIST.md` S1, S2, S3, S4, S7 (zero-reference).
2. Confirm S5/S6/M1/M2 one-liners, then delete.
3. Remove waiter fallback branch (`serveWaiterPage`), then M3.
4. Rebuild client, run regression checks, write completion report covering the non-admin scope; admin remains for Phase 01b.

---

## Step 9 — Regression checklist (to run after ANY change)

- Build: `cd Sites/Trump/client && npm run build` (must succeed; `dist/` is gitignored).
- Server syntax: `node --check server/server.js` (+ changed files).
- Auth: login/logout/me for owner, manager, waiter, kitchen; role redirects.
- Admin: `/Admin` loads; menu list/create/**edit**/availability/media/delete; orders complete/delete; deals; chef-recs; bundles; accounts create/**suspend**; analytics; reservations; tables; service desk.
- Owner: `/Owner` loads.
- Waiter: `/Waiter` loads; floor/tasks/coach.
- Kitchen: `/Kitchen` loads; order status.
- Menu/Orders/Reco/Reservation/Socket: customer `/:tableId/menu`, submit order, chat, cart sync, reservation create.
- Routes: `/admin.html`, `/waiter.html`, `/owner.html` behave as intended (no 404/500); `curl /healthz` `/readyz`.
- `npm run reco:validate` · `chat:validate` · `reco:health` · `smoke:test`.

**Success criteria (Phase 01):** React sole production UI ✓; `admin.html` retired ✓; legacy documented ✓; safe deletions done ✓; regression passes ✓; no functionality lost ✓; production behaviour unchanged ✓ — **none of the destructive criteria are met yet; this is expected and correct given the gate.**

---

## Constraints reminder (Phase 01)

No new features · no redesigns · no UI improvements · no auth changes · no DB changes · no AI changes · no role-permission changes. Consolidation only. (This is why even parity-restoration needs your explicit sign-off.)
