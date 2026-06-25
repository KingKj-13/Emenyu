# SUPERVISOR-CHECKLIST.md — Shift Handover + Weekly Supervision

**For:** managers/owner supervising the floor and the system. Covers **shift handover** (intra-day) and the **manager/owner weekly** routines. Keep it light — most items are a glance at the dashboard.

---

## Shift handover (every shift change)
**Outgoing supervisor**
- [ ] All active tables have a known owner; no orphaned tables (reassign any → with a reason).
- [ ] Any open issues noted for the incoming supervisor (a flaky device, a slow table).
- [ ] Outgoing waiters **end their shifts**; their tables are transferred/covered.

**Incoming supervisor**
- [ ] Dashboard healthy (active waiters, open tables, orders, revenue look right).
- [ ] Notifications bell clear of unhandled alerts.
- [ ] Incoming waiters **start shifts** + appear on the dashboard.
- [ ] Quick health glance: `npm run health:check` HEALTHY (or `/healthz` ok).

## During the shift (supervisor watch)
- [ ] Balance tables across waiters (reassign overloaded sections — reason recorded).
- [ ] Watch for stuck orders / repeated app issues → if widespread, **fall back + call the operator** ([../operations/INCIDENT-RESPONSE.md](../operations/INCIDENT-RESPONSE.md)).
- [ ] Spot-check a bill total vs the till.

## Manager — weekly
- [ ] Review the week's reports (Summary / Top items / Per-table / By-hour); flag anomalies to the owner.
- [ ] Staff: anyone left? → owner suspends their account + revokes devices ([../operations/PASSWORD-ROTATION.md](../operations/PASSWORD-ROTATION.md)).
- [ ] Device list sane (no unknown devices) — Profile → My devices.
- [ ] Note recurring staff/customer friction → the issue tracker ([../phase-07/ISSUE-TRACKER.md](../phase-07/ISSUE-TRACKER.md)).

## Owner — weekly
- [ ] Revenue/order trends make sense vs. the till.
- [ ] Menu fresh (seasonal items, prices current) — edit via the console; re-verify totals.
- [ ] Ask the operator for the weekly **backup verification** sign-off ([../operations/BACKUP-VERIFICATION.md](../operations/BACKUP-VERIFICATION.md)).
- [ ] Confirm staff are using their **own** accounts (reports stay accurate).

## Operator — weekly (system supervision)
- [ ] `npm run health:check` (prod) HEALTHY; review `pm2 logs` for `error`/`_failed`/`rate_limit_`.
- [ ] Backup integrity + off-box copy present.
- [ ] Disk trend; log rotation healthy.
- [ ] Rate-limit hits during normal service ≈ 0 (tune if not — [../phase-05/RATE-LIMIT-REVIEW.md](../phase-05/RATE-LIMIT-REVIEW.md)).
- [ ] (Reference: deeper weekly/monthly steps in [../operations/MAINTENANCE.md](../operations/MAINTENANCE.md).)

**Handover by:** ____ → ____  **Date/shift:** ____
