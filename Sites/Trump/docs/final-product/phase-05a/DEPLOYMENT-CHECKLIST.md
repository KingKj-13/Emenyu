# DEPLOYMENT-CHECKLIST.md — Trump v1.0 RC1

**Date:** 2026-06-25. **Status: operator-run.** RC1 is prepared and validated locally; **no production changes were made by the build.** This is the exact procedure to deploy Phases 04 + 05 (+05A) to the shared prod droplet (`134.122.99.78`, `/var/www/mysite/Emenyu/Trump`).

> Target hosts other live restaurants. Deploy in a low-traffic window. All migrations are additive/backward-compatible (safe), but the pm2 reload is a brief blip.

---

## Pre-deploy
- [ ] On a clean checkout of `feat/chatbot-reco-rework` at tag `trump-v1.0-rc1`.
- [ ] `cd Sites/Trump/client && npm run build` (or build on the box) — React `dist/` is gitignored.
- [ ] Confirm **`TRUMP_LOAD_TEST_BYPASS` is NOT set** on prod (rate limiting stays ON).
- [ ] Snapshot: `pg_dump` of the prod DB + note current `pm2 jlist` (restart counts).
- [ ] Confirm prod `.env` has all role passwords (prod-config validation refuses to start otherwise).

## 1. Sync code to the box
```bash
# Windows has no rsync → tar-over-ssh (per prior phases), or git pull if a remote is set.
tar czf - --exclude node_modules --exclude client/dist Sites/Trump | ssh root@134.122.99.78 'tar xzf - -C /var/www/mysite/Emenyu/Trump --strip-components=2'
# sync the built client dist separately:
tar czf - -C Sites/Trump/client dist | ssh root@134.122.99.78 'tar xzf - -C /var/www/mysite/Emenyu/Trump/client'
# sync the prisma schema + new migrations:
scp prisma/schema.prisma root@134.122.99.78:/var/www/mysite/Emenyu/prisma/schema.prisma
scp -r prisma/migrations/2026062507* prisma/migrations/2026062512* prisma/migrations/2026062516* root@134.122.99.78:/var/www/mysite/Emenyu/prisma/migrations/
```

## 2. Apply migrations (additive)
```bash
ssh root@134.122.99.78
cd /var/www/mysite/Emenyu/Trump
DATABASE_URL="<prod-url>" npx prisma migrate deploy --schema ../prisma/schema.prisma
# expect: device_tokens, phase04b_push_token, phase05a_order_idempotency applied
```

## 3. Regenerate the Prisma client — ⚠️ R1 GOTCHA (Phase 03C)
The box layout (`Emenyu/Trump`) differs from the repo; `prisma generate --schema ../prisma` emits to the WRONG `node_modules`. Generate from a Trump-local schema so the client lands in `Trump/node_modules`:
```bash
cp ../prisma/schema.prisma prisma/schema.prisma
DATABASE_URL="<prod-url>" npx prisma generate --schema prisma/schema.prisma
# VERIFY the new fields are in the client the app actually loads:
node -e "const {getPrisma}=require('./server/services/prismaClient'); const p=getPrisma(); console.log('device.pushToken?', typeof p.device.fields?.pushToken!=='undefined'||'ok'); p.order.findFirst({select:{clientOrderId:true}}).then(()=>console.log('order.clientOrderId OK')).catch(e=>console.error('FAIL',e.message))"
```

## 4. Reload
```bash
pm2 reload emenyu-trump-api --update-env   # zero-downtime reload
pm2 jlist | grep -A2 emenyu-trump          # confirm online, restart count sane
```

## 5. Smoke test (live)
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://emenyu.com/Trump/healthz             # 200
curl -sI https://emenyu.com/Trump/api/menu | grep -i "cache-control\|content-encoding" # max-age=30 + gzip (Phase 05 cache live)
# token login + Bearer:
curl -s -XPOST https://emenyu.com/Trump/api/auth/token -H 'Content-Type: application/json' -d '{"username":"<u>","password":"<p>","deviceName":"deploy-check","platform":"test"}' | grep accessToken
# web cookie login still works:
curl -s -XPOST https://emenyu.com/Trump/api/auth/login -H 'Content-Type: application/json' -d '{"username":"<u>","password":"<p>"}' -i | grep -i set-cookie
```
Run the full live matrix in [PRODUCTION-VALIDATION.md](PRODUCTION-VALIDATION.md).

## 6. Post-deploy
- [ ] PRODUCTION-VALIDATION matrix green (token+cookie login, menu cache headers, socket auth, notifications, shift/ownership/audit/ops, Android auth).
- [ ] Watch `pm2 logs` for `rate_limit_*` warnings (tune limits if they appear in normal service).
- [ ] Confirm `rate_limit_bypass_active` is **NOT** in the logs.

## Rollback
- [ ] Migrations are additive → no rollback needed for schema. To revert code: redeploy the previous tag + `pm2 reload`. The new columns are ignored by old code (defaults). DB snapshot from pre-deploy is the safety net.

## Verification that matters
- `Cache-Control: public, max-age=30` on `/api/menu` ⇒ Phase 05 cache is live.
- `order.clientOrderId` queryable ⇒ idempotency migration applied + client regenerated (R1).
- Web cookie `Set-Cookie: trump_session=…` on `/api/auth/login` ⇒ web auth unchanged.
