#!/usr/bin/env node
'use strict';
// Phase 09 (FRP1) — Operator health check. Verifies every critical subsystem and
// prints a PASS/FAIL/WARN report. Exit code 0 only if there are no FAILs.
//   node scripts/health-check.js                 # check local (default port)
//   TRUMP_HEALTH_BASE=https://emenyu.com/Trump node scripts/health-check.js
//   node scripts/health-check.js --json
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.TRUMP_PORT || process.env.PORT || 3012;
const ORIGIN = process.env.TRUMP_HEALTH_ORIGIN || `http://127.0.0.1:${PORT}`;
const BASE = process.env.TRUMP_HEALTH_BASE || `${ORIGIN}${process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump'}`;
const results = [];
const add = (name, status, detail = '') => results.push({ name, status, detail });
const sh = (c) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const get = async (url, opts = {}) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(4000), ...opts }); return { ok: r.ok, status: r.status, headers: r.headers, text: await r.text() }; } catch (e) { return { ok: false, status: 0, err: e.name }; } };

async function main() {
  // 1. Database connectivity
  try {
    const { getPrisma } = require(path.join(ROOT, 'server', 'services', 'prismaClient'));
    const p = getPrisma();
    await p.$queryRawUnsafe('select 1');
    const hasModels = !!(p.order && p.device && p.shift);
    add('database', hasModels ? 'PASS' : 'WARN', hasModels ? 'reachable; client models present' : 'reachable but client missing models (R1?)');
    await p.$disconnect();
  } catch (e) { add('database', 'FAIL', e.message); }

  // 2. API health
  const h = await get(`${ORIGIN}/healthz`);
  add('api_health', h.ok && /"status":"ok"/.test(h.text || '') ? 'PASS' : 'FAIL', `status=${h.status}`);

  // 3. Readiness (DB-backed)
  const r = await get(`${ORIGIN}/readyz`);
  add('api_readyz', /"status":"ready"/.test(r.text || '') ? 'PASS' : 'FAIL', `status=${r.status}`);

  // 4. Socket service (engine.io handshake)
  const s = await get(`${BASE}/socket.io/?EIO=4&transport=polling`);
  add('socket_io', s.status === 200 || s.status === 400 ? 'PASS' : 'FAIL', `handshake status=${s.status}`);

  // 5. Cache (Phase 05 menu cache headers)
  const m = await get(`${BASE}/api/menu`, { headers: { 'Accept-Encoding': 'gzip' } });
  const cc = m.headers && m.headers.get && m.headers.get('cache-control');
  add('menu_cache', m.ok && /max-age/.test(cc || '') ? 'PASS' : 'WARN', `cache-control=${cc || 'none'} encoding=${m.headers && m.headers.get ? m.headers.get('content-encoding') : '?'}`);

  // 6. Notifications subsystem (endpoint alive + auth-gated)
  const n = await get(`${BASE}/api/notifications/unread-count`);
  add('notifications', n.status === 401 ? 'PASS' : (n.status === 200 ? 'PASS' : 'WARN'), `unread-count status=${n.status} (401=alive+gated)`);

  // 7. Storage (media dirs + writability)
  try {
    for (const d of ['Images', 'Video']) { const dir = path.join(ROOT, d); fs.accessSync(dir, fs.constants.R_OK); }
    const tmp = path.join(ROOT, '.health-write-test'); fs.writeFileSync(tmp, 'ok'); fs.unlinkSync(tmp);
    add('storage', 'PASS', 'Images/ + Video/ readable; app dir writable');
  } catch (e) { add('storage', 'FAIL', e.message); }

  // 8. Disk space
  const df = sh("df -P / 2>/dev/null | tail -1 | awk '{print $5}'") || sh("df -P . | tail -1 | awk '{print $5}'");
  if (df) { const pct = parseInt(df, 10); add('disk', pct >= 90 ? 'FAIL' : (pct >= 80 ? 'WARN' : 'PASS'), `root ${df} used`); }
  else add('disk', 'SKIP', 'df unavailable');

  // 9. Backups (box-specific)
  const bdir = process.env.TRUMP_BACKUP_ROOT || '/root/backups/auto';
  if (fs.existsSync(bdir)) {
    const latest = sh(`ls -1t ${bdir} 2>/dev/null | head -1`);
    const ageDays = latest ? Math.floor((Date.now() - fs.statSync(path.join(bdir, latest)).mtimeMs) / 86400000) : 999;
    add('backups', latest && ageDays <= 1 ? 'PASS' : 'WARN', latest ? `latest ${latest} (${ageDays}d old)` : 'no backups found');
  } else add('backups', 'SKIP', `${bdir} not present (not the prod box?)`);

  // 10. PM2
  const pm2 = sh('pm2 jlist');
  if (pm2) { const online = /"status":"online"/.test(pm2) && /emenuy-trump-api/.test(pm2); add('pm2', online ? 'PASS' : 'WARN', online ? 'emenuy-trump-api online' : 'app not online in pm2'); }
  else add('pm2', 'SKIP', 'pm2 not found (dev run?)');

  // 11. Certificates (box-specific; check via the public base if https)
  if (/^https:/.test(BASE)) {
    const host = new URL(BASE).host;
    const exp = sh(`echo | openssl s_client -servername ${host} -connect ${host}:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null`);
    add('tls_cert', exp ? 'PASS' : 'WARN', exp || 'could not read cert');
  } else add('tls_cert', 'SKIP', 'base is http (TLS terminated by nginx in prod)');

  // ---- report ----
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ base: BASE, results }, null, 2)); }
  else {
    console.log(`\n=== Trump Health Check (${BASE}) ===`);
    for (const x of results) { const icon = { PASS: '✓', FAIL: '✗', WARN: '!', SKIP: '·' }[x.status]; console.log(`  ${icon} ${x.status.padEnd(5)} ${x.name.padEnd(16)} ${x.detail}`); }
    const f = results.filter(x => x.status === 'FAIL').length, w = results.filter(x => x.status === 'WARN').length;
    console.log(`\n  ${results.filter(x => x.status === 'PASS').length} pass · ${w} warn · ${f} fail · ${results.filter(x => x.status === 'SKIP').length} skip`);
    console.log(`  RESULT: ${f ? '✗ FAIL — investigate above' : '✓ HEALTHY' + (w ? ' (with warnings)' : '')}\n`);
  }
  process.exit(results.some(x => x.status === 'FAIL') ? 1 : 0);
}
main().catch(e => { console.error('health-check crashed:', e); process.exit(2); });
