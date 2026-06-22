# Task 4 — Recommendation Rotation (Design)

**Design only.** Goal: different guests shouldn't always see identical recommendations,
while respecting priority, preserving quality, and staying **deterministic enough to
report** (no `Math.random`). Addresses audit finding F5 (repetitive output).

## 1. What exists today

A partial, cart-keyed rotation already exists:
- `pickVariedMenuItem()` ([aiService.js:646](Sites/Trump/server/services/aiService.js#L646))
  picks `pool[hashString(seed) % pool.length]` over the top-5 matches.
- `addCourseCompletions()` rotates wine/drink by `hashString(cartNames.join('|'))`
  ([aiService.js:1064](Sites/Trump/server/services/aiService.js#L1064)).

**Limitations:** the seed is the *cart text only*, so every guest with the same cart sees
the identical pick (no cross-guest variety), and popularity-sorted lists
(`addPopularCandidates`) are fully static — hence "im hungry" and "stake" returned the
identical Tomahawk/Wagyu/Fillet trio.

## 2. Principles

1. **Rotate only among equally-valid options.** Candidates are bucketed into *priority
   bands*; rotation happens **within** a band (and within a `rotationGroup` from Task 2),
   never across bands. A higher-priority chef rec is never demoted for variety.
2. **Weighted, not uniform.** Within a band, selection probability is proportional to
   `priority` (and recency/quality), so stronger recs still appear more often.
3. **Deterministic + reproducible.** A seeded PRNG keyed on stable inputs; the seed is
   logged so any shown set can be reconstructed for reporting/AB analysis.
4. **Quality floor preserved.** Only candidates at/above the band's score threshold are
   eligible; rotation never injects a weak item purely for novelty.

## 3. Seed composition

```
rotationSeed = hash( rotationKey )
rotationKey  = `${restaurantId}|${bucket}|${scopeId}|${rotationGroup}`
```

- `bucket` — a time bucket controlling cadence (default `YYYY-MM-DD` = rotates daily;
  `TRUMP_RECO_ROTATION_BUCKET=hour|day|week`).
- `scopeId` — controls *who* varies:
  - **per-day mode** (`scope=day`): `scopeId = ""` → every guest sees the same set that
    day, set changes daily. Simplest to reason about and report.
  - **per-session mode** (`scope=session`): `scopeId = deviceId|tableId` → different
    guests/tables see different sets, stable within a guest's session.
  - Configurable via `TRUMP_RECO_ROTATION_SCOPE` (default `session`).
- Reuse the existing `hashString()` for the hash, feeding a small seeded PRNG
  (e.g. mulberry32) for weighted draws — both pure and dependency-free.

## 4. Algorithm (pseudocode — not implemented)

```
function rotate(candidates, ctx):
    seed = hash(`${rid}|${bucket(ctx)}|${scopeId(ctx)}`)
    rng  = mulberry32(seed)
    out = []
    for band in descendingPriorityBands(candidates):      // chef band first, then algo bands
        groups = groupBy(band, c => c.rotationGroup || c.id)
        for g in stableOrder(groups):                     // stable group order = reportable
            pick = weightedDraw(g.items, w => w.priority, rng)   // higher priority → more likely
            out.push(pick)
    return applyCategorySafety(out, ctx.cart)             // Task 3 runs AFTER rotation
                .slice(limit)
```

- `weightedDraw` uses `rng` (seeded), so identical seed ⇒ identical result.
- Category-safety (Task 3) is applied **after** rotation so variety can never reintroduce
  a banned combination (e.g. two beverages).

## 5. Determinism for reporting

- Persist `rotationSeed` (and the resolved scope/bucket) with each impression. The
  schema already has `UpsellEvent` ([prisma/schema.prisma](prisma/schema.prisma)) — add a
  `rotationSeed`/`variantKey` field there (Task 2-style additive change, later phase) so
  analytics can answer "which variant did table 12 see at 7pm?" and compute per-variant
  acceptance.
- Because the seed is a pure function of `(restaurant, bucket, scope, group)`, any report
  can **recompute** the exact set offline — no need to store the full list.

## 6. Cadence options (chef/owner choice)

| Mode | `scope` | `bucket` | Behaviour |
|---|---|---|---|
| Daily house rotation | day | day | everyone sees set A today, set B tomorrow |
| Per-guest variety (default) | session | day | guests differ; stable per guest that day |
| High-churn demo | session | hour | rotates hourly per guest |

## 7. Quality safeguards

- Rotation pool per group capped (default top 5, matching today's `pickVariedMenuItem`).
- Bands are never merged: chef band (priority ≥ 1000) always leads; algorithmic variety
  happens only to fill remaining slots.
- If a group has one strong outlier (priority gap > threshold), rotation is suppressed for
  that group (always show the outlier) to avoid degrading an obviously-best pick.

## 8. Config summary

| Env | Default | Meaning |
|---|---|---|
| `TRUMP_RECO_ROTATION_SCOPE` | `session` | `day` \| `session` |
| `TRUMP_RECO_ROTATION_BUCKET` | `day` | `hour` \| `day` \| `week` |
| `TRUMP_RECO_ROTATION_POOL` | `5` | max candidates per group considered for rotation |
