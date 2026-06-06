# Live Postgres Verification Suite (Phase 5, Task 4)

An automated, DB-backed end-to-end check of the recommendation/analytics stack —
the live counterpart to the offline self-tests (`reco:validate`, `reco:health:test`,
`reco:validate:phase5`).

```bash
npm run reco:verify:live -- --confirm          # run against the dev DB in DATABASE_URL
npm run reco:verify:live -- --confirm --json    # machine-readable summary
```

## Safety — never touches production data

- **Refuses to run without `--confirm`** (exit 2) and prints the (masked) target DB.
- **All writes use an isolated `restaurantId` (`verify-suite`)**, never the real `trump`
  rows, and are **deleted in a `finally` block** at the end of the run.
- **Chef-rec and bundle retrieval are read-only**; rotation is pure (no DB).
- Override the isolation id with `RECO_VERIFY_RESTAURANT_ID` if desired.

Even though writes are isolated and cleaned up, point `DATABASE_URL` at a **development**
database.

## What it verifies

| # | Check | How |
|--:|---|---|
| 0 | Connectivity | `SELECT 1` |
| 1 | **Analytics ingest** | `recordBatch` of 4 isolated events → `stored === 4`, `sink === "postgres"` |
| 2 | **Analytics aggregation** | `getAnalytics()` → impressions counted, revenue attributed, `byBundle` present |
| 3 | **Dashboard query** | the same `getAnalytics` path the dashboard calls → top boards present |
| 4 | **Chef recommendation retrieval** | `PrismaMenuService.loadChefRecommendations()` returns an array |
| 5 | **Bundle retrieval** | `RecommendationBundleService.listActive()` returns `PersonaOrder[]` |
| 6 | **Rotation behaviour** | deterministic per device + varied across devices |
| 7 | **Cleanup** | deletes all `restaurantId="verify-suite"` events |

Exit: `0` all pass · `1` a check failed · `2` not confirmed / cannot connect.

## When to run

- After applying migrations + seeds to a dev/staging database (step 4 of the
  [deployment checklist](deployment-checklist.md)).
- In CI against an ephemeral Postgres, as a smoke test of the DB-backed paths that the
  pure self-tests can't cover.

## Relationship to the offline suites

| Suite | Needs DB | Covers |
|---|:--:|---|
| `reco:validate` (Phase 3) | no | classifier, safety R1–R7, rotation, chatbot NLU (41/41) |
| `reco:health:test` (Phase 4) | no | health analyzer + analytics aggregator (17/17) |
| `reco:validate:phase5` | no | bundle mapping/validation, attribution extensions, insights (17/17) |
| **`reco:verify:live`** | **yes (dev)** | the real Postgres ingest/aggregate/retrieve/rotate paths |
