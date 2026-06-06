# Phase 5 — Production Readiness & Data-Driven Recommendations

Moves recommendations from configuration-driven to **production-operational** on real
restaurant data, while preserving all existing behaviour and guarantees. Builds on
Phases 3–4. Scope: `Sites/Trump`. Local & deterministic — no paid APIs, no third-party
LLMs. **Chef-first priority and all safety guarantees are unchanged.** Branch
`feat/phase3-reco-implementation`; **not merged, not deployed.**

## What shipped

| Task | Deliverable | Where |
|---|---|---|
| 1 | Database-backed recommendation bundles (models, API, admin, seed) | [bundles.md](bundles.md) |
| 2 | Item- & bundle-level analytics attribution (CTR, acceptance, revenue, revenue/impression, per-source/bundle) | [attribution-and-optimization.md](attribution-and-optimization.md) |
| 3 | Optimization dashboard — actionable insights (dead recs, missing pairings, disabled targets, poor rotation groups) | [attribution-and-optimization.md](attribution-and-optimization.md) |
| 4 | Live Postgres verification suite (dev-only, isolated, prod-safe) | [live-verification.md](live-verification.md) |
| 5 | Deployment readiness audit (migration/seed/health/rollback/verify + env vars) | [deployment-checklist.md](deployment-checklist.md) |
| 6 | Performance review (pure-path bench + DB-query analysis; safe opts only) | [performance.md](performance.md) |

## Constraints honoured

- No recommendation logic rewrites; no AI-generated ranking; chef-curated recs remain primary.
- Phase 3 suite **41/41** and Phase 4 suite **17/17** remain green (verified).
- All new validation is **additive** (separate `reco:validate:phase5`, 17/17).

## Commands

```bash
cd Sites/Trump
# offline validation (no DB)
npm run reco:validate          # Phase 3 — 41/41
npm run reco:health:test       # Phase 4 — 17/17
npm run reco:validate:phase5   # Phase 5 — 17/17
npm run reco:bench             # pure-path performance micro-benchmark
# DB-backed (dev database)
npm run reco:seed -- --apply       # chef recommendations
npm run bundles:seed -- --apply    # recommended-order bundles
npm run reco:health                # chef-rec integrity vs live menu
npm run reco:verify:live -- --confirm   # end-to-end live verification (isolated test data)
# client
cd client && npm run typecheck && npm run build
```

## Schema changes

`RecommendationBundle` + `RecommendationBundleItem` (Phase 5). Pre-existing:
`MenuItemRecommendation` (Phase 3), `RecommendationEvent` (Phase 4). All additive,
idempotent migrations.

## Remaining production risks

- **DB-backed features need the migration + `prisma generate` + seeds on deploy.** Until
  then, chef recs/bundles/analytics use their fallbacks (engine→algorithmic, bundles→JSON
  then built-in constant, analytics→JSON ring buffer).
- **Analytics ingest is unauthenticated** (guests have no session) — bounded by hard
  sanitisation, a 100-event cap and the shared chat rate-limiter, not by auth.
- **In-memory analytics aggregation** (20 000-row window) suits a single venue; very high
  volume would warrant SQL `GROUP BY` (bench shows 50 000 events ≈ 14 ms today).
- **Bundle admin writes require Postgres** (reads fall back to JSON/constant).
- Carried from earlier phases: the prod host still needs `auth:rotate`; the branch is
  unmerged/undeployed.

## Merge readiness

Code-ready for merge to `master`; deploy-gated on the migration + seeds. All static gates
green (tsc, vite, `node --check`, 41/41 + 17/17 + 17/17). The only path not exercisable
offline is live Postgres I/O, isolated behind the hybrid services and covered by
`reco:verify:live` on a dev database.
