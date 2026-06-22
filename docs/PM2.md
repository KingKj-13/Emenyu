# PM2 Setup

This deployment uses one PM2 forked process because the current storage model is local JSON/files. Do not run clustered instances until storage moves to SQL or another shared transactional backend.

## Install

```bash
cd /var/www/emenuy/Trump
npm ci --omit=dev
npm install -g pm2
mkdir -p logs/pm2 logs/nginx backups
```

## Start

```bash
cp .env.example .env
nano .env
pm2 start ecosystem.config.js --env production
pm2 save
```

## Startup Persistence

```bash
pm2 startup systemd -u deploy --hp /home/deploy
pm2 save
systemctl status pm2-deploy
```

Run the exact command printed by `pm2 startup` if your deploy user is not `deploy`.

## Restart Commands

```bash
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
pm2 restart emenuy-trump-api --update-env
pm2 stop emenuy-trump-api
pm2 logs emenuy-trump-api --lines 200
pm2 monit
```

Use `reload` for normal config/code deploys. Use `restart` only when the process is wedged or after a failed reload.

## Log Rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 save
```

PM2 writes to:

```text
logs/pm2/emenuy-trump-api-out.log
logs/pm2/emenuy-trump-api-error.log
logs/pm2/emenuy-trump-api-combined.log
```

## Health Monitoring

```bash
curl -fsS http://127.0.0.1:3012/healthz
curl -fsS http://127.0.0.1:3012/readyz
npm run health
```

Suggested DigitalOcean monitor:

```bash
*/1 * * * * curl -fsS http://127.0.0.1:3012/readyz >/dev/null || pm2 restart emenuy-trump-api --update-env
```

Prefer alerting before auto-restart once the first customers are live.

