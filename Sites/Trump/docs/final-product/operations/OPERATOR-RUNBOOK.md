# OPERATOR-RUNBOOK.md — Running Trump Day-to-Day

**Audience:** the person who keeps Trump running (technical operator). Assumes nothing. All commands run on the box: `ssh root@134.122.99.78`.

**Key facts:** app `/var/www/mysite/Emenyu/Trump`; PM2 process **`emenuy-trump-api`**; port `127.0.0.1:3012`; behind nginx at `https://emenyu.com/Trump`; DB `emenyu` (PostgreSQL, localhost-only).

---

## Daily commands (cheat sheet)
```bash
pm2 status                              # is it up? restart count?
pm2 logs emenuy-trump-api --lines 100   # recent logs
pm2 monit                               # live CPU% / memory
curl -s http://127.0.0.1:3012/healthz   # {"status":"ok",...}
curl -s http://127.0.0.1:3012/readyz    # {"status":"ready"} (DB reachable)
```

## Start / stop / restart
```bash
cd /var/www/mysite/Emenyu/Trump
npm run pm2:start      # first start (pm2 start ecosystem.config.js --env production)
npm run pm2:restart    # zero-downtime reload
npm run pm2:stop       # stop
npm run pm2:logs       # tail logs
pm2 save               # persist the process list across reboots (do once after first start)
```
After a **server reboot**, PM2 resurrects saved processes (`pm2 startup` + `pm2 save` must have been run once). Verify with `pm2 status`.

## Health & status
| Check | Command | Healthy |
|---|---|---|
| Process | `pm2 status` | `online`, restarts stable |
| App health | `curl …/healthz` | `"status":"ok"` |
| Readiness (DB) | `curl …/readyz` | `"status":"ready"` |
| Public site | `curl -sI https://emenyu.com/Trump/healthz` | `200` |
| Menu cache | `curl -sI https://emenyu.com/Trump/api/menu` | `Cache-Control: public, max-age=30` + gzip |
| Memory | `pm2 monit` | RSS « 768 MB (restarts itself at 768 MB) |

## Accounts (staff logins)
```bash
npm run auth:audit     # list accounts; flags weak/default passwords (target: 0 weak)
npm run auth:rotate    # rotate any weak/default account passwords to strong ones
```
Roles: **owner > manager > waiter > kitchen**. Owner manages everyone; manager manages waiter/kitchen; nobody can manage an owner. See [PASSWORD-ROTATION.md](PASSWORD-ROTATION.md) and [OWNER-TRAINING.md](OWNER-TRAINING.md).

## Backups
```bash
./scripts/backup-trump.sh    # run a backup now (DB custom dump + app data, checksummed)
# scheduled daily via cron; off-box copy to DigitalOcean Spaces via rclone if configured.
ls -lh /root/backups/auto/   # local backups (14-day retention)
```
Verify a backup is restorable: [BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md).

## Logs
```bash
pm2 logs emenuy-trump-api          # app logs (structured JSON)
ls ~/.pm2/logs/                    # log files (rotated by pm2-logrotate, gzipped)
pm2 flush                          # clear logs if disk-pressured (after archiving)
```
What to grep for: `error`/`fatal` (problems), `rate_limit_` (throttling), `*_failed` (DB/save issues), `auth_login_failed` (bad logins). See [LOGGING-RUNBOOK.md](LOGGING-RUNBOOK.md).

## Monitoring
`scripts/monitor-trump.sh` runs every 5 min (cron) and alerts (webhook) on health/disk/memory problems. See [MONITORING-RUNBOOK.md](MONITORING-RUNBOOK.md).

## Deploy / update
Use [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) (`scripts/deploy-trump.sh`). Never edit code directly on the box.

## Common operator tasks
| Task | How |
|---|---|
| Restart after a hang | `npm run pm2:restart`; if still bad, `pm2 restart emenuy-trump-api` |
| Free disk | archive + `pm2 flush`; prune old `/root/backups/auto/`; `du -sh /var/log/*` |
| Check who's logged in / on shift | owner/manager console → Operations dashboard, or `GET /Trump/api/shifts` (admin) |
| Add/suspend a staff account | owner console → Manage staff (see OWNER-TRAINING) |
| Validate env after `.env` change | `npm run env:check` |
| Investigate an incident | [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md) |

## Escalation
If health is red and a restart doesn't fix it within a few minutes → [SERVER-RECOVERY.md](SERVER-RECOVERY.md). If data looks wrong/lost → [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md). **During service, restaurant first (Rule 1): fall back to the existing workflow, then fix.**
