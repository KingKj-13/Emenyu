# PERFORMANCE-OBSERVATIONS.md — Pilot Performance

> **STATUS: baselines are REAL (Phase 05, measured); the "Observed during service" column is NOT YET FILLED — operator-run on prod during the live service.** Do not invent service numbers. Capture them live and compare to the baseline.

**Context:** baselines were measured on the build host (8-core/17 GB) — they characterise the *application*. Prod is the **1 vCPU / 1 GB shared droplet**, so the pilot's job is to capture **real prod numbers under real load** and check for regressions vs. the app baseline + the Phase 05 capacity findings.

---

## Phase 05 baselines (measured — the comparison target)
| Metric | Phase 05 baseline | Source |
|---|---|---|
| Menu p50 (sequential, cached) | **2 ms** | LOAD-TEST |
| Menu @10 concurrent | **~500 req/s, p50 17 ms** | LOAD-TEST |
| Menu @200 concurrent | 257 req/s, **0 errors**, < 1 core | LOAD-TEST |
| Order accepted-throughput | **~21/s** @10 concurrent | LOAD-TEST |
| Order burst 5xx (post-RC1 retry) | **1/71** @70 concurrent | Phase 05A |
| Hot DB queries | **sub-millisecond** | DATABASE-PERFORMANCE |
| RSS under load | **105–168 MB** (limit 768 MB) | LOAD-TEST |
| Notification delivery (socket) | live (event received) | 04B socket B2 |
| First real-world limit | **rate limiter (shared-IP), then video bandwidth** | CAPACITY-REPORT |

## What to capture DURING service (fill live)
| Metric | How to capture | Observed | vs. baseline |
|---|---|---|---|
| API latency p50/p95 (`/api/menu`, `/submit_order`, `/api/shift/me`) | nginx access log latency, or `curl -w "%{time_total}"` spot-checks | / |  |
| CPU (app) | `pm2 monit` / `pidusage` of emenyu-trump-api (% of 1 vCPU) |  |  |
| RAM (RSS) | `pm2 monit` / `free -m` |  |  |
| Bandwidth (egress) | `vnstat` / droplet metrics (watch video) |  |  |
| Socket.IO connections | server `io.engine.clientsCount` / log; peak concurrent |  |  |
| Order throughput | orders/min from DB `createdAt` histogram |  |  |
| Notification latency | event timestamp → device receipt (eyeball / log) |  |  |
| Error rate | 5xx count in nginx/app logs ÷ requests (target ~0) |  |  |
| Rate-limit hits | count of `rate_limit_*` warnings in app log (target ~0) |  |  |

## Capture commands (operator, on the box — read-only)
```bash
pm2 monit                                  # live CPU% + mem of emenyu-trump-api
pm2 logs emenyu-trump-api --lines 0        # tail; watch for rate_limit_* / *_failed / error
grep -c rate_limit_ /path/to/app.log       # shared-IP throttling during service
# DB activity:
psql "$URL" -c "select count(*) from pg_stat_activity where datname=current_database();"
# orders/min:
psql "$URL" -c "select date_trunc('minute',\"createdAt\") m, count(*) from \"Order\" where \"createdAt\">now()-interval '3 hours' group by m order by m;"
# socket count (if exposed) or from connection logs
```

## Regression gates (compare to baseline)
- [ ] Menu p50 on prod stays low (cache working; `Cache-Control: max-age=30` present).
- [ ] Order success rate ≥ 99% during peak (idempotency + retry).
- [ ] No sustained CPU pinned at 1 core / no RSS approaching 768 MB.
- [ ] `rate_limit_*` warnings ≈ 0 during normal service (validated limits, raised in RC1). If they appear → tune per RATE-LIMIT-REVIEW.
- [ ] Socket connections stable (no mass disconnect storms).
- [ ] Error rate ≈ 0; any 5xx → BUG-LIST with the request + log line.

## Notes / anomalies (fill live)
- Slowest endpoint observed: ____
- Any moment latency spiked (when, why): ____
- Bandwidth peak (and whether video drove it — confirms MEDIA-BANDWIDTH): ____
