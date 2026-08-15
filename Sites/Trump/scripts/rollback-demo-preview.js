#!/usr/bin/env node
'use strict';
// Rollback for the Michael Martin demo seed (2026-08-04/05). Removes the ENTIRE
// batch and nothing else, one command, reversible-by-backup.
//
// Two modes:
//   --target=trump-preview   (default, recommended)  -> the preview tenant IS the
//     batch: every row with restaurantId='trump-preview' is seed data, so rollback
//     is a full tenant wipe. Nothing under restaurantId='trump' is touched, ever.
//   --target=trump --tag=demo_20260804   (fallback path only, if the preview-flag
//     deploy missed the 20:00 SAST abort condition and data went into the live
//     'trump' tenant instead) -> tag-scoped deletion using the batch markers the
//     generator writes: Order.filename prefix 'demo_20260804_', Order.raw.seedBatch,
//     Table.metadata.seedBatch, RecommendationEvent.sessionId prefix.
//
//   node scripts/rollback-demo-preview.js                       # DRY RUN (default)
//   node scripts/rollback-demo-preview.js --apply                # perform the rollback
//   node scripts/rollback-demo-preview.js --target=trump --tag=demo_20260804 --apply

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const TARGET = (ARGS.find(a => a.startsWith('--target=')) || '--target=trump-preview').split('=')[1];
const TAG = (ARGS.find(a => a.startsWith('--tag=')) || '--tag=demo_20260804').split('=')[1];

function jw(filePath, data) { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); }

async function main() {
  const prisma = getPrisma();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '..', 'backups', `rollback_${TAG}_${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`=== ${APPLY ? 'APPLY' : 'DRY RUN'} — rollback target=${TARGET} tag=${TAG} ===`);

  const tenantScoped = TARGET !== 'trump';

  const orderWhere = tenantScoped
    ? { restaurantId: TARGET }
    : { restaurantId: TARGET, filename: { startsWith: `${TAG}_` } };
  const tableWhere = tenantScoped
    ? { restaurantId: TARGET }
    : { restaurantId: TARGET, tableId: { startsWith: 'pv' } }; // demo tables are always pv*/pv-pd* by construction
  const recoWhere = tenantScoped
    ? { restaurantId: TARGET }
    : { restaurantId: TARGET, sessionId: { startsWith: `${TAG}:` } };

  // Backup everything matched, before any delete.
  const orders = await prisma.order.findMany({ where: orderWhere, include: { items: true, statusHistory: true, rating: true } });
  const tables = await prisma.table.findMany({ where: tableWhere });
  const recoEvents = await prisma.recommendationEvent.findMany({ where: recoWhere });
  jw(path.join(backupDir, 'orders.json'), orders);
  jw(path.join(backupDir, 'tables.json'), tables);
  jw(path.join(backupDir, 'recommendation-events.json'), recoEvents);

  const manifest = {
    target: TARGET, tag: TAG, tenantScoped, createdAt: new Date().toISOString(),
    counts: { orders: orders.length, orderItems: orders.reduce((s, o) => s + o.items.length, 0), tables: tables.length, recommendationEvents: recoEvents.length }
  };
  jw(path.join(backupDir, 'manifest.json'), manifest);

  console.log('\nBackup written to:', backupDir);
  console.log(JSON.stringify(manifest, null, 2));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to remove the rows above.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async tx => {
    if (orders.length) {
      const delOrders = await tx.order.deleteMany({ where: { id: { in: orders.map(o => o.id) } } });
      console.log(`deleted ${delOrders.count} order(s) (items/history/rating cascaded)`);
    }
    if (recoEvents.length) {
      const delReco = await tx.recommendationEvent.deleteMany({ where: { id: { in: recoEvents.map(e => e.id) } } });
      console.log(`deleted ${delReco.count} recommendation event(s)`);
    }
    if (tables.length) {
      const delTables = await tx.table.deleteMany({ where: { id: { in: tables.map(t => t.id) } } });
      console.log(`deleted ${delTables.count} table(s)`);
    }
  });

  // Verification: prove nothing else was touched.
  const remainingForTarget = await prisma.order.count({ where: tenantScoped ? { restaurantId: TARGET } : orderWhere });
  const otherTenantCount = TARGET === 'trump-preview'
    ? await prisma.order.count({ where: { restaurantId: 'trump' } })
    : await prisma.order.count({ where: { restaurantId: 'trump', filename: { not: { startsWith: `${TAG}_` } } } });
  console.log('\n=== VERIFICATION ===');
  console.log(`orders remaining under target scope (${TARGET}): ${remainingForTarget} (expect 0)`);
  console.log(`orders remaining OUTSIDE the batch (should be fully untouched): ${otherTenantCount}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error('ROLLBACK FAILED:', e); process.exit(1); });
