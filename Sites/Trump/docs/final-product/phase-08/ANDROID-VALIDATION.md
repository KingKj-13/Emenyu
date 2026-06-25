# ANDROID-VALIDATION.md — Phase 08 (SRE1) Step 3

**Date:** 2026-06-25. **Status: ◑ code-level review complete + one crash-handling fix applied; on-device metrics require a real device (not faked).**
**Method:** review of `Apps/TrumpWaiter` source + `tsc --noEmit` (clean). **Honest boundary:** cold-start ms, memory MB, battery drain, and APK size are **physical measurements** — there is no Android device/emulator/APK in the build env, so those cells are **left for the device matrix**, never invented.

---

## Code-level review (what can be verified by reading the app)
| Aspect | Finding | Status |
|---|---|---|
| **Cold start** (structure) | minimal root: providers + navigation; notification handler configured once; session hydrated async (non-blocking) → fast first paint. **Measure ms on device.** | ◑ review ok / measure on device |
| **Memory** (structure) | no obvious retained-listener leaks; socket/connectivity listeners return unsubscribe; offline cache bounded (AsyncStorage keys). **Measure peak RSS on device.** | ◑ review ok / measure on device |
| **Battery** | normal app workload (REST + one socket + occasional push); no background polling loop while backgrounded; foreground notification poll is 25 s. **Measure drain over a shift.** | ◑ review ok / measure on device |
| **Offline recovery** | read-cache + `SyncBanner` + actions disabled offline; reconnect refreshes the small read set. Verified by design ([../phase-04b/OFFLINE-IMPLEMENTATION.md](../phase-04b/OFFLINE-IMPLEMENTATION.md)). | ✅ design verified |
| **Reconnect speed** | socket.io-client `reconnection:true`, delay 1 s→8 s backoff; token refreshed in the handshake on reconnect. Server-side reconnect proven (4 attempts → reconnected). | ✅ verified (server side) |
| **Notification latency** | live socket `notification` event + push; reconcile via REST. Live delivery proven (04B B2). **Measure device receipt latency on the matrix.** | ✅ path / measure on device |
| **APK size** | depends on the EAS build (Expo 51/RN 0.74 → typically tens of MB). **Measure on the produced APK.** | ⬜ build required |
| **Crash handling** | **GAP FOUND: no error boundary** → a render error white-screened the app. **FIXED** (top-level `ErrorBoundary` with a Try-again fallback; tsc clean). | ✅ **fixed this phase** |
| **Background behavior** | no work scheduled while backgrounded beyond OS-delivered push; on foreground, reconnect + reconcile. **Confirm OS-kill/restore on device.** | ◑ review ok / confirm on device |

## Fix applied this phase
**Error boundary** (`Apps/TrumpWaiter/src/components/ErrorBoundary.tsx`, wrapping `App`): a render error now shows a recoverable fallback (data is safe on the server) with **Try again** instead of a blank screen. Backward-compatible, additive, `tsc --noEmit` EXIT 0.

## On-device measurements — TO RUN (the device matrix)
These **cannot be measured in the build env** and must be filled on ≥3 real devices ([../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md) §B). No values invented.
| Metric | Device 1 | Device 2 | Device 3 |
|---|---|---|---|
| Cold start (median ms) |  |  |  |
| Peak memory (MB) |  |  |  |
| Battery drain / 1 h shift |  |  |  |
| Reconnect time (s) after network drop |  |  |  |
| Push receipt latency (fg/bg) |  |  |  |
| APK size (MB) | (per build) | | |
| Crash on bad render? (error boundary catches) | ☐ | ☐ | ☐ |

## Suggested improvements (measurable — implement only if the matrix shows a problem)
- If **cold start** is slow on low-end devices → defer non-critical work off the first paint (already minimal).
- If **memory** climbs over a long shift → audit the offline cache size + listener lifecycles (reviewed clean here; confirm on device).
- If **reconnect** is slow on flaky Wi-Fi → tune the backoff. (Per Rule 2, change only if measured.)

## Verdict
The app is **structurally sound** (clean lifecycle, offline/reconnect handled, now crash-resilient via the error boundary) and **typecheck-clean**. The remaining Android validation is **on-device measurement** (cold start/memory/battery/APK/crash) on the device matrix — an operator/hardware step, reported honestly as pending, not fabricated.
