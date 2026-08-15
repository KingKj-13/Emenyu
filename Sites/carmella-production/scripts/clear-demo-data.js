#!/usr/bin/env node
'use strict';
// Removes ONLY the data seed-demo-data.js generated -- never touches real
// activity. Matches its tagging exactly: AnalyticsEvent rows with
// isDemo = true, and ActiveCartState/Table rows whose tableId starts with
// "demo-" (a prefix no real guest table ever uses -- real tables are
// table1, table21, etc.).
//
//   node scripts/clear-demo-data.js
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { getPrisma } = require('../server/services/prismaClient');

const RESTAURANT_ID = 'carmella-production';

async function main() {
  const prisma = getPrisma();
  console.log(`[clear-demo-data] connecting to ${RESTAURANT_ID}...`);

  const events = await prisma.analyticsEvent.deleteMany({ where: { restaurantId: RESTAURANT_ID, isDemo: true } });
  // ActiveCartState must go before Table (FK: ActiveCartState references Table).
  const carts = await prisma.activeCartState.deleteMany({ where: { restaurantId: RESTAURANT_ID, tableId: { startsWith: 'demo-' } } });
  const tables = await prisma.table.deleteMany({ where: { restaurantId: RESTAURANT_ID, tableId: { startsWith: 'demo-' } } });

  console.log(`[clear-demo-data] removed ${events.count} demo analytics events`);
  console.log(`[clear-demo-data] removed ${carts.count} demo cart states, ${tables.count} demo table rows`);
  console.log('[clear-demo-data] done. Real production data was never touched (filtered strictly by isDemo=true / tableId LIKE "demo-%").');
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('[clear-demo-data] failed:', err);
  process.exitCode = 1;
});
