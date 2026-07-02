# DAY-IN-THE-LIFE.md — Phase 08 (SRE1) Step 7

**Date:** 2026-06-25. **Status: ✅ systematic workflow walkthrough (system-level), grounded in the verified end-to-end scenario (11/11). Friction points identified.**
**Honest scope:** this is the **system/interaction** walkthrough of a full restaurant day — every interaction traced through the working software. The *human* day (real staff/customers) is the live pilot ([../phase-06/](../phase-06/)). Each step here was exercised in the Phase 05A service scenario (11/11) and the SRE1 probes.

---

## The day, step by step (interaction → system → friction)

### 1. Opening
- Operator confirms `pm2 status` online, `/healthz` ok, `/readyz` ready, menu cache live. Wi-Fi + QR codes in place.
- **System:** server already up (PM2 autorestart survives overnight reboots). **Friction:** none if the box stayed up; if rebooted, confirm `pm2 resurrect` happened.

### 2. Staff arrive & log in
- Owner/manager on the web console; waiters on the Android app; kitchen on its view. Each uses their **own** account.
- **System:** token login (app) + cookie login (web), both verified; role-gated landing. **Friction:** a waiter logging in as someone else (training point — WAITER-TRAINING). Login proven fast (token issue + Bearer 200).

### 3. Shift starts
- Each waiter taps **Start shift**; manager sees them appear on the Operations dashboard.
- **System:** `POST /shift/start` (verified). **Friction:** forgetting to start a shift skews per-waiter reports — covered in training + manager can end a shift for them.

### 4. Tables open
- Tables are pre-created; QR codes resolve to `/Trump/<tableId>`.
- **System:** valid `table1…30`; auto-create on first order as a backstop. **Friction:** a QR for a non-existent table → validator rejects the order; pre-create + verify QRs (QR-DEPLOYMENT).

### 5. Customers order
- Guest scans QR → menu loads (cached, fast) → adds items → submits.
- **System:** menu 2 ms cached; order validated server-side (price/availability/table); **idempotent** (no double-order on double-tap). **Friction watch:** order-success feedback must be unmistakable on a busy phone (UX watchlist).

### 6. Busy lunch (peak)
- Many tables ordering within minutes; waiters moving; notifications firing.
- **System:** menu scales (914 req/s @10c, sub-¼-core at 200c); orders idempotent + retry-safe (97% at a realistic 10c rush, graceful beyond). **Friction:** rate limiter is per-IP — on shared Wi-Fi the RC1 ceilings (3000/300 per 15 min) cover a busy restaurant; watch `rate_limit_*` logs (RATE-LIMIT-REVIEW).

### 7. Table transfers
- A waiter goes on break → transfers a table; or a manager reassigns an overloaded section.
- **System:** transfer (owner-only-of-that-table) / manager reassign (reason required); every change **audited**; the target waiter is **notified**. Verified in the scenario + security probe.

### 8. Notifications
- Table calls, transfers, alerts reach the right person live (socket) + push; a missed one is recovered via the unread list.
- **System:** per-user rooms + push + polling fallback; **REST unread list is the truth** (lost-notif recovery proven). **Friction:** push permission must be granted at install (training/onboarding).

### 9. Bills
- Manager/owner completes orders → moved to history; totals (VAT 15% + service 5%) computed server-side.
- **System:** `POST /complete` (verified); analytics reflect it immediately. **Friction:** owner should sanity-check the Trump total vs the till at close (Trump takes no payments — totals are informational, KNOWN-LIMITATIONS).

### 10. Closing
- Waiters **End shift**; manager confirms no lingering active sessions.
- **System:** `POST /shift/end`; active-shifts list empties. Verified.

### 11. Reports
- Owner pulls Summary / Top items / Per-table / By-hour for the day.
- **System:** analytics aggregate the live `Order` table (admin-only, 403 for waiter); reflect the day's orders/revenue. Verified (all four endpoints 200).

### 12. Backup
- Overnight cron runs `backup-trump.sh` (DB + app data, checksummed, off-box), fails hard on error, monitor alerts.
- **System:** verified-restorable; monthly drill. **Friction:** confirm the off-box copy is configured (LAUNCH-CHECKLIST).

### 13. Restaurant closes
- Box stays up (next day's open is just "log in"). PM2 keeps the app alive; monitor watches health/disk/memory.

## Friction summary (for the live pilot to confirm/quantify)
| Friction | Where | Mitigation / watch |
|---|---|---|
| Login-as-wrong-person | Step 2 | training; per-person accounts |
| Forgot to start/end shift | 3/10 | training; manager override |
| Order-success feedback clarity | 5 | UX watchlist (phase-06 UX-IMPROVEMENTS) |
| Push permission not granted | 8 | onboarding step |
| Shared-Wi-Fi rate limits | 6 | RC1 ceilings + watch logs |
| Till vs Trump total reconciliation | 9 | owner habit; no-payments by design |

## Verdict
Every interaction in a full restaurant day is **handled by working, verified software**, with friction points identified and each either mitigated or on the live-pilot watchlist. None is a single-restaurant blocker. The human dimension (staff comfort, real timings) is the live pilot's job.
