# CUSTOMER-ONBOARDING.md — Onboarding the First Restaurant

> **STATUS: PLAYBOOK + INTAKE FORM — not yet executed.** Onboarding a real, paying restaurant requires a real restaurant, owner, staff, and a production deployment (which is operator-run; the build session made no prod changes). **No restaurant/owner/customer details are invented below** — fill the form with the real restaurant's data when onboarding.

This is the end-to-end playbook to take one restaurant from "interested" to "live on Trump."

---

## The onboarding sequence (each step links to its detailed doc)
1. **Select & intake** the restaurant (Step 1 form ↓).
2. **Configure** the restaurant → [RESTAURANT-CONFIGURATION.md](RESTAURANT-CONFIGURATION.md).
3. **Load the menu** → [MENU-MIGRATION.md](MENU-MIGRATION.md).
4. **Deploy QR codes** → [QR-DEPLOYMENT.md](QR-DEPLOYMENT.md).
5. **Create staff accounts** + **train** → [STAFF-TRAINING-LOG.md](STAFF-TRAINING-LOG.md) + [../operations/](../operations/) training docs.
6. **Deploy to production** → [../operations/DEPLOYMENT-RUNBOOK.md](../operations/DEPLOYMENT-RUNBOOK.md) + [../operations/GO-LIVE-CHECKLIST.md](../operations/GO-LIVE-CHECKLIST.md).
7. **Go live** → [GO-LIVE-LOG.md](GO-LIVE-LOG.md).
8. **Hypercare** (first week) → [SUPPORT-LOG.md](SUPPORT-LOG.md) + [ISSUE-TRACKER.md](ISSUE-TRACKER.md).
9. **Review** → [POST-LAUNCH-REVIEW.md](POST-LAUNCH-REVIEW.md).

---

## Step 1 — Restaurant intake form (fill from the real restaurant)
**Restaurant name:** ____
**Owner (name + contact):** ____
**Site / address:** ____
**Expected customer volume:** ____ /day (peak service: ____)
**Number of tables:** ____ (ids `table1…table_N`)
**Staff:** owners ____, managers ____, waiters ____, kitchen ____
**Operating hours:** ____ (operational only — no system lock; see RESTAURANT-CONFIGURATION §3)
**Current ordering workflow (what Trump replaces/augments):** ____
**Devices for waiters (model / Android version):** ____
**Restaurant Wi-Fi (SSID / reliability / backup uplink?):** ____
**Currency:** ____ (RC1 displays **ZAR/"R"**; confirm or schedule a change)
**VAT %:** ____  **Service charge %:** ____  (→ `TRUMP_VAT_RATE` / `TRUMP_SERVICE_RATE`)

## Recorded configuration (fill after Step 2–4)
| Item | Value | Verified by |
|---|---|---|
| `TRUMP_APP_NAME` (display) |  |  |
| VAT / service rates |  |  |
| Tables created (count) |  |  |
| QR codes printed + verified |  |  |
| Menu source (console / JSON) + item count |  |  |
| Staff accounts created (per person) |  |  |
| `auth:audit` = 0 weak |  |  |

## Commercial / expectations (record)
- [ ] Pricing/agreement with the restaurant confirmed (out of scope for this doc — just confirm it exists).
- [ ] Fallback workflow agreed (Rule 1: restaurant first).
- [ ] Support contact + hours agreed for the first week (hypercare).
- [ ] Owner understands: backups are automatic; data is theirs; Trump takes **no payments** (billing totals are informational).

## Onboarding completion gate
Onboarding is "done" (ready for go-live) when:
- [ ] Intake form complete; configuration recorded + **every item verified** ([RESTAURANT-CONFIGURATION.md](RESTAURANT-CONFIGURATION.md) checklist).
- [ ] Menu loaded + verified; QR codes placed + scan-tested on-site.
- [ ] Staff accounts created; **all roles trained** with sign-off ([STAFF-TRAINING-LOG.md](STAFF-TRAINING-LOG.md)).
- [ ] Production deployed + smoke-green; backups + monitoring confirmed ([../operations/LAUNCH-CHECKLIST.md](../operations/LAUNCH-CHECKLIST.md)).
- [ ] Fallback rehearsed; support channel open.

→ Proceed to [GO-LIVE-LOG.md](GO-LIVE-LOG.md).

## Onboarding sign-off
Onboarded by: ____  Owner sign-off: ____  Date: ____
