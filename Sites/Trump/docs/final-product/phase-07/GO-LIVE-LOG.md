# GO-LIVE-LOG.md — First Production Service(s) Record

> **STATUS: NOT YET RUN — log template.** Records each real production service. **No service data is invented.** Run [../operations/GO-LIVE-CHECKLIST.md](../operations/GO-LIVE-CHECKLIST.md) for the pre-flight; log the actual service here. **Rule 1: restaurant first** — fall back to the existing workflow at any abort trigger.

**Restaurant:** ____

---

## Service record (duplicate this block per service — the phase asks for MULTIPLE services)
```
Service #: ____   Date: ____   Type: lunch / dinner
Start time: ____   End time: ____
Customers served: ____
Orders placed (total): ____   via Trump: ____   via fallback: ____
Tables used: ____   Table transfers: ____
Peak usage (busiest 30 min): customers ____ / orders ____ / concurrent sockets ____
Notifications delivered: ____
Support requests during service: ____ (→ SUPPORT-LOG)
Incidents: ____ (→ ISSUE-TRACKER; P0/P1 → ../operations/INCIDENT-RESPONSE.md)
Rule-1 fallbacks (and why): ____
Critical failures: ____ (target: 0)
End-of-service: all shifts ended? ☐  reports pulled + totals match till? ☐  post-service backup? ☐
Owner sentiment after service (1–5): ____
```

## Multi-service summary (fill across services)
| # | Date | Type | Customers | Orders (Trump) | Incidents | Critical | Fallbacks | Owner (1–5) |
|---|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |

## Live watch (per service — operator)
- [ ] `pm2 monit` + `pm2 logs` open ([../operations/MONITORING-RUNBOOK.md](../operations/MONITORING-RUNBOOK.md)).
- [ ] Capture metrics → [../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md) (compare to Phase 05 baselines): API latency, CPU, RAM, bandwidth, sockets, order throughput, notification latency, error rate, rate-limit hits.
- [ ] First real loop confirmed live: QR → menu → order → reaches staff → completed → in reports.

## Abort triggers (→ fallback + capture evidence)
Orders not reaching staff · duplicate/lost orders · repeated app crashes · customers can't load the menu · untrustworthy billing numbers. (Idempotency should prevent duplicates — if one occurs, capture the repro for [ISSUE-TRACKER.md](ISSUE-TRACKER.md).)

## Go-live outcome
- Number of services completed on Trump: ____
- Any critical production failure across all services? ☐ no ☐ yes → ____
- Owner willing to continue using Trump? ☐ yes ☐ undecided ☐ no
- → Continue hypercare ([SUPPORT-LOG.md](SUPPORT-LOG.md)); synthesize in [POST-LAUNCH-REVIEW.md](POST-LAUNCH-REVIEW.md).
