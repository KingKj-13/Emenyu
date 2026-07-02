# RC1-COMPLETION-REPORT.md — Trump v1.0 Release Candidate 1

**Date:** 2026-06-25. **Tag:** `trump-v1.0-rc1`.
**Status: ✅ RC1 assembled, hardened, validated locally, and FROZEN. Production deploy, APK build, physical-device testing, and the off-hours prod load test are operator-run gates (hardware/window/authorization outside this build) — documented exactly, never fabricated.**

---

## Success criteria
| Criterion | Status | Evidence |
|---|---|---|
| Branch cleaned | ✅ | no debug/console/secrets; bypass default-OFF (Step 1 scan) |
| Production updated | ⬜ operator-run | DEPLOYMENT-CHECKLIST (prep-only per your choice; zero prod changes by build) |
| APK built | ⬜ build-env required | KNOWN-ISSUES #1; APK-BUILD (04B) |
| Physical devices tested | ⬜ devices required | KNOWN-ISSUES #2; PILOT-TEST-PLAN matrix |
| Production load test passed | ⬜ operator-run window | PRODUCTION-VALIDATION §C; Phase 05 baseline |
| Remaining measured improvements implemented | ✅ | idempotency 5/5, retry 33→1, post-save best-effort, limits raised |
| Restaurant pilot completed | ⬜ real staff/service | PILOT-TEST-PLAN (API scenario proven 11/11) |
| RC1 frozen | ✅ | tag + freeze policy below |

**Honest split:** everything achievable in software is **done and validated**; the ⬜ items are gated purely by hardware (APK/phones), a maintenance window on a shared box (load test), real staff (pilot), or your deploy decision (you chose prep-only). All are specified to run, none are faked.

## What RC1 contains
- **Web platform** (01–03, deployed in 03C) + **token auth** (04) + **Android waiter app & backend additions** (04B) + **performance** (05) + **RC hardening** (05A).

## 05A hardening — implemented + measured
| Improvement | Result |
|---|---|
| Order **idempotency** (`clientOrderId` + partial unique index + dedup/P2002 race handling) | **5/5** — 10 concurrent identical submits → **1 order** |
| Order **retry/backoff** on transient pool error | burst 5xx **33 → 1** (70 concurrent) |
| **Post-save side-effects best-effort** | a persisted order never returns 500 |
| **Validated production rate limits** (general 600→3000, public-write 60→300) | fits a per-restaurant shared IP |

## Validation done this phase (local, production-mode)
- **Full service scenario: 11/11** (open→login→browse→order→notify→shift→bill→close→reports).
- **Order idempotency: 5/5.** **Burst robustness: 5xx 33→1.**
- Carried green: 04B integration **27/27**, Phase 05 menu cache (12→500 req/s @10c), restart durability, socket reconnect.

## Migrations in RC1 (additive, reversible)
`20260625070500` Device · `20260625120000` Device.pushToken/pushProvider · `20260625160000` Order.clientOrderId + partial unique index. All `ADD COLUMN…DEFAULT` / new table / index — no rewrites, no data loss.

## Freeze policy (Step 9) — IN EFFECT
On `trump-v1.0-rc1`, **only critical bug fixes** are allowed:
- ❌ No new features. ❌ No schema redesign. ❌ No API redesign. ❌ No UI redesign.
- ✅ Critical bug fixes only, each as a small commit referencing the issue.
- The deferred items (per-table rate-limit keying, media→CDN, single-transaction order) are **Phase 06+**, not RC1.

## Remaining gates to declare v1.0 (operator)
1. Deploy RC1 (DEPLOYMENT-CHECKLIST) + run live validation (PRODUCTION-VALIDATION §B).
2. Build the APK (toolchain/EAS) + run the 3-device matrix.
3. Run the off-hours prod load test (PRODUCTION-VALIDATION §C).
4. Run the restaurant pilot (PILOT-TEST-PLAN) — 9-step scenario on real devices, no critical issue.

## Declaration
**Trump v1.0 RC1 is assembled, hardened, locally validated, and frozen.** The application is ready for the operator-run deployment + pilot gates above; once those pass on real hardware/prod, RC1 becomes **v1.0 for real restaurant deployment.** Phase 06 (multi-restaurant, customer app, kitchen display, advanced AI, more native clients) begins only after RC1 is stable.
