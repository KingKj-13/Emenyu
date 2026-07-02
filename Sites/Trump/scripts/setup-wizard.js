#!/usr/bin/env node
'use strict';
// Phase 09 (FRP1) — Restaurant setup wizard. Turns one config file into the env +
// tables + accounts for a single restaurant, so onboarding isn't manual editing.
// DRY-RUN by default (prints the plan + generated credentials); --apply executes.
//
//   node scripts/setup-wizard.js --config restaurant.json            # dry-run plan
//   node scripts/setup-wizard.js --config restaurant.json --apply    # write env + create tables (+ extra staff)
//
// restaurant.json:
// { "name":"My Bistro", "vatRate":0.15, "serviceRate":0.05, "tables":12,
//   "branding":{"appName":"My Bistro"},
//   "owner":{"username":"owner"}, "managers":["mgr1","mgr2"],
//   "waiters":["sam","alex","jo"], "kitchen":{"username":"kitchen"} }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const cfgPath = (() => { const i = process.argv.indexOf('--config'); return i > -1 ? process.argv[i + 1] : null; })();
const envFile = (() => { const i = process.argv.indexOf('--env-file'); return i > -1 ? process.argv[i + 1] : path.join(ROOT, '.env.wizard'); })();
if (!cfgPath) { console.error('usage: node scripts/setup-wizard.js --config <restaurant.json> [--apply] [--env-file <path>]'); process.exit(2); }

const strongPw = () => crypto.randomBytes(18).toString('base64url');
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

function validate(cfg) {
  const errs = [];
  if (!cfg.name) errs.push('name is required');
  const t = num(cfg.tables, 0);
  if (!(t >= 1 && t <= 50)) errs.push('tables must be 1..50 (Rule 1: one restaurant, ≤50 tables)');
  if (cfg.vatRate != null && !(cfg.vatRate >= 0)) errs.push('vatRate must be ≥ 0');
  if (cfg.serviceRate != null && !(cfg.serviceRate >= 0)) errs.push('serviceRate must be ≥ 0');
  const mgr = (cfg.managers || []).length, wtr = (cfg.waiters || []).length;
  if (mgr > 5) errs.push('managers > 5 (Rule 1 envelope is 2–5)');
  if (wtr > 20) errs.push('waiters > 20 (Rule 1 envelope is 5–20)');
  return errs;
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const errs = validate(cfg);
  if (errs.length) { console.error('Config errors:\n' + errs.map(e => '  ✗ ' + e).join('\n')); process.exit(1); }

  const tables = num(cfg.tables, 0);
  const vat = cfg.vatRate != null ? cfg.vatRate : 0.15;
  const service = cfg.serviceRate != null ? cfg.serviceRate : 0.05;
  const appName = (cfg.branding && cfg.branding.appName) || cfg.name;

  // generate credentials for the 4 default roles
  const ownerU = (cfg.owner && cfg.owner.username) || 'owner';
  const kitchenU = (cfg.kitchen && cfg.kitchen.username) || 'kitchen';
  const creds = {
    owner: { username: ownerU, password: strongPw() },
    manager: { username: (cfg.managers && cfg.managers[0]) || 'manager', password: strongPw() },
    waiter: { username: (cfg.waiters && cfg.waiters[0]) || 'waiter', password: strongPw() },
    kitchen: { username: kitchenU, password: strongPw() }
  };
  // extra staff beyond the 4 defaults (created via accountService on --apply)
  const extraStaff = [
    ...(cfg.managers || []).slice(1).map(u => ({ username: u, role: 'manager', password: strongPw() })),
    ...(cfg.waiters || []).slice(1).map(u => ({ username: u, role: 'waiter', password: strongPw() }))
  ];

  const envLines = {
    TRUMP_APP_NAME: appName,
    TRUMP_VAT_RATE: String(vat),
    TRUMP_SERVICE_RATE: String(service),
    TRUMP_OWNER_USER: creds.owner.username, TRUMP_OWNER_PASS: creds.owner.password,
    TRUMP_MANAGER_USER: creds.manager.username, TRUMP_MANAGER_PASS: creds.manager.password,
    TRUMP_WAITER_USER: creds.waiter.username, TRUMP_WAITER_PASS: creds.waiter.password,
    TRUMP_KITCHEN_PASS: creds.kitchen.password
  };

  // --- plan ---
  console.log(`\n=== Restaurant Setup — ${cfg.name} ===`);
  console.log(`  app name      : ${appName}`);
  console.log(`  VAT / service : ${(vat * 100).toFixed(1)}% / ${(service * 100).toFixed(1)}%`);
  console.log(`  tables        : ${tables} (table1…table${tables})`);
  console.log(`  default roles : owner=${creds.owner.username}, manager=${creds.manager.username}, waiter=${creds.waiter.username}, kitchen=${kitchenU}`);
  console.log(`  extra staff   : ${extraStaff.length} (${extraStaff.map(s => s.username + ':' + s.role).join(', ') || 'none'})`);
  console.log('\n  -- generated credentials (hand to staff privately; shown ONCE) --');
  Object.entries(creds).forEach(([role, c]) => console.log(`     ${role.padEnd(8)} ${c.username.padEnd(12)} ${c.password}`));
  extraStaff.forEach(s => console.log(`     ${s.role.padEnd(8)} ${s.username.padEnd(12)} ${s.password}`));

  if (!APPLY) {
    console.log(`\n  (dry-run — re-run with --apply to write env (${path.relative(ROOT, envFile)}) + create tables + extra staff.)`);
    console.log('  After --apply: review the env file, merge into Trump/.env, restart, then npm run auth:audit.\n');
    return;
  }

  // --- apply ---
  // 1. env file (does not overwrite .env directly — operator merges + reviews)
  const envText = Object.entries(envLines).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(envFile, envText);
  console.log(`\n  ✓ env written → ${path.relative(ROOT, envFile)} (merge into Trump/.env after review)`);

  // 2. create tables
  try {
    const { getPrisma } = require(path.join(ROOT, 'server', 'services', 'prismaClient'));
    const p = getPrisma();
    const rid = process.env.TRUMP_RESTAURANT_ID || 'trump';
    let created = 0;
    for (let n = 1; n <= tables; n++) {
      const tableId = `table${n}`;
      await p.table.upsert({ where: { restaurantId_tableId: { restaurantId: rid, tableId } }, update: {}, create: { tableId, displayName: `Table ${n}` } });
      created++;
    }
    console.log(`  ✓ ${created} tables ensured (table1…table${tables})`);

    // 3. extra staff via the account service (the 4 default roles seed from env on boot)
    if (extraStaff.length) {
      const { createConfig } = require(path.join(ROOT, 'server', 'utils', 'helpers'));
      const { AccountService } = require(path.join(ROOT, 'server', 'services', 'accountService'));
      const config = createConfig(process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump');
      const acct = new AccountService(config);
      if (acct.ensureReady) await acct.ensureReady();
      let made = 0;
      for (const s of extraStaff) {
        try { await acct.createAccount({ username: s.username, password: s.password, role: s.role }, { username: creds.owner.username, role: 'owner' }); made++; }
        catch (e) { console.log(`     ! could not create ${s.username}: ${e.message}`); }
      }
      console.log(`  ✓ ${made}/${extraStaff.length} extra staff accounts created`);
    }
    await p.$disconnect();
  } catch (e) { console.error('  ✗ apply (DB) failed:', e.message); process.exit(1); }

  console.log('\n  NEXT: merge the env file into Trump/.env → restart → npm run auth:audit (0 weak) →');
  console.log('        node scripts/qr-generate.js --tables 1-' + tables + ' --base <prod>/Trump --verify\n');
}
main().catch(e => { console.error('setup-wizard failed:', e.message); process.exit(1); });
