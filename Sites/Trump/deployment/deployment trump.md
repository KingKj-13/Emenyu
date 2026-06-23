# Deployment Trump (SSH) — Upload & Run

This file explains how to upload the **Emenyu Trump** app to your **SSH server** and start it in production.

> Assumptions
> - You are deploying the Node app from `Sites/Trump/`.
> - Your SSH server already has **Node.js**, **npm**, **nginx**, and **pm2** installed (or you will install them separately).
> - You want the app to live at: `/var/www/emenuy/Trump`.

---

## 1) Prepare your local machine

From your local repo (`d:/Projects/Emenyu`), you’ll upload the contents of:

- `Sites/Trump/` (server + config + persistent folders)

### Recommended production folders to keep persistent

Keep these folders as local-first persistent storage on the server:

- `data/`
- `food/`
- `orders/`
- `history/`
- `tables/`
- `uploads/`

If these already exist on the server, uploading a new release should not delete them.

---

## 2) SSH into your server

```bash
ssh <user>@<server-ip-or-hostname>
```

---

## 3) Create the target directory

```bash
sudo mkdir -p /var/www/emenuy/Trump
sudo chown -R <user>:<user> /var/www/emenuy/Trump
```

---

## 4) Upload files to the server

You can use either **rsync** (best) or **scp**.

### Option A (Recommended): rsync

From your local machine:

```bash
rsync -av --delete \
  --exclude 'node_modules' \
  --exclude 'venv' \
  --exclude '.git' \
  --exclude 'deploy' \
  --exclude 'dont_upload' \
  --exclude 'logs' \
  Sites/Trump/ <user>@<server-ip-or-hostname>:/var/www/emenuy/Trump/
```

**If you want to preserve persistent folders**, remove `--delete` and/or add excludes, for example:

```bash
rsync -av \
  --exclude 'node_modules' \
  --exclude 'venv' \
  --exclude 'logs' \
  --exclude 'data' \
  --exclude 'food' \
  --exclude 'orders' \
  --exclude 'history' \
  --exclude 'tables' \
  --exclude 'uploads' \
  Sites/Trump/ <user>@<server-ip-or-hostname>:/var/www/emenuy/Trump/
```

### Option B: scp (slower)

Upload the folder recursively:

```bash
scp -r Sites/Trump/* <user>@<server-ip-or-hostname>:/var/www/emenuy/Trump/
```

For large apps, rsync is usually preferred.

---

## 5) Configure `.env`

On the server:

```bash
cd /var/www/emenuy/Trump
cp .env.example .env
nano .env
```

At minimum, ensure these production-required values are set:

- `TRUMP_SESSION_SECRET`
- `TRUMP_PUBLIC_ORIGIN`
- `TRUMP_ALLOWED_ORIGINS`
- `TRUMP_OWNER_PASS`
- `TRUMP_MANAGER_PASS`
- `TRUMP_WAITER_PASS`

---

## 6) Install dependencies (production)

```bash
cd /var/www/emenuy/Trump
npm ci --omit=dev
```

---

## 7) Deploy / start with pm2

### First deploy

```bash
cd /var/www/emenuy/Trump
mkdir -p logs/pm2 logs/nginx backups
npm run audit:prod
npm run health
pm2 start ecosystem.config.js --env production
pm2 save
```

If `npm run health` is run before PM2 starts, the server may not be up yet. In that case run `npm start` temporarily.

### Normal (update) deploy

```bash
cd /var/www/emenuy/Trump
npm ci --omit=dev
npm run audit:prod
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
curl -fsS http://127.0.0.1:3012/readyz
```

---

## 8) Configure nginx

You can copy the provided nginx config:

- `Sites/Trump/deploy/nginx/emenuy-trump.conf`

Typical location:

```bash
sudo cp emenuy-trump.conf /etc/nginx/sites-available/your-site.conf
sudo nginx -t
sudo systemctl reload nginx
```

> In the config file, update `server_name your-domain.example` and certificate paths if needed.

---

## 9) Verify the app

Route smoke tests:

```bash
curl -I http://127.0.0.1:3012/Trump/table1
curl -I http://127.0.0.1:3012/Trump/Login
curl -fsS http://127.0.0.1:3012/Trump/api/menu >/dev/null
curl -fsS http://127.0.0.1:3012/healthz
curl -fsS http://127.0.0.1:3012/readyz
```

---

## 10) Common operational commands

- Stop:

```bash
pm2 stop emenuy-trump-api
```

- View logs:

```bash
pm2 logs emenuy-trump-api --lines 200
```

---

## Notes / pitfalls

- Make sure you do **not** delete persistent local-first folders on updates (`data/`, `uploads/`, etc.).
- Ensure `TRUMP_*` env vars are present; the app refuses to start without them in production.
- nginx must proxy:
  - `/healthz` and `/readyz`
  - websocket path `/Trump/socket.io` (and/or `/trump/socket.io`)


