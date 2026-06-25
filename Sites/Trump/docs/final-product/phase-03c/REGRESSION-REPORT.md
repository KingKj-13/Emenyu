# REGRESSION-REPORT.md — Phase 03C Steps 6–7

**Date:** 2026-06-25. **Stabilization window:** regression/deploy/bug/perf fixes only (no features). **Result: 1 deployment regression found + fixed-forward; 0 functional regressions.**

---

## R1 — Prisma client generated to the wrong location (deployment regression) — FIXED

**Symptom:** after `prisma generate --schema ../prisma/schema.prisma`, the app's runtime client (`prismaClient.js` → `Trump/node_modules/@prisma/client`) reported `shift=undefined auditLog=undefined notification=undefined`. The new operations endpoints would have 500'd on the first DB call, while existing features stayed healthy (old client still had their models).

**Root cause:** the box layout (`Emenyu/Trump`) differs from the repo (`Emenyu/Sites/Trump`). Prisma emits the client next to the **schema** (`Emenyu/node_modules`), but the app resolves `@prisma/client` **up from the Trump dir** (`Trump/node_modules`). The two diverged — the "local-stub" gotcha.

**Fix (fix-forward, before sign-off):** synced the new schema to `Trump/prisma/schema.prisma` and ran `prisma generate --schema prisma/schema.prisma` from the Trump dir → client emitted into `Trump/node_modules`. Verified `shift=object auditLog=object notification=object`, reloaded, re-validated **15/15**.

**Permanent remedy (follow-up):** encode this in `deploy-trump.sh` for the box — generate from the **Trump-local** schema (or set the generator `output`), so a future deploy can't reproduce it. Tracked for the next ops-script update (not a code/schema change).

## R2 — Load test "errors" were rate-limit 429s (NOT a regression)

The local 50-concurrent **single-IP** burst returned 25% `429`. Investigated: status codes were exactly `{200:598, 429:202}` — the app's per-IP rate limiter shedding excess load **by design**. **Zero 5xx, zero timeouts, zero crashes.** Not a defect; real multi-IP traffic does not hit per-IP limits the same way. See PERFORMANCE-REPORT.

## Regression sweep — existing functionality intact

| Area | Result |
|---|---|
| Auth (4 roles login) | ✅ 200 (no change) |
| Menu browsing | ✅ 200, 71 ms avg on prod |
| `/healthz` `/readyz` | ✅ 200 |
| Role enforcement (admin 403 for waiter/kitchen) | ✅ unchanged |
| 02B.1 lockdown (`:3012`/`:5432` loopback) | ✅ intact post-deploy |
| Migration history integrity | ✅ 16 applied, "up to date" |
| Co-tenant restaurants | ✅ unaffected (`emenyu.com/` 200) |

## Outstanding (non-blocking, for stabilization/Phase 04)
- Bake the R1 prisma-generate location fix into `deploy-trump.sh`.
- Notification socket push (currently 20 s poll) — small backend follow-up.
- Manual cross-browser/visual QA (PRODUCTION-VALIDATION §Step 5).
- Disk at 86% — monitor (`monitor-trump.sh` alerts at 90%).

**No functional regressions. The one deployment regression (R1) is resolved and re-verified.**
