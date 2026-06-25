# APK-BUILD.md — Phase 04B Step 9

**Date:** 2026-06-25. **Status: ⚠️ build CONFIGURED + ready; the binary was NOT produced in this environment.**

> **Honesty note.** The machine this phase ran on has **no Android SDK, no JDK, no Expo/EAS CLI, and no Expo account** (verified: `java` not found, `ANDROID_HOME` empty, `expo`/`eas` absent). A real APK therefore **cannot be generated here**. This document gives the exact, ready-to-run build configuration + commands; the artifact is produced by running them on a machine with the toolchain (or on EAS cloud). No fabricated APK, size, or hash is reported.

---

## Build configuration (committed)
| File | Purpose |
|---|---|
| `app.json` | app id `com.emenyu.trumpwaiter`, permissions (`INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`), plugins (`expo-secure-store`, `expo-notifications`), `extra.apiBaseUrl` |
| `eas.json` | profiles: **development** (dev-client APK), **preview** (internal **APK**), **production** (AAB) |
| `package.json` | build scripts (`build:apk:preview`, `build:apk:dev`, `build:aab:prod`) |
| `babel.config.js` / `tsconfig.json` | `babel-preset-expo`, strict TS |

## EAS profiles (`eas.json`)
- `development` → `developmentClient: true`, `android.buildType: apk` (debug/dev client).
- `preview` → `distribution: internal`, `android.buildType: apk` → **the installable pilot APK**.
- `production` → `android.buildType: app-bundle` (AAB for Play), `autoIncrement`.

## Commands
```bash
cd Apps/TrumpWaiter
npm install                 # done in this phase (Expo 51.0.39, RN 0.74.5; 1186 pkgs)

# one-time
npm i -g eas-cli
eas login
eas build:configure        # writes a real extra.eas.projectId

# DEBUG / dev-client APK
eas build -p android --profile development     # → APK (dev client)

# RELEASE pilot APK (sideload to staff devices)
npm run build:apk:preview   # eas build -p android --profile preview → APK

# Play AAB
npm run build:aab:prod
```
A **local** build is also possible where the Android SDK + JDK 17 exist:
```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```

## Prerequisites before the FIRST real build
1. **EAS project id** — `eas build:configure` (replaces the placeholder in `app.json`).
2. **FCM** — drop `google-services.json` (Firebase → Android app `com.emenyu.trumpwaiter`) at the app root; upload the FCM key to EAS credentials. (Expo Go / dev needs none.)
3. **Branding assets** — `assets/icon.png` (1024²), `splash.png`, `adaptive-icon.png`, `notification-icon.png`. Omitted from the scaffold so it builds on Expo defaults; add for store polish.
4. **API target** — confirm `extra.apiBaseUrl` (prod `https://emenyu.com/Trump`).

## Dependencies (installed, real)
Expo 51.0.39 · React Native 0.74.5 · React 18.2.0 · @react-navigation/native 6.1.18 (+ native-stack, bottom-tabs) · socket.io-client 4.8.3 · expo-secure-store · expo-notifications · expo-device · @react-native-community/netinfo · @react-native-async-storage/async-storage. 639 top-level `node_modules` entries.

## Expected artifact (to confirm post-build — NOT measured here)
| Metric | Expectation (typical Expo 51 RN app) | How to confirm |
|---|---|---|
| Preview APK size | ~50–70 MB (single-arch dev/preview APK) | `ls -lh app-release.apk` after build |
| Build time (EAS cloud) | ~10–20 min queue + build | EAS build log |
| Min / target SDK | min API 24, target API 34 (Expo 51 defaults) | `expo prebuild` output |
> These are stated as **expectations to verify**, not measurements.

## Install steps (pilot)
1. `eas build -p android --profile preview` → download APK (or scan QR).
2. On the device: enable "Install unknown apps" for the browser/files app.
3. Install the APK; launch **Trump Waiter**.
4. Sign in with staff credentials → token session begins; the device registers under **Profile → My devices** (revocable).

## Status against Step 9
- Debug APK: **profile defined, command ready** — not produced here (no toolchain).
- Release APK: **profile defined, command ready** — not produced here.
- Size / build time / install steps: **documented** (size/time as expectations to verify on first build).
