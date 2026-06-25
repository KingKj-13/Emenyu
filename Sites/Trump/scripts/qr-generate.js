#!/usr/bin/env node
'use strict';
// Phase 09 (FRP1) — Production QR generator for table codes. Produces a high-res PNG
// and an SVG per table, plus a printable HTML sheet (open it and Print → Save as PDF).
// Optionally verifies that every QR URL resolves (200) before you print.
//
//   node scripts/qr-generate.js --tables 1-20 --base https://emenyu.com/Trump --out ./qr
//   node scripts/qr-generate.js --tables 1-20 --base https://emenyu.com/Trump --out ./qr --verify
//
// Requires the `qrcode` package:  npm i qrcode   (dev/ops dependency)
const fs = require('fs');
const path = require('path');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }
const flag = (n) => process.argv.includes('--' + n);

let QRCode;
try { QRCode = require('qrcode'); }
catch { console.error('Missing dependency. Install it first:\n   npm i qrcode\n(then re-run this command)'); process.exit(2); }

function parseTables(spec) {
  // "1-20" or "1,3,5" or "20"
  if (/^\d+-\d+$/.test(spec)) { const [a, b] = spec.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
  if (/,/.test(spec)) return spec.split(',').map(s => parseInt(s, 10)).filter(Boolean);
  return [parseInt(spec, 10)];
}

async function main() {
  const tablesSpec = arg('tables', '1-10');
  const base = (arg('base', process.env.TRUMP_PUBLIC_ORIGIN ? `${process.env.TRUMP_PUBLIC_ORIGIN}${process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump'}` : 'https://emenyu.com/Trump')).replace(/\/+$/, '');
  const outDir = path.resolve(arg('out', './qr'));
  const suffix = arg('suffix', ''); // e.g. "/menu" to point straight at the menu
  const nums = parseTables(tablesSpec);
  if (!nums.length || nums.some(n => n < 1 || n > 50)) { console.error('--tables must be in 1..50 (Rule 1: one restaurant, ≤50 tables)'); process.exit(2); }

  fs.mkdirSync(outDir, { recursive: true });
  const entries = [];
  for (const n of nums) {
    const tableId = `table${n}`;
    const url = `${base}/${tableId}${suffix}`;
    const pngPath = path.join(outDir, `${tableId}.png`);
    const svgPath = path.join(outDir, `${tableId}.svg`);
    await QRCode.toFile(pngPath, url, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 600 });
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    fs.writeFileSync(svgPath, svg);
    entries.push({ tableId, url, svg });
    console.log(`  ✓ ${tableId}  ${url}  → ${path.basename(pngPath)}, ${path.basename(svgPath)}`);
  }

  // printable HTML sheet (grid; print to PDF)
  const cards = entries.map(e => `
    <div class="card">
      <div class="qr">${e.svg}</div>
      <div class="label">${e.tableId.replace('table', 'Table ')}</div>
      <div class="url">${e.url}</div>
    </div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Trump table QR codes</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14mm; }
  .card { border: 1px dashed #bbb; border-radius: 8px; padding: 8mm; text-align: center; page-break-inside: avoid; }
  .qr svg { width: 55mm; height: 55mm; }
  .label { font-size: 20pt; font-weight: 800; margin-top: 4mm; }
  .url { font-size: 8pt; color: #666; word-break: break-all; }
  h1 { text-align:center; font-size: 14pt; }
  @media print { .noprint { display:none; } }
</style></head><body>
  <h1 class="noprint">Trump — table QR codes (Print → Save as PDF)</h1>
  <div class="grid">${cards}</div>
</body></html>`;
  const sheetPath = path.join(outDir, 'qr-sheet.html');
  fs.writeFileSync(sheetPath, html);
  console.log(`\n  printable sheet → ${sheetPath}  (open it, Print → Save as PDF)`);

  if (flag('verify')) {
    console.log('\n  verifying each QR URL resolves…');
    let ok = 0, bad = 0;
    for (const e of entries) {
      try { const r = await fetch(e.url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(6000) }); const good = r.status >= 200 && r.status < 400; good ? ok++ : bad++; console.log(`   ${good ? '✓' : '✗'} ${e.tableId} → ${r.status}`); }
      catch (err) { bad++; console.log(`   ✗ ${e.tableId} → ${err.name}`); }
    }
    console.log(`\n  verify: ${ok} ok, ${bad} unreachable`);
    if (bad) { console.log('  ⚠ some URLs did not resolve — check the --base + that the site is deployed.\n'); process.exit(1); }
  }
  console.log(`\n  done — ${entries.length} table QR codes in ${outDir}\n`);
}
main().catch(e => { console.error('qr-generate failed:', e.message); process.exit(1); });
