// Deep analysis of mismatches
const fs = require('fs');
const path = require('path');

const MENU_ITEMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'menu-items.json'), 'utf8'));

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Build set of matched normalizedNames from dry-run
const matched = JSON.parse(fs.readFileSync(path.join(__dirname, 'matched-pairs.json'), 'utf8'));
const matchedNorms = new Set(matched.map(m => m.normalized));

// Unmatched DB items
const unmatchedItems = MENU_ITEMS.filter(i => !matchedNorms.has(i.normalizedName));

// Unmatched images  
const IMAGE_DIR = path.resolve(__dirname, '..', 'Sites', 'Trump', 'Images');
const imageFiles = fs.readdirSync(IMAGE_DIR).filter(f => {
  const ext = path.extname(f).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
});
const byNormalized = new Map();
for (const item of MENU_ITEMS) {
  const key = item.normalizedName;
  if (!byNormalized.has(key)) byNormalized.set(key, []);
  byNormalized.get(key).push(item);
}

const unmatchedImages = imageFiles.filter(f => {
  const ext = path.extname(f);
  const stem = path.basename(f, ext);
  const normalized = normalizeName(stem);
  return !(byNormalized.get(normalized) || []).length;
});

console.log('=== UNMATCHED ANALYSIS ===\n');
console.log('Unmatched DB items (no image):');
unmatchedItems.forEach(i => console.log(`  id=${i.id} name="${i.name}" norm="${i.normalizedName}"`));

console.log('\nUnmatched image files (no DB record):');
unmatchedImages.forEach(f => {
  const ext = path.extname(f);
  const stem = path.basename(f, ext);
  const normalized = normalizeName(stem);
  console.log(`  ${f} → norm="${normalized}"`);
});

// Check if there's a pattern: maybe & vs "and"
console.log('\n=== PATTERN ANALYSIS ===');
console.log('\nDB items with & in name:');
unmatchedItems
  .filter(i => i.name.includes('&'))
  .forEach(i => {
    const withAnd = i.normalizedName;  // already has & stripped  
    const nameWithAnd = i.name.replace(/&/g, 'AND');
    const normWithAnd = normalizeName(nameWithAnd);
    const hasMatch = unmatchedImages.some(f => {
      const ext = path.extname(f);
      const stem = path.basename(f, ext);
      return normalizeName(stem) === normWithAnd;
    });
    console.log(`  id=${i.id} "${i.name}" → norm="${withAnd}" withAnd="${normWithAnd}" fileMatch=${hasMatch}`);
  });

// Check numeric suffix items
console.log('\nDB items with numeric patterns:');
unmatchedItems
  .filter(i => /\d/.test(i.name))
  .forEach(i => console.log(`  id=${i.id} "${i.name}" → "${i.normalizedName}"`));
