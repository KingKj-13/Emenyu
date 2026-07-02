# OWNERSHIP-UI.md — Phase 03B Step 2

**Date:** 2026-06-25. **Status: ✅ implemented + verified.** Consumes existing ownership APIs only.

---

## Component
`client/src/components/operations/OwnershipPanel.tsx` — per-table ownership card.

- **Displays:** current owner (or "Unassigned"), and the full **ownership history** (each `assign/transfer/takeover/reassign/release` with actor, previous owner, reason, time).
- **Role-aware actions** (gated by `useAuth`):
  - **Waiter (owner of the table):** Transfer → `POST /ownership/:t/transfer`.
  - **Waiter (not owner):** Take over → `POST /ownership/:t/takeover`.
  - **Manager / Owner:** Reassign (**reason required**, disabled until filled) → `POST /ownership/:t/reassign`; plus Assign.
- Target waiter is chosen from active-shift waiters (`GET /shifts`), with a reason field.

## Where it's wired
- **Waiter app** Profile → `WaiterOpsSection` table explorer (enter a table id → owner + actions + history).
- The same component is reusable on the admin floor view.

## Endpoints consumed
`GET /ownership` · `GET /ownership/:t` · `GET /ownership/:t/history` · `POST /ownership/:t/{assign,transfer,takeover,reassign}`.

## Verification
- Build clean; authed probe: `waiter GET /ownership 200`.
- Backend semantics proven in the Phase 03 sim (40/40): transfer changes owner, non-owner transfer → 403, takeover, reassign-without-reason → 400, history ≥ 2 rows. The UI surfaces exactly these.

## Notes / next refinement
- Inline ownership controls **on each floor table card** (vs the Profile explorer) is a UI refinement — same component, mounted per card. Deferred to keep the large `WaiterPage`/floor edits low-risk this pass.
- The legacy account `assignedTables` field is now superseded by `WaiterAssignment`; retiring it from any remaining UI is a cleanup follow-up.
