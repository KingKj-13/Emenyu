#!/usr/bin/env node
'use strict';
// Remove all seeded DEMO orders (Phase 2). Matches the seed marker — filename
// prefix 'demo_seed_' — and is tenant-scoped. OrderItems / status history cascade.
// This is the go-live cleanup referenced by the Phase 5 runbook.
//
//   node scripts/purge-demo-orders.js           # show how many demo orders exist (no delete)
//   node scripts/purge-demo-orders.js --apply    # delete them

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
// Local dev override: .env.local (gitignored) repoints DATABASE_URL at the local
// database so build/test work never touches prod. No-op in production (no file).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const APPLY = process.argv.includes('--apply');
const DEMO_PREFIX = 'demo_seed_';

async function main() {
  const prisma = getPrisma();
  const where = { restaurantId: RESTAURANT_ID, filename: { startsWith: DEMO_PREFIX } };
  const count = await prisma.order.count({ where });
  console.log(`demo orders (restaurantId='${RESTAURANT_ID}', filename^='${DEMO_PREFIX}'): ${count}`);
  if (!APPLY) {
    console.log(count ? 'run with --apply to delete them.' : 'nothing to purge.');
  } else if (count) {
    const removed = await prisma.order.deleteMany({ where });
    console.log(`deleted ${removed.count} demo order(s) (items + history cascaded).`);
  } else {
    console.log('nothing to purge.');
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error('purge failed:', e.message); process.exit(1); });
