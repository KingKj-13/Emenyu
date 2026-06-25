# UX-POLISH.md — Phase 08 (SRE1) Step 2

**Date:** 2026-06-25. **Status: ✅ code-level UX audit; one refinement applied (recoverable error screen). No redesign.**
**Method:** review of the React SPA + the Android waiter app source. **Honest scope:** a full *visual* UX audit needs the running UI + real users on real devices — that is captured live in [../phase-06/UX-IMPROVEMENTS.md](../phase-06/UX-IMPROVEMENTS.md). This is the **code-level** pass: structural UX properties that can be verified by reading the code, and a fix for the one clear gap.

---

## What's already good (verified in code)
| Property | Evidence |
|---|---|
| **Loading states** | Web: `Suspense` fallbacks (Spinner) on every lazy route; pull-to-refresh on app screens (`Screen refreshing`). |
| **Touch targets** | Android `Button` / `Field` use **minHeight 48** (meets the 44–48 px guideline); tab icons sized for tap. |
| **Offline feedback** | `SyncBanner` shows "offline / last synced HH:MM"; action buttons **grey out** offline with a "reconnect to act" hint (no silent failures). |
| **Button consistency** | Android `Button` is a single themed component (primary/secondary/danger/ghost variants) — consistent across screens. |
| **Dark mode consistency** | Single `theme` token set (dark, gold accent) used app-wide + the web admin's dark gold console; no ad-hoc colors in the app components. |
| **Typography** | Centralized `theme.font` scale (app); no inline font sizing in the app components. |
| **Accessibility** | `accessibilityRole="button"` + `accessibilityState` on the app `Button`; `role="alert"` on the new error screen. |
| **Confirmation on destructive actions** | Transfer/takeover require an explicit action + reason field; offline guard prevents accidental mid-drop actions. |

## Refinement applied this phase (no redesign)
**Recoverable error screen (web + Android).** Previously a render error showed a **blank white screen** — the worst UX during service. Now an **error boundary** renders a clear, on-brand fallback ("Something went wrong · your data is safe · Reload / Try again"). This is the single highest-value UX/reliability refinement and is additive ([RECOVERY-VALIDATION.md](RECOVERY-VALIDATION.md)).

## Candidate refinements (defer to observed-usage — Rule 2)
These are **code-level observations**, not user-confirmed problems. Per Rule 2 ("every improvement must solve a real operational problem"), they are **recorded, not implemented** until a real user hits them (capture in [../phase-06/UX-IMPROVEMENTS.md](../phase-06/UX-IMPROVEMENTS.md)):
| Area | Observation | Why deferred |
|---|---|---|
| Order submit feedback | confirm the success toast/animation is unmistakable during a rush | needs on-device observation |
| Notification tap → table | verify the deep-link lands on the exact table every time | covered by device matrix |
| Menu image loading | lazy-load + skeletons would smooth scroll on slow Wi-Fi | a real-Wi-Fi observation + ties to the CDN/lazy-load backlog (KNOWN-LIMITATIONS) |
| Long lists (50 tables) | confirm the floor view stays snappy at the 50-table upper bound | needs a 50-table dataset on a device |

> These are **not** redesigns and **not** added speculatively — they're a watchlist for the live pilot.

## What was explicitly NOT changed
No screen was redesigned, no flow changed, no new screen added. Only the recoverable-error refinement was applied (a measured reliability/UX gap). Per Rule 2/Step 2 ("only refinement"), everything else awaits real-user evidence.

## Verdict
The UI already has the structural UX fundamentals (loading states, 48 px targets, offline feedback, consistent theming/typography, a11y roles). The one clear gap — a blank screen on render error — is **fixed**. Visual/interaction polish beyond this is driven by the live pilot's observed issues, not speculation.
