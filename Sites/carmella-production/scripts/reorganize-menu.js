#!/usr/bin/env node
'use strict';
// One-time reorganization: collapses the 8 existing top-level chapters down
// to 3 -- Mains, Desserts, Drinks -- by reparenting their existing sections,
// splitting "Coffee & Hot" into "Coffee" and "Tea", then deleting the now-
// empty old chapters. Item ids, prices, images, and all other item data are
// untouched -- this only moves which category each section's items sit
// under. Safe to re-run: if "Mains"/"Desserts"/"Drinks" already exist as
// top-level chapters, it reuses them instead of creating duplicates.
//
//   node scripts/reorganize-menu.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { getPrisma } = require('../server/services/prismaClient');
const RESTAURANT_ID = 'carmella-production';

const MAINS_SECTIONS = ['Breakfast', 'Starters', 'Salads', 'Pasta', 'Fish', 'Meat & Poultry', 'Side Dishes', "Khuli's Sandwiches", 'The Light Bites', 'The Platters'];
const DESSERTS_SECTIONS = ['The Desserts'];
const DRINKS_SECTIONS_KEEP = ['Champagne', 'Sparkling Wine', 'White Wine', 'Rosé Wine', 'Red Wine', 'Beers & Ciders', 'The Cocktails', 'The Virgin Cocktails', 'Cold Beverages', 'Squeezed Juices', 'Milkshakes', 'Smoothies', 'Crushers'];
const RENAME = { Liquor: 'Spirits' };

const COFFEE_ITEMS = ['Americano', 'Cappuccino', 'Espresso', 'Latte', 'Flat White', 'Café Mocha', 'Red Cappuccino', 'Cortado', 'Irish Coffee', 'Decaf', 'Almond Milk / Oat Milk'];
const TEA_ITEMS = ['Chai Latte', 'Dirty Chai', 'Tea', 'Coconut Matcha', "Jennifer's Vanilla Matcha", 'Hot Chocolate', 'Herbal Water', 'Ginger Shot'];

function slugify(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
}

async function ensureTopLevel(prisma, title, courseType, sortOrder) {
  const existing = await prisma.menuCategory.findFirst({ where: { restaurantId: RESTAURANT_ID, title, parentId: null } });
  if (existing) return existing;
  return prisma.menuCategory.create({
    data: {
      restaurantId: RESTAURANT_ID, title, slug: slugify(title),
      path: `${RESTAURANT_ID}/${slugify(title)}-${Date.now()}`,
      sortOrder, visible: true, courseType, metadata: { storage: 'object' }
    }
  });
}

async function moveSection(prisma, title, newParentId, sortOrder, renameTo) {
  const section = await prisma.menuCategory.findFirst({ where: { restaurantId: RESTAURANT_ID, title, parentId: { not: null } } });
  if (!section) { console.log(`  [skip] section not found: ${title}`); return; }
  await prisma.menuCategory.update({
    where: { id: section.id },
    data: { parentId: newParentId, sortOrder, ...(renameTo ? { title: renameTo, slug: slugify(renameTo) } : {}) }
  });
  console.log(`  moved "${title}"${renameTo ? ` -> renamed "${renameTo}"` : ''} under new parent`);
}

async function main() {
  const prisma = getPrisma();
  console.log(`[reorganize-menu] connecting to ${RESTAURANT_ID}...`);

  const mains = await ensureTopLevel(prisma, 'Mains', 'MAIN', 0);
  const desserts = await ensureTopLevel(prisma, 'Desserts', 'MAIN', 1);
  const drinks = await ensureTopLevel(prisma, 'Drinks', 'DRINK', 2);
  console.log(`Mains=${mains.id} Desserts=${desserts.id} Drinks=${drinks.id}`);

  console.log('Reparenting Mains sections...');
  for (let i = 0; i < MAINS_SECTIONS.length; i++) await moveSection(prisma, MAINS_SECTIONS[i], mains.id, i);

  console.log('Reparenting Desserts sections...');
  for (let i = 0; i < DESSERTS_SECTIONS.length; i++) await moveSection(prisma, DESSERTS_SECTIONS[i], desserts.id, i);

  console.log('Reparenting Drinks sections...');
  let drinkOrder = 0;
  for (const title of DRINKS_SECTIONS_KEEP) await moveSection(prisma, title, drinks.id, drinkOrder++);
  for (const [from, to] of Object.entries(RENAME)) await moveSection(prisma, from, drinks.id, drinkOrder++, to);

  // Split "Coffee & Hot" into "Coffee" and "Tea".
  const coffeeAndHot = await prisma.menuCategory.findFirst({ where: { restaurantId: RESTAURANT_ID, title: 'Coffee & Hot' }, include: { items: true } });
  if (coffeeAndHot) {
    const coffeeCat = await prisma.menuCategory.create({
      data: { restaurantId: RESTAURANT_ID, title: 'Coffee', slug: 'coffee', path: `${RESTAURANT_ID}/coffee-${Date.now()}`, parentId: drinks.id, sortOrder: drinkOrder++, visible: true, courseType: 'DRINK', metadata: { storage: 'object' } }
    });
    const teaCat = await prisma.menuCategory.create({
      data: { restaurantId: RESTAURANT_ID, title: 'Tea', slug: 'tea', path: `${RESTAURANT_ID}/tea-${Date.now()}`, parentId: drinks.id, sortOrder: drinkOrder++, visible: true, courseType: 'DRINK', metadata: { storage: 'object' } }
    });
    let moved = 0, unmatched = [];
    for (const item of coffeeAndHot.items) {
      if (COFFEE_ITEMS.includes(item.name)) { await prisma.menuItem.update({ where: { id: item.id }, data: { categoryId: coffeeCat.id } }); moved++; }
      else if (TEA_ITEMS.includes(item.name)) { await prisma.menuItem.update({ where: { id: item.id }, data: { categoryId: teaCat.id } }); moved++; }
      else { await prisma.menuItem.update({ where: { id: item.id }, data: { categoryId: coffeeCat.id } }); unmatched.push(item.name); moved++; }
    }
    await prisma.menuCategory.delete({ where: { id: coffeeAndHot.id } });
    console.log(`  split Coffee & Hot -> Coffee/Tea (${moved} items moved${unmatched.length ? `, unmatched fell back to Coffee: ${unmatched.join(', ')}` : ''})`);
  } else {
    console.log('  [skip] Coffee & Hot not found (already split?)');
  }

  // Delete old top-level chapters now that their children have moved --
  // only ones with zero remaining children, so this never silently drops
  // content if a section name didn't match above.
  const oldChapterTitles = ['The Morning Pages', 'The Global Table', 'The Companions', 'The Interludes', 'The Memory Course', "The Family's Toast", 'The Gaspard Cellar', 'Slow Drinks'];
  for (const title of oldChapterTitles) {
    const chapter = await prisma.menuCategory.findFirst({ where: { restaurantId: RESTAURANT_ID, title, parentId: null }, include: { _count: { select: { children: true, items: true } } } });
    if (!chapter) continue;
    if (chapter._count.children > 0 || chapter._count.items > 0) {
      console.log(`  [WARN] "${title}" still has ${chapter._count.children} children / ${chapter._count.items} direct items -- not deleting`);
      continue;
    }
    await prisma.menuCategory.delete({ where: { id: chapter.id } });
    console.log(`  deleted empty old chapter "${title}"`);
  }

  const finalTree = await prisma.menuCategory.findMany({ where: { restaurantId: RESTAURANT_ID, parentId: null }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { items: true, children: true } } } });
  console.log('\nFinal top-level chapters:');
  for (const c of finalTree) console.log(`  ${c.title} (${c._count.children} sections, ${c._count.items} direct items)`);

  const totalItems = await prisma.menuItem.count({ where: { restaurantId: RESTAURANT_ID } });
  console.log(`\nTotal menu items (should be unchanged): ${totalItems}`);

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('[reorganize-menu] failed:', err);
  process.exitCode = 1;
});
