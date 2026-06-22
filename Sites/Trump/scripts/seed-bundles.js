#!/usr/bin/env node
'use strict';
// Seed / update recommended-order bundles (Phase 5, Task 1). Moves the persona meal
// bundles out of the hardcoded client constant into the database (and a JSON fallback).
//
//   node scripts/seed-bundles.js            # dry run (preview)
//   node scripts/seed-bundles.js --json      # write the JSON fallback only (no DB) — for dev
//   node scripts/seed-bundles.js --apply     # upsert into Postgres (idempotent; needs DB)
//   node scripts/seed-bundles.js --clear     # remove seed-created bundles from Postgres
//
// The DB rows are the production source of truth; the JSON file
// (data/recommendation-bundles.json) is the offline fallback the bundle service reads
// when Postgres is unavailable. The client falls back to its bundled constant only when
// neither is present.

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const JSON_PATH = path.join(__dirname, '..', 'data', 'recommendation-bundles.json');
const APPLY = process.argv.includes('--apply');
const CLEAR = process.argv.includes('--clear');
const JSON_ONLY = process.argv.includes('--json');

// Ported verbatim from client/src/constants/recommendedOrders.ts.
const BUNDLES = [
  { slug: 'sushi', persona: 'The Sushi Lover', icon: '🍱', description: 'Fresh, delicate and made to share.', accent: '#4d7f82', priority: 100,
    items: [ { course: 'Drink', itemName: 'COSMOPOLITAN', price: 145 }, { course: 'Starter', itemName: 'CRISPY RICE', price: 195 }, { course: 'Main', itemName: 'CALIFORNIA ROLL - SALMON (8pc)', price: 189 }, { course: 'Dessert', itemName: 'DUO OF ICE CREAM', price: 99 } ] },
  { slug: 'steak', persona: 'The Steak Lover', icon: '🥩', description: 'Flame-grilled, dry-aged, unapologetic.', accent: '#a52b2d', priority: 100,
    items: [ { course: 'Drink', itemName: 'TRUMPS', price: 225 }, { course: 'Starter', itemName: 'BEEF BILTONG', price: 155 }, { course: 'Main', itemName: 'RIBEYE 380g', price: 369 }, { course: 'Dessert', itemName: 'DEATH BY CHOCOLATE CAKE', price: 119 } ] },
  { slug: 'fish', persona: 'The Fish Lover', icon: '🐟', description: 'From the coast, line to plate.', accent: '#3a6e8f', priority: 100,
    items: [ { course: 'Drink', itemName: 'MOJITO', price: 145 }, { course: 'Starter', itemName: 'FALKLANDS CALAMARI', price: 285 }, { course: 'Main', itemName: 'KINGKLIP FILLET', price: 365 }, { course: 'Dessert', itemName: 'CAPE MALVA PUDDING', price: 115 } ] },
  { slug: 'veg', persona: 'The Vegetarian', icon: '🥦', description: 'Garden-forward and full of colour.', accent: '#5c7a4f', priority: 100,
    items: [ { course: 'Drink', itemName: 'MARGARITA', price: 145 }, { course: 'Starter', itemName: 'CAPRESE & AVOCADO SALAD', price: 149 }, { course: 'Main', itemName: 'VEG PLATTER', price: 255 }, { course: 'Dessert', itemName: 'TRIO OF ICE CREAM', price: 119 } ] },
  { slug: 'pasta', persona: 'The Pasta Lover', icon: '🍝', description: 'Comfort, twirled to perfection.', accent: '#b5651d', priority: 100,
    items: [ { course: 'Drink', itemName: 'PINA COLADA', price: 145 }, { course: 'Starter', itemName: 'CHICKEN TRINCHADO', price: 125 }, { course: 'Main', itemName: 'BEEF FILLET PASTA', price: 289 }, { course: 'Dessert', itemName: 'RED VELVET CAKE', price: 115 } ] }
];

function jsonShape() {
  return BUNDLES.map((b, i) => ({
    id: i + 1, slug: b.slug, persona: b.persona, icon: b.icon, description: b.description,
    accent: b.accent, active: true, priority: b.priority, sortOrder: i, rotationGroup: '',
    items: b.items.map((it, idx) => ({ course: it.course, itemName: it.itemName, itemId: null, price: it.price, sortOrder: idx }))
  }));
}

function writeJsonFallback() {
  fs.writeFileSync(JSON_PATH, JSON.stringify(jsonShape(), null, 2), 'utf8');
  console.log(`Wrote JSON fallback: ${JSON_PATH} (${BUNDLES.length} bundles).`);
}

async function main() {
  console.log(`Prepared ${BUNDLES.length} persona bundles (${BUNDLES.reduce((n, b) => n + b.items.length, 0)} items).`);

  if (JSON_ONLY) { writeJsonFallback(); process.exit(0); }

  if (!APPLY && !CLEAR) {
    console.log('\nDry run. Use --json to write the dev fallback, or --apply to upsert into Postgres.');
    process.exit(0);
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    if (CLEAR) {
      const res = await prisma.recommendationBundle.deleteMany({ where: { restaurantId: RESTAURANT_ID, createdBy: 'seed' } });
      console.log(`Removed ${res.count} seed-created bundles.`);
    } else {
      // Idempotent: drop prior seed rows (cascade removes their items) then recreate.
      await prisma.recommendationBundle.deleteMany({ where: { restaurantId: RESTAURANT_ID, createdBy: 'seed' } });
      for (const [i, b] of BUNDLES.entries()) {
        await prisma.recommendationBundle.create({
          data: {
            restaurantId: RESTAURANT_ID, createdBy: 'seed', slug: b.slug, persona: b.persona,
            icon: b.icon, description: b.description, accent: b.accent, priority: b.priority,
            sortOrder: i, active: true,
            items: { create: b.items.map((it, idx) => ({ course: it.course, itemName: it.itemName, price: it.price, sortOrder: idx })) }
          }
        });
      }
      const total = await prisma.recommendationBundle.count({ where: { restaurantId: RESTAURANT_ID } });
      console.log(`Upserted ${BUNDLES.length} bundles. Table now holds ${total}.`);
      writeJsonFallback();
    }
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed (is the database reachable?):', error.message);
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    process.exit(2);
  }
}

main();
