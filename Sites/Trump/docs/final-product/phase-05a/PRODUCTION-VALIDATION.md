# PRODUCTION-VALIDATION.md — Trump v1.0 RC1

**Date:** 2026-06-25.
**Status:** RC1 **validated against the live local production-mode server**; **production deploy + live validation are operator-run** (the build made no prod changes, per the chosen "prep-only" path). This doc gives (A) the RC1 local validation results and (B) the exact live procedure to run post-deploy, and (C) the operator-run prod load test.

---

## A. RC1 validation — executed (local, production-mode server + Postgres)
| Step-3 item | Result | Evidence |
|---|---|---|
| Owner / Manager / Waiter roles, token login | ✅ | e2e 1a (3/4; kitchen account present, its local password ≠ test value — role auth identical) |
| Kitchen role | ✅ structurally | role-based auth is the same code path; account exists |
| Token login (Bearer) | ✅ | 04B REST 1–2; e2e 1a |
| Cookie login (web) | ✅ unchanged | e2e 1b; 04B REST 18 |
| Socket authentication (Bearer + cookie) | ✅ | 04B socket A1–A2, C1; reconnect drill |
| Menu cache | ✅ live (`Cache-Control: max-age=30`, gzip, ETag/304) | PERFORMANCE-AUDIT; headers verified |
| Notifications (deliver + ack) | ✅ | e2e 6a/6b; 04B socket B1/B2 |
| Shift workflow (start/end) | ✅ | e2e 2 + 8 |
| Table ownership (takeover/transfer) | ✅ | e2e 5; 04B REST 7–8 |
| Audit | ✅ | Phase 03 (account/table/notification actions audited) |
| Operations dashboard | ✅ | Phase 03B UI + ops endpoints (e2e reports) |
| Android authentication | ✅ | 04B token-probe 16/16 (device issue/refresh/rotate/revoke) |
| **Full service scenario** | ✅ **11/11** | scenario probe (open→login→browse→order→notify→shift→bill→close→reports) |
| **Order idempotency** | ✅ **5/5** | idempotency probe (10 concurrent identical → 1 order) |
| **Order burst robustness** | ✅ 5xx 33→1 | retry/backoff measured |

## B. Live validation — operator-run (post-deploy on https://emenyu.com)
Run after the DEPLOYMENT-CHECKLIST. Each should pass identically to the local results above.
```bash
# 1. Health + menu cache headers
curl -s -o /dev/null -w "%{http_code}\n" https://emenyu.com/Trump/healthz
curl -sI https://emenyu.com/Trump/api/menu | grep -iE "cache-control|content-encoding|etag"   # max-age=30; gzip; W/"menu-...

# 2. Each role: token login (owner/manager/waiter/kitchen)
for u in owner manager waiter kitchen; do
  curl -s -XPOST https://emenyu.com/Trump/api/auth/token -H 'Content-Type: application/json' \
    -d "{\"username\":\"$u\",\"password\":\"<pw>\",\"deviceName\":\"val\",\"platform\":\"test\"}" \
    | grep -q accessToken && echo "$u token OK" || echo "$u token FAIL"
done

# 3. Cookie (web) login unchanged
curl -s -XPOST https://emenyu.com/Trump/api/auth/login -H 'Content-Type: application/json' -d '{"username":"waiter","password":"<pw>"}' -i | grep -i set-cookie

# 4. Bearer on a protected ops endpoint (use a token from step 2)
curl -s https://emenyu.com/Trump/api/shift/me -H "Authorization: Bearer <token>" -o /dev/null -w "%{http_code}\n"   # 200

# 5. Idempotency live (same clientOrderId twice → one order)
COID="val-$(date +%s)"
for i in 1 2; do curl -s -XPOST https://emenyu.com/Trump/submit_order -H 'Content-Type: application/json' \
  -d "{\"table_number\":\"table1\",\"items\":[{\"name\":\"<real item>\",\"qty\":1}],\"totals\":{\"tip\":0},\"clientOrderId\":\"$COID\"}"; echo; done
# then confirm exactly ONE order carries that clientOrderId (admin/DB), and remove the validation order.

# 6. Socket Bearer handshake — connect a socket.io client with auth.token=<access>; expect waiterRegistered on joinAsWaiter.
```
- [ ] Browser smoke: load `/Trump` SPA, log in (owner/manager/waiter), open the operations dashboard + notifications bell, confirm live updates.

## C. Production load test — operator-run (Step 6, OFF-HOURS window)
**Do NOT run during service** (shared droplet with other live restaurants). In an approved maintenance window:
```bash
# Temporarily enable the bypass ONLY for the window (so one test IP isn't rate-limited),
# then UNSET it immediately after:
pm2 set ... TRUMP_LOAD_TEST_BYPASS 1 && pm2 reload emenyu-trump-api --update-env   # window start

# Menu — 200 concurrent viewers:
autocannon -c 200 -d 30 -H "Accept-Encoding: gzip" https://emenyu.com/Trump/api/menu
# Orders — 80 concurrent (spread across tables, each with a unique clientOrderId via a body script):
#   reuse Apps/.../order-load pattern → POST /Trump/submit_order
# Sockets — 150–200 concurrent socket.io connections (joinAsWaiter), hold 60s, watch drops.

# Measure on the box DURING the run:
pm2 monit            # CPU% / mem of emenyu-trump-api
free -m; vmstat 2    # RAM / IO
# DB: SELECT count(*) FROM pg_stat_activity;  and slow-query log.

pm2 set ... TRUMP_LOAD_TEST_BYPASS 0 && pm2 reload emenyu-trump-api --update-env   # window end — bypass OFF
```
**Targets (compare against the Phase 05 local baseline):** 200 viewers 0 errors; 80 orders ≥99% success (retry/backoff); 150–200 sockets stable; CPU within 1 vCPU headroom; RSS « 768 MB; no regressions.

> The Phase 05 LOAD-TEST.md figures are the **application baseline** (test host). This step converts them into **certified prod numbers** on the 1 vCPU / 1 GB droplet. Until run, prod absolute capacity remains the one open certification item.
