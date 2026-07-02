#!/usr/bin/env bash
#
# Trump production deploy — idempotent, fail-hard, with pre-deploy snapshot.
#
# Runs ON the production box AFTER the new code has been synced into $APP_DIR
# (rsync from the workstation, excluding node_modules/.git). Every step fails
# hard; on failure it points at the snapshot for rollback.
#
#   deploy-trump.sh                    # full deploy (builds client on box)
#   SKIP_CLIENT_BUILD=1 deploy-trump.sh  # client/dist was built + synced from workstation
#                                        # (recommended on the 1 GB box — avoids OOM)
#   deploy-trump.sh rollback <snapshot-dir>   # restore code + DB from a snapshot
#
set -euo pipefail

APP_DIR="${TRUMP_APP_DIR:-/var/www/mysite/Emenyu/Trump}"
SCHEMA="${TRUMP_PRISMA_SCHEMA:-$APP_DIR/../../prisma/schema.prisma}"
PM2_APP="${TRUMP_PM2_APP:-emenuy-trump-api}"
READYZ="${TRUMP_READYZ:-http://127.0.0.1:3012/readyz}"
SNAP_ROOT="${TRUMP_DEPLOY_SNAP_ROOT:-/root/trump-deploy-snapshots}"
DB_NAME="${TRUMP_DB_NAME:-emenyu}"

c_info=$'\033[1;36m'; c_ok=$'\033[1;32m'; c_err=$'\033[1;31m'; c_off=$'\033[0m'
log() { echo -e "${c_info}[deploy]${c_off} $*"; }
ok()  { echo -e "${c_ok}[deploy ok]${c_off} $*"; }

# ---------------------------------------------------------------- rollback mode
if [ "${1:-}" = "rollback" ]; then
  snap="${2:?usage: deploy-trump.sh rollback <snapshot-dir>}"
  [ -d "$snap" ] || { echo "snapshot dir not found: $snap" >&2; exit 1; }
  log "ROLLBACK from $snap"
  if [ -f "$snap"/app-*.tar.gz ]; then
    tar -xzf "$snap"/app-*.tar.gz -C "$APP_DIR"
    ok "code restored"
  fi
  if [ -f "$snap"/"$DB_NAME"-*.dump ]; then
    read -r -p "Restore DB $DB_NAME from dump? This OVERWRITES live data [y/N] " a
    if [ "$a" = "y" ]; then
      cat "$snap"/"$DB_NAME"-*.dump | sudo -u postgres pg_restore --clean --if-exists -d "$DB_NAME"
      ok "DB restored"
    fi
  fi
  pm2 reload ecosystem.config.js --only "$PM2_APP" --update-env
  ok "rollback reload issued — verify $READYZ"
  exit 0
fi

# ----------------------------------------------------------------- deploy mode
ts="$(date -u +%Y%m%dT%H%M%SZ)"
snap="$SNAP_ROOT/$ts"
die() { echo -e "\n${c_err}[deploy FAILED]${c_off} $*" >&2; echo "Rollback: $0 rollback $snap" >&2; exit 1; }

cd "$APP_DIR" || die "APP_DIR $APP_DIR missing"

log "1/7 pre-deploy snapshot -> $snap"
mkdir -p "$snap"
sudo -u postgres pg_dump -Fc "$DB_NAME" > "$snap/$DB_NAME-$ts.dump" || die "pre-deploy DB dump failed"
tar -czf "$snap/app-$ts.tar.gz" --exclude node_modules --exclude client/node_modules \
    --exclude client/dist -C "$APP_DIR" . 2>/dev/null || true
cp -a "$APP_DIR/.env" "$snap/.env.bak" 2>/dev/null || true
cp -a "$APP_DIR/ecosystem.config.js" "$snap/ecosystem.config.js.bak" 2>/dev/null || true
ok "snapshot ($(du -sh "$snap" | cut -f1))"

log "2/7 npm ci --omit=dev"
npm ci --omit=dev || die "npm ci failed"

log "3/7 prisma generate (into Trump/node_modules — R1 fix)"
# R1 deploy defect (Phase 03C): the schema's generator block has no explicit `output`,
# so `prisma generate` emits the client to the @prisma/client nearest the SCHEMA file
# (Emenyu/node_modules), NOT the one the app actually loads (Trump/node_modules) — the
# app then runs a stale client missing new fields. Fix: generate from a Trump-LOCAL copy
# of the canonical schema so the client lands in $APP_DIR/node_modules, then verify.
mkdir -p prisma
cp -f "$SCHEMA" prisma/schema.prisma || die "could not copy schema to Trump-local prisma/"
npx prisma generate --schema prisma/schema.prisma || die "prisma generate failed"
# Verify the app-loaded client actually has the latest models/fields (fails fast if R1 recurs):
node -e "const {getPrisma}=require('./server/services/prismaClient'); const p=getPrisma(); p.order.findFirst({select:{clientOrderId:true}}).then(()=>{ if(!p.device||!p.shift) throw new Error('client missing device/shift'); console.log('prisma client OK (order.clientOrderId, device, shift present)'); process.exit(0);}).catch(e=>{console.error('PRISMA CLIENT VERIFY FAILED:',e.message); process.exit(1);});" \
  || die "generated prisma client is missing expected models/fields (R1 — client in wrong node_modules)"

log "4/7 prisma migrate deploy (canonical schema + migrations dir)"
npx prisma migrate deploy --schema "$SCHEMA" || die "migrate deploy failed"

log "5/7 client build"
if [ "${SKIP_CLIENT_BUILD:-0}" = "1" ]; then
  [ -f client/dist/index.html ] || die "SKIP_CLIENT_BUILD=1 but client/dist/index.html is missing"
  ok "client build skipped (using synced client/dist)"
else
  ( cd client && npm ci && npm run build ) || die "client build failed"
  [ -f client/dist/index.html ] || die "client build produced no client/dist/index.html"
  ok "client built"
fi

log "6/7 pm2 reload $PM2_APP"
pm2 reload ecosystem.config.js --only "$PM2_APP" --update-env || die "pm2 reload failed"

log "7/7 readyz gate + smoke"
ready=0
for _ in $(seq 1 20); do
  if curl -fsS -m 5 "$READYZ" | grep -q '"status":"ready"'; then ready=1; break; fi
  sleep 2
done
[ "$ready" = "1" ] || die "readyz never reported ready after reload"
curl -fsS -m 8 http://127.0.0.1:3012/healthz >/dev/null        || die "healthz failed"
curl -fsS -m 8 http://127.0.0.1:3012/Trump/api/menu >/dev/null || die "menu endpoint failed"

ok "DEPLOY COMPLETE ($ts). Snapshot kept at $snap"
