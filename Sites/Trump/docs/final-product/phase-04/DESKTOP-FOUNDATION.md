# DESKTOP-FOUNDATION.md — Phase 04 Step 4

**Date:** 2026-06-25. **Status: design.** A single desktop **Staff** app for **Owner** + **Manager** (Kitchen = future), reusing the existing React UI, sharing the token auth.

---

## Technology choice: **Tauri** ✅ (Electron as fallback)

| Criterion | Tauri | Electron |
|---|---|---|
| Reuse existing React build | ✅ loads the same Vite SPA | ✅ |
| Bundle size / RAM | ✅ ~3–10 MB, OS webview | ✗ ~120 MB, bundled Chromium |
| Security | ✅ Rust core, locked-down IPC, CSP | ~ |
| Auto-update | ✅ built-in updater (signed) | ✅ electron-updater |
| Maturity / ecosystem | ~ growing | ✅ very mature |

**Decision: Tauri** — it **wraps the existing React admin SPA** (the `/Trump/Admin` build) as a native window with a tiny, secure footprint, fitting the 1 GB-box ethos. Electron is the fallback if a Tauri/webview limitation appears.

## Architecture — reuse, don't rebuild
- The desktop shell loads the **existing React UI** (the production SPA), pointed at `https://emenyu.com/Trump` (or a packaged build hitting the API). **Zero UI rewrite** — Operations dashboard, Audit viewer, menu/analytics already exist.
- Native shell adds: **window chrome, OS notifications, auto-update, secure token storage** (OS keychain via Tauri Stronghold/`keyring`), deep links.

## Auth (shared with web + Android)
- Desktop logs in via `POST /api/auth/token` (`platform: 'desktop'`) → stores tokens in the **OS keychain** (not localStorage). The embedded React app uses Bearer (a thin shim injects the header / or the app uses the same `opsApi` with a token provider).
- Same refresh-rotation + device registry (`/auth/devices`) → "this PC" appears in session management; revocable.

## Roles
- **Owner / Manager:** full admin + Operations + Audit (the React admin).
- **Kitchen (future):** a kitchen-display mode (the existing `/Trump/Kitchen` route) — packaged later.

## Auto-update strategy
- **Tauri updater** with a signed `latest.json` manifest hosted alongside releases (GitHub Releases or DO Spaces). App checks on launch + daily; downloads + verifies signature; prompts to restart.
- Channel: `stable`. Rollback = pin previous release in the manifest.

## Packaging (see PACKAGING.md)
- **Windows:** MSI / NSIS installer, code-signed.
- **macOS:** `.dmg`, notarized.
- **Linux:** AppImage (optional).

## Why one app (not per-role)
A single binary with **role-driven UI** (the React app already gates by `useAuth`) — owners/managers share it; the server enforces permissions. Simpler distribution + updates.

## Out of scope
No offline-first desktop editing (online tool); no bundled DB; no business logic in the shell.
