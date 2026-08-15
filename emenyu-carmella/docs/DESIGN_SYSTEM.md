# Design System — Carmella by Sir Gaspard

## Token architecture

Trump's client has no theming framework (no Tailwind, no CSS-in-JS) — just CSS custom properties defined once in `client/src/index.css`'s `:root` block, consumed everywhere via `var(--color-x)`. Carmella's theme reuses this exact pattern rather than introducing new tooling: `client/src/styles/carmella-theme.css` redefines the same semantic token *names* to different values, scoped entirely under `[data-tenant="carmella"]` so it has zero effect on any other tenant's build.

```css
[data-tenant='carmella'] { --color-ink: #F7F2E8; --color-cream: #172417; /* ... */ }
[data-tenant='carmella'][data-theme='golden'] { --color-ink: #141F17; /* dark override */ }
```

`document.documentElement.dataset.tenant` is set once at boot (`main.tsx`) from the build-time `VITE_RESTAURANT_ID` constant. `data-theme` is set once `AppContext` resolves `GET /api/config`'s `currentDayPart`.

### Why token *meanings* get re-purposed, not renamed

Every component's CSS was written assuming Trump's single dark theme (`--color-ink`/`--color-coal`/`--color-panel` = dark backgrounds, `--color-cream` = light text). Carmella's morning/midday modes are a **light** theme. Rather than touch every component to read a differently-named variable, the existing token names are re-pointed: for Carmella's light modes, `--color-ink` becomes the light background and `--color-cream` becomes the dark text — components that generically consume "the base surface token" / "the primary text token" get correct contrast either way, with zero component-level changes. Golden hour (15:00–19:00) is Carmella's one dark mode and needed the least re-purposing, since it's structurally closest to Trump's original assumption.

## Palette

| Token | Midday/default | Morning | Golden hour |
|---|---|---|---|
| `--color-ink` (base surface) | `#F7F2E8` cream-paper | `#FBF7EF` paper-light | `#141F17` golden-bg |
| `--color-cream` (primary text) | `#172417` gaspard-green | same | `#F7F2E8` |
| `--color-gold` | `#C9A96A` | same | `#D9A05B` golden-amber |
| `--color-gold-soft` | `#B08D57` brass | same | `#E4B67C` |
| `--color-gaspard-accent` | `#B65C33` terracotta (reserved) | same | same |

**Terracotta (`--color-gaspard-accent`) is reserved exclusively for "Gaspard is speaking" AI-suggestion UI** — never a generic accent. Defined and ready; **not yet wired into the specific AI-surface components** (`RecommendationJourney`, chat bubbles still render in gold) — see `FUTURE_ROADMAP.md`.

## Typography

`--font-heading: 'Fraunces', ...serif` (display, dish names, story lines — italic used for stories/intros), `--font-body: 'Inter', ...sans-serif` (UI, labels, prices). Both loaded via the same shared Google Fonts `<link>` in `client/index.html` alongside Trump's Cormorant Garamond/Manrope — every tenant's build pays the same font-loading cost rather than maintaining a per-tenant HTML template.

## Day-part engine

Three modes, each with its own token set and (via the `DayPart` DB rows) its own greeting, lead chapters, and chat-chip suggestions:
- **Morning** 06:30–11:30 — light, paper-light surface.
- **Midday** 11:30–15:00 — light, cream-paper surface (also the default before the config fetch resolves).
- **Golden hour** 15:00–19:00 — dark, amber accent.

Resolution is server-side (`server/utils/dayPartResolver.js`, a pure function over real DB-configured HH:MM windows and the current SAST time), read once by the client via `GET /api/config`. **Not live-ticking** — a guest seated through a boundary won't see the flip without a refresh (see `FUTURE_ROADMAP.md`).

## Motion

No new motion system — Carmella reuses whatever transition/easing conventions the shared components already have (`--ease-premium` etc. from `index.css`). The design brief's "soft fades, 200–300ms" guidance is already broadly consistent with Trump's existing component transitions.

## What's explicitly NOT themed differently

Spacing, radius, shadow, and z-index tokens are shared/brand-agnostic across every tenant — only color and font tokens are tenant-specific.
