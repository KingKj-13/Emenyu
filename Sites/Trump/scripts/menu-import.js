#!/usr/bin/env node
'use strict';
// Phase 09 (FRP1) — Menu import + validation. Reads a CSV of menu items, validates,
// detects duplicates + missing images + category problems, and prints a clear report.
// Emits a normalized menu JSON ready to load. DRY-RUN by default (no DB writes).
//
//   node scripts/menu-import.js menu.csv                 # validate + report (+ write menu.normalized.json)
//   node scripts/menu-import.js menu.csv --apply         # ALSO write to the menu (via the menu service)
//
// CSV columns (header row, case-insensitive): category, name, price, [description], [image], [subcategory]
// Excel: save the sheet as CSV first (UTF-8). (xlsx parsing needs the `xlsx` package.)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('usage: node scripts/menu-import.js <menu.csv> [--apply]'); process.exit(2); }

// --- minimal RFC4180-ish CSV parser (handles quotes, commas, CRLF) ---
function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function main() {
  const raw = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) { console.error('CSV has no data rows'); process.exit(2); }
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = (n) => header.indexOf(n);
  const need = ['category', 'name', 'price'];
  const missingCols = need.filter(n => col(n) < 0);
  if (missingCols.length) { console.error('CSV missing required columns: ' + missingCols.join(', ')); process.exit(2); }

  const errors = [], warnings = [];
  const items = [];
  const seen = new Set();             // category::name dup detection
  const categories = new Set();
  const imagesDir = path.join(ROOT, 'Images');
  const haveImages = fs.existsSync(imagesDir) ? new Set(fs.readdirSync(imagesDir).map(f => f.toLowerCase())) : new Set();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const ln = i + 1;
    const category = (r[col('category')] || '').trim();
    const sub = col('subcategory') >= 0 ? (r[col('subcategory')] || '').trim() : '';
    const name = (r[col('name')] || '').trim();
    const priceRaw = (r[col('price')] || '').trim();
    const description = col('description') >= 0 ? (r[col('description')] || '').trim() : '';
    const image = col('image') >= 0 ? (r[col('image')] || '').trim() : '';

    if (!category) errors.push(`row ${ln}: missing category`);
    if (!name) errors.push(`row ${ln}: missing name`);
    // Strip currency symbols + thousands separators, but a non-numeric value must
    // ERROR (not silently become 0) — e.g. "notaprice" is invalid, "R1,250.00" is 1250.
    const cleaned = priceRaw.replace(/[R$£€\s,]/g, '');
    const price = Number(cleaned);
    if (!priceRaw) errors.push(`row ${ln} (${name}): missing price`);
    else if (cleaned === '' || !Number.isFinite(price) || price < 0) errors.push(`row ${ln} (${name}): invalid price "${priceRaw}"`);

    if (category && name) {
      const key = `${category.toLowerCase()}::${name.toLowerCase()}`;
      if (seen.has(key)) warnings.push(`row ${ln}: DUPLICATE "${name}" in "${category}"`);
      seen.add(key);
    }
    if (category) categories.add(category);
    if (image && haveImages.size && !haveImages.has(image.toLowerCase())) warnings.push(`row ${ln} (${name}): image "${image}" not found in Images/`);
    if (!image) warnings.push(`row ${ln} (${name}): no image (will use keyword/category fallback)`);

    items.push({ category, subcategory: sub, name, price: Number.isFinite(price) ? price : 0, description, image, available: true });
  }

  // category sanity
  for (const c of categories) if (c.length > 40) warnings.push(`category "${c}" is unusually long`);

  // --- build normalized menu object (category → { items: [...] }) ---
  const menu = {};
  for (const it of items) {
    const root = it.category || 'Uncategorized';
    menu[root] = menu[root] || { visible: true, items: [] };
    const target = it.subcategory
      ? (menu[root][it.subcategory] = menu[root][it.subcategory] || { visible: true, items: [] })
      : menu[root];
    target.items.push({ name: it.name, price: it.price, description: it.description, image: it.image, available: it.available });
  }

  // --- report ---
  console.log(`\n=== Menu Import Report — ${path.basename(file)} ===`);
  console.log(`  rows parsed       : ${rows.length - 1}`);
  console.log(`  items valid       : ${items.length - new Set(errors.map(e => e.split(' ')[1])).size} / ${items.length}`);
  console.log(`  categories        : ${categories.size} (${[...categories].slice(0, 8).join(', ')}${categories.size > 8 ? '…' : ''})`);
  console.log(`  duplicates        : ${warnings.filter(w => /DUPLICATE/.test(w)).length}`);
  console.log(`  missing images    : ${warnings.filter(w => /no image|not found/.test(w)).length}`);
  console.log(`  ERRORS            : ${errors.length}`);
  console.log(`  warnings          : ${warnings.length}`);
  if (errors.length) { console.log('\n  -- ERRORS (must fix) --'); errors.slice(0, 30).forEach(e => console.log('   ✗ ' + e)); if (errors.length > 30) console.log(`   …and ${errors.length - 30} more`); }
  if (warnings.length) { console.log('\n  -- warnings --'); warnings.slice(0, 20).forEach(w => console.log('   ! ' + w)); if (warnings.length > 20) console.log(`   …and ${warnings.length - 20} more`); }

  const outPath = file.replace(/\.csv$/i, '') + '.normalized.json';
  fs.writeFileSync(outPath, JSON.stringify(menu, null, 2));
  console.log(`\n  normalized menu written → ${outPath}`);

  if (errors.length) { console.log('\n  RESULT: ✗ has ERRORS — fix and re-run before importing.\n'); process.exit(1); }
  console.log(`\n  RESULT: ✓ valid${warnings.length ? ' (with warnings)' : ''}.`);

  if (APPLY) {
    console.log('\n  --apply: writing to the menu via the menu service…');
    applyMenu(menu).then(() => { console.log('  ✓ menu saved.\n'); process.exit(0); }).catch(e => { console.error('  ✗ apply failed:', e.message); process.exit(1); });
  } else { console.log('  (dry-run — re-run with --apply to load it, or import the JSON via the owner console.)\n'); }
}

async function applyMenu(menu) {
  const { createConfig } = require(path.join(ROOT, 'server', 'utils', 'helpers'));
  const { FileService } = require(path.join(ROOT, 'server', 'services', 'fileService'));
  const config = createConfig(process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump');
  const fileService = new FileService(config);
  await fileService.saveMenu(menu);
}

main();
