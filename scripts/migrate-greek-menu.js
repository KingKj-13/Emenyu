#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

// Load root .env before anything else
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaMenuService } = require('../shared/prismaMenuService');

const FOOD_DIR = path.join(__dirname, '..', 'Sites', 'Greek', 'food');

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  console.log('🍽️  Greek menu migration → PostgreSQL');

  const menuData = readJson(path.join(FOOD_DIR, 'MythosMenu.json'));
  if (!menuData || Object.keys(menuData).length === 0) {
    console.error('❌ MythosMenu.json is empty or missing. Aborting.');
    process.exit(1);
  }

  const recommendations = readJson(path.join(FOOD_DIR, 'recommendations.json')) || [];
  const popular = readJson(path.join(FOOD_DIR, 'popular.json')) || [];

  const service = new PrismaMenuService({ restaurantId: 'greek' });

  const alreadyHasData = await service.hasMenuData();
  if (alreadyHasData) {
    console.log('⚠️  Greek already has menu data in PostgreSQL. Re-migrating (overwrite)...');
  }

  const summary = await service.migrateFromJson({ menuData, recommendations, popular });

  if (summary.unavailable) {
    console.error('❌ PostgreSQL unavailable. Check DATABASE_URL in .env');
    process.exit(1);
  }

  console.log(`✅ Greek migration complete:`);
  console.log(`   Categories : ${summary.categories}`);
  console.log(`   Items      : ${summary.items}`);
  console.log(`   Recs       : ${summary.recommendations}`);
  console.log(`   Popular    : ${summary.popular}`);

  await service.close();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
