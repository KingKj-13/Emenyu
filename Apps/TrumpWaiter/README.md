# Trump Waiter (Android)

The staff (waiter) Android app for the Trump restaurant. It **consumes the existing
Trump production API** (Phase 04 token auth) — the server is the source of truth and
all business logic (shifts, table ownership, notifications) lives server-side. This
app is a thin, real-time client. No duplicated workflows.

## Stack
- **Expo** (managed) + **React Native 0.74** + **TypeScript** (strict)
- **React Navigation** (bottom tabs + native stack)
- **expo-secure-store** — tokens live only in the OS keystore/keychain
- **socket.io-client** — realtime via the Phase 04B Bearer handshake
- **expo-notifications** — push (Expo → FCM/APNs)
- **@react-native-community/netinfo** — connectivity / offline

## Architecture
```
src/
  api/         REST client (Bearer + refresh interceptor, retry, timeout) + typed endpoints
  auth/        token store (rotating refresh, single-flight), device id, AuthContext
  components/  theme + shared UI (Screen, Button, SyncBanner, ui primitives)
  hooks/       useShift, useOwnership, useNotifications, useConnectivity
  navigation/  RootNavigator (auth gate) + tabs + stack
  screens/     Login, Home, Shift, Tables, TableDetail, Notifications, Requests, Profile
  services/    connectivity, socket (Bearer), push (FCM/Expo), offline read-through
  storage/     secureStore (tokens), cache (offline reads)
  types/       operations (shared with web client), api (auth/device/menu)
```

## Configure the API target
`app.json` → `expo.extra.apiBaseUrl`. Default is production (`https://emenyu.com/Trump`).
For local integration testing point it at a running Trump server, e.g. an Android
emulator reaching the host machine:
```json
"extra": { "apiBaseUrl": "http://10.0.2.2:3012/Trump" }
```

## Run (dev)
```bash
npm install
npm run start          # Expo dev server (scan QR with Expo Go / dev client)
npm run android        # build/run on a connected device or emulator
npm run typecheck      # tsc --noEmit
```

## Build an APK
See [docs/final-product/phase-04b/APK-BUILD.md](../../Sites/Trump/docs/final-product/phase-04b/APK-BUILD.md).
```bash
npm run build:apk:preview   # eas build -p android --profile preview  → installable APK
```

## Pre-release assets (intentionally omitted from the scaffold)
Add before a Play Store build (the app runs on Expo defaults without them):
- `assets/icon.png` (1024×1024), `assets/splash.png`, `assets/adaptive-icon.png`, `assets/notification-icon.png`
- `google-services.json` (Firebase console → Android app `com.emenyu.trumpwaiter`) for FCM
- a real EAS `projectId` in `app.json` → `extra.eas.projectId`

## Security notes
- Access token: 15 min, Bearer, validated server-side by the same HMAC + active-user
  check as the web cookie (suspension/global-logout revoke it instantly).
- Refresh token: rotating, single-use, stored only in SecureStore; reuse → 401.
- Offline = **read-resilient, write-online**: server-authoritative actions are
  disabled while offline (no split-brain on the shared floor).
