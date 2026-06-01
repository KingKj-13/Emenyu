# Backup And Recovery

## What To Back Up

Back up these directories and files:

```text
data/accounts.json
data/chat_logs.json
food/
orders/
history/
tables/
uploads/
.env
ecosystem.config.js
```

Do not store `.env` in a public repo. Keep encrypted off-server copies.

## Daily Backup Command

```bash
cd /var/www/emenuy/Trump
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
tar -czf "backups/emenuy-trump-$timestamp.tar.gz" \
  data food orders history tables uploads ecosystem.config.js .env
```

Copy backups off the droplet:

```bash
rsync -av backups/ backup-user@backup-host:/srv/backups/emenuy-trump/
```

## Retention

Recommended minimum:

- Hourly local backups for 24 hours during launch week
- Daily backups for 30 days
- Weekly backups for 12 weeks
- Monthly backups for 12 months

## Restore

```bash
pm2 stop emenuy-trump-api
cd /var/www/emenuy/Trump
mkdir -p restore-scratch
tar -xzf backups/emenuy-trump-YYYYMMDDTHHMMSSZ.tar.gz -C restore-scratch
rsync -av restore-scratch/ ./
npm ci --omit=dev
pm2 start ecosystem.config.js --env production
curl -fsS http://127.0.0.1:3012/readyz
```

## Rollback

Before each deploy:

```bash
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
tar -czf "backups/predeploy-$timestamp.tar.gz" data food orders history tables uploads .env ecosystem.config.js
```

If a deploy fails:

```bash
pm2 stop emenuy-trump-api
tar -xzf backups/predeploy-YYYYMMDDTHHMMSSZ.tar.gz -C /var/www/emenuy/Trump
pm2 start ecosystem.config.js --env production
sudo nginx -t && sudo systemctl reload nginx
```

## Session Recovery

Sessions survive restarts when `.env` keeps the same `TRUMP_SESSION_SECRET` and `data/accounts.json` is restored. Changing `TRUMP_SESSION_SECRET` invalidates all active browser sessions, which is appropriate after suspected secret exposure.

