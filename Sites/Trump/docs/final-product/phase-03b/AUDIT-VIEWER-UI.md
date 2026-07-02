# AUDIT-VIEWER-UI.md — Phase 03B Step 5

**Date:** 2026-06-25. **Status: ✅ implemented + verified.** Read-only; the audit log is immutable.

---

## Component
`client/src/components/operations/AuditViewer.tsx`.

- **Filters:** Action (dropdown), Target type (dropdown), Actor (text), row limit (50–500) → `GET /api/audit?action=&actor=&targetType=&limit=`.
- **Search:** client-side text filter across actor/action/summary/reason/target.
- **Table:** When · Actor (+role) · Action · Target · Summary.
- **Detail drawer:** click a row → side panel with full fields (when, actor, action, target, summary, reason) + pretty-printed `metadata`.
- **No edit affordances** — there is no create/update/delete UI; logs cannot be changed (the model has no `updatedAt`; the API exposes only `GET`).

## Where it's wired
Admin console → new **Audit Trail** tab (OPERATIONS nav group).

## Endpoints consumed
`GET /api/audit` (read-only).

## Verification
- Build clean; authed probe: `owner GET /audit 200`, `waiter → 403`.
- The Phase 03 sim confirmed the trail records all 8 action types (shift.started/ended, table.transfer/takeover/reassign, account.created/suspended, notification.acknowledged) and is append-only.

## Notes
- Date-range filtering is supported by the service (`since`) and can be added to the UI filter bar trivially; the current viewer filters by action/actor/target/limit + free-text search, which covers the common audit lookups.
