# INSTALLATION-GUIDE.md — Setting Up Trump From Scratch

**Audience:** an engineer standing up Trump on a fresh server for a new restaurant, with no prior knowledge. Follow top to bottom.

---

## What you're building
A Node.js (Express) API + React SPA, served behind nginx over HTTPS, backed by PostgreSQL, managed by PM2. Topology of the existing prod box:

```
Internet → nginx (TLS, emenyu.com) → 127.0.0.1:3012 (PM2: emenuy-trump-api) → PostgreSQL (localhost)
                                                                              ↘ /Images, /Video (static)
```

## Prerequisites (install on the server)
```bash
# Ubuntu 22.04/24.04
sudo apt update && sudo apt install -y nginx postgresql git curl
# Node 18+ (nvm or NodeSource), then:
sudo npm i -g pm2
# (optional, for off-box backups) rclone:  sudo apt install -y rclone
```

## 1. Get the code
```bash
sudo mkdir -p /var/www/mysite/Emenyu && cd /var/www/mysite/Emenyu
git clone <repo> .            # or rsync the release; layout must be Emenyu/Trump + Emenyu/prisma
cd Trump
```
> Layout matters: the app is `Emenyu/Trump`, the Prisma schema is `Emenyu/prisma/schema.prisma`. The deploy/runbooks rely on this (the **R1** gotcha — see DEPLOYMENT-RUNBOOK).

## 2. PostgreSQL
```bash
sudo -u postgres createdb emenyu
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '<strong>';"
# LOCKDOWN (Phase 02B): keep Postgres local-only.
#   postgresql.conf: listen_addresses = 'localhost'
#   pg_hba.conf:     local/127.0.0.1 only (no 0.0.0.0/0)
sudo systemctl restart postgresql
```

## 3. Environment
```bash
cd /var/www/mysite/Emenyu/Trump
node scripts/bootstrap-env.js        # generates secrets + writes Trump/.env
# Root .env (Emenyu/.env) holds ONLY DATABASE_URL for Prisma:
echo 'DATABASE_URL="postgresql://postgres:<pw>@localhost:5432/emenyu?schema=public"' > /var/www/mysite/Emenyu/.env
npm run env:check                    # validate
```
**Production refuses to start without strong role passwords.** Ensure `.env` has: `TRUMP_OWNER_USER/PASS`, `TRUMP_MANAGER_USER/PASS`, `TRUMP_WAITER_USER/PASS`, `TRUMP_KITCHEN_PASS` (and `TRUMP_ADMIN_PASS`), `TRUMP_SESSION_SECRET`, plus the `TRUMP_*` config. **Do NOT set `TRUMP_LOAD_TEST_BYPASS`** (it disables rate limiting).

## 4. Dependencies + Prisma + migrations
```bash
npm ci --omit=dev
# R1-safe client generation (client must land in Trump/node_modules):
mkdir -p prisma && cp -f ../prisma/schema.prisma prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema ../prisma/schema.prisma   # creates all tables
```

## 5. Build the client
```bash
cd client && npm ci && npm run build && cd ..   # → client/dist/ (served by the app)
```

## 6. nginx (reverse proxy + TLS)
- Proxy `https://<domain>/Trump` → `http://127.0.0.1:3012`.
- TLS via Let's Encrypt (`certbot --nginx`), HSTS on.
- Pass through `X-Forwarded-For` / `X-Forwarded-Proto` (the app trusts 1 proxy hop in production — needed for correct client IP in rate limiting).
- WebSocket upgrade for `/Trump/socket.io` (`proxy_set_header Upgrade $http_upgrade; Connection "upgrade";`).
> The repo nginx conf is a non-matching template — use the live box's working conf as reference.

## 7. Start under PM2
```bash
npm run pm2:start            # pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup      # survive reboots (run the printed command once)
pm2 status                   # online?
curl -s http://127.0.0.1:3012/readyz   # "ready"
```

## 8. Seed reference data (per restaurant)
```bash
npm run menu:migrate         # if importing legacy menu JSON → Postgres
npm run reco:seed            # chef recommendations (optional)
# create tables + QR codes; load menu + media via the owner console
```

## 9. Backups + monitoring
```bash
# cron (daily backup + 5-min monitor) — see BACKUP-VERIFICATION / MONITORING-RUNBOOK:
crontab -e
#   0 3 * * *   /var/www/mysite/Emenyu/Trump/scripts/backup-trump.sh
#   */5 * * * * /var/www/mysite/Emenyu/Trump/scripts/monitor-trump.sh
# off-box backups: configure rclone remote (e.g. spaces:) + /etc/trump-backup.env
```

## 10. Verify install
- [ ] `pm2 status` online; `/healthz` ok; `/readyz` ready.
- [ ] `https://<domain>/Trump` loads the SPA.
- [ ] Owner/manager/waiter can log in (web) and via token (Android).
- [ ] `npm run auth:audit` → 0 weak passwords.
- [ ] Backup runs and verifies ([BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md)).
- [ ] Monitoring cron active.

Next: [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md).
