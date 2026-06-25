# PILOT-TEST-PLAN.md — Trump v1.0 RC1 Restaurant Pilot

**Date:** 2026-06-25. **Status: plan + readiness checklist. The API-level service scenario is PROVEN (11/11 local); the real pilot is staff running a live service on real devices.**

---

## Pilot readiness checklist
| Gate | State | Source |
|---|---|---|
| RC1 deployed to prod | ⬜ operator-run | DEPLOYMENT-CHECKLIST |
| Live validation matrix green | ⬜ operator-run | PRODUCTION-VALIDATION §B |
| Off-hours prod load test passed | ⬜ operator-run | PRODUCTION-VALIDATION §C |
| Android APK built + signed | ⬜ **build env required** | APK-BUILD (04B) |
| 3+ physical devices tested | ⬜ **devices required** | §Device matrix below |
| Staff accounts provisioned (owner/manager/waiter/kitchen) | ⬜ | rotate from defaults |
| Tables seeded (1–N) + QR codes printed | ⬜ | per restaurant |
| Menu loaded + media present | ⬜ | owner console |
| Rollback rehearsed | ⬜ | DEPLOYMENT-CHECKLIST |

## Service scenario — the acceptance test
**Proven at API level locally (11/11).** The pilot repeats it with **real staff + real devices on prod**:

| # | Step | Pass criteria | API-proven |
|---|---|---|---|
| 1 | Restaurant opens | server healthy; menu loads | ✅ |
| 2 | Staff log in (owner/manager/waiter; kitchen) | each lands on their console; Android waiter logs in via token | ✅ |
| 3 | Customers browse | QR → menu loads fast (cached); images/video play | ✅ (menu) |
| 4 | Orders placed | orders reach kitchen/waiter; **double-tap doesn't duplicate** (idempotency) | ✅ |
| 5 | Notifications delivered | waiter app + web bell receive live notifications | ✅ |
| 6 | Shift changes | start/end shift; manager transfer/takeover of tables | ✅ |
| 7 | Bills completed | orders move to history; totals correct | ✅ |
| 8 | Restaurant closes | shifts ended; no active sessions linger | ✅ |
| 9 | Reports generated | summary/items/tables/hours reflect the service | ✅ |

**Everything must succeed on real hardware for pilot sign-off.**

## Android device matrix — TO BE EXECUTED (≥ 3 devices)
Carried from Phase 04B DEVICE-TEST-REPORT (still **NOT EXECUTED** — no devices in the build environment; never fabricated). Build the preview APK (APK-BUILD), install, run:

| # | Case | Pass criteria | Result |
|---|---|---|---|
| 1 | Login (token) | session starts | ⬜ |
| 2 | Token refresh | silent after 15 min | ⬜ |
| 3 | Shift start/end | server reflects | ⬜ |
| 4 | Orders (idempotent) | no duplicate on double-tap | ⬜ |
| 5 | Notifications (live) | socket + push | ⬜ |
| 6 | Offline mode | banner; actions disabled; cache reads | ⬜ |
| 7 | Reconnect | resumes cleanly | ⬜ |
| 8 | Push (fg/bg + tap routing) | delivered; opens table | ⬜ |
| 9 | Battery (1 h shift) | record drain | ⬜ |
| 10 | Memory | record peak | ⬜ |
| 11 | Startup | record cold-start median | ⬜ |
| Devices | low-end (A10) / mid (A13) / recent (A14) | — | ⬜ |

> Battery/memory/startup cells are intentionally blank — to be filled with **measured** values on real devices, not estimated.

## Pilot logistics
- **Duration:** one full service (lunch or dinner), one restaurant.
- **Fallback:** the existing paper/POS flow stays available; staff can revert any time.
- **Observers:** one technical person on-site watching `pm2 logs` + the ops dashboard.
- **Record:** every issue (severity, repro, screenshot) → feeds KNOWN-ISSUES / Phase 06 backlog.

## Sign-off
Pilot is certified when: the 9-step scenario completes on real devices with **no critical issue**, the device matrix is filled, and the off-hours load test passed. Then RC1 → **v1.0 for real restaurant deployment**.
