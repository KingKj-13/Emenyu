# PILOT-LOG.md — Trump v1.0 RC1 Restaurant Pilot

> **STATUS: NOT YET RUN — operator-executed.** This is the live-pilot log **template**. The pilot itself requires a real restaurant, real staff, real customers, deployed RC1, and installed APKs — none of which exist in the build environment. **Do not treat any blank field as a result.** Fill in during the actual service. No field below is fabricated.

**Pilot date:** ____ **Restaurant:** ____ **Service:** lunch / dinner **On-site observer:** ____

---

## Pre-pilot readiness (the part that IS verified)
RC1 was validated in the build session (local, production-mode server @ tag `trump-v1.0-rc1`, HEAD `c54a807`):

| Check | Result | When |
|---|---|---|
| Server boots clean (0 errors/fatals) | ✅ | build session |
| `/healthz` 200 | ✅ | build session |
| Menu cache live (`Cache-Control: max-age=30`, gzip) | ✅ | build session |
| Token login + Bearer `/shift/me` 200 | ✅ | build session |
| Web cookie login 200 (unchanged) | ✅ | build session |
| **Full service dry-run (API): 11/11** | ✅ | Phase 05A scenario probe |
| Order idempotency 5/5 · burst 5xx 33→1 | ✅ | Phase 05A |

These prove the software is ready for a pilot. They are **not** a substitute for the live pilot.

## Pilot gates (must be green BEFORE service)
- [ ] RC1 deployed to prod (DEPLOYMENT-CHECKLIST) — migrations + R1 prisma regen + pm2 reload + smoke test
- [ ] Live validation matrix green (PRODUCTION-VALIDATION §B)
- [ ] Release APK built + installed on ≥3 waiter devices (PILOT-TEST-PLAN; APK-BUILD)
- [ ] Device matrix run (PERFORMANCE-OBSERVATIONS §devices)
- [ ] Staff accounts provisioned + passwords rotated; tables + QR codes ready; menu + media loaded
- [ ] **Fallback rehearsed** (paper/POS) — Rule 1: restaurant first

## Service timeline — fill live (timestamp every event)
| Time | Phase | Event / observation | Who | Issue? (→ BUG-LIST/UX) |
|---|---|---|---|---|
|  | Open | server up; staff arrive |  |  |
|  | Login | owner / manager / waiters / kitchen sign in |  |  |
|  | Browse | first customers scan QR → menu loads |  |  |
|  | Orders | first orders placed; reach kitchen/waiter |  |  |
|  | Notifications | waiter-call / transfer alerts delivered |  |  |
|  | Tables | a table transferred / taken over |  |  |
|  | Bills | bills completed → history |  |  |
|  | Peak | busiest 30 min — watch latency/errors |  |  |
|  | Close | shifts ended; sessions cleared |  |  |
|  | Reports | owner pulls summary/items/tables/hours |  |  |

## Rule-1 events (any time Trump was set aside for the existing workflow)
| Time | What happened | Did service continue uninterrupted? | Fallback used |
|---|---|---|---|
|  |  |  |  |

## Counts (fill at close)
- Customers served: ____ · Orders placed: ____ · Orders via Trump: ____ · Tables used: ____
- Notifications delivered: ____ · Table transfers: ____ · Errors observed: ____
- Critical incidents (service interrupted): ____ (target: **0**)

## End-of-service quick verdict
- Did one complete service run on Trump end-to-end? ☐ yes ☐ partial ☐ fell back
- Any **critical** failure? ☐ no ☐ yes → ____
- Proceed to interviews (STAFF/OWNER/WAITER-FEEDBACK) and synthesis (POST-PILOT-REPORT).
