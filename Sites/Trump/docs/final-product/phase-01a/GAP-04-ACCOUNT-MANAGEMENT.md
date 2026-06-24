# GAP-04-ACCOUNT-MANAGEMENT.md — Account Management (HIGH) — ✅ CLOSED

**Date:** 2026-06-24. **Status: suspend/activate implemented + verified (frontend-only). Assign-tables documented as dead → retirement proposed (not ported).**

---

## Problem

Vanilla admin could **suspend**, **activate**, and **assign tables** to staff accounts. React `/Admin` could only **view** and **create** — no management actions. Suspending a departed/compromised account is security-critical, so this blocked retirement.

## API audit (what already existed)

- **`PATCH /api/auth/accounts/:username`** → `auth.updateAccount` → `accountService.updateAccount(actor, username, patch)`.
- Supported `patch` fields: `label`, `password` (≥6), **`status` ('active'|'suspended')**, `assignedTables`.
- Permission checks already enforced server-side: `accountService.canManageRole` (owner→manager/waiter/kitchen; manager→waiter/kitchen; owners never managed via API). `listForActor` already returns only manageable accounts.
- `api.updateAccount(username, payload)` already existed in `client/src/services/api.ts` — just **unwired**.

⇒ Suspend/activate is **pure frontend wiring. No backend change.**

## `assignedTables` — operational status (audit)

| Question | Finding |
|---|---|
| Stored? | Yes — `accountService.updateAccount` persists `patch.assignedTables`; `sanitizeAccount` returns it. |
| In the Prisma `User` model? | **No** — JSON-account field only (Phase 00 AUDIT-DATABASE §5). |
| Enforced anywhere? | **No.** Socket table control uses `TABLE_CONTROL_ROLES` (any waiter/manager/owner may control any table — `socketService.socketCanControlTable`). No code reads `assignedTables` for authorization or routing. |
| Value today | Effectively **dead** — a stored field with no behavioural effect. |

### Decision
Per the phase rule ("If assignedTables is effectively dead: document and propose retirement. Do NOT silently remove it."): **assign-tables UI is NOT ported.** The field is left in place (no removal), and retirement is **proposed** for a future phase that also removes the now-unused `assignedTables` read/write paths. Removing it now would be a behaviour/schema-adjacent change, out of Phase 01A scope.

This is **not a functionality loss**: the feature had no operational effect to lose.

## Implementation (frontend only)

- **`client/src/pages/AdminPage.tsx`**:
  - `handleUpdateAccountStatus(username, status)` → `api.updateAccount(username, { status })`, then reloads accounts.
  - `AccountsList` now takes `currentUsername` + `onUpdateStatus`; delegates each row to a new `AccountRow`.
  - `AccountRow`: shows status and a **Suspend / Activate** button (with a confirm on suspend, per-row busy state). Hidden for the current user (self-guard) — the server also rejects unauthorised targets.
  - Accounts tab wired: `<AccountsList accounts={accounts} currentUsername={user?.username} onUpdateStatus={handleUpdateAccountStatus} />`.

Suspension takes effect immediately: `accountService.updateAccount`/`invalidateSessions` semantics + the login `status === 'suspended'` check (`helpers.js`) sign the user out and block re-login.

## Requirements check
- ✅ Suspend implemented.
- ✅ Activate implemented.
- ✅ Assign-tables: audited, found dead, documented, retirement proposed (not silently removed, not ported).
- ✅ No backend change; existing permission checks reused.

## Verification
- `tsc --noEmit` clean; `vite build` success.
- Server permission model unchanged (`canManageRole` still authoritative).

## Result
**Owner/Manager can suspend and reactivate staff in React `/Admin` without the vanilla admin → MATCHED.** Assign-tables → **DEPRECATED** (dead, retirement proposed).
