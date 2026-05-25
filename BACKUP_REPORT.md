# BACKUP REPORT
## Pre-Deployment Backup — Trump Platform Redeployment
**Date:** 2026-05-22
**Backup location:** `/root/backups/pre_trump_deploy_20260521_195505/`

---

## BACKUP CONTENTS

| Component | Backed up to | Status |
|-----------|-------------|--------|
| Nginx site configs (sites-available/, sites-enabled/) | `backup/nginx/` | ✅ |
| Nginx main nginx.conf | `backup/nginx/nginx.conf` | ✅ |
| PM2 dump.pm2 (process registry) | `backup/pm2/dump.pm2` | ✅ |
| PM2 dump.pm2.bak | `backup/pm2/dump.pm2.bak` | ✅ |
| PM2 module_conf.json | `backup/pm2/` | ✅ |
| Greek .env | `backup/envfiles/Greek.env` | ✅ |
| Imli .env | — | N/A (not found) |
| AlPescatore .env | — | N/A (not found) |
| Greek orders/ | `backup/greek_data/orders/` | ✅ |
| Greek tables/ | `backup/greek_data/tables/` | ✅ |
| Greek uploads/ | `backup/uploads/Greek/` | ✅ |
| AlPescatore orders/ | `backup/alpesc_data/orders/` | ✅ |
| AlPescatore tables/ | `backup/alpesc_data/tables/` | ✅ |
| AlPescatore uploads/ | `backup/uploads/AlPescatore/` | ✅ |
| SSL cert info (listing) | `backup/ssl_info/cert_list.txt` | ✅ |
| Greek package.json | `backup/Greek_package.json` | ✅ |
| AlPescatore package.json | `backup/AlPescatore_package.json` | ✅ |
| Trump data | — | N/A (directory was already deleted) |
| PostgreSQL databases | — | N/A (PostgreSQL not installed yet) |

**Total backup size:** 288K (operational data is small; uploads are tiny)

---

## WHAT IS NOT IN THE BACKUP

| Item | Why |
|------|-----|
| SSL certificate files | Managed by certbot; live at `/etc/letsencrypt/live/emenyu.com/` — do not copy |
| node_modules for any site | Regenerated on deploy; not useful in backup |
| PM2 log files | Noted for truncation; not worth backing up |
| Trump runtime data | Directory was intentionally deleted before this session |
| PostgreSQL data | Not installed yet |

---

## ROLLBACK PROCEDURE

If the Trump deployment fails and must be rolled back:

```bash
# 1. Stop the new Trump process
pm2 stop emenuy-trump-api 2>/dev/null
pm2 delete emenuy-trump-api 2>/dev/null

# 2. Restore PM2 state to pre-deployment
cp /root/backups/pre_trump_deploy_20260521_195505/pm2/dump.pm2 /root/.pm2/dump.pm2
pm2 resurrect

# 3. Restore nginx if changed (no changes expected)
# cp /root/backups/pre_trump_deploy_20260521_195505/nginx/sites-available/mysite \
#    /etc/nginx/sites-available/mysite
# nginx -t && systemctl reload nginx

# 4. Restore Greek operational data if accidentally modified
# rsync -av /root/backups/pre_trump_deploy_20260521_195505/greek_data/ \
#   /var/www/mysite/Emenyu/Greek/

# 5. To fully remove a failed Trump deployment
# rm -rf /var/www/mysite/Emenyu/Trump/
# pm2 delete Trump Josh-Trump Recommend-Trump emenuy-trump-api 2>/dev/null || true
```

---

## SITES NOT AFFECTED BY DEPLOYMENT

The following sites are active and will not be touched during Trump deployment:

| Site | PM2 name | Port | Data location |
|------|---------|------|---------------|
| Greek | Greek | 3002 | /var/www/mysite/Emenyu/Greek/ |
| Imli | imli | 3001 | /var/www/mysite/Emenyu/Imli/ |
| AlPescatore | AlPescatore | 3005 | /root/AlPescatore/ |
| Josh-Greek | Josh-Greek | 5001 | /var/www/mysite/Emenyu/Greek/ |
