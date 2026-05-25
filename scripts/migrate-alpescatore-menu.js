#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

// Load root .env before anything else
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaMenuService } = require('../shared/prismaMenuService');

const FOOD_DIR = path.join(__dirname, '..', 'Sites', 'AlPescatore', 'food');

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`  ⚠️  Could not read ${path.basename(filePath)}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('🐟  Al Pescatore menu migration → PostgreSQL');

  // Al Pescatore has 3 separate menu files — merge them exactly as the API does
  let combinedMenu = {};

  const food = readJson(path.join(FOOD_DIR, 'Al Pescatore Food.json'));
  if (food) combinedMenu = { ...combinedMenu, ...food };

  const wine = readJson(path.join(FOOD_DIR, 'Al Pescatore Wine.json'));
  if (wine) combinedMenu = { ...combinedMenu, ...wine };

  const cocktail = readJson(path.join(FOOD_DIR, 'Al Pescatore Coctail.json'));
  if (cocktail) combinedMenu = { ...combinedMenu, ...cocktail };

  if (Object.keys(combinedMenu).length === 0) {
    console.error('❌ All 3 menu files are empty or missing. Aborting.');
    process.exit(1);
  }

  console.log(`  Loaded ${Object.keys(combinedMenu).length} top-level categories from Food + Wine + Cocktail files`);

  const recommendations = readJson(path.join(FOOD_DIR, 'recommendations.json')) || [];
  const popular = readJson(path.join(FOOD_DIR, 'popular.json')) || [];

  const service = new PrismaMenuService({ restaurantId: 'al_pescatore' });

  const alreadyHasData = await service.hasMenuData();
  if (alreadyHasData) {
    console.log('⚠️  Al Pescatore already has menu data in PostgreSQL. Re-migrating (overwrite)...');
  }

  const summary = await service.migrateFromJson({ menuData: combinedMenu, recommendations, popular });

  if (summary.unavailable) {
    console.error('❌ PostgreSQL unavailable. Check DATABASE_URL in .env');
    process.exit(1);
  }

  console.log(`✅ Al Pescatore migration complete:`);
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
