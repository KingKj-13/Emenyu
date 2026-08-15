// Dry-run analysis: match image filenames to database menu items
// Uses normalizedName matching (exact, no fuzzy)
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.resolve(__dirname, '..', 'Sites', 'Trump', 'Images');
const MENU_ITEMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'menu-items.json'), 'utf8'));

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Build lookup: normalizedName → [items]
const byNormalized = new Map();
for (const item of MENU_ITEMS) {
  const key = item.normalizedName;
  if (!byNormalized.has(key)) byNormalized.set(key, []);
  byNormalized.get(key).push(item);
}

// Scan images
const imageFiles = fs.readdirSync(IMAGE_DIR).filter(f => {
  const ext = path.extname(f).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
});

const results = {
  totalImages: imageFiles.length,
  totalDbItems: MENU_ITEMS.length,
  matched: [],
  noMatch: [],
  duplicateMatch: [],
};

for (const file of imageFiles) {
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  const normalized = normalizeName(stem);
  
  const matches = byNormalized.get(normalized) || [];
  
  if (matches.length === 1) {
    results.matched.push({ file, dbId: matches[0].id, dbName: matches[0].name, normalized });
  } else if (matches.length === 0) {
    results.noMatch.push({ file, normalized });
  } else {
    results.duplicateMatch.push({ file, normalized, count: matches.length, items: matches.map(m => ({ id: m.id, name: m.name })) });
  }
}

console.log('=== DRY RUN ANALYSIS ===');
console.log(`Total images: ${results.totalImages}`);
console.log(`Total DB items: ${results.totalDbItems}`);
console.log(`Matched (1:1): ${results.matched.length}`);
console.log(`No DB match: ${results.noMatch.length}`);
console.log(`Duplicate DB match: ${results.duplicateMatch.length}`);

if (results.noMatch.length > 0) {
  console.log('\n--- NO MATCH (images without DB record) ---');
  results.noMatch.forEach(r => console.log(`  ${r.file} → normalized: "${r.normalized}"`));
}

if (results.duplicateMatch.length > 0) {
  console.log('\n--- DUPLICATE MATCH (multiple DB records) ---');
  results.duplicateMatch.forEach(r => {
    console.log(`  ${r.file} → ${r.count} matches:`);
    r.items.forEach(i => console.log(`    id=${i.id} name="${i.name}"`));
  });
}

// Items without an image match
const matchedNorms = new Set(results.matched.map(m => m.normalized));
const unmatchedItems = MENU_ITEMS.filter(i => !matchedNorms.has(i.normalizedName));
console.log(`\nDB items without matching image: ${unmatchedItems.length}`);
if (unmatchedItems.length > 0 && unmatchedItems.length <= 50) {
  unmatchedItems.forEach(i => console.log(`  id=${i.id} name="${i.name}" normalized="${i.normalizedName}"`));
}

// Write matched pairs to file for the upload script
fs.writeFileSync(
  path.join(__dirname, 'matched-pairs.json'),
  JSON.stringify(results.matched, null, 2)
);
console.log(`\nWrote ${results.matched.length} matched pairs to scripts/matched-pairs.json`);
