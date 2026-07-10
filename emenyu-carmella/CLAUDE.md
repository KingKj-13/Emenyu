# Carmella by Sir Gaspard — Working Rules

You are building the **Carmella** tenant of eMenyu. Read this before touching anything.

## Source of truth
- Menu content: `data/carmella-menu-data.json` — never hand-type menu items, prices, or copy. Import from this file. Item `id` slugs are stable keys.
- Visual/behavioral reference: `design/carmella-prototype.html` (open with local dish images at `../images/`).
- AI behavior: `design/gaspard-prompt-pack.md` — implement §1–§4 verbatim, pass §5 eval before launch.
- Build plan & acceptance criteria: `design/carmella-build-brief.md` — work ONE phase at a time.
- Design rationale: `design/carmella-design-direction.html`.

## Hard rules
1. **Phase discipline.** Follow the brief's phases (0→5). Finish Phase 0 (discovery, no code) and get approval before writing code. End each phase with a summary + screenshots.
2. **Don't touch the Trumps tenant.** Zero visual or behavioral changes to existing tenants. Run a regression check after theming work.
3. **Design is not negotiable silently.** If the codebase can't do something the design requires (e.g., dual theme modes), stop and propose options — don't quietly compromise.
4. **Terracotta (#B65C33) is reserved** for AI-suggestion UI only. It must always mean "Gaspard is speaking."
5. **Gaspard guardrails are non-negotiable:** allergies first, no invented menu facts, no discount/urgency language, alcohol posture per prompt pack.
6. **Images are not in git** (see `.gitignore`). They live on this machine. Production images need WebP/AVIF renditions + lazy loading (Phase 5).
7. **Analytics:** every AI-suggestion acceptance (strip tap, pairing add, chat-card add, bundle add) must fire an event tagged `source=gaspard`.

## Design tokens
```
--gaspard-green:#172417  --deep-moss:#24402E  --cream-paper:#F7F2E8
--paper-light:#FBF7EF    --brass:#B08D57      --gold:#C9A96A
--terracotta:#B65C33     --golden-amber:#D9A05B  --golden-bg:#141F17
```
Fonts: Fraunces (display/stories, real italics) + Inter (UI). Self-host.
Day-parts: morning 06:30–11:30 · midday 11:30–15:00 · golden 15:00–19:00 (config-driven; public holidays close 15:00; timezone SAST).

## Open questions (blocked on client — don't guess)
- Dietary/allergen tags in the JSON are provisional until the kitchen confirms.
- Missing wine glass prices; "Decaf R6" intent; qaLog fixes need sign-off.
