# emenyu-carmella — Design Handoff

Complete design-to-build handoff for the **Carmella by Sir Gaspard** tenant (Cedar Square, Fourways, JHB). Produced in the eMenyu design session, July 2026.

## Folder map
```
CLAUDE.md                          ← working rules (Claude Code reads this automatically)
data/carmella-menu-data.json       ← SOURCE OF TRUTH: 190 items, prices, variants,
                                      stories, tags, pairings, day-parts, bundles, qaLog
design/carmella-build-brief.md     ← phased build plan + acceptance criteria
design/carmella-prototype.html     ← interactive reference (needs ../images/ locally)
design/carmella-menu-data.js       ← data wrapper the prototype loads
design/carmella-design-direction.html ← concept board (palette, type, screens, voice)
design/gaspard-prompt-pack.md      ← production AI spec + eval checklist
skill/carmella-build/SKILL.md      ← Claude Code skill (move to .claude/skills/ to enable)
images/                            ← NOT in git — place the 201 dish JPGs here locally
```

## How to start the build
1. Place the 201 dish images in `images/` on the build machine (never commit them).
2. Open `design/carmella-prototype.html` in a browser — this is the target.
3. In Claude Code, from the repo root:

> Read emenyu-carmella/CLAUDE.md and emenyu-carmella/design/carmella-build-brief.md.
> Start with Phase 0 only: explore the codebase, answer the 5 discovery questions,
> and give me the gap list and migration plan. Do not write any code yet.

4. Approve the Phase 0 plan, then proceed phase by phase (one PR each).

## Quick facts
- Architecture: identical to the Trumps Prime Grillhouse tenant (order-to-table, waiter fulfils) — new skin, new persona.
- Route target: `emenyu.com/Carmella/Table{n}/menu`
- Currency ZAR · Hours 06:30–19:00 (15:00 public holidays) · WhatsApp +27 78 195 1259
- The AI persona is "Gaspard" — see the prompt pack. Guardrails are non-negotiable.
