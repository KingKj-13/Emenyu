# Performance — Carmella by Sir Gaspard

## Image optimization

Reused Trump's existing `media-optimize.js` (ffmpeg-based, no new dependency), generalized to accept `--dir`/`--restaurant-id` instead of being hardcoded to Trump's own path — one tool for every tenant, not a duplicated script.

| | Raw | Optimized | Reduction |
|---|---|---|---|
| 201 dish photos | 1,388 MB (avg 6.9MB/file) | 13 MB (WebP, max 1200px wide) | 99% |
| Thumbnails (300px) | — | 2 MB | — |

Matches the outcome of Trump's own prior media-optimization phase (439 images, 3.0GB → 62MB). Raw JPGs stay local-only (gitignored); only the optimized WebP renditions are committed to git.

## What was NOT changed

- No new client-side dependencies added for theming (pure CSS custom properties) or the variant selector (native React state, no form library).
- No additional database round-trips added to the hot chat/recommend path beyond one `loadDayParts()` call per chat turn when a persona is day-part-aware (Carmella only; a no-op empty-array return for tenants without `DayPart` rows).
- The recommendation-scoring engine itself is untouched — no new computational cost per candidate.

## Not measured in this session

- **No Lighthouse run.** No browser automation tooling was available in this environment (see `TESTING.md`) — the design brief's "Lighthouse mobile perf ≥ 85" acceptance criterion is unverified. The image-size reduction above strongly suggests it's achievable (Trump's own comparable optimization was validated in its own phase), but this should be run for real before the demo, ideally via the browser directly rather than assumed.
- **No load test.** Trump's Phase 05/05A load-testing work (rate limiting, idempotency) applies to Carmella unchanged (shared middleware, shared config shape) but was not re-run against Carmella specifically.

## Caching

Unchanged shared behavior: `FileService.loadMenu()`'s 30-second single-flight TTL cache applies per-process, so Carmella's menu cache is independent of Trump's/Demo's (separate processes, separate cache instances) — no cross-tenant cache pollution risk.
