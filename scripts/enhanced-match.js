// Enhanced matching analysis: handles &→and, accents, and ID-suffixed filenames
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.resolve(__dirname, '..', 'Sites', 'Trump', 'Images');
const MENU_ITEMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'menu-items.json'), 'utf8'));

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Normalize with & → AND replacement and accent normalization
function normalizeForMatch(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents (ë → e, é → e)
    .replace(/&/g, 'AND')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Build lookup maps
const byNormalized = new Map();     // original normalized (strip &)
const byNormalizedAnd = new Map();  // with & → AND
const byId = new Map();            // by DB id

for (const item of MENU_ITEMS) {
  const key1 = item.normalizedName;
  if (!byNormalized.has(key1)) byNormalized.set(key1, []);
  byNormalized.get(key1).push(item);
  
  const key2 = normalizeForMatch(item.name);
  if (!byNormalizedAnd.has(key2)) byNormalizedAnd.set(key2, []);
  byNormalizedAnd.get(key2).push(item);
  
  byId.set(item.id, item);
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
  matchMethod: { direct: 0, andReplace: 0, idSuffix: 0 },
};

for (const file of imageFiles) {
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  const normalized = normalizeName(stem);
  const normalizedAnd = normalizeForMatch(stem);
  
  // Strategy 1: Direct normalizedName match
  const directMatches = byNormalized.get(normalized) || [];
  if (directMatches.length === 1) {
    results.matched.push({ file, dbId: directMatches[0].id, dbName: directMatches[0].name, method: 'direct' });
    results.matchMethod.direct++;
    continue;
  }
  
  // Strategy 2: &→AND normalized match  
  const andMatches = byNormalizedAnd.get(normalizedAnd) || [];
  if (andMatches.length === 1) {
    results.matched.push({ file, dbId: andMatches[0].id, dbName: andMatches[0].name, method: 'and_replace' });
    results.matchMethod.andReplace++;
    continue;
  }
  
  // Strategy 3: If filename ends with _<number>, that number is the DB id
  // e.g., caprese_and_avocado_salad_19.jpg → id=19
  const idSuffixMatch = stem.match(/_(\d+)$/);
  if (idSuffixMatch) {
    const candidateId = parseInt(idSuffixMatch[1], 10);
    const item = byId.get(candidateId);
    if (item) {
      // Verify the stem without the suffix matches the item name
      const stemWithoutSuffix = stem.replace(/_\d+$/, '');
      const normalizedStem = normalizeForMatch(stemWithoutSuffix);
      const normalizedItem = normalizeForMatch(item.name);
      if (normalizedStem === normalizedItem) {
        results.matched.push({ file, dbId: item.id, dbName: item.name, method: 'id_suffix' });
        results.matchMethod.idSuffix++;
        continue;
      }
    }
  }
  
  results.noMatch.push({ file, normalized, normalizedAnd });
}

console.log('=== ENHANCED MATCHING RESULTS ===');
console.log(`Total images: ${results.totalImages}`);
console.log(`Total DB items: ${results.totalDbItems}`);
console.log(`Matched: ${results.matched.length}`);
console.log(`  - Direct normalization: ${results.matchMethod.direct}`);
console.log(`  - &→AND replacement: ${results.matchMethod.andReplace}`);
console.log(`  - ID suffix: ${results.matchMethod.idSuffix}`);
console.log(`No match: ${results.noMatch.length}`);

if (results.noMatch.length > 0) {
  console.log('\n--- STILL NO MATCH ---');
  results.noMatch.forEach(r => console.log(`  ${r.file} → norm="${r.normalized}" normAnd="${r.normalizedAnd}"`));
}

// Check for DB items that still have no image
const matchedIds = new Set(results.matched.map(m => m.dbId));
const unmatchedItems = MENU_ITEMS.filter(i => !matchedIds.has(i.id));
console.log(`\nDB items without matching image: ${unmatchedItems.length}`);
if (unmatchedItems.length > 0) {
  unmatchedItems.forEach(i => console.log(`  id=${i.id} name="${i.name}"`));
}

// Write final matched pairs
fs.writeFileSync(
  path.join(__dirname, 'matched-pairs-final.json'),
  JSON.stringify(results.matched, null, 2)
);
console.log(`\nWrote ${results.matched.length} matched pairs to scripts/matched-pairs-final.json`);
