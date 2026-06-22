# Recommendation Health Checks (Phase 4, Task 4)

Automated data-integrity validation for chef recommendations. Pure analyzer
([`recommendationHealth.js`](../../server/services/recommendationHealth.js)) + a CLI
([`scripts/reco-health.js`](../../scripts/reco-health.js)).

## Commands

```bash
cd Sites/Trump
npm run reco:health            # check live chef recs against the menu (needs Postgres)
npm run reco:health -- --json  # machine-readable report (CI / dashboards)
npm run reco:health:test       # offline fixture self-test of the analyzer + aggregator (no DB)
```

Exit codes: **0** healthy / all self-tests pass · **1** fail-level issues or a failing
self-test · **2** could not run the live check (database unreachable).

## What it checks

| Code | Level | Meaning |
|---|---|---|
| `orphaned_source` | fail | the rec's source item no longer exists in the menu |
| `missing_target` | fail | the recommended (target) item no longer exists |
| `disabled_target` | warn | the recommended item is hidden / unavailable |
| `circular_chain` | warn | A → B and B → A (or a longer cycle) among active recs |
| `invalid_rotation_group` | warn | a rotation group with a single member (nothing to rotate) or spanning multiple source items (ambiguous) |
| `duplicate_priority` | warn | same source + recType + priority on different targets with no shared rotation group (ambiguous ordering) |

`fail` means the recommendation cannot work and is the only level that flips the exit
code / `ok: false`. `warn` means it works but is degraded or ambiguous. Only **active**
recommendations are evaluated (a disabled row pointing nowhere is harmless).

## Architecture

```
 npm run reco:health
        │
        ▼
 scripts/reco-health.js ──▶ Prisma: menuItemRecommendation.findMany + menuItem.findMany
        │                    (enriches recs with source/target names)
        ▼
 recommendationHealth.analyze({ recommendations, items })   ◀── pure, no I/O
        │   • orphaned/missing (membership checks)
        │   • disabled target (available/visible flags)
        │   • circular chains (DFS cycle detection over source→target edges)
        │   • rotation-group validity (member count / source spread)
        │   • duplicate priority (group by source|recType|priority)
        ▼
 { ok, summary: { fail, warn, byCode, … }, issues: [ { level, code, message, … } ] }
```

The same `analyze()` is exercised offline with one focused fixture per rule in
`--selftest` (see below), so the logic is validated without a database.

## JSON report shape

```jsonc
{
  "ok": false,
  "summary": { "recommendations": 42, "active": 40, "items": 180,
               "fail": 1, "warn": 3, "byCode": { "missing_target": 1, "disabled_target": 2, "invalid_rotation_group": 1 } },
  "issues": [
    { "level": "fail", "code": "missing_target", "message": "Chef rec #17: recommended item 98 (…) no longer exists.", "recId": 17 },
    { "level": "warn", "code": "disabled_target", "message": "Chef rec #5: recommends \"Malva Pudding\" which is hidden or unavailable.", "recId": 5 }
  ]
}
```

## Self-test (offline) — sample output

```
$ npm run reco:health:test
  PASS  orphaned source detected
  PASS  missing target detected
  PASS  disabled target detected (warn, not fail)
  PASS  circular chain detected
  PASS  single-member rotation group flagged
  PASS  rotation group spanning sources flagged
  PASS  duplicate priority conflict detected
  PASS  shared rotation group is NOT a duplicate-priority conflict
  PASS  clean data set → ok with no issues
  PASS  aggregate totals.impressions = 5
  …
  17/17 self-tests passed.  ALL PASSED.
```

## Recommended usage

- Run `npm run reco:health` after editing chef recommendations or deleting/hiding menu
  items, and as a pre-deploy gate (non-zero exit on `fail`).
- `--json` output can be wired into a monitoring check or a future Admin "health" panel.

## Troubleshooting

- **Exit 2 / "database unreachable"** — the live check needs `DATABASE_URL`. Validate the
  analyzer offline with `npm run reco:health:test`.
- **`invalid_rotation_group` for an intentional single pour** — give the group ≥ 2 members
  or clear the `rotationGroup` (a single fixed pairing doesn't need a rotation group).
- **`duplicate_priority` warnings** — either give the tied targets distinct priorities or
  put them in a shared rotation group (the rotation engine then breaks the tie fairly).
