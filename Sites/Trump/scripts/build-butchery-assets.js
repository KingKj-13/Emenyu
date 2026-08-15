/**
 * One-off asset pass for the butchery (cow cut selector) integration.
 *
 * Source:  "Test cow/assets/cow.png"  +  "Test cow/cuts/*.png"   (~22 MB of PNG)
 * Output:  Sites/Trump/client/public/butchery/*.webp             (~2 MB)
 *
 * The carcass plate is only ever drawn as a flat silhouette (the printed
 * butcher-chart treatment), so its RGB is discarded and replaced with a single
 * cream tone — only the alpha channel carries information. That compresses to
 * a fraction of the photoreal original with zero visible difference.
 *
 * Run:  node build-butchery-assets.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'D:/Projects/Emenyu/Test cow';
const OUT = 'D:/Projects/Emenyu/Sites/Trump/client/public/butchery';

// Matches --cow-hide in CowMeatSelector.module.css (Trump's paper-edge cream).
const HIDE = { r: 0xe9, g: 0xe0, b: 0xcf };

const CUTS = [
  'chuck', 'fillet', 'neck', 'rib', 'rump', 'shin',
  'silverside', 'sirloin', 'thickflank', 'thinflank', 'topside',
];

async function silhouette() {
  const src = path.join(SRC, 'assets', 'cow.png');
  const { width, height } = await sharp(src).metadata();
  // Keep the alpha channel; overwrite RGB with the flat hide tone.
  const alpha = await sharp(src).ensureAlpha().extractChannel(3).toBuffer();
  const flat = sharp({
    create: { width, height, channels: 3, background: HIDE },
  }).png();
  const out = await sharp(await flat.toBuffer())
    .joinChannel(alpha)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT, 'cow.webp'), out);
  return ['cow.webp', width, height, fs.statSync(src).size, out.length];
}

async function cut(name) {
  const src = path.join(SRC, 'cuts', `${name}.png`);
  const out = await sharp(src)
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, alphaQuality: 100, effort: 6 })
    .toBuffer();
  const dst = path.join(OUT, `${name}.webp`);
  fs.writeFileSync(dst, out);
  const m = await sharp(out).metadata();
  return [`${name}.webp`, m.width, m.height, fs.statSync(src).size, out.length];
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [await silhouette()];
  for (const c of CUTS) rows.push(await cut(c));
  let from = 0, to = 0;
  for (const [f, w, h, a, b] of rows) {
    from += a; to += b;
    console.log(
      f.padEnd(18), `${w}x${h}`.padEnd(11),
      (a / 1048576).toFixed(2) + ' MB', '->', (b / 1024).toFixed(0) + ' KB',
      `(${(100 - (b / a) * 100).toFixed(1)}% smaller)`
    );
  }
  console.log('\nTOTAL', (from / 1048576).toFixed(2) + ' MB', '->', (to / 1048576).toFixed(2) + ' MB');
})();
