# PILOT-CHECKLIST.md — Operator's Pilot Run Sheet

**Purpose:** the operator's tickable checklist to run the first restaurant pilot safely. The detailed pilot **kit** (log, interview forms, measurement plan, decision gate) lives in [../phase-06/](../phase-06/); this is the operations wrapper that sequences it. **Rule 1: restaurant first — abort to fallback at any red flag.**

---

## Before the pilot (readiness)
- [ ] [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) fully ticked (infra, app, security, data, backups, monitoring, Android, training, validation).
- [ ] RC1 deployed + smoke-green ([DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md)); tag `trump-v1.0-rc1`.
- [ ] Live validation matrix green ([../phase-05a/PRODUCTION-VALIDATION.md](../phase-05a/PRODUCTION-VALIDATION.md) §B).
- [ ] Off-hours prod load test passed (§C).
- [ ] Release APK installed on ≥3 waiter devices; device matrix run ([../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md)).
- [ ] Staff trained (OWNER/MANAGER/WAITER-TRAINING) + kitchen briefed.
- [ ] **Fallback workflow agreed**; abort signal known to all.
- [ ] Fresh backup taken + **verified restorable** ([BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md)).
- [ ] On-call operator available; monitoring webhook test-fired.

## During the pilot
- [ ] On-site observer with [../phase-06/PILOT-LOG.md](../phase-06/PILOT-LOG.md) open — timestamp every phase (open→login→browse→order→notify→transfer→bills→close→reports).
- [ ] Operator watching `pm2 monit` + `pm2 logs` ([MONITORING-RUNBOOK.md](MONITORING-RUNBOOK.md)); capture metrics into [../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md) vs the Phase 05 baselines.
- [ ] Log any issue → [../phase-06/BUG-LIST.md](../phase-06/BUG-LIST.md) (repro→root cause→verify→regression) and UX friction → [../phase-06/UX-IMPROVEMENTS.md](../phase-06/UX-IMPROVEMENTS.md).
- [ ] **Abort triggers** (→ fallback + capture): orders not reaching staff, duplicate/lost orders, repeated app crashes, customers can't load the menu, untrustworthy billing numbers ([GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md)).

## After the pilot
- [ ] Interview Owner, Manager, Waiters, Kitchen ([../phase-06/](../phase-06/) OWNER/WAITER/STAFF-FEEDBACK) — **record exact words**.
- [ ] Fix only **pilot-confirmed Critical/High** bugs (Rule 2): repro → root cause → fix (server-side) → verify → regression. No feature creep.
- [ ] Apply only **observed** UX polish (no redesign).
- [ ] Post-service backup; debrief.
- [ ] Write [../phase-06/POST-PILOT-REPORT.md](../phase-06/POST-PILOT-REPORT.md): top-10 improvements, top-10 strengths, severity buckets, decision.

## Decision (record)
- ☐ **Trump v1.0 Certified for Restaurant Deployment** — one full service, **0 critical failures**, no Trump-caused interruption, performance within baseline, all High bugs fixed, owner/staff willing to run the next service on it.
- ☐ **Additional Pilot Required** — otherwise; list exit criteria for the next pilot.

Decision by: ____  Date: ____
