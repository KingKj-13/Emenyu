// Post-upload verification script
// 1. Checks all DB records have imagePath pointing to existing files
// 2. Randomly samples 50+ URLs and verifies HTTP accessibility
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const PROJECT_ROOT = '/var/www/mysite/Emenyu';
process.env.DATABASE_URL = 'postgresql://postgres:emenyu123@127.0.0.1:5432/emenyu';
const { PrismaClient } = require(path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();

const IMAGES_DIR = path.join(PROJECT_ROOT, 'Trump', 'Images');
const BASE_URL = 'https://emenyu.com';

function checkUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      const contentType = res.headers['content-type'] || '';
      const isImage = contentType.startsWith('image/');
      const isOk = res.statusCode >= 200 && res.statusCode < 400;
      // Consume body to free resources
      res.resume();
      resolve({ 
        ok: isOk && isImage, 
        status: res.statusCode, 
        contentType,
        url 
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message, url }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout', url }); });
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  console.log('=== POST-UPLOAD VERIFICATION ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);
  
  // 1. Check all DB records
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: 'trump' },
    select: { id: true, name: true, imagePath: true },
    orderBy: { id: 'asc' }
  });
  
  console.log(`Total menu items: ${items.length}`);
  
  let withImage = 0;
  let withoutImage = 0;
  let fileExists = 0;
  let fileMissing = 0;
  const missingFiles = [];
  const noImage = [];
  
  for (const item of items) {
    if (!item.imagePath) {
      withoutImage++;
      noImage.push(item);
      continue;
    }
    withImage++;
    
    // Check if file exists on disk
    // imagePath is like "/Trump/Images/file.jpg"
    // disk path is "/var/www/mysite/Emenyu/Trump/Images/file.jpg"
    const diskPath = path.join(PROJECT_ROOT, item.imagePath.replace(/^\//, '').replace(/^Trump\//, 'Trump/'));
    if (fs.existsSync(diskPath)) {
      fileExists++;
    } else {
      fileMissing++;
      missingFiles.push({ id: item.id, name: item.name, imagePath: item.imagePath, diskPath });
    }
  }
  
  console.log(`Items with imagePath: ${withImage}`);
  console.log(`Items without imagePath: ${withoutImage}`);
  console.log(`Files exist on disk: ${fileExists}`);
  console.log(`Files missing on disk: ${fileMissing}`);
  
  if (noImage.length > 0) {
    console.log('\n--- ITEMS WITHOUT IMAGE ---');
    noImage.forEach(i => console.log(`  id=${i.id} "${i.name}"`));
  }
  
  if (missingFiles.length > 0) {
    console.log('\n--- MISSING FILES ---');
    missingFiles.forEach(m => console.log(`  id=${m.id} "${m.name}" → ${m.diskPath}`));
  }
  
  // 2. HTTP verification of random 60 images
  const withImageItems = items.filter(i => i.imagePath);
  const sampleSize = Math.min(60, withImageItems.length);
  const sample = shuffle(withImageItems).slice(0, sampleSize);
  
  console.log(`\n--- HTTP VERIFICATION (${sampleSize} random URLs) ---`);
  
  let httpOk = 0;
  let httpFail = 0;
  const httpFailures = [];
  
  for (let i = 0; i < sample.length; i++) {
    const item = sample[i];
    const url = `${BASE_URL}${item.imagePath}`;
    const result = await checkUrl(url);
    
    if (result.ok) {
      httpOk++;
    } else {
      httpFail++;
      httpFailures.push({ id: item.id, name: item.name, url, ...result });
      console.log(`  FAIL: id=${item.id} "${item.name}" → ${url} (status=${result.status || 'N/A'} error=${result.error || 'not image'})`);
    }
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log(`\nHTTP OK: ${httpOk}/${sampleSize}`);
  console.log(`HTTP FAIL: ${httpFail}/${sampleSize}`);
  
  if (httpFailures.length > 0) {
    console.log('\n--- HTTP FAILURES ---');
    httpFailures.forEach(f => console.log(`  id=${f.id} "${f.name}" → ${f.url}`));
  }
  
  // Summary
  console.log('\n========================================');
  console.log('       VERIFICATION SUMMARY');
  console.log('========================================');
  console.log(`DB items total:         ${items.length}`);
  console.log(`DB items with image:    ${withImage}`);
  console.log(`DB items no image:      ${withoutImage}`);
  console.log(`Files on disk:          ${fileExists}`);
  console.log(`Files missing:          ${fileMissing}`);
  console.log(`HTTP verified OK:       ${httpOk}/${sampleSize}`);
  console.log(`HTTP verified FAIL:     ${httpFail}/${sampleSize}`);
  console.log('========================================');
  
  const allOk = withoutImage === 0 && fileMissing === 0 && httpFail === 0;
  console.log(`\nOverall: ${allOk ? 'ALL CHECKS PASSED ✓' : 'ISSUES DETECTED ✗'}`);
  
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch(e => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
