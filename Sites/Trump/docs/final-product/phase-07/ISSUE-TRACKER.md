# ISSUE-TRACKER.md — First-Restaurant Findings

> **STATUS: EMPTY — no live findings yet.** Every observation from onboarding/go-live/hypercare is categorized here. **Do not implement immediately — prioritize after one week** (Step 8). During the RC1 freeze, only **Critical/High pilot-confirmed bugs** get fixed now; everything else is scheduled.

**Categories:** Configuration · Training · Bug · UX · Performance · Feature-request.
**Severity:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low.

---

## Entry template
```
ID: P07-001
Category: configuration / training / bug / ux / performance / feature-request
Severity: 🔴/🟠/🟡/⚪
Source: GO-LIVE-LOG / SUPPORT-LOG / STAFF-TRAINING-LOG / metrics (cite + timestamp)
Observed: <what, who, when — real evidence only>
Reproduction (bugs): <steps; device/role/network>
Root cause: <after investigation — server is source of truth>
Decision: fix-now (Crit/High, pilot-confirmed) / schedule / won't-do
Fix: <commit ref, server-side> / Verification: <repro re-run + regression>
Status: open / fixed / scheduled / deferred(Phase 06+)
```

## Findings (fill from real usage)
| ID | Category | Sev | Source | Summary | Decision | Status |
|---|---|---|---|---|---|---|
| _none yet_ |  |  |  |  |  |  |

## Triage rules
- **Configuration** → fix immediately (it's setup, not code): correct the value, re-verify. Update [RESTAURANT-CONFIGURATION.md](RESTAURANT-CONFIGURATION.md) if the default misled.
- **Training** → clarify on the spot + improve the relevant [../operations/](../operations/) training guide. Not a code change.
- **Bug (🔴/🟠, reproducible)** → fix now: repro → root cause → server-side fix → verify → regression ([../operations/INCIDENT-RESPONSE.md](../operations/INCIDENT-RESPONSE.md)). 🟡/⚪ → schedule.
- **UX (observed)** → minimal polish only (no redesign); else schedule.
- **Performance** → measure vs Phase 05 baseline; fix only if a real regression ([../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md)).
- **Feature-request** → **always defer** to the Phase 06+ backlog (no feature work in Phase 07).

## Prioritization (do this AFTER week 1 — Step 8)
| Priority bucket | IDs |
|---|---|
| Fix before wider rollout (Crit/High) |  |
| Next iteration (Medium) |  |
| Backlog (Low / feature requests) |  |

## Backlog feed (Phase 06+ candidates)
Carry forward, with the real evidence that motivates each:
- Per-table rate-limit keying · media→Spaces/CDN · single-transaction order · multi-restaurant · customer app · kitchen display — see [../operations/KNOWN-LIMITATIONS.md](../operations/KNOWN-LIMITATIONS.md). Only promote items the pilot actually justified.
