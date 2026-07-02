# PACKAGING.md — Phase 04 Step 7

**Date:** 2026-06-25. **Status: strategy (no builds this phase).**

---

## Android (React Native / Expo)

| Item | Plan |
|---|---|
| Build | **EAS Build** (cloud) → APK (sideload/pilot) + AAB (Play) |
| Dev/pilot | `eas build -p android --profile preview` → **APK** for direct install on staff devices |
| Signing | EAS-managed Android keystore (or a checked-in upload key in CI secrets) |
| Updates | **EAS Update** (OTA JS) for fixes; store release for native changes |
| Min/target SDK | target current Play requirement (e.g. API 34+), min API 26 |

**Play Store readiness checklist**
- [ ] App signing (Play App Signing) + upload key.
- [ ] Privacy policy URL + Data Safety form (collects: staff login + device id; **no customer PII**).
- [ ] Target SDK ≥ Play minimum; 64-bit; permissions minimal (network, notifications).
- [ ] FCM `google-services.json`; notification icons/channels.
- [ ] Internal testing track → closed pilot → production.
- [ ] Store listing (it's a **staff** tool — consider an unlisted/internal distribution or org-managed Play if not public).

> For a single restaurant's staff, **internal distribution (APK / unlisted track)** is likely preferable to a public Play listing.

## Desktop (Tauri)

| OS | Artifact | Notes |
|---|---|---|
| **Windows** | **MSI + NSIS `.exe`** installer | code-sign (EV/OV cert) to avoid SmartScreen; auto-update via signed `latest.json` |
| **macOS** | **`.dmg`** (universal) | Apple Developer ID sign + **notarize** + staple |
| **Linux** | **AppImage** (optional) | also `.deb` if needed; no signing infra required |

- **Auto-update:** Tauri updater checks a signed manifest (GitHub Releases or DO Spaces) on launch + daily; verifies signature; prompts restart.
- **CI:** GitHub Actions matrix (win/mac/linux) → build → sign → publish release + manifest.

## Versioning & release
- Semver; the app shows its version + `GET /healthz` build info for support.
- Release channels: `stable` (default). Rollback = re-point the update manifest to the prior signed build.

## Distribution summary
- **Waiter (Android):** EAS → APK/internal track, OTA for JS fixes.
- **Staff (Desktop):** Tauri installers (Win MSI primary; mac dmg; linux AppImage optional), signed, auto-updating.
- Both authenticate via the **token API** and register as **devices** (revocable from `GET /api/auth/devices`).
