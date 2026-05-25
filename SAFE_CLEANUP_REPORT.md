# SAFE CLEANUP REPORT
## Pre-Deployment Server Cleanup
**Date:** 2026-05-21
**Server:** 134.122.99.78 (emenyu.com)

---

## SUMMARY

Recovered **~1.1 GB** of disk space. Stopped 3 crash-looping PM2 processes. No operational data was deleted — only log files were truncated and dead process registrations were removed.

**Disk before cleanup:** 19G used / 4.7G free (80%)
**Disk after cleanup:** ~17.9G used / 4.8G free (80%)

---

## 1. CRASH-LOOPING PROCESSES STOPPED

The following PM2 processes were stopped and deleted. They referenced the deleted Trump directory and had been looping since before this session.

| PM2 ID | Name | Restarts | Issue | Action |
|--------|------|---------|-------|--------|
| 12 | Trump | ~13 | `ENOENT: frontend/pages/menu.html` — Trump dir deleted | `pm2 stop 12 && pm2 delete 12` |
| 13 | Josh-Trump | ~107 | venv path missing: `/var/www/mysite/Emenyu/Trump/venv/bin/python` | `pm2 stop 13 && pm2 delete 13` |
| 14 | Recommend-Trump | **835,981** | `recommend.py` missing | `pm2 stop 14 && pm2 delete 14` |

All three were safely deletable — they had no associated runtime data (no orders/, tables/) and their script paths did not exist on disk.

---

## 2. LOG FILE TRUNCATION

Truncated (not deleted) all bloated log files. Truncation preserves the file descriptor so PM2 continues logging to the same inode after truncation.

| Log file | Size before | Size after | Method | Disk recovered |
|---------|-------------|------------|--------|----------------|
| Josh-Greek-out.log | **841 MB** | 0 bytes | `truncate -s 0` | 841 MB |
| Josh-Greek-error.log | 115 MB | 0 bytes | `truncate -s 0` | 115 MB |
| Recommend-Trump-error.log | **138 MB** | 0 bytes | `truncate -s 0` | 138 MB |
| Josh-Trump-error.log | 160 KB | 0 bytes | `truncate -s 0` | 160 KB |
| Josh-Trump-out.log | 111 KB | 0 bytes | `truncate -s 0` | 111 KB |
| Trump-error.log | 1.6 KB | 0 bytes | `truncate -s 0` | 1.6 KB |
| Trump-out.log | 23 KB | 0 bytes | `truncate -s 0` | 23 KB |

**Total recovered:** ~1,094 MB (~1.07 GB)

Logs retained (not touched):
- `AlPescatore-out.log` (724 KB) — active, recent
- `AlPescatore-error.log` (446 KB) — active, recent
- `Greek-out.log` (39 KB) — active, recent
- `Greek-error.log` (5.2 KB) — active, recent

---

## 3. WHAT WAS NOT TOUCHED

| Item | Why left alone |
|------|----------------|
| `/var/www/mysite/Emenyu/Greek/orders/` | Active operational data |
| `/var/www/mysite/Emenyu/Greek/tables/` | Active table state |
| `/var/www/mysite/Emenyu/Greek/uploads/` | Media files |
| `/root/AlPescatore/orders/` | Active operational data |
| `/root/AlPescatore/tables/` | Active table state |
| `/etc/nginx/` | No changes required or made |
| `/etc/letsencrypt/` | No changes required or made |
| `/root/.pm2/dump.pm2` | Preserved (will be overwritten at session end with `pm2 save`) |
| Greek PM2 process (id 3) | Running, untouched |
| Imli PM2 process (id 1) | Running, untouched |
| AlPescatore PM2 process (id 10) | Running, untouched |
| Josh-Greek PM2 process (id 15) | Running, untouched |

---

## 4. DISK STATE AFTER CLEANUP

```
Filesystem      Size  Used Avail Use%
/dev/vda1        24G   19G  4.8G  80%
```

Note: The recovered ~1.1 GB was partially consumed by:
- `npm install` in Trump directory (~60-80 MB node_modules delta)
- Python venv creation for Recommend-Trump (~200 MB)
- Trump app logs accumulating during testing

Net result: disk usage percentage unchanged (80%) but absolute free space restored.

---

## 5. DISK RISK MONITORING

Josh-Greek-out.log was at 841 MB because Josh-Greek (port 5001) runs sentence-transformers inference and logs every request/embedding. It will regrow. Recommended action:

```bash
# Add to crontab (run as root):
0 3 * * * truncate -s 0 /root/.pm2/logs/Josh-Greek-out.log
```

AlPescatore-out.log (724 KB) and AlPescatore-error.log (446 KB) are currently modest but should be monitored.
