# LOGGING-RUNBOOK.md — Reading Trump's Logs

**Audience:** operator/engineer diagnosing behaviour. Trump logs **structured JSON** to stdout, captured by PM2 and rotated (gzipped) by **pm2-logrotate**.

---

## Where the logs are
```bash
pm2 logs emenuy-trump-api            # live tail (out + error)
pm2 logs emenuy-trump-api --lines 200
ls -lh ~/.pm2/logs/                  # emenuy-trump-api-out.log / -error.log (+ gzipped rotations)
```
nginx access/error logs (for HTTP/proxy issues): `/var/log/nginx/`.

## Log format
Each line is JSON: `{"ts","level","event","pid","app","env","restaurantId", ...fields}`. Filter by `event` and `level`.
```bash
pm2 logs emenuy-trump-api --lines 0 | grep '"event":"http_request"'      # request log
grep '"level":"error"' ~/.pm2/logs/emenuy-trump-api-error.log | tail
```

## Key events to know
| Event | Meaning | Action if frequent |
|---|---|---|
| `server_started` | boot OK | — |
| `http_request` | every request (method/path/status/durationMs) | watch `statusCode>=500`, high `durationMs` |
| `auth_login_success` / `auth_login_failed` | logins | many failures → brute force? check IP |
| `auth_login_suspended` | suspended account tried | expected for disabled staff |
| `token_issued` / `token_issue_failed` | native (Android) auth | failures → wrong creds / device issue |
| `rate_limit_general` / `_public_write` / `_auth` / `_chat` | throttling fired | frequent in normal service → tune limits (RATE-LIMIT-REVIEW) |
| `rate_limit_bypass_active` | **bypass is ON** | **must NOT appear in prod** — unset `TRUMP_LOAD_TEST_BYPASS`, reload |
| `order_postgres_save_failed` / `*_cart_save_failed` | DB transaction pressure | bursty → expected under extreme load (retry handles); sustained → investigate pool/DB |
| `push_dispatch_failed` / `push_expo_*` | push delivery hiccup | non-fatal (notifications reconcile via REST) |
| `csp_enabled` | security headers on | — |
| `level":"fatal"` | startup/critical failure | [SERVER-RECOVERY.md](SERVER-RECOVERY.md) |

## Useful one-liners
```bash
# error/fatal in the last rotation
zgrep -hE '"level":"(error|fatal)"' ~/.pm2/logs/*-error*.gz ~/.pm2/logs/*-error.log | tail -40
# 5xx responses
pm2 logs emenuy-trump-api --lines 0 | grep '"statusCode":5'
# rate-limit pressure during service
grep -c '"event":"rate_limit_' ~/.pm2/logs/emenuy-trump-api-out.log
# slow requests (durationMs > 1000)
grep '"event":"http_request"' ~/.pm2/logs/*-out.log | grep -E '"durationMs":[0-9]{4,}'
# failed logins by frequency
grep '"event":"auth_login_failed"' ~/.pm2/logs/*-out.log | wc -l
```

## Rotation & retention (pm2-logrotate)
- Configured to cap size and **gzip** rotations (Phase 02B2 brought a 472 MB log down to 2.7 MB).
```bash
pm2 conf pm2-logrotate            # view rotation settings (max_size, retain, compress:true)
pm2 flush                         # clear current logs (archive first if needed) — frees disk fast
```
Verify rotation is healthy in [MAINTENANCE.md](MAINTENANCE.md) (weekly).

## Privacy / safety
- Logs include usernames, IPs, table ids, request paths — **no passwords, no tokens, no card data** (Trump takes no payments). Treat logs as sensitive (staff usernames + IPs); restrict access; don't paste raw logs into public channels.
- When sharing a log for support, redact IPs/usernames.

## Disk-pressure note
Logs are the usual disk grower. pm2-logrotate bounds them, but if disk hits 90% the monitor alerts → archive + `pm2 flush` ([SERVER-RECOVERY.md](SERVER-RECOVERY.md) §3).
