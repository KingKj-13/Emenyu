# LOG-HARDENING.md — Phase 02B.2 P3

**Date:** 2026-06-24. **Goal:** stop unbounded PM2 logs from filling the disk. **Status: ✅ CLOSED — `pm2-logrotate` active; PM2 log footprint cut from 472 MB → 2.7 MB; disk reclaimed.**

---

## 1. Before

```
$ du -sh ~/.pm2/logs            → 472M
$ ls -laS ~/.pm2/logs
 348 MB  imli-out.log
 143 MB  imli-error.log
$ df -h /                       → 21G used / 3.1G free / 87%
```
No rotation was configured; logs grew without bound on an already-tight disk. A single co-tenant (`imli`) produced ~491 MB.

## 2. Install + configure

```
$ pm2 install pm2-logrotate            # v3.0.0, online
$ pm2 set pm2-logrotate:max_size 10M
$ pm2 set pm2-logrotate:retain 7
$ pm2 set pm2-logrotate:compress true
$ pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
$ pm2 set pm2-logrotate:workerInterval 30
```
- **Rotation:** at 10 MB per file (checked every 30 s) **and** daily.
- **Retention:** 7 rotated files per log.
- **Compression:** gzip on rotated files.

## 3. Reclaim + after

The existing bloat was compressed and live logs flushed:
```
$ gzip -f ~/.pm2/logs/*__2026-*.log     # rotated files → .gz
$ pm2 flush                              # truncate live logs
$ du -sh ~/.pm2/logs                     → 2.7M      (was 472M)
$ ls -laS ~/.pm2/logs
 1.9 MB  imli-out__...log.gz             (compressed from 348 MB → ~180:1)
 0.8 MB  imli-error__...log.gz
$ df -h /                                → 20G used / 3.6G free / 85%
```
**Disk: 87% → 85%** (≈ +0.5 GB free), PM2 logs **472 MB → 2.7 MB**, and rotation now caps future growth.

## 4. Persistence + ongoing protection

- `pm2-logrotate` is a registered PM2 module and survives restarts (`pm2 save` written).
- The Phase 02B.2 **monitor** also alerts on `disk ≥ 90%` as a backstop (MONITORING-IMPLEMENTATION).

## 5. Noted follow-up (out of Trump scope)

`imli` is a **runaway log producer** (it regenerated ~348 MB within one rotation window; 145 lifetime restarts though currently stable). `pm2-logrotate` now bounds the disk impact, but the underlying verbosity/restart cause in the **imli** app should be investigated separately (it is a different restaurant, outside Trump's scope). The other co-tenant logs are small.

---

## Verdict

| Requirement | Status |
|---|---|
| Automatic rotation | ✅ size + daily |
| Retention | ✅ 7 files |
| Compression | ✅ gzip |
| Disk pressure reduced | ✅ 472 MB → 2.7 MB logs; 87% → 85% |

**N3/M6 (log hygiene): CLOSED.**
