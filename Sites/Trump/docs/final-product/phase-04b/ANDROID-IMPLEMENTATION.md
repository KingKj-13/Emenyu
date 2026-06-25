# ANDROID-IMPLEMENTATION.md — Phase 04B Step 1

**Date:** 2026-06-25. **Status: ✅ implemented + typechecked (tsc clean) + integration-validated (27/27 live).**

The first production Android application for Trump — a **staff (waiter) client** that consumes the **existing** Trump production API. The server (Phase 03) remains the source of truth; the app holds **no business logic**, only presentation + the token/realtime/offline plumbing.

---

## Stack (as installed)
| Concern | Choice | Version |
|---|---|---|
| Runtime | Expo (managed) | 51.0.39 |
| Framework | React Native | 0.74.5 |
| Language | TypeScript (strict) | 5.3 |
| UI runtime | React | 18.2.0 |
| Navigation | React Navigation (tabs + native stack) | 6.1.18 |
| Realtime | socket.io-client | 4.8.3 |
| Secure storage | expo-secure-store | 13.x |
| Push | expo-notifications (→ FCM/APNs) | 0.28.x |
| Connectivity | @react-native-community/netinfo | 11.x |

Chosen per the Phase 04 blueprint (ANDROID-FOUNDATION.md): RN/Expo reuses the team's React/TS skills and the **shared `types/operations.ts`** contract from the web client.

## Project location
```
Apps/TrumpWaiter/
```

## Structure (Step 1 requirement — matched exactly)
```
src/
  api/          apiClient.ts (Bearer+refresh+retry+timeout), endpoints.ts, auth.ts, ops.ts, menu.ts
  auth/         tokenStore.ts (rotating refresh, single-flight), deviceId.ts, AuthContext.tsx
  components/   theme.ts, Screen.tsx, Button.tsx, SyncBanner.tsx, ui.tsx
  hooks/        useShift, useOwnership, useNotifications, useConnectivity
  navigation/   RootNavigator.tsx (auth gate + tabs + stack), types.ts
  screens/      Login, Home, Shift, Tables, TableDetail, Notifications, Requests, Profile
  services/     connectivity.ts, socket.ts (Bearer), push.ts (FCM/Expo), offline.ts (read-through)
  storage/      secureStore.ts (tokens only), cache.ts (offline reads)
  types/        operations.ts (SHARED with web client), api.ts (auth/device/menu)
config.ts       API base URL (configurable), socket path, timeouts
App.tsx         providers + navigation
```

## Shared models
`src/types/operations.ts` is **byte-identical** to the web client's `client/src/types/operations.ts` (ShiftRow, OwnershipRow, NotificationRow, OpsSnapshot…). Both UIs consume the same server shapes — the brief's "no duplicated workflows" applied to types.

## What runs where (no logic duplication)
| Capability | Owner | App role |
|---|---|---|
| Shifts, ownership, notifications, audit | **Server (Phase 03)** | call endpoints, render |
| Auth / token issue / rotation / revoke | **Server (Phase 04)** | store tokens securely, attach Bearer |
| Recommendations / AI / menu data | **Server** | read-only consume |
| Realtime fan-out | **Server (socket + pushDispatcher)** | subscribe, reconcile |

## Validation done this phase
- **`tsc --noEmit`: 0 errors** (full app, against real RN/Expo/navigation types).
- **Live integration vs local Trump server: 27/27** — 22 REST + 5 socket (see API/REALTIME/AUTH docs and DEVICE-TEST-REPORT).
- **Not done here:** physical-device runtime, real APK artifact (no Android toolchain / devices in the build environment — see APK-BUILD.md, DEVICE-TEST-REPORT.md).
