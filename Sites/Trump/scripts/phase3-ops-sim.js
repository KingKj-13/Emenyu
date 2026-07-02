'use strict';
// Phase 03 — operational validation simulation. LOCAL DB ONLY (aborts otherwise).
// Exercises: 3 managers + 10 waiters + 50 tables + 100 customers/orders, shifts,
// table ownership (assign/transfer/takeover/reassign), notifications, owner ops,
// audit trail, and permissions. Verifies invariants, prints PASS/FAIL, cleans up.
//
//   DATABASE_URL="postgresql://...@localhost:5432/emenyu_local" node scripts/phase3-ops-sim.js

const path = require('path');

const DB = process.env.DATABASE_URL || '';
if (!/localhost|127\.0\.0\.1/.test(DB)) {
  console.error('ABORT: DATABASE_URL is not local —', DB.replace(/:[^:@/]+@/, ':****@'));
  process.exit(2);
}

const { createConfig } = require('../server/utils/helpers');
const { createLogger } = require('../server/utils/logger');
const { getPrisma } = require('../server/services/prismaClient');
const { AuditService } = require('../server/services/auditService');
const { ShiftService } = require('../server/services/shiftService');
const { TableOwnershipService } = require('../server/services/tableOwnershipService');
const { NotificationService } = require('../server/services/notificationService');
const { OperationsService } = require('../server/services/operationsService');
const { AccountService } = require('../server/services/accountService');

const config = createConfig(path.resolve(__dirname, '..'));
const logger = createLogger({ ...config, logging: { level: 'error' } });
const prisma = getPrisma();
const audit = new AuditService({ config, logger });
const notifications = new NotificationService({ config, logger, auditService: audit });
const shifts = new ShiftService({ config, logger, auditService: audit });
const ownership = new TableOwnershipService({ config, logger, auditService: audit, notificationService: notifications });
const ops = new OperationsService({ config, logger, shiftService: shifts, notificationService: notifications });
const accounts = new AccountService(config, { logger, auditService: audit });

const R = 'trump';
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } };

async function cleanup() {
  await prisma.order.deleteMany({ where: { restaurantId: R, filename: { startsWith: 'sim-order-' } } });
  await prisma.waiterAssignment.deleteMany({ where: { restaurantId: R, tableId: { startsWith: 'simT' } } });
  await prisma.shift.deleteMany({ where: { restaurantId: R, username: { startsWith: 'sim_' } } });
  await prisma.notification.deleteMany({ where: { restaurantId: R, OR: [{ recipientUser: { startsWith: 'sim_' } }, { tableId: { startsWith: 'simT' } }] } });
  await prisma.auditLog.deleteMany({ where: { restaurantId: R, OR: [{ actor: { startsWith: 'sim_' } }, { targetId: { startsWith: 'simT' } }, { targetId: { startsWith: 'sim_' } }] } });
  await prisma.table.deleteMany({ where: { restaurantId: R, tableId: { startsWith: 'simT' } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: 'sim_' } } });
  try { const all = await accounts.getAccounts(); await accounts.writeAccounts(all.filter(a => !String(a.username).startsWith('sim_'))); } catch { /* json fallback best-effort */ }
}

async function main() {
  console.log('=== Phase 03 ops simulation (LOCAL emenyu_local) ===');
  await cleanup();

  const owner = { username: 'owner', role: 'owner' };
  const mgrActor = { username: 'sim_m1', role: 'manager' };
  const managers = ['sim_m1', 'sim_m2', 'sim_m3'];
  const waiters = Array.from({ length: 10 }, (_, i) => `sim_w${i + 1}`);

  // 1 — staff: 3 managers + 10 waiters
  for (const m of managers) await accounts.createAccount(owner, { username: m, role: 'manager', password: 'SimPass12345', label: m });
  for (const w of waiters) await accounts.createAccount(owner, { username: w, role: 'waiter', password: 'SimPass12345', label: w });
  const list = await accounts.getAccounts();
  check('3 managers supported', list.filter(a => a.role === 'manager' && a.username.startsWith('sim_')).length === 3);
  check('10 waiters supported', list.filter(a => a.role === 'waiter' && a.username.startsWith('sim_')).length === 10);

  // 2 — permissions
  check('owner CANNOT manage owner', accounts.canManageRole(owner, 'owner') === false);
  check('owner CAN manage manager', accounts.canManageRole(owner, 'manager') === true);
  check('manager CANNOT manage manager', accounts.canManageRole(mgrActor, 'manager') === false);
  check('manager CAN manage waiter', accounts.canManageRole(mgrActor, 'waiter') === true);
  let denied = false;
  try { await accounts.createAccount(mgrActor, { username: 'sim_illegal', role: 'manager', password: 'SimPass12345' }); }
  catch (e) { denied = e.statusCode === 403; }
  check('manager creating manager -> 403', denied);

  // 3 — 50 tables
  for (let i = 1; i <= 50; i++) {
    await prisma.table.upsert({
      where: { restaurantId_tableId: { restaurantId: R, tableId: `simT${i}` } },
      update: {}, create: { restaurantId: R, tableId: `simT${i}`, displayName: `Sim ${i}`, status: 'active' }
    });
  }
  check('50 tables', (await prisma.table.count({ where: { restaurantId: R, tableId: { startsWith: 'simT' } } })) === 50);

  // 4 — shifts
  for (const w of waiters) await shifts.startShift(w, { role: 'waiter', startedBy: w });
  for (const m of managers) await shifts.startShift(m, { role: 'manager', startedBy: m });
  check('13 active shifts', (await shifts.listActiveShifts()).filter(s => s.username.startsWith('sim_')).length === 13);
  let dup = false;
  try { await shifts.startShift(waiters[0], { role: 'waiter' }); } catch (e) { dup = e.statusCode === 409; }
  check('double shift blocked (409)', dup);

  // 5 — assign 50 tables across 10 waiters
  for (let i = 1; i <= 50; i++) await ownership.assign(`simT${i}`, waiters[(i - 1) % 10], { assignedBy: waiters[(i - 1) % 10] });
  check('50 tables owned', (await ownership.listOwnership()).filter(a => a.tableId.startsWith('simT')).length === 50);
  check('simT1 owned by sim_w1', (await ownership.getOwner('simT1')).waiterName === 'sim_w1');

  // 6 — transfer
  await ownership.transfer('simT1', 'sim_w1', 'sim_w2', { reason: 'break' });
  check('transfer changed owner -> sim_w2', (await ownership.getOwner('simT1')).waiterName === 'sim_w2');
  check('ownership history >= 2 rows', (await ownership.getHistory('simT1')).length >= 2);
  let xfer = false;
  try { await ownership.transfer('simT1', 'sim_w9', 'sim_w3', { reason: 'x' }); } catch (e) { xfer = e.statusCode === 403; }
  check('non-owner transfer -> 403', xfer);

  // 7 — takeover
  await ownership.takeOver('simT2', 'sim_w5', { reason: 'owner away' });
  check('takeover changed owner -> sim_w5', (await ownership.getOwner('simT2')).waiterName === 'sim_w5');

  // 8 — manager reassign (reason required)
  await ownership.reassign('simT3', 'sim_w7', { actor: 'sim_m1', reason: 'load balance' });
  check('reassign changed owner -> sim_w7', (await ownership.getOwner('simT3')).waiterName === 'sim_w7');
  let noReason = false;
  try { await ownership.reassign('simT4', 'sim_w8', { actor: 'sim_m1' }); } catch (e) { noReason = e.statusCode === 400; }
  check('reassign without reason -> 400', noReason);

  // 9 — 100 orders
  for (let i = 1; i <= 100; i++) {
    await prisma.order.create({
      data: { restaurantId: R, filename: `sim-order-${i}`, tableId: `simT${(i % 50) + 1}`, waiterName: waiters[i % 10], status: 'completed', total: 50 + (i % 20) * 5, subtotal: 50, timestamp: new Date() }
    });
  }
  check('100 orders', (await prisma.order.count({ where: { restaurantId: R, filename: { startsWith: 'sim-order-' } } })) === 100);

  // 10 — end one shift, metrics computed
  const ended = await shifts.endShift('sim_w1', { endedBy: 'sim_w1', reason: 'end of shift' });
  check('shift end computes ordersHandled', ended.status === 'ended' && ended.ordersHandled > 0);
  check('shift end computes revenueHandled', ended.revenueHandled > 0);

  // 11 — notifications (owner/admin view = all)
  const unread = await notifications.unreadCount({ all: true });
  check('notifications raised on ownership change (unread>0)', unread > 0);
  const feed = await notifications.list({ all: true, limit: 50 });
  check('notification carries priority + timestamp', feed.length > 0 && feed[0].priority != null && feed[0].createdAt != null);
  if (feed[0]) {
    await notifications.markRead(feed[0].id, { actor: 'sim_m1' });
    check('markRead reduces unread by 1', (await notifications.unreadCount({ all: true })) === unread - 1);
  }
  await notifications.markAllRead({ all: true, actor: 'sim_m1' });
  check('markAllRead -> 0 unread', (await notifications.unreadCount({ all: true })) === 0);

  // 12 — owner operations snapshot
  const snap = await ops.snapshot();
  check('owner ops: 9 active waiters (10 started, 1 ended)', snap.activeWaiterCount === 9);
  check('owner ops: >=3 active managers', snap.activeManagerCount >= 3);
  check('owner ops: openTables >= 50', snap.openTables >= 50);
  check('owner ops: ordersToday >= 100', snap.ordersToday >= 100);
  check('owner ops: revenueToday > 0', snap.revenueToday > 0);
  check('owner ops: waiterPerformance populated', snap.waiterPerformance.length > 0);

  // 13 — suspend a waiter (audited)
  await accounts.updateAccount(owner, 'sim_w10', { status: 'suspended' });

  // 14 — audit trail completeness + immutability
  const rows = await audit.list({ limit: 1000 });
  const actions = new Set(rows.map(a => a.action));
  for (const a of ['shift.started', 'shift.ended', 'table.transfer', 'table.takeover', 'table.reassign', 'account.created', 'account.suspended', 'notification.acknowledged']) {
    check(`audit records: ${a}`, actions.has(a));
  }
  check('audit append-only (every row has createdAt, no updatedAt field)', rows.length > 0 && rows.every(r => r.createdAt && r.updatedAt === undefined));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SIM ERROR:', e && e.message ? e.message : e);
  try { await cleanup(); await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(2);
});
