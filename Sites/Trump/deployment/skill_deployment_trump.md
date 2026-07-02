# Skill File: Deploy Trump to SSH (Skill / Runbook)

Use this as a “skill” template when executing deployment steps for **Sites/Trump** on an **SSH server**.

---

## Goal
Upload the Trump app to a remote server, configure env, install production deps, start with **pm2**, and ensure nginx is ready.

---

## Required Inputs
- `SSH_USER`
- `SSH_HOST`
- `TARGET_DIR` (recommended: `/var/www/emenuy/Trump`)
- `DOMAIN` (for nginx `server_name`, if applicable)
- `.env` values:
  - `TRUMP_SESSION_SECRET`
  - `TRUMP_PUBLIC_ORIGIN`
  - `TRUMP_ALLOWED_ORIGINS`
  - `TRUMP_OWNER_PASS`
  - `TRUMP_MANAGER_PASS`
  - `TRUMP_WAITER_PASS`

---

## Steps

### 1) SSH and directory
```bash
ssh $SSH_USER@$SSH_HOST
sudo mkdir -p $TARGET_DIR
sudo chown -R $SSH_USER:$SSH_USER $TARGET_DIR
```

### 2) Upload (rsync)
From local machine (repo root `d:/Projects/Emenyu`):
```bash
rsync -av --delete \
  --exclude 'node_modules' \
  --exclude 'venv' \
  --exclude '.git' \
  --exclude 'deploy' \
  --exclude 'dont_upload' \
  --exclude 'logs' \
  Sites/Trump/ $SSH_USER@$SSH_HOST:$TARGET_DIR/
```

If you must preserve local-first persistent folders, remove `--delete` or add excludes for:
`data/ food/ orders/ history/ tables/ uploads/`.

### 3) Configure `.env`
```bash
cd $TARGET_DIR
cp .env.example .env
nano .env
```

### 4) Install production dependencies
```bash
npm ci --omit=dev
```

### 5) Start with pm2
```bash
mkdir -p logs/pm2 logs/nginx backups
npm run audit:prod
npm run health
pm2 start ecosystem.config.js --env production
pm2 save
```

### 6) nginx config (if using it)
Copy config file from repo (local):
- `Sites/Trump/deploy/nginx/emenuy-trump.conf`

On server:
- set `server_name your-domain.example ...`
- ensure cert paths are correct
- test and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 7) Verify
```bash
curl -fsS http://127.0.0.1:3012/healthz
curl -fsS http://127.0.0.1:3012/readyz
curl -I http://127.0.0.1:3012/Trump/Login
```

---

## Operational quick commands
- Reload updated app (example using only one pm2 process):
```bash
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
```

- Stop:
```bash
pm2 stop emenuy-trump-api
```

- Logs:
```bash
pm2 logs emenuy-trump-api --lines 200
```

---

## Failure patterns to check
- Missing required `TRUMP_*` env vars in `.env`.
- `pm2` started but server not ready yet (run `npm start` temporarily if needed).
- nginx not reloaded or certificate paths wrong.
- Websocket proxy path not correct: `/Trump/socket.io`.


