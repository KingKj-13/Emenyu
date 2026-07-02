# GO-LIVE-CHECKLIST.md — Launch Day Cutover

**Purpose:** the day-of, hour-by-hour pre-flight to put the first restaurant live. Run [LAUNCH-CHECKLIST](LAUNCH-CHECKLIST.md) **before** this. Restaurant first — abort to fallback at any red flag (Rule 1).

---

## T-24h (day before)
- [ ] Final deploy at tag `trump-v1.0-rc1` done + smoke-green (DEPLOYMENT-RUNBOOK).
- [ ] Fresh backup taken + **verified restorable** (BACKUP-VERIFICATION).
- [ ] All staff accounts confirmed (each person logs in once successfully, web + app).
- [ ] APKs installed on every waiter device; notifications permission granted; battery charged.
- [ ] QR codes placed at every table; menu + media verified on a customer device.
- [ ] Fallback (paper/POS) ready and staff know the abort signal.

## T-2h (before service)
- [ ] `pm2 status` online; `/healthz` ok; `/readyz` ready; restart count stable.
- [ ] `npm run auth:audit` → 0 weak.
- [ ] Menu loads fast over the restaurant's real Wi-Fi (not just office network).
- [ ] One **end-to-end rehearsal**: log in → place a test order (with a `clientOrderId`) → see it on waiter/kitchen → complete it → confirm it's in reports → delete the test order.
- [ ] Monitoring webhook test-fired (you receive the alert).
- [ ] On-site observer present with [../phase-06/PILOT-LOG.md](../phase-06/PILOT-LOG.md) open.

## T-0 (service starts)
- [ ] Watch `pm2 monit` (CPU/RAM) + `pm2 logs` for the first 30 min.
- [ ] First real customer: QR → menu loads → order places → reaches staff. Confirm the loop once, live.
- [ ] First notification delivered to a waiter device.
- [ ] No `rate_limit_*` warnings during normal flow (if seen → note; limits are tunable, RATE-LIMIT-REVIEW).

## During service — abort triggers (Rule 1: stop + fall back, then fix)
- 🔴 Orders not reaching the kitchen/waiter.
- 🔴 Duplicate or lost orders (should not happen — idempotency; if it does, capture repro for BUG-LIST).
- 🔴 Repeated app crashes/freezes on waiter devices.
- 🔴 Customers can't load the menu.
- 🔴 Any data the owner can't trust for billing.
→ Switch to fallback **immediately**, keep serving, capture evidence ([INCIDENT-RESPONSE](INCIDENT-RESPONSE.md), [../phase-06/BUG-LIST.md](../phase-06/BUG-LIST.md)).

## Close of service
- [ ] All shifts ended; no lingering active sessions.
- [ ] Owner pulls reports (summary/items/tables/hours) — sanity-check totals against the till.
- [ ] Backup runs (or run it manually) post-service.
- [ ] Debrief + interviews ([../phase-06/](../phase-06/) feedback forms).

## Post go-live (first week)
- [ ] Daily: check `pm2 status`, logs for errors/rate-limits, backup success, disk.
- [ ] Triage any pilot bugs (Critical/High only) per [INCIDENT-RESPONSE](INCIDENT-RESPONSE.md) + BUG-LIST.
- [ ] After a clean full service with 0 critical failures + owner confidence → certification decision ([../phase-06/POST-PILOT-REPORT.md](../phase-06/POST-PILOT-REPORT.md)).

## Sign-off
- Go-live approved by: ____  Date/time: ____
- Fallback confirmed available: ☐  On-call operator: ____
