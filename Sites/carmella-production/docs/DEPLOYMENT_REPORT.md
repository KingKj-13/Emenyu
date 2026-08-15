# Carmella Production — Deployment Report

Date: 2026-07-15
Host: `134.122.99.78` (shared droplet — Trump, Demo, Luxury/company site, trump-staging also live here)

## Summary

`carmella-production` is now live at `https://emenyu.com/Carmella/` (URL unchanged from
before). The previous deployment is stopped but fully intact for rollback.

## What changed on the server

| Component | Before | After |
|---|---|---|
| Live process | `emenuy-carmella-api` (PM2 id 24), port 3015 | `carmella-production-api` (PM2 id 25), port 3016 |
| Database | `emenyu_carmella` (unchanged, still exists, not touched) | `emenyu_carmella_production` (new, isolated, own dedicated role `carmella_production`) |
| Nginx | `/Carmella/*` → `localhost:3015` | `/Carmella/*` → `localhost:3016` |
| Deploy path | `/var/www/mysite/Emenyu/Carmella/` (untouched) | `/var/www/mysite/Emenyu/carmella-production/` |

Nothing about Trump (3012), trump-staging (3013), Demo (3014), or the Luxury/company site
(8010) was touched. Verified all four still respond 200 after the cutover.

## Sequence actually performed

1. Read-only recon: `pm2 list`, `df -h`, `free -h`, `ss -ltnp` — confirmed port 3016 free,
   ~440MB memory headroom.
2. Provisioned an isolated Postgres role (`carmella_production`) and database
   (`emenyu_carmella_production`) via peer-authenticated `psql` as the `postgres` OS user —
   no shared credentials touched, password generated server-side and never left the box.
3. Uploaded the deploy package (server code, Prisma schema, scripts, pre-built client
   `dist/`, optimized images) via tar+scp — no git/rsync on the box, matching this
   platform's established deploy convention.
4. `npm install` (178 packages, ~23s, no memory issues) + `npx prisma generate` +
   `npx prisma migrate deploy` — migration applied only to the new isolated database.
5. Ran the bundled menu importer against the new database: 190 items, 8 chapters, 26
   sections, 61 variants, 0 missing images.
6. Started `carmella-production-api` via PM2 on port 3016 — the *existing* live process
   was left running and untouched at this point.
7. Verified health directly on port 3016 (bypassing Nginx entirely): `/healthz`,
   `/readyz`, customer page, Admin page, menu API, promotions API, image serving —
   all correct, all still isolated from the public URL.
8. Backed up `/etc/nginx/sites-enabled/mysite` before any edit.
9. Changed only the 3 `proxy_pass` lines inside the Carmella location block
   (confirmed via grep this was the only place port 3015 appeared in the file) to point
   at 3016. Ran `nginx -t` — passed — before reloading.
10. `systemctl reload nginx` (reload, not restart — never drops other sites' connections).
11. Verified the live public URL end-to-end with a real Playwright browser pass: landing
    page, menu (190 items), add-to-cart, cart totals, Admin panel — zero page errors.
    Verified Socket.IO's public handshake responds correctly.
12. Verified Trump, Demo, and the Luxury/company site all still return 200 post-reload.
13. Only then: `pm2 stop emenuy-carmella-api` (stopped, not deleted — still in `pm2 list`,
    fully restorable) and `pm2 save` so the new process survives a reboot.

## Rollback path

If needed:
```
ssh root@134.122.99.78
# restore nginx
cp /root/deploy-backups/carmella-production-cutover-20260715/nginx-mysite.conf.bak /etc/nginx/sites-enabled/mysite
nginx -t && systemctl reload nginx
# restart the old process
pm2 restart emenuy-carmella-api
```
The old deployment directory, database (`emenyu_carmella`), and PM2 entry are all still
present and unmodified — nothing about this deployment deleted or altered them.

## Explicitly not done (per your instructions — awaiting your go-ahead)

- The old `emenuy-carmella-api` PM2 entry and its deploy directory have **not** been
  deleted — only stopped. Delete only when you explicitly say so.
- The old `emenyu_carmella` database has **not** been dropped or modified.
