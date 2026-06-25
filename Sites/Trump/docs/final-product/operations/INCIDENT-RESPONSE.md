# INCIDENT-RESPONSE.md — Handling Production Incidents

**Audience:** on-call operator. **Rule 1:** during service, protect the restaurant first — fall back to paper/POS, *then* work the incident.

**Priorities:** P0 (service down / data loss / security breach) · P1 (major feature broken, has workaround) · P2 (degraded) · P3 (minor).

---

## At a glance
| Pri | Example | Target response | Target resolve |
|---|---|---|---|
| **P0** | Site down; orders lost; DB corrupt; credential/data breach | **immediate** | ASAP (hours) |
| **P1** | Login broken for a role; notifications not delivering; menu won't load for many | < 15 min | same day |
| **P2** | Slow responses; one device flaky; occasional 5xx | < 1 h | days |
| **P3** | Cosmetic; rare edge case | next business day | backlog |

## The loop (every incident): Detection → Containment → Recovery → Verification → Communication
For each, record timestamps in the incident log (template below).

---

## P0 — Service down / data loss / security
**Detection:** monitor webhook alert, `/healthz` failing, staff report "nothing works", or anomalous logins.
**Containment:**
- Service issue → **tell staff to fall back** (Rule 1). 
- Suspected breach → rotate `TRUMP_SESSION_SECRET` (kills all sessions), `npm run auth:rotate`, revoke devices, block the source if identifiable; preserve logs.
- Data loss → **stop writes** (`pm2 stop emenuy-trump-api`) to prevent overwriting recoverable state.
**Recovery:**
- Down → [SERVER-RECOVERY.md](SERVER-RECOVERY.md). Data/box → [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md) (restore into scratch DB, verify, cutover).
**Verification:** `/readyz` ready; test login (web+token); place+complete a test order; row counts sane; backup taken.
**Communication:** notify owner immediately + when resolved; one-paragraph cause + impact + fix.

## P1 — Major feature broken
**Detection:** staff report; `*_failed`/`error` spikes in logs; a smoke test fails.
**Containment:** confirm scope (one role? one device? everyone?). Provide the workaround (e.g., web console if the app is the problem).
**Recovery:**
- Recent deploy suspected → **rollback** (`deploy-trump.sh rollback …`).
- Config → fix `.env` + `npm run env:check` + reload.
- Capture a reproduction for [../phase-06/BUG-LIST.md](../phase-06/BUG-LIST.md) (repro → root cause → fix → verify → regression).
**Verification:** the broken flow now works end-to-end; regression check (e.g., re-run the e2e/idempotency probes against staging).
**Communication:** update owner/manager when restored.

## P2 / P3
- Log it, attach evidence, triage into BUG-LIST. **No feature creep** — only Critical/High get fixed during a pilot (Rule 2). Schedule the rest.

## Diagnostic quick-reference
```bash
pm2 status; pm2 logs emenuy-trump-api --lines 120
curl -s http://127.0.0.1:3012/healthz; curl -s http://127.0.0.1:3012/readyz
grep -E '"level":"(error|fatal)"' ~/.pm2/logs/*-error*.log | tail
grep rate_limit_ ~/.pm2/logs/*.log | tail        # throttling?
grep _failed ~/.pm2/logs/*.log | tail             # DB/save failures?
sudo -u postgres psql -d emenyu -c "select count(*) from pg_stat_activity;"   # connection pressure
df -h /; free -m
```

## Incident log template (fill per incident)
```
ID: INC-YYYYMMDD-01    Priority: P0/P1/P2/P3
Detected: <time, how>
Impact: <who/what; service interrupted? Y/N>
Containment: <action + time>
Root cause: <after investigation — server is source of truth, no local-only fixes>
Recovery: <action + time; rollback/restore ref>
Verification: <tests run, result>
Communication: <who told, when>
Follow-up: <BUG-LIST id; prevention>
```

## Prevention feedback
Every P0/P1 should produce a follow-up: a monitor check, a smoke test, or a doc fix so it's caught earlier next time. Update [MONITORING-RUNBOOK.md](MONITORING-RUNBOOK.md) / [MAINTENANCE.md](MAINTENANCE.md) accordingly.
