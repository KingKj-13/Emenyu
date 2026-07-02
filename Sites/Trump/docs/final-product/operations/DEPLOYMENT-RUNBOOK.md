# DEPLOYMENT-RUNBOOK.md — Trump Production Deploy

**Audience:** anyone deploying Trump, even if new to the project. **Every line is executable.**
**Target host:** DigitalOcean droplet `134.122.99.78` (1 vCPU / 1 GB, **shared with other restaurants** — deploy in a low-traffic window). App lives at `/var/www/mysite/Emenyu/Trump`. nginx fronts `https://emenyu.com`. App runs under PM2 as **`emenuy-trump-api`** on `127.0.0.1:3012` (note the spelling). Prod DB name: **`emenyu`** (PostgreSQL, localhost-only).

> The automated path is **`scripts/deploy-trump.sh`** (snapshot → npm ci → prisma generate **(R1-safe)** → migrate deploy → client build → pm2 reload → readyz+smoke, with a `rollback` mode). The manual steps below are what it does, for when you need to run them by hand.

---

## 0. Prerequisites (once)
- SSH access: `ssh root@134.122.99.78`.
- On the box: Node 18+, PM2, PostgreSQL client, `rclone` (for off-box backups), nginx already configured (it is).
- Workstation has the repo at tag `trump-v1.0-rc1` (or the release you're deploying).
- Confirm **`TRUMP_LOAD_TEST_BYPASS` is NOT set** on prod (rate limiting must stay ON).

## 1. Pre-deploy backup (NEVER skip)
```bash
ssh root@134.122.99.78 '/var/www/mysite/Emenyu/Trump/scripts/backup-trump.sh'   # DB + app, checksummed
# or the deploy script makes its own pre-deploy snapshot under /root/trump-deploy-snapshots/<ts>
pm2 jlist | grep -o '"restart_time":[0-9]*' | head -1                            # note current restart count
```

## 2. Build the client on the workstation (the box has only 1 GB — building there can OOM)
```bash
cd Sites/Trump/client && npm ci && npm run build      # produces client/dist/ (gitignored)
```

## 3. Sync code to the box
```bash
# Windows has no rsync → tar-over-ssh:
tar czf - --exclude node_modules --exclude .git --exclude client/node_modules Sites/Trump \
  | ssh root@134.122.99.78 'tar xzf - -C /var/www/mysite/Emenyu/Trump --strip-components=2'
tar czf - -C Sites/Trump/client dist \
  | ssh root@134.122.99.78 'tar xzf - -C /var/www/mysite/Emenyu/Trump/client'
scp prisma/schema.prisma root@134.122.99.78:/var/www/mysite/Emenyu/prisma/schema.prisma
scp -r prisma/migrations/* root@134.122.99.78:/var/www/mysite/Emenyu/prisma/migrations/
```

## 4. Deploy (automated — recommended)
```bash
ssh root@134.122.99.78
cd /var/www/mysite/Emenyu/Trump
SKIP_CLIENT_BUILD=1 TRUMP_PRISMA_SCHEMA=/var/www/mysite/Emenyu/prisma/schema.prisma \
  ./scripts/deploy-trump.sh
```
This runs all 7 steps and **fails hard** with a rollback hint if anything breaks. The Prisma-generate step is **R1-safe**: it copies the schema to a Trump-local path and generates so the client lands in `Trump/node_modules`, then verifies `order.clientOrderId`/`device`/`shift` are present.

### …or manual (what the script does)
```bash
cd /var/www/mysite/Emenyu/Trump
# 4a. deps
npm ci --omit=dev
# 4b. PRISMA GENERATE — R1 GOTCHA. Generate from a Trump-LOCAL schema so the client emits
#     to Trump/node_modules (NOT Emenyu/node_modules). Verify before continuing.
mkdir -p prisma && cp -f ../prisma/schema.prisma prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
node -e "const{getPrisma}=require('./server/services/prismaClient');const p=getPrisma();p.order.findFirst({select:{clientOrderId:true}}).then(()=>console.log('client OK')).catch(e=>{console.error('R1 FAIL',e.message);process.exit(1)})"
# 4c. migrations (use the CANONICAL schema — its folder has migrations/)
npx prisma migrate deploy --schema ../prisma/schema.prisma
# 4d. reload (zero-downtime)
pm2 reload ecosystem.config.js --only emenuy-trump-api --update-env
```

## 5. Smoke tests (gate — all must pass)
```bash
curl -fsS -m 5 http://127.0.0.1:3012/readyz | grep '"status":"ready"'   # readiness
curl -fsS http://127.0.0.1:3012/healthz >/dev/null                      # health
curl -sI https://emenyu.com/Trump/api/menu | grep -i "cache-control\|content-encoding"  # max-age=30 + gzip (Phase 05 cache live)
curl -s -XPOST https://emenyu.com/Trump/api/auth/login -H 'Content-Type: application/json' -d '{"username":"<u>","password":"<p>"}' -i | grep -i set-cookie  # web cookie auth
curl -s -XPOST https://emenyu.com/Trump/api/auth/token  -H 'Content-Type: application/json' -d '{"username":"<u>","password":"<p>","deviceName":"deploy","platform":"test"}' | grep accessToken  # native token auth
```
Full matrix: [../phase-05a/PRODUCTION-VALIDATION.md](../phase-05a/PRODUCTION-VALIDATION.md) §B.

## 6. Verify & finish
- [ ] `pm2 jlist` — app **online**, restart count not climbing.
- [ ] No `rate_limit_bypass_active` in `pm2 logs` (bypass is OFF).
- [ ] Menu has `Cache-Control: public, max-age=30`.
- [ ] Smoke tests green.
- [ ] Note the deploy snapshot dir for rollback.

## 7. Rollback (if any gate fails)
```bash
# automated:
./scripts/deploy-trump.sh rollback /root/trump-deploy-snapshots/<timestamp>
# manual: restore code from snapshot tar, restore DB from snapshot dump, pm2 reload.
```
Migrations are **additive/backward-compatible** — old code tolerates new columns (defaults), so a code-only rollback is safe without a DB downgrade. The pre-deploy DB dump is the safety net. See [SERVER-RECOVERY.md](SERVER-RECOVERY.md) / [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md).

## Common deploy failures → fix
| Symptom | Cause | Fix |
|---|---|---|
| App boots but new fields missing / 500s | **R1** — client in wrong node_modules | Re-run step 4b (Trump-local generate) + verify |
| "Refusing to start production without required secure configuration" | a role password env var missing | set all `TRUMP_*_PASS` in `.env` (see [INSTALLATION-GUIDE.md](INSTALLATION-GUIDE.md)) |
| `readyz` never ready | DB unreachable / migration pending | check `pm2 logs`, Postgres up, `migrate deploy` |
| client build OOM on box | 1 GB RAM | build on workstation + `SKIP_CLIENT_BUILD=1` |
