# BUG-LIST.md — Pilot-Discovered Bugs

> **STATUS: EMPTY — no pilot has run, so there are no pilot-confirmed bugs.** Per Rule 2, **only pilot-discovered Critical/High issues are eligible to fix in Phase 06.** Speculative/pre-existing items are NOT bugs for this phase (they live in the Phase 05A KNOWN-ISSUES backlog). Fill one row per reproducible issue observed during the live service.

**Severity:** 🔴 Critical (service interrupted / data loss / security) · 🟠 High (blocks a task, has a workaround) · 🟡 Medium (annoyance) · ⚪ Low.
**A fix is allowed only with:** reproduction → root cause → verification → regression check (Rule 2 + Step 7).

---

## Bug template (copy per bug)
```
ID: PILOT-BUG-001
Severity: 🔴/🟠/🟡/⚪
Title:
Observed: <what happened, who saw it, timestamp from PILOT-LOG>
Reproduction: <exact steps; device/role/network>
Frequency: <once / intermittent / every time>
Impact: <service effect; Rule-1 interruption? Y/N>
Root cause: <after investigation — server is source of truth, no local-only fixes>
Fix: <commit ref; server-side>
Verification: <how confirmed fixed — re-run repro>
Regression check: <what else tested; e.g. e2e scenario re-run, idempotency probe>
Status: open / fixed / deferred(Phase 06+)
```

## Active bugs (fill during/after pilot)
| ID | Sev | Title | Repro? | Root cause | Fix (commit) | Verified | Status |
|---|---|---|---|---|---|---|---|
| _none yet_ |  |  |  |  |  |  |  |

## Fix log (only Critical/High, pilot-confirmed)
> Each fix must reference observed behaviour. No feature additions. Server-side only.

| Commit | Bug ID | Repro confirmed | Regression run | Result |
|---|---|---|---|---|
|  |  |  |  |  |

## Triage rules (reminder)
- 🔴 Critical → fix **immediately** (or fall back per Rule 1, then fix).
- 🟠 High → fix within the pilot window if safe; else schedule with evidence.
- 🟡/⚪ → record only; defer (no feature creep).
- Anything needing a schema/API/UI **redesign** is **out of scope** (RC1 freeze) → Phase 06+ backlog with justification.
