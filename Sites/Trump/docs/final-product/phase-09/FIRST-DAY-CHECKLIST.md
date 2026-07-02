# FIRST-DAY-CHECKLIST.md — Morning Opening

**For:** the person opening the restaurant (manager/owner) + the operator on the first day. Tick every box. **Rule 1: the restaurant comes first** — if anything's red, fall back to the normal workflow and call the operator.

---

## A. Operator — system ready (before staff arrive)
```bash
npm run diagnostics                    # versions/SHA/tag correct? bypass off? DB reachable?
TRUMP_HEALTH_BASE=https://emenyu.com/Trump npm run health:check   # all box checks PASS?
```
- [ ] `diagnostics`: git tag = the deployed release; **rate-limit bypass off**; DB reachable; "client models OK".
- [ ] `health:check`: **HEALTHY** — database / api_health / readyz / socket_io / menu_cache / notifications / storage / disk / **backups** / **pm2** / **tls_cert** all PASS (no FAIL).
- [ ] Last night's **backup** present + ≤ 1 day old; off-box copy confirmed.
- [ ] Disk < 80%; PM2 `emenuy-trump-api` online, restart count stable.

## B. Front-of-house — service ready
- [ ] Restaurant **Wi-Fi** up; test the menu on the real Wi-Fi (not office): `https://emenyu.com/Trump/table1` loads fast.
- [ ] **QR codes** on every table, each labelled with its number; spares available.
- [ ] **Menu** correct (today's specials in, sold-out items hidden); images load.
- [ ] Test order: place one from a table QR → reaches waiter/kitchen → complete it → confirm in reports → **delete the test order**.

## C. Staff — logged in & on shift
- [ ] Owner/manager logged in to the web console; dashboard healthy.
- [ ] Each **waiter** logged in to the app (own account), notifications permission granted, phone charged.
- [ ] Kitchen view up.
- [ ] Each waiter taps **Start shift**; they appear on the Operations dashboard.

## D. Safety net
- [ ] Fallback (paper/till) ready; everyone knows the abort signal.
- [ ] Operator reachable; monitoring webhook confirmed delivering ([../operations/MONITORING-RUNBOOK.md](../operations/MONITORING-RUNBOOK.md)).

## First-day-only extras
- [ ] Onboarding sign-offs complete ([../phase-07/CUSTOMER-ONBOARDING.md](../phase-07/CUSTOMER-ONBOARDING.md)); staff trained ([../operations/](../operations/) training).
- [ ] Observer on-site with the pilot log ([../phase-06/PILOT-LOG.md](../phase-06/PILOT-LOG.md)).
- [ ] Owner briefed: backups are automatic; Trump takes no payments (totals informational); how to read reports.

## Open for service
- [ ] All boxes ticked → open. Watch `pm2 monit` + the dashboard for the first 30 minutes.

**Opened by:** ____  **Time:** ____  **Operator:** ____
