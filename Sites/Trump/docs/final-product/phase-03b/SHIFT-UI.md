# SHIFT-UI.md — Phase 03B Step 1

**Date:** 2026-06-25. **Status: ✅ implemented + verified (build + authed API).** Consumes existing shift endpoints only; no backend changes.

---

## Component
`client/src/components/operations/ShiftPanel.tsx` — the waiter's shift control.

- **Off duty:** "Start shift" button → `POST /api/shift/start`.
- **On duty:** live **on-duty timer** (ticks every 30 s), plus live tiles — **Orders / Revenue / Tasks** — from `GET /api/shift/me`; "End shift" → `POST /api/shift/end`.
- **End summary:** on end, a gold summary card shows **Orders handled / Revenue handled / Tasks resolved** (snapshotted server-side from the shift window).

## Where it's wired
Waiter app **Profile** tab (`WaiterPage.tsx` → `WaiterOpsSection`), below the existing performance stats. (The legacy `StartShiftScreen` "Start Service" remains the client-side floor demo; `ShiftPanel` is the real, persisted Phase 03 shift.)

## Endpoints consumed
`GET /api/shift/me` · `POST /api/shift/start` · `POST /api/shift/end` (via `services/opsApi.ts`).

## Verification
- `tsc --noEmit` clean, `vite build` ✓.
- Authed probe (`role-probe.js`, 16/16): `waiter POST /shift/start 200` → `/shift/me shows active` → `POST /shift/end 200`.
- One-active-shift invariant enforced server-side (409 on double start; covered by the Phase 03 sim).

## Notes / next refinement
- Manager/owner force-end + the all-shifts list have endpoints (`/shifts`, `/shifts/:username/end`) surfaced in the **Owner Operations** dashboard; a dedicated admin "On shift now" management table is a small follow-up.
- A real-browser visual pass is recommended before production sign-off (logic + API contract are verified headlessly).
