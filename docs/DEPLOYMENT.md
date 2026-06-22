# Deployment Guide

## Production Layout

Recommended DigitalOcean path:

```text
/var/www/emenuy/Trump
├── server.js
├── ecosystem.config.js
├── .env
├── data/
├── food/
├── orders/
├── history/
├── tables/
├── uploads/
├── logs/
└── backups/
```

Keep `data`, `food`, `orders`, `history`, `tables`, and `uploads` persistent. These are the local-first data stores until SQL migration.

## First Deploy

```bash
cd /var/www/emenuy/Trump
npm ci --omit=dev
cp .env.example .env
nano .env
mkdir -p logs/pm2 logs/nginx backups
npm run audit:prod
npm run health
pm2 start ecosystem.config.js --env production
pm2 save
```

If `npm run health` is run before PM2 starts, start the app temporarily with `npm start` in another shell.

## Required Production Env

Set these before `NODE_ENV=production` startup:

```bash
TRUMP_SESSION_SECRET=
TRUMP_PUBLIC_ORIGIN=https://your-domain.example
TRUMP_ALLOWED_ORIGINS=https://your-domain.example
TRUMP_OWNER_PASS=
TRUMP_MANAGER_PASS=
TRUMP_WAITER_PASS=
```

The app refuses to start in production without secure session and account seed values.

## Normal Deploy

```bash
cd /var/www/emenuy/Trump
npm ci --omit=dev
npm run audit:prod
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
curl -fsS http://127.0.0.1:3012/readyz
sudo nginx -t
sudo systemctl reload nginx
```

## Shutdown

```bash
pm2 stop emenuy-trump-api
```

The Node server handles `SIGINT` and `SIGTERM`, closes Socket.IO, stops accepting new requests, and exits after in-flight requests finish or the shutdown timeout is reached.

## Route Smoke Test

```bash
curl -I http://127.0.0.1:3012/Trump/table1
curl -I http://127.0.0.1:3012/Trump/Login
curl -fsS http://127.0.0.1:3012/Trump/api/menu >/dev/null
curl -fsS http://127.0.0.1:3012/healthz
curl -fsS http://127.0.0.1:3012/readyz
```

Admin and waiter pages should redirect unauthenticated users to `/Trump/Login`, then return after login.

