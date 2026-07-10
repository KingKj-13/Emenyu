# Carmella by Sir Gaspard — Build Brief for Claude Code
**From:** Design (Cowork session) → **To:** Engineering (Claude Code, eMenyu repo)
**Goal:** Ship Carmella as a new restaurant tenant on the existing eMenyu architecture — same skeleton as the Trumps Prime Grillhouse tenant (`emenyu.com/Trump/Table1/menu`), completely new skin and persona.

---

## 0 · Files in this handoff (put in repo, e.g. `/design/carmella/`)

| File | Role | Rule |
|---|---|---|
| `carmella-menu-data.json` | **Source of truth** for all menu content: 190 items, prices (ZAR), variants, chapters, images, story lines, tags, availability, pairings, day-parts, bundles, qaLog | Import from this. Never hand-type menu content. |
| `carmella-prototype.html` (+ `carmella-menu-data.js`) | **Visual + behavioral reference.** Open in a browser next to the build; match look, spacing, tone and flows | Reference only — do not copy code into production. |
| `carmella-design-direction.html` | Design rationale: palette, type, principles, voice | Consult when a decision isn't covered by the prototype. |
| `gaspard-prompt-pack.md` | Production AI spec: system prompt, guardrails, day-part briefs, pairing logic, waiter prompts, eval checklist | Implement §1–§4 verbatim; run §5 before launch. |
| `001_…jpg` → `201_…jpg` | Dish photography (AI-generated, client-supplied) | Optimize before serving (see Phase 5). |

---

## Phase 0 — Discovery (no code yet)
Explore the codebase and report back before building:
1. How is a tenant/restaurant defined (Trump as the example)? Config file, DB rows, theme system?
2. How does theming work today — CSS variables, Tailwind config, styled components? Can a tenant have **two theme modes** (light + golden hour)?
3. Menu data model: does the schema support variants, add-ons, item-level availability toggles, dietary tags, a `story` text field, and item↔item pairing links? List gaps.
4. How is the AI assistant wired for Trump (prompt source, template variables, how items are rendered in chat replies)?
5. Table routing (`/Carmella/Table{n}/menu`) — what's needed for a new tenant?

**Deliverable: a gap list + migration plan. Wait for approval before Phase 1.**

## Phase 1 — Data
- Write an idempotent import script: `carmella-menu-data.json` → DB. Preserve `id` slugs as stable keys.
- Schema additions likely needed: `story` (string), `subtitle` (string), `availability` enum, `pairings` relation, `isAddon` on variants, `serves-4` tag support.
- Import `qaLog` items as admin-visible content flags, not silent fixes.
- Images: map by filename; do not rename source files.

## Phase 2 — Theme skin
Design tokens (from the direction board — exact values):

```
--gaspard-green: #172417   /* identity, headers, CTAs */
--deep-moss:     #24402E   /* prices, secondary */
--cream-paper:   #F7F2E8   /* midday surface */
--paper-light:   #FBF7EF   /* morning surface */
--brass:         #B08D57   /* rules, seals, icons */
--gold:          #C9A96A   /* accents on green */
--terracotta:    #B65C33   /* "Gaspard suggests" ONLY */
--golden-amber:  #D9A05B   /* after-15:00 accent */
--golden-bg:     #141F17   /* after-15:00 surface */
```
- Fonts: **Fraunces** (display, dish names, stories — real italics) + **Inter** (UI, labels, prices). Google Fonts, self-host for performance.
- Motion: soft fades/page-turn feel, 200–300 ms ease; nothing bouncy.
- Terracotta is reserved exclusively for AI-suggestion UI — it must mean "Gaspard is speaking."

## Phase 3 — Experience features (parity with prototype)
1. **Chapters** replace categories, using the exact names in the JSON (The Morning Pages, The Global Table, The Companions, The Interludes, The Memory Course, The Family's Toast, The Gaspard Cellar, Slow Drinks). Each renders its `intro` line as an italic opener.
2. **Story lines** on cards and item sheets (serif italic, above description).
3. **Day-part engine** per `dayparts` in JSON: reorders chapters, switches greeting, swaps suggestion strip + chat chips, and flips theme to golden mode at 15:00. Config-driven times (public-holiday close = 15:00). Server or client clock — decide in Phase 0, must respect restaurant timezone (SAST).
4. **Gaspard suggests strip** (one per screen max) and **pairing box** on item sheets driven by the `pairings` map; one-tap add with price.
5. **Bundles** ("Gaspard's Tables") — carousel, one-tap add-all, day-part filtered.
6. **Order flow:** identical to Trump (cart → send → waiter confirms at table). Copy tone per prototype: "Gaspard has your order — a member of the team is on their way."
7. Keep from Trump: table badge, call-waiter bell, cart bar, sub-category chips, favourites if present.

## Phase 4 — Ask Gaspard
- Implement the system prompt + day-part briefs from `gaspard-prompt-pack.md` exactly. Inject `{{MENU_DATA}}` from DB (strip image fields).
- Implement the `{item:ITEM_ID}` → tappable dish card protocol and `{action:call_waiter}` / `{action:catering_enquiry}` actions (catering → WhatsApp handoff to +27 78 195 1259).
- Hard guardrails are non-negotiable: allergy handling, no invented items, no discount/urgency language, alcohol posture, availability caveats.

## Phase 5 — Performance, QA, launch
- **Images:** 201 JPGs → generate WebP/AVIF renditions (card ~400w, sheet ~800w), lazy-load, CDN. Target < 2s first load on 3G-ish mobile data (South African context).
- **AI eval:** run the 10-case checklist in `gaspard-prompt-pack.md` §5; all must pass.
- **Visual QA:** side-by-side with `carmella-prototype.html` in all three day-parts, 360px–430px widths.
- **Regression:** Trump tenant must be pixel-identical to before — no shared-theme leakage.
- **Analytics:** ensure suggestion-acceptance events fire (strip taps, pairing adds, chat-card adds, bundle adds) tagged `source=gaspard` — this feeds the dashboard's "revenue from AI recommendations" and the client's ROI story.
- **Client-blocking items before launch:** kitchen confirms dietary/allergen tags; wine glass prices missing in PDF; "Decaf R6" intent; qaLog menu fixes sign-off.

---

## Acceptance criteria (definition of done)
- [ ] `emenyu.com/Carmella/Table1/menu` renders the full menu from DB, matching the prototype in all three day-parts.
- [ ] No hard-coded menu content in code; JSON→DB import is repeatable.
- [ ] Ask Gaspard passes all 10 eval cases; item chips are tappable; actions fire.
- [ ] Suggestion-acceptance analytics visible in the restaurant dashboard.
- [ ] Lighthouse mobile perf ≥ 85 on the menu route; images served as WebP/AVIF.
- [ ] Trump tenant unchanged (visual regression check).
- [ ] Allergy disclaimer shown at entry (text in JSON `restaurant.allergyNotice`).

## Working agreement
Work **one phase per session/PR**. End each phase with: what changed, what's blocked, screenshots. Do not start the next phase without approval. If the codebase fights the design (e.g., theming can't do two modes), stop and propose options rather than silently compromising the design.
