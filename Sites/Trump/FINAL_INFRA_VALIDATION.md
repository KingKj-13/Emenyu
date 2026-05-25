# Final Infra Validation

Run this checklist after every production deploy.

## Process

```bash
pm2 describe emenuy-trump-api
pm2 logs emenuy-trump-api --lines 100
curl -fsS http://127.0.0.1:3012/healthz
curl -fsS http://127.0.0.1:3012/readyz
```

Expected: PM2 status is `online`, health is `ok`, readiness is `ready`, and logs contain structured JSON events.

## Routes

```bash
curl -I http://127.0.0.1:3012/Trump/table1
curl -I http://127.0.0.1:3012/Trump/Login
curl -fsS http://127.0.0.1:3012/Trump/api/menu >/dev/null
curl -I http://127.0.0.1:3012/admin.html
curl -I http://127.0.0.1:3012/waiter.html
```

Expected: customer route renders, login route renders, menu API returns JSON, protected admin/waiter routes redirect unauthenticated users.

## Auth

1. Login as owner or manager.
2. Open `/Trump/Admin`.
3. Refresh the browser.
4. Confirm the session persists.
5. Logout and confirm protected pages redirect to login.

## Waiter And Customer Flow

1. Open `/Trump/table1`.
2. Add an item to the cart.
3. Open waiter dashboard.
4. Confirm table status updates.
5. Submit an order.
6. Confirm admin/waiter dashboards update through Socket.IO.

## Nginx

```bash
sudo nginx -t
curl -I https://your-domain.example/Trump/table1
curl -fsS https://your-domain.example/healthz
curl -fsS https://your-domain.example/readyz
```

Expected: TLS is valid, security headers are present, gzip is enabled for text assets, and Socket.IO connects on `/Trump/socket.io`.

## Restart Recovery

```bash
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
curl -fsS http://127.0.0.1:3012/readyz
```

Expected: customer/admin/waiter routes recover without manual file cleanup; active JSON files remain valid.

## Local Validation Performed

Completed on 2026-05-19 from the Windows development workspace:

- Node syntax checks passed for server startup, helpers, middleware, logger, Socket.IO service, upload controller, and healthcheck script.
- Local server started on validation port `4012`.
- `npm run health` returned `/healthz: ok` and `/readyz: ready`.
- Customer route `/Trump/table1` returned `200`.
- Menu API `/Trump/api/menu` returned `200`.
- Socket.IO client `/Trump/socket.io/socket.io.js` returned `200`.
- Unauthenticated `/admin.html` and `/waiter.html` returned `302` redirects.
- Auth cookie session persisted through `/Trump/api/auth/login` and `/Trump/api/auth/me`.
- Authenticated admin and waiter pages returned `200`.
- Waiter table status and recommendation API returned `200`.
- `npm run audit:prod` reported zero vulnerabilities.
- Production config validation rejects startup when required secrets/origins are missing and accepts startup when secure env values are present.
- PM2 started `emenuy-trump-api` through `ecosystem.config.js` on validation port `4013`; `/readyz` returned `200`; the PM2 process was deleted after validation.

Nginx is not installed in this Windows workspace, so `nginx -t` must be run on the DigitalOcean droplet after copying `deploy/nginx/emenuy-trump.conf`.
