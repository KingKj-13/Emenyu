#!/usr/bin/env node
'use strict';
// Phase 09 (FRP1) — Media optimizer + coverage validation. Uses ffmpeg (no native
// image lib needed) to resize images, convert to WebP, compress videos, and make
// thumbnails — NON-DESTRUCTIVELY (writes to an `optimized/` subfolder; never touches
// originals). Default action is a COVERAGE REPORT (what exists, what's oversized).
//
//   node scripts/media-optimize.js                      # coverage report only (this tenant)
//   node scripts/media-optimize.js --optimize           # + optimize images & videos
//   node scripts/media-optimize.js --optimize --limit 5 # optimize first 5 of each (sample)
//   node scripts/media-optimize.js --dir ../../Carmella --optimize --restaurant-id carmella
//                                                        # run against another tenant's
//                                                        # Images/Video dirs (--dir is
//                                                        # relative to this scripts/ folder)
//                                                        # — same tool, no per-tenant
//                                                        # duplicate script.
//
// Requires ffmpeg on PATH.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dirFlagIndex = process.argv.indexOf('--dir');
const ROOT = dirFlagIndex > -1
  ? path.resolve(__dirname, process.argv[dirFlagIndex + 1])
  : path.resolve(__dirname, '..');
const restaurantIdFlagIndex = process.argv.indexOf('--restaurant-id');
const RESTAURANT_ID = restaurantIdFlagIndex > -1
  ? process.argv[restaurantIdFlagIndex + 1]
  : (process.env.TRUMP_RESTAURANT_ID || 'trump');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
const IMG = path.join(ROOT, 'Images');
const VID = path.join(ROOT, 'Video');
const IMG_MAX_W = 1200, THUMB_W = 300, IMG_WARN_BYTES = 500 * 1024, VIDEO_CRF = 28;
const OPTIMIZE = process.argv.includes('--optimize');
const limit = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? parseInt(process.argv[i + 1], 10) : Infinity; })();

function ffmpegAvailable() { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } }
function list(dir, exts) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => exts.test(f)).map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size })) : []; }
const mb = (b) => (b / 1048576).toFixed(2) + 'MB';

function coverage() {
  const images = list(IMG, /\.(jpe?g|png|webp)$/i);
  const videos = list(VID, /\.(mp4|webm|mov)$/i);
  const oversized = images.filter(i => i.size > IMG_WARN_BYTES).sort((a, b) => b.size - a.size);
  console.log('\n=== Media Coverage ===');
  console.log(`  images : ${images.length} files, ${mb(images.reduce((a, i) => a + i.size, 0))} total, avg ${images.length ? mb(images.reduce((a, i) => a + i.size, 0) / images.length) : '0'}`);
  console.log(`  videos : ${videos.length} files, ${mb(videos.reduce((a, v) => a + v.size, 0))} total`);
  console.log(`  oversized images (> ${mb(IMG_WARN_BYTES)}): ${oversized.length}`);
  oversized.slice(0, 8).forEach(i => console.log(`     ! ${i.name}  ${mb(i.size)}`));
  return { images, videos, oversized };
}

async function menuMediaCheck() {
  // Validate every menu item resolves to SOME usable image (explicit or fallback).
  // The Prisma client always lives under Trump's own server/ tree regardless of
  // which tenant's Images/Video dir this run is pointed at (--dir).
  try {
    const { getPrisma } = require(path.resolve(__dirname, '..', 'server', 'services', 'prismaClient'));
    const items = await getPrisma().menuItem.findMany({ where: { restaurantId: RESTAURANT_ID }, select: { name: true, imagePath: true } });
    const haveFallback = fs.existsSync(path.join(IMG, 'Tomahawk.jpg'));
    const explicitCount = items.filter(i => i.imagePath).length;
    console.log(`  menu items : ${items.length} (restaurantId=${RESTAURANT_ID}); ${explicitCount} with an explicit imagePath; fallback present: ${haveFallback ? 'yes (Tomahawk.jpg)' : 'no (tenant relies on explicit imagePath / its own resolver fallback)'}`);
    await getPrisma().$disconnect();
  } catch (e) { console.log(`  menu items : (DB unavailable — ${e.message})`); }
}

function optimizeImages(images) {
  const outDir = path.join(IMG, 'optimized'); const thumbDir = path.join(IMG, 'thumbnails');
  fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(thumbDir, { recursive: true });
  let before = 0, after = 0, done = 0;
  for (const img of images.slice(0, limit)) {
    const src = path.join(IMG, img.name); const stem = img.name.replace(/\.[^.]+$/, '');
    const webp = path.join(outDir, `${stem}.webp`); const thumb = path.join(thumbDir, `${stem}.webp`);
    try {
      execFileSync('ffmpeg', ['-y', '-i', src, '-vf', `scale='min(${IMG_MAX_W},iw)':-1`, '-q:v', '80', webp], { stdio: 'ignore' });
      execFileSync('ffmpeg', ['-y', '-i', src, '-vf', `scale=${THUMB_W}:-1`, '-q:v', '75', thumb], { stdio: 'ignore' });
      before += img.size; after += fs.statSync(webp).size; done++;
    } catch (e) { console.log(`     ✗ ${img.name}: ${e.message.split('\n')[0]}`); }
  }
  console.log(`  images optimized: ${done} → ${path.relative(ROOT, outDir)} (+ thumbnails). ${mb(before)} → ${mb(after)} (${before ? Math.round((1 - after / before) * 100) : 0}% smaller)`);
}

function optimizeVideos(videos) {
  const outDir = path.join(VID, 'optimized'); const posterDir = path.join(VID, 'posters');
  fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(posterDir, { recursive: true });
  let before = 0, after = 0, done = 0;
  for (const v of videos.slice(0, limit)) {
    const src = path.join(VID, v.name); const stem = v.name.replace(/\.[^.]+$/, '');
    const out = path.join(outDir, `${stem}.mp4`); const poster = path.join(posterDir, `${stem}.jpg`);
    try {
      execFileSync('ffmpeg', ['-y', '-i', src, '-vcodec', 'libx264', '-crf', String(VIDEO_CRF), '-preset', 'fast', '-acodec', 'aac', '-movflags', '+faststart', out], { stdio: 'ignore' });
      execFileSync('ffmpeg', ['-y', '-ss', '00:00:01', '-i', src, '-vframes', '1', '-q:v', '3', poster], { stdio: 'ignore' });
      before += v.size; after += fs.statSync(out).size; done++;
    } catch (e) { console.log(`     ✗ ${v.name}: ${e.message.split('\n')[0]}`); }
  }
  console.log(`  videos optimized: ${done} → ${path.relative(ROOT, outDir)} (+ posters). ${mb(before)} → ${mb(after)} (${before ? Math.round((1 - after / before) * 100) : 0}% smaller)`);
}

async function main() {
  const cov = coverage();
  await menuMediaCheck();
  if (!OPTIMIZE) { console.log('\n  (coverage only — re-run with --optimize to produce WebP/thumbnails/compressed video, non-destructively.)\n'); return; }
  if (!ffmpegAvailable()) { console.error('\n  ✗ ffmpeg not found on PATH — install it to optimize. (Coverage above is still valid.)\n'); process.exit(1); }
  console.log('\n  optimizing (non-destructive → optimized/ + thumbnails/ + posters/)…');
  optimizeImages(cov.images);
  optimizeVideos(cov.videos);
  console.log('\n  done. Originals untouched; review the optimized/ outputs before swapping in.\n');
}
main().catch(e => { console.error('media-optimize failed:', e.message); process.exit(1); });
