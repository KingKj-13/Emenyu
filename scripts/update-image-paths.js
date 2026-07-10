// Production image path update script
// Updates ONLY the imagePath field for each MenuItem matching the pre-computed pairs
// Each update is committed individually for safety
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = '/var/www/mysite/Emenyu';
process.env.DATABASE_URL = 'postgresql://postgres:emenyu123@127.0.0.1:5432/emenyu';
const { PrismaClient } = require(path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();

const IMAGES_DIR = path.join(PROJECT_ROOT, 'Trump', 'Images');

async function main() {
  const pairs = JSON.parse(fs.readFileSync('/tmp/matched-pairs-final.json', 'utf8'));
  
  console.log(`Starting image path update for ${pairs.length} items...`);
  console.log(`Images directory: ${IMAGES_DIR}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('---');
  
  const results = {
    total: pairs.length,
    uploaded: 0,        // file exists on server
    linked: 0,          // DB updated successfully
    missingFile: [],     // file not found on server
    dbUpdateFailed: [],  // DB update failed
    verifyFailed: [],    // post-update verification failed
    noDbMatch: [],       // DB record not found (should not happen)
    multiDbMatch: [],    // multiple DB records (should not happen)
  };
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const { file, dbId, dbName } = pair;
    const imagePath = `/Trump/Images/${file}`;
    const serverFilePath = path.join(IMAGES_DIR, file);
    
    // 1. Verify image file exists on server
    if (!fs.existsSync(serverFilePath)) {
      console.log(`[${i+1}/${pairs.length}] SKIP (missing file): ${file}`);
      results.missingFile.push({ file, dbId, dbName });
      continue;
    }
    results.uploaded++;
    
    // 2. Verify exactly one DB record matches
    try {
      const existing = await prisma.menuItem.findUnique({
        where: { id: dbId },
        select: { id: true, name: true, imagePath: true, restaurantId: true }
      });
      
      if (!existing) {
        console.log(`[${i+1}/${pairs.length}] SKIP (no DB record): id=${dbId} "${dbName}"`);
        results.noDbMatch.push({ file, dbId, dbName });
        continue;
      }
      
      if (existing.restaurantId !== 'trump') {
        console.log(`[${i+1}/${pairs.length}] SKIP (wrong restaurant): id=${dbId} "${dbName}" restaurant=${existing.restaurantId}`);
        results.noDbMatch.push({ file, dbId, dbName, reason: 'wrong_restaurant' });
        continue;
      }
      
      // 3. Update ONLY the imagePath field
      await prisma.menuItem.update({
        where: { id: dbId },
        data: { imagePath: imagePath }
      });
      
      // 4. Post-update verification: re-read and confirm
      const updated = await prisma.menuItem.findUnique({
        where: { id: dbId },
        select: { id: true, imagePath: true }
      });
      
      if (updated.imagePath !== imagePath) {
        console.log(`[${i+1}/${pairs.length}] VERIFY FAIL: id=${dbId} expected="${imagePath}" got="${updated.imagePath}"`);
        results.verifyFailed.push({ file, dbId, dbName, expected: imagePath, got: updated.imagePath });
        continue;
      }
      
      results.linked++;
      if ((i + 1) % 50 === 0 || i === pairs.length - 1) {
        console.log(`[${i+1}/${pairs.length}] OK: id=${dbId} "${dbName}" → ${imagePath}`);
      }
      
    } catch (err) {
      console.log(`[${i+1}/${pairs.length}] DB ERROR: id=${dbId} "${dbName}" → ${err.message}`);
      results.dbUpdateFailed.push({ file, dbId, dbName, error: err.message });
    }
  }
  
  // Final report
  console.log('\n========================================');
  console.log('       PRODUCTION IMAGE UPLOAD REPORT');
  console.log('========================================');
  console.log(`Timestamp:              ${new Date().toISOString()}`);
  console.log(`Total images found:     ${results.total}`);
  console.log(`Files on server:        ${results.uploaded}`);
  console.log(`Successfully linked:    ${results.linked}`);
  console.log(`Missing files:          ${results.missingFile.length}`);
  console.log(`No DB match:            ${results.noDbMatch.length}`);
  console.log(`Multiple DB match:      ${results.multiDbMatch.length}`);
  console.log(`DB update failures:     ${results.dbUpdateFailed.length}`);
  console.log(`Verification failures:  ${results.verifyFailed.length}`);
  console.log('========================================');
  
  if (results.missingFile.length > 0) {
    console.log('\n--- MISSING FILES ---');
    results.missingFile.forEach(r => console.log(`  ${r.file} (id=${r.dbId})`));
  }
  if (results.noDbMatch.length > 0) {
    console.log('\n--- NO DB MATCH ---');
    results.noDbMatch.forEach(r => console.log(`  ${r.file} (id=${r.dbId})`));
  }
  if (results.dbUpdateFailed.length > 0) {
    console.log('\n--- DB UPDATE FAILURES ---');
    results.dbUpdateFailed.forEach(r => console.log(`  ${r.file} (id=${r.dbId}): ${r.error}`));
  }
  if (results.verifyFailed.length > 0) {
    console.log('\n--- VERIFICATION FAILURES ---');
    results.verifyFailed.forEach(r => console.log(`  ${r.file} (id=${r.dbId}): expected="${r.expected}" got="${r.got}"`));
  }
  
  // Write full results to file
  fs.writeFileSync('/tmp/upload-results.json', JSON.stringify(results, null, 2));
  console.log('\nFull results written to /tmp/upload-results.json');
  
  await prisma.$disconnect();
  
  // Exit with error code if there were any failures
  if (results.linked !== results.total) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
