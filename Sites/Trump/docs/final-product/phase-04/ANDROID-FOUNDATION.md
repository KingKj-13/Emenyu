# ANDROID-FOUNDATION.md — Phase 04 Step 3

**Date:** 2026-06-25. **Status: design (no app code this phase).** Foundation for the **Android Waiter App**, consuming the existing production APIs — no duplicated business logic.

---

## Technology choice: **React Native (Expo)** ✅

| Criterion | React Native (Expo) | Flutter |
|---|---|---|
| Team skillset | ✅ already React + TypeScript (the whole `client/`) | ✗ Dart, new language |
| Code/type reuse | ✅ port `types/operations.ts` + the `opsApi.ts` client shape verbatim | ✗ re-model in Dart |
| API client parity | ✅ same `fetch` + Bearer patterns | ~ |
| Push (FCM) | ✅ `expo-notifications` / RN Firebase | ✅ |
| Secure storage | ✅ `expo-secure-store` (Keystore) | ✅ |
| OTA updates | ✅ Expo EAS Update | ✗ |
| Speed to v1 | ✅ highest (reuse) | lower |

**Decision: React Native + Expo (EAS).** The dominant factor is **reuse** — the team already maintains a React/TS codebase, and `types/operations.ts` + the typed `opsApi` client transfer directly. Flutter would mean a second language and re-modelling every type.

## Architecture (thin client; server is source of truth)

```
[ RN screens ] → [ apiClient (Bearer) ] → existing Trump REST API
       ↑                ↑
 [ secure token store ] [ TokenManager: refresh-on-401, rotation ]
```

- **No business logic** in the app — it renders server data and calls endpoints. Shifts/ownership/notifications all live server-side (Phase 03).
- **Reused contracts:** `types/operations.ts` (Shift/Ownership/Notification/AuditRow) and the `opsApi` method shapes become an `@trump/api` module shared in spirit (copied, since RN ≠ web bundle).

## Auth integration
- **Login:** `POST /api/auth/token` with `{ username, password, deviceName: <model>, platform: 'android' }` → store `accessToken` + `refreshToken` in **`expo-secure-store`** (Android Keystore-backed).
- **TokenManager:** attach `Authorization: Bearer`; on `401`, call `/auth/token/refresh` (single-flight), persist rotated refresh, retry once; on refresh-fail → logout.
- **Persistent session:** secure store survives restarts; device stays registered until revoked (`/auth/devices`).
- **Logout:** `POST /auth/token/revoke` + clear store.

## Screens (map to existing APIs)
| Screen | Endpoints |
|---|---|
| Login | `POST /api/auth/token` |
| Shift | `GET /api/shift/me`, `POST /api/shift/start`,`/end` |
| Floor / My tables | `GET /api/floor`, `GET /api/ownership` |
| Table detail | `GET /api/ownership/:t`,`/history`; transfer/takeover |
| Notifications | `GET /api/notifications`, `/unread-count`, `/:id/ack` |
| Timeline | `GET /api/ownership/:t/history` + `GET /api/waiter/tasks` |
| Customer requests | `GET/POST /api/waiter/tasks`, ack/resolve |

## Real-time
- **v1:** poll `notifications/unread-count` (20 s) + floor on focus — works today.
- **04B:** add socket token handshake (API-COMPATIBILITY §gap) → live push via Socket.IO; FCM for background (PUSH-ARCHITECTURE).

## Project skeleton (04B)
```
trump-waiter-app/ (Expo, TS)
  src/api/        client.ts (Bearer + refresh), ops.ts (ported opsApi), types.ts
  src/auth/       TokenManager, secureStore
  src/screens/    Login, Shift, Floor, TableDetail, Notifications, Requests
  app.json (EAS), eas.json
```

## Out of scope (per brief)
No customer app, no multi-restaurant, no AI changes, no offline writes in v1 (read-cache + online mutations — see OFFLINE-STRATEGY).
