#!/usr/bin/env node
'use strict';
// Phase 09 (FRP1) — System diagnostics. One command that reports the facts you need
// to troubleshoot a Trump install. Read-only; safe to run anytime.
//   node scripts/diagnostics.js            # human report
//   node scripts/diagnostics.js --json     # machine-readable
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sh(cmd) { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}
function pkgVersion(mod) { try { return require(`${mod}/package.json`).version; } catch { return 'not-installed'; }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = {};

  // --- build / version ---
  out.appName = process.env.TRUMP_APP_NAME || 'emenuy-trump';
  out.nodeVersion = process.version;
  out.platform = `${process.platform} ${process.arch}`;
  out.environment = process.env.NODE_ENV || 'development';
  out.gitSha = sh('git rev-parse --short HEAD') || 'unknown';
  out.gitTag = sh('git describe --tags --abbrev=0') || 'none';
  out.gitBranch = sh('git rev-parse --abbrev-ref HEAD') || 'unknown';
  // build date = mtime of the built client (if present), else package.json
  try {
    const dist = path.join(root, 'client', 'dist', 'index.html');
    out.clientBuildDate = fs.existsSync(dist) ? fs.statSync(dist).mtime.toISOString() : 'no client/dist (not built)';
  } catch { out.clientBuildDate = 'unknown'; }
  out.appVersion = (() => { try { return require(path.join(root, 'package.json')).version; } catch { return 'unknown'; } })();

  // --- dependency versions ---
  out.prismaClientVersion = pkgVersion('@prisma/client');
  out.prismaCliVersion = sh('npx --no-install prisma --version 2>/dev/null') ? 'see prisma --version' : pkgVersion('prisma');
  out.socketIoVersion = pkgVersion('socket.io');
  out.expressVersion = pkgVersion('express');

  // --- database ---
  out.database = { url: process.env.DATABASE_URL ? maskUrl(process.env.DATABASE_URL) : 'DATABASE_URL not set' };
  try {
    const { getPrisma } = require(path.join(root, 'server', 'services', 'prismaClient'));
    const p = getPrisma();
    const v = await p.$queryRawUnsafe('select version() as v');
    out.database.version = String(v[0].v).split(',')[0];
    out.database.reachable = true;
    // prisma client field sanity (R1 canary)
    out.database.clientHasNewModels = !!(p.order && p.device && p.shift);
    await p.$disconnect();
  } catch (e) { out.database.reachable = false; out.database.error = e.message; }

  // --- runtime / config ---
  out.config = {
    publicBasePath: process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump',
    restaurantId: process.env.TRUMP_RESTAURANT_ID || 'trump',
    port: process.env.TRUMP_PORT || process.env.PORT || 3012,
    host: process.env.TRUMP_HOST || '127.0.0.1',
    rateLimitBypass: String(process.env.TRUMP_LOAD_TEST_BYPASS || '') === '1' ? 'ON (⚠ must be OFF in prod)' : 'off'
  };

  // --- connected services (live, optional) ---
  const base = `http://${out.config.host}:${out.config.port}${out.config.publicBasePath}`;
  out.services = {};
  out.services.health = await probe(`${base.replace(out.config.publicBasePath, '')}/healthz`) || await probe(`${base}/healthz`);
  out.services.ready = await probe(`http://${out.config.host}:${out.config.port}/readyz`);
  // cache canary — menu endpoint returns the Phase 05 cache headers
  out.services.menuCache = await menuCacheStatus(`${base}/api/menu`);
  out.services.pm2 = sh('pm2 jlist') ? 'pm2 present' : 'pm2 not found / not running here';

  // --- output ---
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); return; }
  print(out);
}

function maskUrl(u) { return u.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@'); }
async function probe(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); const t = await r.text(); return `${r.status} ${t.slice(0, 60)}`; }
  catch (e) { return `unreachable (${e.name})`; }
}
async function menuCacheStatus(url) {
  try { const r = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(3000) });
    return `${r.status} cache-control=${r.headers.get('cache-control') || 'none'} encoding=${r.headers.get('content-encoding') || 'none'}`; }
  catch (e) { return `unreachable (${e.name})`; }
}
function print(o) {
  const L = (k, v) => console.log(`  ${String(k).padEnd(22)} ${v}`);
  console.log('\n=== Trump System Diagnostics ===');
  console.log('-- build --'); L('app', o.appName); L('version', o.appVersion); L('git', `${o.gitSha} (${o.gitBranch}, tag ${o.gitTag})`); L('client build', o.clientBuildDate); L('environment', o.environment);
  console.log('-- runtime --'); L('node', o.nodeVersion); L('platform', o.platform); L('@prisma/client', o.prismaClientVersion); L('socket.io', o.socketIoVersion); L('express', o.expressVersion);
  console.log('-- config --'); Object.entries(o.config).forEach(([k, v]) => L(k, v));
  console.log('-- database --'); L('reachable', o.database.reachable); if (o.database.version) L('version', o.database.version); if (o.database.clientHasNewModels !== undefined) L('client models OK', o.database.clientHasNewModels); if (o.database.error) L('error', o.database.error);
  console.log('-- services --'); Object.entries(o.services).forEach(([k, v]) => L(k, v));
  console.log('');
}

main().catch(e => { console.error('diagnostics failed:', e); process.exit(1); });
