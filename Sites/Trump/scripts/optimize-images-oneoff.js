#!/usr/bin/env node
'use strict';
/**
 * One-off menu image optimization (Phase: media performance).
 *
 * The 2026-07 menu rework landed ~439 full-resolution photos (many 8–15 MB,
 * several are PNG data with a .jpg extension) served as-is — the cause of the
 * slow menu. This script rewrites the Images/ set into web-weight assets:
 *
 *   Images/_originals/<name>      ← original moved here untouched (backup)
 *   Images/<stem>.jpg             ← real JPEG, ≤1600px wide, q80 (same URL keeps working)
 *   Images/<stem>.webp            ← WebP, ≤1600px wide, q80 (DB imagePath moves here)
 *   Images/thumbnails/<stem>.webp ← WebP, 300px wide, q75 (menu-card grid)
 *
 * Output basenames are LOWERCASED to match the DB convention (all 439
 * MenuItem.imagePath values are lowercase; Windows hides case mismatches that
 * would 404 on the Linux box). Idempotent: re-runs source from _originals/.
 *
 * Usage: node scripts/optimize-images-oneoff.js [--dry-run] [--limit N]
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = path.resolve(__dirname, '..', 'Images');
const ORIGINALS_DIR = path.join(IMAGES_DIR, '_originals');
const THUMBS_DIR = path.join(IMAGES_DIR, 'thumbnails');

const FULL_WIDTH = 1600;
const THUMB_WIDTH = 300;
const JPEG_QUALITY = 80;
const WEBP_QUALITY = 80;
const THUMB_QUALITY = 75;
const CONCURRENCY = 4;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const dryRun = process.argv.includes('--dry-run');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : Infinity;

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function optimizeOne(sourcePath, stemLower) {
  const jpgOut = path.join(IMAGES_DIR, `${stemLower}.jpg`);
  const webpOut = path.join(IMAGES_DIR, `${stemLower}.webp`);
  const thumbOut = path.join(THUMBS_DIR, `${stemLower}.webp`);

  // failOn:'none' tolerates minor corruption; rotate() bakes EXIF orientation;
  // flatten guards against alpha channels (several "jpg" files are PNG data).
  const base = sharp(sourcePath, { failOn: 'none' }).rotate();

  await base
    .clone()
    .resize({ width: FULL_WIDTH, withoutEnlargement: true })
    .flatten({ background: '#111111' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(`${jpgOut}.tmp`);
  await base
    .clone()
    .resize({ width: FULL_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(`${webpOut}.tmp`);
  await base
    .clone()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toFile(`${thumbOut}.tmp`);

  // .tmp + rename = never a half-written file at the served path, and the
  // rename forces the lowercase name onto case-insensitive Windows.
  for (const out of [jpgOut, webpOut, thumbOut]) {
    if (fs.existsSync(out)) fs.unlinkSync(out);
    fs.renameSync(`${out}.tmp`, out);
  }

  return {
    jpg: fs.statSync(jpgOut).size,
    webp: fs.statSync(webpOut).size,
    thumb: fs.statSync(thumbOut).size
  };
}

async function main() {
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
  fs.mkdirSync(THUMBS_DIR, { recursive: true });

  // Worklist: root-level images not yet backed up, plus everything already in
  // _originals (idempotent re-run). Map: lowercase stem -> source path.
  const work = new Map();

  for (const entry of fs.readdirSync(ORIGINALS_DIR)) {
    const ext = path.extname(entry).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      work.set(path.basename(entry, ext).toLowerCase(), path.join(ORIGINALS_DIR, entry));
    }
  }

  for (const entry of fs.readdirSync(IMAGES_DIR)) {
    const full = path.join(IMAGES_DIR, entry);
    if (!fs.statSync(full).isFile()) continue;
    const ext = path.extname(entry).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    if (ext === '.webp') continue; // our own generated output on re-runs

    const stemLower = path.basename(entry, ext).toLowerCase();
    if (work.has(stemLower)) {
      // Original already backed up on a previous run; the root file is our
      // generated output — leave it, _originals stays the source of truth.
      continue;
    }

    const backupPath = path.join(ORIGINALS_DIR, entry);
    if (!dryRun) fs.renameSync(full, backupPath);
    work.set(stemLower, dryRun ? full : backupPath);
  }

  const entries = [...work.entries()].slice(0, limit);
  console.log(`${dryRun ? '[dry-run] ' : ''}optimizing ${entries.length} images (of ${work.size} found)`);
  if (dryRun) return;

  let done = 0;
  let failed = 0;
  let beforeTotal = 0;
  let jpgTotal = 0;
  let webpTotal = 0;
  let thumbTotal = 0;
  const failures = [];

  const queue = [...entries];
  async function worker() {
    while (queue.length) {
      const [stemLower, sourcePath] = queue.shift();
      try {
        const before = fs.statSync(sourcePath).size;
        const sizes = await optimizeOne(sourcePath, stemLower);
        beforeTotal += before;
        jpgTotal += sizes.jpg;
        webpTotal += sizes.webp;
        thumbTotal += sizes.thumb;
        done += 1;
        if (done % 50 === 0) console.log(`  ${done}/${entries.length}…`);
      } catch (error) {
        failed += 1;
        failures.push({ stem: stemLower, error: error.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log('\n=== Optimization summary ===');
  console.log(`  optimized : ${done}  failed: ${failed}`);
  console.log(`  originals : ${mb(beforeTotal)} (preserved in Images/_originals/)`);
  console.log(`  jpg set   : ${mb(jpgTotal)}  (avg ${mb(jpgTotal / Math.max(done, 1))})`);
  console.log(`  webp set  : ${mb(webpTotal)} (avg ${mb(webpTotal / Math.max(done, 1))})`);
  console.log(`  thumbnails: ${mb(thumbTotal)} (avg ${mb(thumbTotal / Math.max(done, 1))})`);
  for (const f of failures) console.log(`  FAILED: ${f.stem} — ${f.error}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
