# DEVICE-TEST-REPORT.md — Phase 04B Step 10

**Date:** 2026-06-25.
**Status: ⚠️ PHYSICAL-DEVICE TESTING NOT EXECUTED — no Android devices (and no build toolchain) are available in this environment.** What *was* validated is reported truthfully below; the on-device matrix is a ready-to-run plan, not a record of results.

> No battery/memory/startup numbers are invented. Empty result cells are exactly that — **not yet run**.

---

## A. What WAS validated here (real, reproducible)

### A1. Static — TypeScript
`cd Apps/TrumpWaiter && npx tsc --noEmit` → **0 errors** (full app vs. real RN/Expo/React-Navigation/socket.io-client types).

### A2. Live integration vs. a running Trump server (local, real DB) — **27/27**
REST probe (`scratchpad/probe-04b-rest.js`) **22/22** and socket probe (`scratchpad/probe-04b-socket.js`) **5/5**. These exercise the **exact** API/socket contract every screen uses:

| Workflow step (Step 5) | Backed by check | Result |
|---|---|---|
| Login (token issue) | REST 1 | ✅ |
| Bearer on protected endpoints / auth required | REST 2–4 | ✅ |
| Start shift | REST 5 | ✅ |
| View assigned tables (ownership) | REST 6 | ✅ |
| Take over table | REST 7 | ✅ |
| Transfer table | REST 8 | ✅ |
| Customer requests / notifications (list, unread, ack) | REST 9–11 | ✅ |
| Device sessions + push-token register (persist + dispatcher target) | REST 12–13c | ✅ |
| Token refresh / rotation / reuse-401 | REST 14–16 | ✅ |
| End shift | REST 17 | ✅ |
| Web cookie login unchanged | REST 18 | ✅ |
| Device revoke → refresh 401 | REST 19–20 | ✅ |
| Socket Bearer handshake + identity | Socket A1–A2 | ✅ |
| **Live notification delivery to device socket** | Socket B1–B2 | ✅ |
| Bad-token socket denied | Socket C1 | ✅ |

This proves the app's **integration layer** end-to-end. It does **not** prove on-device runtime, rendering, gestures, push receipt on a handset, or resource usage — those need Step B.

---

## B. On-device matrix — TO BE EXECUTED (≥ 3 devices)

**Devices (suggested spread):** low-end (e.g. Android 10, 3 GB RAM), mid (Android 13), recent (Android 14). Build: `eas build -p android --profile preview` → install APK.

Legend: ⬜ not executed.

| # | Case | Method | Pass criteria | Result |
|---|---|---|---|---|
| 1 | Login | enter staff creds | session starts, lands on Home | ⬜ |
| 2 | Token refresh | idle > 15 min, then act | silent refresh, no re-login | ⬜ |
| 3 | Session persistence | kill + reopen app | opens signed-in | ⬜ |
| 4 | Shift start/end | tap Start/End | server reflects; metrics show | ⬜ |
| 5 | Table ownership: takeover | take an open table | becomes owner; history row | ⬜ |
| 6 | Table ownership: transfer | transfer to colleague | colleague owns; both update | ⬜ |
| 7 | Notifications | trigger from web | appears live (socket) | ⬜ |
| 8 | Customer requests | guest table call | shows in Requests; tap → table | ⬜ |
| 9 | Timeline/history | open Table Detail | ownership history renders | ⬜ |
| 10 | Offline mode | enable airplane mode | banner shows; actions disabled; reads from cache | ⬜ |
| 11 | Reconnect | restore network | banner clears; actions re-enabled; data refreshes | ⬜ |
| 12 | Push (foreground) | send via web | heads-up + badge | ⬜ |
| 13 | Push (background) | app backgrounded | system notification; tap → table | ⬜ |
| 14 | Multi-device | sign in on 2nd device | both listed in Profile; revoke works | ⬜ |
| 15 | Role permissions | as waiter | no admin-only endpoints exposed | ⬜ |
| 16 | Battery | 1 h active shift | record % drain | ⬜ |
| 17 | Memory | inspect (Android profiler) | record peak RSS | ⬜ |
| 18 | Startup time | cold start ×5 | record median ms | ⬜ |

### Metrics to capture (no placeholder values)
| Device | OS | Battery /h | Peak memory | Cold start | Notes |
|---|---|---|---|---|---|
| _device 1_ | | | | | |
| _device 2_ | | | | | |
| _device 3_ | | | | | |

---

## C. Conclusion
The **integration contract is proven** (27/27 live) and the **app compiles cleanly**. Physical-device validation (Section B) is the remaining gate before a staff pilot and **must be run on real hardware** — it could not be performed in this environment and is deliberately left unmarked rather than fabricated.
