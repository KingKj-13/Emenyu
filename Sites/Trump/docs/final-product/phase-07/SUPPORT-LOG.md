# SUPPORT-LOG.md — Hypercare (First Operating Week)

> **STATUS: NOT YET RUN — log template.** Hypercare = staying available throughout the first operating week of the real restaurant. **No support tickets are invented.** Log every real request here; route bugs/UX/etc. to [ISSUE-TRACKER.md](ISSUE-TRACKER.md).

**Restaurant:** ____ **Hypercare window:** ____ → ____ **On-call:** ____ **Channel:** ____ (phone/WhatsApp/etc.)

---

## Ticket template (one per request)
```
ID: SUP-001
When: <date/time>           Reported by: <owner/manager/waiter/kitchen>
Channel: phone / message / in-person
Category: configuration / training / bug / UX / performance / feature-request
Severity: P0 / P1 / P2 / P3   (P0/P1 → ../operations/INCIDENT-RESPONSE.md)
Request (verbatim): ____
Diagnosis / root cause: ____ (server is source of truth — no local-only fixes)
Resolution: ____
Time to resolution: ____
Follow-up / prevention: ____  → ISSUE-TRACKER id: ____
```

## Ticket log (fill live)
| ID | When | Reporter | Category | Sev | Summary | Resolution | Time-to-resolve |
|---|---|---|---|---|---|---|---|
| _none yet_ |  |  |  |  |  |  |  |

## Daily hypercare check (each day of week 1)
| Day | pm2/health ok | Backup ok | Errors/rate-limits in logs | New tickets | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |

Use [../operations/OPERATOR-RUNBOOK.md](../operations/OPERATOR-RUNBOOK.md) (daily checks) + [../operations/MONITORING-RUNBOOK.md](../operations/MONITORING-RUNBOOK.md).

## Support metrics (week 1 summary)
- Total tickets: ____  By category: config ___ / training ___ / bug ___ / UX ___ / perf ___ / feature ___
- P0: ____  P1: ____  P2/P3: ____
- Median time-to-resolution: ____
- Recurring themes (≥2 tickets): ____
- **Support process validated?** ☐ (every request acknowledged + resolved or scheduled, with root cause)

## Handover (end of hypercare)
- Outstanding items → [ISSUE-TRACKER.md](ISSUE-TRACKER.md) with owners + priority.
- Move from hypercare to normal support cadence ([../operations/MAINTENANCE.md](../operations/MAINTENANCE.md)).
- Sign-off: ____
