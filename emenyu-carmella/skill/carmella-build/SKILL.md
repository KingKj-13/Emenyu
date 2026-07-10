---
name: carmella-build
description: Build rules and design context for the Carmella by Sir Gaspard tenant of eMenyu. Use when working on anything Carmella — theming, menu data import, chapters, day-part logic, Ask Gaspard AI, bundles, pairings, or QA for the Carmella tenant.
---

# Carmella Build Skill

## What this is
Carmella by Sir Gaspard is a story-driven all-day European café in Johannesburg getting an eMenyu tenant with the same architecture as Trumps Prime Grillhouse but a completely different skin ("The Living Journal") and an in-character AI host ("Ask Gaspard").

## Before any Carmella work
1. Read `emenyu-carmella/CLAUDE.md` (rules) and `emenyu-carmella/design/carmella-build-brief.md` (current phase, acceptance criteria).
2. Identify which phase the work belongs to. Never skip ahead of the approved phase.
3. Menu content comes ONLY from `emenyu-carmella/data/carmella-menu-data.json`.

## Key implementation facts
- **Chapters, not categories.** Use the exact names from the JSON: The Morning Pages, The Global Table, The Companions, The Interludes, The Memory Course, The Family's Toast, The Gaspard Cellar, Slow Drinks. Each has an italic `intro` line.
- **Day-part engine** drives chapter order, greeting, suggestion strip, chat chips, and theme mode: morning (light, `#FBF7EF`), midday (`#F7F2E8`), golden hour after 15:00 (dark `#141F17` + amber `#D9A05B`). Config-driven times, SAST, public-holiday close 15:00.
- **Story lines** render in Fraunces italic above descriptions, on cards and item sheets.
- **Pairings** come from the JSON `pairings` map → "Gaspard suggests" box on item sheets, one-tap add with price. Terracotta `#B65C33` is used ONLY for Gaspard-suggestion UI.
- **Bundles** ("Gaspard's Tables") are one-tap add-all carousels, filtered by day-part.
- **Ask Gaspard**: system prompt, day-part briefs, `{item:ID}` chip protocol and `{action:*}` handlers are specified in `design/gaspard-prompt-pack.md`. Implement verbatim. The 10-case eval in §5 must pass before launch.
- **Analytics**: all suggestion acceptances fire events tagged `source=gaspard`.
- **Never modify the Trumps tenant.** Visual regression check after theme work.

## Definition of done
See the acceptance criteria checklist at the end of `design/carmella-build-brief.md`.
