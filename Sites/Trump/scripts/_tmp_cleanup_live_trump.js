#!/usr/bin/env node
'use strict';
// ONE-TIME, guarded cleanup of leftover dev/test data in the LIVE restaurantId='trump'
// tenant, ahead of the 2026-08-05 Michael Martin demo. Authorized step-by-step by the
// user. Order of operations matches the user's explicit instructions:
//   1. Backup + export everything first (JSON, restaurantId='trump' scoped).
//   2. Check FK dependents on the 13 junk Table rows; delete only what's safe.
//   3. Delete ALL Order rows for restaurantId='trump' (cascades OrderItem/
//      OrderStatusHistory/OrderRating) — this covers both "close/delete the 5 active
//      orders" and "delete the 18 demo_seed_ + 25 dev/qa orders" since together they
//      are the full set of 43 orders currently in the tenant.
//   4. RecommendationEvent rows are exported but NOT deleted (see report).
//   5. The 'waiter' utility Table row and table1..table29 are NEVER touched.
//
//   node scripts/_tmp_cleanup_live_trump.js              # DRY RUN (default) — no writes
//   node scripts/_tmp_cleanup_live_trump.js --apply      # perform backup + deletes

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const APPLY = process.argv.includes('--apply');
const STAMP = process.argv.find(a => a.startsWith('--stamp='))?.split('=')[1];
const JUNK_TABLE_IDS = [
  'uitestdiag', 'uitestdiag2', 'scena', 'scenb', 'scenc', 'scend', 'scene', 'scenf',
  'scena2', 'scene2', 'uistylecheck', 'uiglowcheck', 'table97'
];
const PROTECTED_TABLE_IDS = new Set(['waiter']); // synthetic fallback table used by recordWaiterAssignment — never delete

function jw(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  const prisma = getPrisma();
  const ts = STAMP || new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', 'backups', `demo_cleanup_${ts}`);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`=== ${APPLY ? 'APPLY' : 'DRY RUN'} — restaurantId='${RESTAURANT_ID}' — backup dir: ${dir}`);

  // ---- 1. Backup / export everything first (always runs, even in dry-run, so the
  //         export path can be handed over before any decision to delete is finalized).
  const tables = await prisma.table.findMany({ where: { restaurantId: RESTAURANT_ID } });
  const orders = await prisma.order.findMany({
    where: { restaurantId: RESTAURANT_ID },
    include: { items: true, statusHistory: true, rating: true }
  });
  const recoEvents = await prisma.recommendationEvent.findMany({ where: { restaurantId: RESTAURANT_ID } });
  const upsellEvents = await prisma.upsellEvent.findMany({ where: { restaurantId: RESTAURANT_ID } });
  const cartStates = await prisma.activeCartState.findMany({ where: { restaurantId: RESTAURANT_ID } });
  const waiterAssignments = await prisma.waiterAssignment.findMany({ where: { restaurantId: RESTAURANT_ID } });

  jw(path.join(dir, 'tables.json'), tables);
  jw(path.join(dir, 'orders.json'), orders);
  jw(path.join(dir, 'recommendation-events.json'), recoEvents);
  jw(path.join(dir, 'upsell-events.json'), upsellEvents);
  jw(path.join(dir, 'active-cart-state.json'), cartStates);
  jw(path.join(dir, 'waiter-assignments.json'), waiterAssignments);

  const manifest = {
    restaurantId: RESTAURANT_ID,
    createdAt: new Date().toISOString(),
    counts: {
      tables: tables.length,
      orders: orders.length,
      orderItems: orders.reduce((s, o) => s + o.items.length, 0),
      recommendationEvents: recoEvents.length,
      upsellEvents: upsellEvents.length,
      activeCartStates: cartStates.length,
      waiterAssignments: waiterAssignments.length
    }
  };
  jw(path.join(dir, 'manifest.json'), manifest);
  console.log('\n=== BACKUP MANIFEST ===');
  console.log(JSON.stringify(manifest, null, 2));

  // ---- 2. Inspect junk tables for FK dependents before deciding to delete
  console.log('\n=== JUNK TABLE DEPENDENCY CHECK ===');
  const deletableTableIds = [];
  for (const tid of JUNK_TABLE_IDS) {
    const [orderCount, cartCount, waCount] = await Promise.all([
      prisma.order.count({ where: { restaurantId: RESTAURANT_ID, tableId: tid } }),
      prisma.activeCartState.count({ where: { restaurantId: RESTAURANT_ID, tableId: tid } }),
      prisma.waiterAssignment.count({ where: { restaurantId: RESTAURANT_ID, tableId: tid } })
    ]);
    const safe = orderCount === 0 && cartCount === 0 && waCount === 0;
    console.log(`  ${tid.padEnd(14)} orders=${orderCount} cart=${cartCount} waiterAssignments=${waCount} -> ${safe ? 'SAFE TO DELETE' : 'HAS DEPENDENTS, SKIP'}`);
    if (safe) deletableTableIds.push(tid);
  }

  // ---- 3. Orders — full set (5 active + 38 history = 43) gets removed
  console.log(`\n=== ORDERS TO DELETE: ${orders.length} (all orders currently in tenant) ===`);
  console.log('  active:', orders.filter(o => o.status === 'active').length);
  console.log('  history:', orders.filter(o => o.status === 'history').length);

  console.log(`\n=== RECOMMENDATION EVENTS: ${recoEvents.length} — exported above, NOT scheduled for deletion (see report) ===`);

  if (!APPLY) {
    console.log('\nDRY RUN complete. Re-run with --apply to perform the backup-confirmed deletes.');
    await prisma.$disconnect();
    return;
  }

  // ---- APPLY: perform deletes in a transaction ----
  console.log('\n=== APPLYING DELETES ===');
  await prisma.$transaction(async tx => {
    const orderIds = orders.map(o => o.id);
    if (orderIds.length) {
      const delOrders = await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      console.log(`  deleted ${delOrders.count} order(s) (items/history/rating cascaded)`);
    }
    if (deletableTableIds.length) {
      const delTables = await tx.table.deleteMany({ where: { restaurantId: RESTAURANT_ID, tableId: { in: deletableTableIds } } });
      console.log(`  deleted ${delTables.count} junk table(s): ${deletableTableIds.join(', ')}`);
    }
  });

  const remainingTables = await prisma.table.findMany({ where: { restaurantId: RESTAURANT_ID }, select: { tableId: true } });
  const remainingOrders = await prisma.order.count({ where: { restaurantId: RESTAURANT_ID } });
  const remainingReco = await prisma.recommendationEvent.count({ where: { restaurantId: RESTAURANT_ID } });
  console.log('\n=== POST-CLEANUP STATE ===');
  console.log('  remaining tables:', remainingTables.map(t => t.tableId).join(', '));
  console.log('  remaining orders:', remainingOrders);
  console.log('  remaining recommendation events (untouched):', remainingReco);

  await prisma.$disconnect();
}

main().catch(e => { console.error('CLEANUP FAILED:', e); process.exit(1); });
