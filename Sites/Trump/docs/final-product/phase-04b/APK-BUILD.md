# APK-BUILD.md — Phase 04B Step 9

**Date:** 2026-06-25, updated 2026-07-02. **Status: ✅ built on EAS cloud (preview profile, SDK 51) and published as a GitHub Release asset — see "Hosting" below.**

> **Build record (2026-07-02).** EAS project `@kingkj1307/trump-waiter` (id `066081f0-bc31-4ed1-a1cd-67fdb6cafa9b`), created via `npx eas-cli init --force`. Android keystore generated remotely by EAS (stored in EAS credentials, not in this repo). Branding assets (dark `#0b0b0c` + gold `#c8a555` "T" monogram) added under `assets/` and wired in `app.json`. A root-level `.easignore` limits the monorepo upload to `Apps/TrumpWaiter` (the repo carries ~300 MB of restaurant images the app build doesn't need).

## Hosting — permanent download link (GitHub Release)

The APK is **never committed to the repo** (`*.apk`/`*.aab` are gitignored). It is attached to a GitHub Release with the asset name **exactly `trump-waiter.apk`**, which makes this URL permanent:

```
https://github.com/KingKj-13/Emenyu/releases/latest/download/trump-waiter.apk
```

The Trump server hands this URL to managers in Admin → Accounts → Add staff account (success view). It is configurable via the `TRUMP_WAITER_APK_URL` env var (`createConfig` → `GET /Trump/api/config`); the default is the URL above.

> **⚠️ Release rule.** `releases/latest/download/<name>` resolves to the newest **non-draft, non-prerelease** release. Every future release on this repo must either **re-attach `trump-waiter.apk`** or be created with `--prerelease`, otherwise the permanent link 404s.

Publish/refresh command:
```bash
gh release create waiter-v<version> path/to/trump-waiter.apk --target master \
  --title "Trump Waiter v<version> (Android APK)" --notes "..."
# or re-attach to an existing release:
gh release upload waiter-v<version> path/to/trump-waiter.apk --clobber
```

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

# one-time (no global install needed — npx works)
npx eas-cli@latest login
npx eas-cli@latest init --force   # writes a real extra.eas.projectId (done 2026-07-02)

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
1. **EAS project id** — ✅ done 2026-07-02 (`066081f0-bc31-4ed1-a1cd-67fdb6cafa9b`, owner `kingkj1307`).
2. **FCM** — ⏳ still open (out of scope for the first release; the app polls in the foreground as fallback). Drop `google-services.json` (Firebase → Android app `com.emenyu.trumpwaiter`) at the app root; upload the FCM key to EAS credentials.
3. **Branding assets** — ✅ done 2026-07-02 (`assets/icon.png` 1024², `splash.png` 1284×2778, `adaptive-icon.png`, `notification-icon.png`; generated dark/gold theme).
4. **API target** — ✅ `extra.apiBaseUrl` = `https://emenyu.com/Trump`.

## Dependencies (installed, real)
Expo 51.0.39 · React Native 0.74.5 · React 18.2.0 · @react-navigation/native 6.1.18 (+ native-stack, bottom-tabs) · socket.io-client 4.8.3 · expo-secure-store · expo-notifications · expo-device · @react-native-community/netinfo · @react-native-async-storage/async-storage. 639 top-level `node_modules` entries.

## Artifact (measured — first real build, 2026-07-02)
| Metric | Measured | Source |
|---|---|---|
| Preview APK size | **65,623,723 bytes (62.6 MB)** | `trump-waiter.apk` downloaded from EAS |
| EAS build | id `121d908b-92ce-4796-820a-64a59ab19b66`, profile `preview`, SDK 51.0.0, versionCode 1 | `eas build:view` |
| Published | GitHub Release `waiter-v1.0.0`, asset `trump-waiter.apk`; `releases/latest/download/trump-waiter.apk` verified HTTP 200 with matching content-length | `gh release` + `curl -I` |

## Install steps (pilot)
1. `eas build -p android --profile preview` → download APK (or scan QR).
2. On the device: enable "Install unknown apps" for the browser/files app.
3. Install the APK; launch **Trump Waiter**.
4. Sign in with staff credentials → token session begins; the device registers under **Profile → My devices** (revocable).

## Status against Step 9
- Debug APK: **profile defined, command ready** — not produced here (no toolchain).
- Release APK: **profile defined, command ready** — not produced here.
- Size / build time / install steps: **documented** (size/time as expectations to verify on first build).
