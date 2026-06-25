# PHASE-07-COMPLETION-REPORT.md — Customer Onboarding & First Deployment

**Date:** 2026-06-25.
**Status: ⚠️ ONBOARDING & DEPLOYMENT KIT DELIVERED + system-config procedures verified against the real code. The onboarding itself is NOT executed — it requires a real paying restaurant, real staff/customers, multiple live services, a week of real support, and a production deployment (operator-run; you chose prep-only). No restaurant, customer, service, support ticket, or production metric was fabricated.**

---

## Why this phase can't be "completed" from here — and what was done
Phase 07 onboards a **real paying restaurant** and runs **real production services**. Its evidence (a named restaurant + owner, trained staff, live services with real orders/customers, a week of support tickets, production metrics) can only come from doing it with a real business. Inventing any of it would be fabricating a customer. So this phase delivers the **execution kit** — playbooks, forms, and logs — with the **system-mechanics parts verified against the actual code**, and the real-restaurant data left as forms to fill.

## Success criteria — honest status
| Criterion | Status | Note |
|---|---|---|
| First restaurant deployed | ⬜ operator-run | runbook + R1 fix ready; not deployed by build (prep-only) |
| Staff trained | ⬜ real staff required | training guides + log template ready |
| Multiple live services completed | ⬜ real services required | GO-LIVE-LOG template; API dry-run proven 11/11 (Phase 05A) |
| No critical production failures | ⬜ pending real services | RC1 readiness + dry-run clean |
| Support process validated | ✅ process defined / ⬜ exercised | SUPPORT-LOG + INCIDENT-RESPONSE process ready |
| Operational documentation verified | ✅ (in build) / ⬜ in-practice | OR1 docs grounded in real artifacts; in-practice check is the deployment |
| Customer willing to continue | ⬜ real customer required | decision gate in POST-LAUNCH-REVIEW |

## What IS real in this phase (verified against code)
- **RESTAURANT-CONFIGURATION** — config map grounded in actual env (`TRUMP_VAT_RATE`=0.15, `TRUMP_SERVICE_RATE`=0.05, `TRUMP_RESTAURANT_ID`, `TRUMP_APP_NAME`, base path), with an **honest currency note** (UI is ZAR/"R", not env-configurable) and an **honest opening-hours note** (no system lock; operational only).
- **MENU-MIGRATION** — real import paths (owner console + `npm run menu:migrate`) + media handling + the VAT/service total-math verification.
- **QR-DEPLOYMENT** — URLs **verified against the client router** (`/Trump/<tableId>`, `/Trump/<tableId>/menu`; valid `table1…table30`; `/`→`table1`).
- These three are immediately usable, accurate procedures.

## Deliverables (docs/final-product/phase-07/)
CUSTOMER-ONBOARDING (playbook + intake form), RESTAURANT-CONFIGURATION, MENU-MIGRATION, QR-DEPLOYMENT (the three grounded procedures), STAFF-TRAINING-LOG, GO-LIVE-LOG, SUPPORT-LOG, ISSUE-TRACKER (categorized), POST-LAUNCH-REVIEW (synthesis + decision gate), and this report.

## No platform features added
Per the phase rule (no feature development), **no application code changed in Phase 07.** RC1 stays frozen at tag `trump-v1.0-rc1`.

## Declaration — pending the real deployment
I cannot honestly declare **"Trump v1.0 Successfully Deployed"** (no restaurant has been onboarded; no live service has run; "no critical failures" and "customer willing to continue" are unproven). Nor is **"Additional Stabilization Required"** a meaningful result without a first deployment to stabilize from.

**Honest declaration:** *Trump v1.0 RC1 is onboarding-ready and the first-deployment is fully instrumented; the deployment-mechanics procedures (config/menu/QR) are verified. Deployment and the "Successfully Deployed" decision await the operator-run onboarding.*

On completion of a real onboarding + multiple services + a week of hypercare, fill POST-LAUNCH-REVIEW and choose:
- **Trump v1.0 Successfully Deployed** — first restaurant live, staff trained, multiple services with 0 critical failures, support validated, customer wants to continue; **or**
- **Additional Stabilization Required** — otherwise, with exit criteria.

## Operator next steps
1. Intake the restaurant ([CUSTOMER-ONBOARDING.md](CUSTOMER-ONBOARDING.md) Step 1).
2. Configure + load menu + deploy QR ([RESTAURANT-CONFIGURATION](RESTAURANT-CONFIGURATION.md) / [MENU-MIGRATION](MENU-MIGRATION.md) / [QR-DEPLOYMENT](QR-DEPLOYMENT.md)).
3. Create accounts + train + sign off ([STAFF-TRAINING-LOG.md](STAFF-TRAINING-LOG.md)).
4. Deploy to prod ([../operations/DEPLOYMENT-RUNBOOK.md](../operations/DEPLOYMENT-RUNBOOK.md)) + go live ([GO-LIVE-LOG.md](GO-LIVE-LOG.md)).
5. Hypercare week ([SUPPORT-LOG.md](SUPPORT-LOG.md) / [ISSUE-TRACKER.md](ISSUE-TRACKER.md)).
6. Review + decide ([POST-LAUNCH-REVIEW.md](POST-LAUNCH-REVIEW.md)).
