#!/usr/bin/env node
'use strict';
/*
 * migrate-images.js — zero-error mapping of the new Images/ file set onto the
 * Trump menu, canonical rename, and imagePath-only DB rewrite.
 *
 *   node scripts/migrate-images.js                 # DRY RUN — analyze + match, write report/plan/backup, change NOTHING
 *   node scripts/migrate-images.js --rename        # Phase 5 — rename files on disk to canonical names (uses the plan)
 *   node scripts/migrate-images.js --verify        # Phase 6 — assert plan⇄disk bijection (files exist, no dup, size match)
 *   node scripts/migrate-images.js --apply         # Phase 7 — write imagePath per the plan (backup first). Requires --yes.
 *   node scripts/migrate-images.js --apply --yes   #          actually write to the DB
 *   node scripts/migrate-images.js --rollback data/image-migration-backup.json --yes   # restore imagePath
 *
 * SAFETY:
 *  - Defaults to the LOCAL database via the .env.local override block (no-op in prod).
 *    Prints the resolved DB host/name up front so you always see which DB you're on.
 *  - Only ever writes MenuItem.imagePath (per-id update). Never touches any other
 *    column, never NULL, never saveMenu(). Tenant-scoped restaurantId='trump'.
 *  - --apply/--rollback are gated behind an explicit --yes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
// Local dev override: .env.local (gitignored) repoints DATABASE_URL at the local
// database so this migration never touches prod. No-op in production (no file).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const IMAGES_DIR = path.resolve(__dirname, '..', 'Images');
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const REPORT_CSV = path.join(DATA_DIR, 'image-migration-report.csv');
const PLAN_JSON = path.join(DATA_DIR, 'image-migration-plan.json');
const BACKUP_JSON = path.join(DATA_DIR, 'image-migration-backup.json');
const RENAME_CSV = path.join(DATA_DIR, 'image-rename-map.csv');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const MODE_RENAME = has('--rename');
const MODE_VERIFY = has('--verify');
const MODE_APPLY = has('--apply');
const MODE_ROLLBACK = has('--rollback');
const CONFIRM = has('--yes');
const CONFIDENCE_FLOOR = 98;

// ── normalization ───────────────────────────────────────────────────────────
const stripDiacritics = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
function norm(s) {
  let x = stripDiacritics(String(s || '').toLowerCase());
  x = x.replace(/&/g, ' and ');
  x = x.replace(/[^a-z0-9]+/g, ' ');               // strip separators first (unifies "2_pce" vs "2 pce")
  x = x.replace(/(\d+)\s*p(?:ce|cs|c)\b/g, '$1pc'); // then merge piece counts: 2 pce / 8pc / 4 pcs → Npc
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}
const compact = (s) => norm(s).replace(/\s+/g, '');
// size signature = sorted set of numeric(+unit) tokens; the wrong-weight guard.
function sizeSig(nrm) {
  const m = (nrm.match(/\d+[a-z]*/g) || []).slice().sort();
  return m.join('|');
}
const tokenSet = (nrm) => nrm.split(' ').filter(Boolean).slice().sort().join(' ');

// ── canonical rename target ─────────────────────────────────────────────────
function sanitizeName(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, ' ') // FS-invalid → space
    .replace(/\s+/g, ' ')
    .trim();
}

// ── minimal JPEG dimension reader (inventory only; never fatal) ──────────────
function jpegSize(buf) {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) };
      }
      if (o + 3 >= buf.length) break;
      o += 2 + buf.readUInt16BE(o + 2);
    }
  } catch { /* ignore */ }
  return null;
}

function dbSummary() {
  const url = process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch { return '(unparseable DATABASE_URL)'; }
}

function ensureDataDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ── load menu (id, name, category>subcategory, imagePath) ────────────────────
async function loadMenu(prisma) {
  const rows = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT_ID },
    include: { category: { include: { parent: true } } },
    orderBy: { id: 'asc' },
  });
  return rows.map((r) => {
    const cat = r.category || {};
    const parent = cat.parent || null;
    const categoryTitle = parent ? parent.title : cat.title || '';
    const subcategoryTitle = parent ? cat.title : '';
    return {
      id: r.id,
      name: r.name,
      category: categoryTitle,
      subcategory: subcategoryTitle,
      imagePath: r.imagePath || '',
      N: norm(r.name),
      C: compact(r.name),
      sig: sizeSig(norm(r.name)),
      tok: tokenSet(norm(r.name)),
    };
  });
}

// ── inventory Images/ ────────────────────────────────────────────────────────
function loadFiles() {
  const names = fs.readdirSync(IMAGES_DIR).filter((f) => {
    const p = path.join(IMAGES_DIR, f);
    return fs.statSync(p).isFile() && /\.(jpe?g|png|webp)$/i.test(f);
  });
  return names.map((filename) => {
    const buf = fs.readFileSync(path.join(IMAGES_DIR, filename));
    const ext = path.extname(filename);
    const base = filename.slice(0, filename.length - ext.length);
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const dim = /\.jpe?g$/i.test(filename) ? jpegSize(buf) : null;
    const m = base.match(/^(.*)_(\d+)$/); // id-suffix candidate (digits only, no trailing letters)
    return {
      filename, ext, base, md5, bytes: buf.length,
      dim, w: dim ? dim.w : '', h: dim ? dim.h : '',
      N: norm(base),
      C: compact(base),
      sig: sizeSig(norm(base)),
      tok: tokenSet(norm(base)),
      idSuffix: m ? { prefix: m[1], n: parseInt(m[2], 10) } : null,
      consumed: false,
    };
  });
}

// ── tiered matcher: returns { itemId → {file, tier, confidence, reason} } ─────
function match(items, files) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const result = new Map(); // itemId → assignment
  const assignedItem = new Set();

  const assign = (item, file, tier, confidence, reason) => {
    result.set(item.id, { file, tier, confidence, reason });
    assignedItem.add(item.id);
    file.consumed = true;
  };

  // T0 — id-suffix (100%): file "<prefix>_<n>" where n==item.id AND norm(prefix)==item.N
  for (const f of files) {
    if (f.consumed || !f.idSuffix) continue;
    const it = byId.get(f.idSuffix.n);
    if (!it || assignedItem.has(it.id)) continue;
    if (norm(f.idSuffix.prefix) === it.N) {
      assign(it, f, 'T0', 100, `id-suffix _${f.idSuffix.n} + name match`);
    }
  }

  // helper: unique-both matching on a given key
  const uniqueKeyPass = (keyName, tier, confidence, label) => {
    const filesByKey = new Map();
    for (const f of files) {
      if (f.consumed) continue;
      const k = f[keyName];
      if (!filesByKey.has(k)) filesByKey.set(k, []);
      filesByKey.get(k).push(f);
    }
    const itemsByKey = new Map();
    for (const it of items) {
      if (assignedItem.has(it.id)) continue;
      const k = it[keyName];
      if (!itemsByKey.has(k)) itemsByKey.set(k, []);
      itemsByKey.get(k).push(it);
    }
    for (const [k, its] of itemsByKey) {
      const fs_ = filesByKey.get(k);
      if (!k) continue;
      if (its.length === 1 && fs_ && fs_.length === 1) {
        const it = its[0], f = fs_[0];
        if (it.sig !== f.sig) continue; // wrong-weight guard
        assign(it, f, tier, confidence, `${label} (unique)`);
      }
    }
  };

  uniqueKeyPass('N', 'T1', 100, 'exact normalized');
  uniqueKeyPass('C', 'T1c', 99, 'ampersand/space-collapsed');

  // T3 — token-set + size-signature agreement (98%), unique on both sides
  const filesByTok = new Map();
  for (const f of files) {
    if (f.consumed) continue;
    const k = `${f.tok}#${f.sig}`;
    if (!filesByTok.has(k)) filesByTok.set(k, []);
    filesByTok.get(k).push(f);
  }
  const itemsByTok = new Map();
  for (const it of items) {
    if (assignedItem.has(it.id)) continue;
    const k = `${it.tok}#${it.sig}`;
    if (!itemsByTok.has(k)) itemsByTok.set(k, []);
    itemsByTok.get(k).push(it);
  }
  for (const [k, its] of itemsByTok) {
    const fs_ = filesByTok.get(k);
    if (its.length === 1 && fs_ && fs_.length === 1) {
      assign(its[0], fs_[0], 'T3', 98, 'token-set + size match (unique)');
    }
  }

  return result;
}

// ── canonical filename map (with id disambiguation on collisions) ────────────
function canonicalMap(items) {
  const baseCount = new Map();
  for (const it of items) {
    const b = sanitizeName(it.name).toLowerCase();
    baseCount.set(b, (baseCount.get(b) || 0) + 1);
  }
  const out = new Map();
  for (const it of items) {
    const base = sanitizeName(it.name);
    const collides = baseCount.get(base.toLowerCase()) > 1;
    const fname = collides ? `${base} [${it.id}].jpg` : `${base}.jpg`;
    out.set(it.id, fname);
  }
  return out;
}

// ── build the full analysis (used by every mode) ─────────────────────────────
function analyze(items, files) {
  const matches = match(items, files);
  const canon = canonicalMap(items);

  // duplicate image hashes
  const byHash = new Map();
  for (const f of files) {
    if (!byHash.has(f.md5)) byHash.set(f.md5, []);
    byHash.get(f.md5).push(f.filename);
  }
  const dupHashGroups = [...byHash.values()].filter((g) => g.length > 1);

  const rows = [];
  const plan = [];
  for (const it of items) {
    const a = matches.get(it.id);
    let status, matchedFile = '', confidence = '', tier = '', reason = '', canonical = '';
    if (a && a.confidence >= CONFIDENCE_FLOOR) {
      status = 'MATCHED';
      matchedFile = a.file.filename;
      confidence = a.confidence;
      tier = a.tier;
      reason = a.reason;
      canonical = canon.get(it.id);
      plan.push({
        id: it.id, name: it.name,
        oldImagePath: it.imagePath,
        matchedFile,
        newImagePath: `Images/${canonical}`,
        tier, confidence,
      });
    } else if (a) {
      status = 'MANUAL REVIEW';
      matchedFile = a.file.filename;
      confidence = a.confidence;
      tier = a.tier;
      reason = `below ${CONFIDENCE_FLOOR}% — ${a.reason}`;
    } else {
      status = 'MISSING IMAGE';
      reason = 'no candidate file at or above confidence floor';
    }
    rows.push({
      id: it.id, name: it.name, cat: [it.category, it.subcategory].filter(Boolean).join(' > '),
      current: it.imagePath, matched: matchedFile, canonical,
      confidence, tier, reason, status,
    });
  }

  // unmatched files
  const unmatched = files.filter((f) => !f.consumed).map((f) => f.filename);
  for (const fn of unmatched) {
    rows.push({ id: '', name: '', cat: '', current: '', matched: fn, canonical: '', confidence: '', tier: '', reason: 'file not assigned to any item', status: 'UNMATCHED IMAGE' });
  }
  // duplicate-hash note rows
  for (const g of dupHashGroups) {
    rows.push({ id: '', name: '', cat: '', current: '', matched: g.join(' | '), canonical: '', confidence: '', tier: '', reason: `identical image bytes shared by ${g.length} files`, status: 'DUPLICATE IMAGE' });
  }

  return { matches, canon, rows, plan, unmatched, dupHashGroups };
}

function writeReport({ rows, plan, items }) {
  ensureDataDir();
  const header = ['Menu Item ID', 'Menu Item', 'Category > Sub', 'Current Image', 'Matched Image', 'Canonical Target', 'Confidence', 'Tier', 'Reason', 'Status'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.name, r.cat, r.current, r.matched, r.canonical, r.confidence, r.tier, r.reason, r.status].map(csvCell).join(','));
  }
  fs.writeFileSync(REPORT_CSV, lines.join('\n') + '\n');
  fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2));
  const backup = items.map((it) => ({ id: it.id, oldImagePath: it.imagePath }));
  fs.writeFileSync(BACKUP_JSON, JSON.stringify(backup, null, 2));
}

function summarize(rows) {
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}

function loadPlan() {
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`plan not found at ${PLAN_JSON} — run the dry run first`);
  return JSON.parse(fs.readFileSync(PLAN_JSON, 'utf8'));
}

// ── Phase 5: rename files to canonical (two-phase, uses the plan) ─────────────
function doRename() {
  const plan = loadPlan();
  const renames = [];
  for (const p of plan) {
    const target = path.basename(p.newImagePath);
    if (p.matchedFile !== target) renames.push({ from: p.matchedFile, to: target, id: p.id, name: p.name });
  }
  // phase 1: source → unique temp
  const temps = [];
  for (const r of renames) {
    const src = path.join(IMAGES_DIR, r.from);
    if (!fs.existsSync(src)) throw new Error(`missing source file for rename: ${r.from} (item ${r.id})`);
    const tmp = path.join(IMAGES_DIR, `__mig_${r.id}__${Math.abs(hash32(r.to))}.tmp`);
    fs.renameSync(src, tmp);
    temps.push({ tmp, to: r.to, id: r.id });
  }
  // collision check on final targets
  const seen = new Set();
  for (const t of temps) {
    if (seen.has(t.to.toLowerCase())) throw new Error(`canonical collision detected: ${t.to}`);
    seen.add(t.to.toLowerCase());
  }
  // phase 2: temp → final
  for (const t of temps) fs.renameSync(t.tmp, path.join(IMAGES_DIR, t.to));

  ensureDataDir();
  const lines = ['Old Filename,New Filename,Item ID,Item Name'];
  for (const r of renames) lines.push([r.from, r.to, r.id, r.name].map(csvCell).join(','));
  fs.writeFileSync(RENAME_CSV, lines.join('\n') + '\n');
  console.log(`renamed ${renames.length} files → ${RENAME_CSV}`);
}
function hash32(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

// ── Phase 6: verify plan ⇄ disk bijection ────────────────────────────────────
function doVerify() {
  const plan = loadPlan();
  const problems = [];
  const usedPath = new Map();
  for (const p of plan) {
    const target = path.basename(p.newImagePath);
    const abs = path.join(IMAGES_DIR, target);
    if (!p.newImagePath.startsWith('Images/')) problems.push(`item ${p.id}: newImagePath not under Images/ (${p.newImagePath})`);
    if (!fs.existsSync(abs)) problems.push(`item ${p.id}: file missing on disk (${target})`);
    if (usedPath.has(p.newImagePath)) problems.push(`duplicate assignment: ${p.newImagePath} used by items ${usedPath.get(p.newImagePath)} and ${p.id}`);
    else usedPath.set(p.newImagePath, p.id);
    // size-signature guard on final name
    if (sizeSig(norm(p.name)) !== sizeSig(norm(target.replace(/\.[^.]+$/, '')))) {
      // canonical target derives from the name, so this should always hold; report if not
      problems.push(`item ${p.id}: size signature mismatch name<->file (${p.name} / ${target})`);
    }
  }
  if (problems.length) {
    console.error(`VERIFY FAILED — ${problems.length} problem(s):`);
    problems.slice(0, 50).forEach((p) => console.error('  - ' + p));
    process.exitCode = 1;
  } else {
    console.log(`VERIFY OK — ${plan.length} items, each maps to exactly one existing file, no duplicates, size signatures consistent.`);
  }
}

// ── Phase 7: apply imagePath per plan (backup first) ─────────────────────────
async function doApply(prisma) {
  const plan = loadPlan();
  // fresh backup of CURRENT db state for exactly the ids we will touch
  ensureDataDir();
  const ids = plan.map((p) => p.id);
  const current = await prisma.menuItem.findMany({ where: { restaurantId: RESTAURANT_ID, id: { in: ids } }, select: { id: true, imagePath: true } });
  fs.writeFileSync(BACKUP_JSON, JSON.stringify(current.map((c) => ({ id: c.id, oldImagePath: c.imagePath })), null, 2));

  if (!CONFIRM) {
    console.log(`DRY RUN (--apply without --yes). Would update ${plan.length} rows. Backup written to ${BACKUP_JSON}. Re-run with --yes to write.`);
    return;
  }
  let changed = 0, unchanged = 0;
  for (const p of plan) {
    const cur = current.find((c) => c.id === p.id);
    if (cur && cur.imagePath === p.newImagePath) { unchanged++; continue; }
    await prisma.menuItem.update({ where: { id: p.id }, data: { imagePath: p.newImagePath } });
    changed++;
  }
  console.log(`APPLIED — ${changed} updated, ${unchanged} already current, ${plan.length} total. Backup: ${BACKUP_JSON}`);
}

// ── rollback ─────────────────────────────────────────────────────────────────
async function doRollback(prisma) {
  const idx = args.indexOf('--rollback');
  const file = args[idx + 1] && !args[idx + 1].startsWith('--') ? path.resolve(args[idx + 1]) : BACKUP_JSON;
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!CONFIRM) { console.log(`DRY RUN rollback — would restore ${backup.length} imagePath values from ${file}. Re-run with --yes.`); return; }
  let restored = 0;
  for (const b of backup) { await prisma.menuItem.update({ where: { id: b.id }, data: { imagePath: b.oldImagePath } }); restored++; }
  console.log(`ROLLBACK — restored ${restored} imagePath values from ${file}`);
}

(async () => {
  console.log(`[migrate-images] DB target: ${dbSummary()}  tenant=${RESTAURANT_ID}`);
  const prisma = getPrisma();
  try {
    if (MODE_ROLLBACK) { await doRollback(prisma); return; }
    if (MODE_RENAME) { doRename(); return; }
    if (MODE_VERIFY) { doVerify(); return; }
    if (MODE_APPLY) { await doApply(prisma); return; }

    // default: analyze + report (dry run, no changes)
    const items = await loadMenu(prisma);
    const files = loadFiles();
    const res = analyze(items, files);
    writeReport({ rows: res.rows, plan: res.plan, items });
    const counts = summarize(res.rows.filter((r) => r.id !== '')); // per-item statuses only
    console.log(`\nItems: ${items.length}   Files: ${files.length}`);
    console.log('Per-item status:', counts);
    console.log(`Unmatched files: ${res.unmatched.length}${res.unmatched.length ? ' → ' + res.unmatched.slice(0, 20).join(', ') : ''}`);
    console.log(`Duplicate-hash groups: ${res.dupHashGroups.length}`);
    const review = res.rows.filter((r) => r.id !== '' && r.status !== 'MATCHED');
    if (review.length) {
      console.log(`\nNeeds attention (${review.length}):`);
      review.slice(0, 60).forEach((r) => console.log(`  [${r.status}] #${r.id} ${r.name}  ${r.matched ? '(cand: ' + r.matched + ')' : ''}`));
    }
    console.log(`\nWrote:\n  ${REPORT_CSV}\n  ${PLAN_JSON}\n  ${BACKUP_JSON}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
