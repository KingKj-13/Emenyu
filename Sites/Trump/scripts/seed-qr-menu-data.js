#!/usr/bin/env node
/**
 * Seed the QR-menu redesign tables from data that already exists.
 *
 * Idempotent and additive. It never deletes, and it never overwrites a row an
 * administrator has since edited — every write is an upsert keyed on natural
 * identity, and `--force` is required to re-apply editorial copy over the top.
 *
 * What it does:
 *
 *   1. CowCut        — the twelve primals, from the client's chart catalogue
 *   2. CowCutItem    — cut -> menu item, resolved with the same name rules the
 *                      client used, so the curated mapping starts from the
 *                      verified state rather than from nothing
 *   3. MediaAsset    — every existing MenuItem.imagePath / .videoPath becomes a
 *                      gallery record (featured, first in order). The original
 *                      columns are left exactly as they are, so every existing
 *                      screen keeps working.
 *
 * Translation rows are deliberately NOT seeded: English is the base row on
 * MenuItem itself and the fallback for every locale. Inventing translated menu
 * content was explicitly ruled out.
 *
 * Usage:
 *   node scripts/seed-qr-menu-data.js                 # dry run, prints a plan
 *   node scripts/seed-qr-menu-data.js --apply
 *   node scripts/seed-qr-menu-data.js --apply --force # also refresh cut copy
 *   node scripts/seed-qr-menu-data.js --apply --restaurant=trump
 */
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const RESTAURANT = (args.find(a => a.startsWith('--restaurant=')) || '--restaurant=trump').split('=')[1];
// Where the client serves the chart artwork from (vite copies public/ into dist/).
const ASSET_BASE = (args.find(a => a.startsWith('--asset-base=')) || '--asset-base=/Trump/butchery').split('=')[1];

const prisma = new PrismaClient();

/* ── the twelve primals ────────────────────────────────────────────────────
   Mirrors client/src/components/butchery/cutCatalog.ts. That file stays the
   source of the chart GEOMETRY; this is the editorial content, which the
   restaurant should be able to change without a deploy. */
const CUTS = [
  { slug: 'neck', name: 'Neck', altName: 'Neck',
    texture: 'Coarse grain, heavy sinew, very little marbling.',
    bestFor: ['Slow braise', 'Potjie', 'Stock', 'Mince'],
    description: 'The neck never stops working, so it is dense, coarse-grained muscle laced through with connective tissue. Given long wet heat that collagen turns to gelatin. It makes the richest gravy on the animal and the best mince you can grind.' },
  { slug: 'chuck', name: 'Chuck', altName: 'Chuck',
    texture: 'Well marbled, mixed grain, moderate connective tissue.',
    bestFor: ['Braise', 'Pot roast', 'Mince', 'Slow smoke'],
    description: 'The shoulder is a bundle of muscles pulling in different directions, which is why it is sold cubed or as a whole roast rather than cut into steaks. Generous marbling makes it the most forgiving braising cut in the carcass.' },
  { slug: 'brisket', name: 'Brisket', altName: 'Brisket',
    texture: 'Dense, long grain, thick fat cap, tough until fully rendered.',
    bestFor: ['Smoke', 'Braise', 'Salt-cure', 'Boil'],
    description: 'The chest muscle carries the standing weight of the animal: a thick fat cap over two muscles whose grains run in opposite directions. It needs hours, and it repays them more completely than anything else on the carcass.' },
  { slug: 'shin', name: 'Shin', altName: 'Shank',
    texture: 'Very tough raw; gelatinous and unctuous once broken down.',
    bestFor: ['Braise', 'Osso buco', 'Stock', 'Soup'],
    description: 'Foreleg and hind leg below the knee and hock, wrapped tight around the bone. More collagen per gram than anywhere else on the animal, with marrow in the middle. Cooked properly it goes from the toughest cut to the silkiest.' },
  { slug: 'rib', name: 'Prime Rib', altName: 'Rib',
    texture: 'Fine grain, heavy marbling, soft fat cap.',
    bestFor: ['Roast', 'Grill', 'Braai', 'Reverse sear'],
    description: 'The rib section barely moves, so the muscle stays fine-grained and heavily marbled under a fat cap that bastes it from the outside in. This is where tenderness and flavour overlap most generously — most cuts trade one for the other.' },
  { slug: 'sirloin', name: 'Sirloin', altName: 'Strip Loin',
    texture: 'Firm, tight grain, moderate marbling, distinct fat edge.',
    bestFor: ['Braai', 'Grill', 'Pan-sear', 'Roast whole'],
    description: 'The strip of loin running along the spine behind the ribs. Firm bite, clean beef flavour, and a band of fat down one edge that should be left on through cooking. It carries more chew than fillet and considerably more taste.' },
  { slug: 'fillet', name: 'Fillet', altName: 'Tenderloin',
    texture: 'Extremely tender, very lean, almost no marbling.',
    bestFor: ['Pan-sear', 'Fast grill', 'Roast whole', 'Raw'],
    description: 'The tenderloin sits tucked up under the spine doing almost no work, which is precisely why it is the tenderest muscle on the animal. It is also the leanest and the mildest — you are buying texture, and you should cook it accordingly.' },
  { slug: 'rump', name: 'Rump', altName: 'Top Sirloin',
    texture: 'Firm, slightly coarse grain, good fat cap, deep flavour.',
    bestFor: ['Braai', 'Grill', 'Pan-sear', 'Roast'],
    description: 'The top of the hip, sitting directly behind the sirloin with a fat cap over it. Firmer and more assertively beefy than any of the loin cuts, and it holds its flavour at higher temperatures. In South Africa it is the default braai steak.' },
  { slug: 'thinflank', name: 'Thin Flank', altName: 'Flank',
    texture: 'Loose, very coarse grain, lean but full-flavoured.',
    bestFor: ['Fast grill', 'Marinate', 'Stir-fry', 'Braai'],
    description: 'The lower belly behind the ribs: a thin, loose sheet of muscle with a pronounced grain running one way only. Marinate it, cook it fast over high heat, and slice it hard across the grain or it will fight you.' },
  { slug: 'thickflank', name: 'Thick Flank', altName: 'Round (Knuckle)',
    texture: 'Lean, even grain, little marbling, dries out past medium.',
    bestFor: ['Braise', 'Stew', 'Schnitzel', 'Slow roast'],
    description: 'The knuckle, sitting in front of the femur. Lean, uniformly grained and easy to portion, which makes it the cut butchers cube for stew and slice thin for schnitzel. Value rather than luxury, and it behaves if you respect the lack of fat.' },
  { slug: 'topside', name: 'Topside', altName: 'Round (Top Round)',
    texture: 'Very lean, fine even grain, no natural fat cover.',
    bestFor: ['Roast rare', 'Braise', 'Slice raw', 'Corn / cure'],
    description: 'The inner face of the hind leg — one large, lean, single-grained muscle with no fat cover except one a butcher ties on. Roasted rare and carved thin it is excellent. Taken past medium it turns to leather, and there is no rescuing it.' },
  { slug: 'silverside', name: 'Silverside', altName: 'Round (Bottom Round)',
    texture: 'Lean and tight, with a silverskin membrane to remove.',
    bestFor: ['Cure / biltong', 'Pot roast', 'Corned beef', 'Braise'],
    description: 'The outer face of the hind leg, named for the sheet of silver connective tissue lying over it, which must come off before cooking. Lean and tight-grained, and traditionally cured rather than roasted — this is the cut that becomes biltong.' },
];

/* ── cut -> item rules ─────────────────────────────────────────────────────
   Same rules the client shipped with, kept word-boundary anchored: a bare
   /rump/ matches "T-RUMP-S SALAD", and this restaurant's name puts that trap
   in a dozen item names. */
const NOT_BEEF = /\b(lamb|pork|chicken|ostrich|springbok|kudu|venison|kingklip|salmon|hake|sole|prawn|calamari|veg|halloumi|tofu)\b/i;

const RULES = {
  rib: { match: [/\bribeye\b/i, /\btomahawk\b/i, /\bbeef ribs\b/i] },
  sirloin: { match: [/\bsirloin\b/i, /\bt-?bone\b/i] },
  fillet: { match: [/\bfillet\b/i], related: { label: 'Carries a fillet lobe', match: [/\bt-?bone\b/i] } },
  rump: { match: [/\brump\b/i, /\bpicanha\b/i] },
  chuck: {
    match: [/\bchuckeye\b/i, /\bdenver\b/i, /\bchuck\b/i],
    related: { label: 'Ground for our patties', match: [/\bburgers?\b/i], exclude: [/\bchicken\b|\bveg\b|\bhalloumi\b/i] },
  },
  silverside: { match: [/\bbiltong\b/i, /\bsilverside\b/i] },
  neck: { match: [/\bneck\b/i], related: { label: 'Minced and slow-cooked here', match: [/\bbolognese\b/i, /\brag[uù]\b/i] } },
  shin: { match: [/\bosso ?buco\b/i, /\bshin\b/i, /\bshank\b/i], related: { label: 'Braised the same way', match: [/^\s*oxtail\s*$/i] } },
  brisket: { match: [/\bbrisket\b/i] },
  thinflank: { match: [/\bflank steak\b/i, /\bthin flank\b/i] },
  thickflank: { match: [/\bthick flank\b/i, /\bknuckle\b/i] },
  topside: { match: [/\btopside\b/i] },
};

const hits = (name, patterns) => patterns.some(re => re.test(name));

async function main() {
  const mode = APPLY ? 'APPLY' : 'DRY RUN';
  console.log(`\nseed-qr-menu-data — ${mode} — restaurant="${RESTAURANT}"\n`);

  const items = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT },
    select: { id: true, name: true, imagePath: true, videoPath: true, description: true, sortOrder: true },
    orderBy: { id: 'asc' },
  });
  console.log(`menu items in scope: ${items.length}`);
  if (items.length === 0) {
    console.log('nothing to do — no menu items for this restaurant.');
    return;
  }

  /* ── 1. cuts ──────────────────────────────────────────────────────────── */
  const cutIdBySlug = new Map();
  let cutsCreated = 0, cutsRefreshed = 0, cutsKept = 0;
  for (const [i, c] of CUTS.entries()) {
    const existing = await prisma.cowCut.findUnique({
      where: { restaurantId_slug: { restaurantId: RESTAURANT, slug: c.slug } },
    });
    const payload = {
      restaurantId: RESTAURANT, slug: c.slug, name: c.name, altName: c.altName,
      description: c.description, texture: c.texture, bestFor: c.bestFor,
      sortOrder: i, active: true,
    };
    if (!existing) {
      cutsCreated++;
      if (APPLY) {
        const row = await prisma.cowCut.create({ data: payload });
        cutIdBySlug.set(c.slug, row.id);
      }
    } else if (FORCE) {
      cutsRefreshed++;
      if (APPLY) await prisma.cowCut.update({ where: { id: existing.id }, data: payload });
      cutIdBySlug.set(c.slug, existing.id);
    } else {
      // Never clobber copy an administrator has edited.
      cutsKept++;
      cutIdBySlug.set(c.slug, existing.id);
    }
  }
  console.log(`cuts        : ${cutsCreated} new, ${cutsRefreshed} refreshed, ${cutsKept} left as-is`);

  /* ── 2. cut -> item ───────────────────────────────────────────────────── */
  let linksPlanned = 0, linksCreated = 0;
  const perCut = [];
  for (const c of CUTS) {
    const rule = RULES[c.slug];
    if (!rule) continue;
    const claimed = new Set();
    const primary = [], related = [];

    for (const it of items) {
      const n = String(it.name || '');
      if (!n || NOT_BEEF.test(n)) continue;
      if (rule.exclude && hits(n, rule.exclude)) continue;
      if (hits(n, rule.match)) { primary.push(it); claimed.add(it.id); }
    }
    if (rule.related) {
      for (const it of items) {
        if (claimed.has(it.id)) continue;
        const n = String(it.name || '');
        if (!n || NOT_BEEF.test(n)) continue;
        if (rule.related.exclude && hits(n, rule.related.exclude)) continue;
        if (hits(n, rule.related.match)) related.push(it);
      }
    }

    perCut.push({ slug: c.slug, primary: primary.length, related: related.length });
    const rows = [
      ...primary.map((it, i) => ({ menuItemId: it.id, matchType: 'PRIMARY', label: '', sortOrder: i })),
      ...related.map((it, i) => ({ menuItemId: it.id, matchType: 'RELATED', label: rule.related.label, sortOrder: 100 + i })),
    ];
    linksPlanned += rows.length;

    if (APPLY) {
      const cutId = cutIdBySlug.get(c.slug);
      if (!cutId) continue;
      for (const r of rows) {
        // Upsert: a link an administrator has already curated is left alone.
        const existing = await prisma.cowCutItem.findUnique({
          where: { cutId_menuItemId: { cutId, menuItemId: r.menuItemId } },
        });
        if (!existing) {
          await prisma.cowCutItem.create({ data: { cutId, ...r } });
          linksCreated++;
        }
      }
    }
  }
  console.log(`cut -> item : ${linksPlanned} matches${APPLY ? `, ${linksCreated} new links written` : ''}`);
  for (const p of perCut) {
    console.log(`              ${p.slug.padEnd(12)} ${String(p.primary).padStart(2)} primary` +
      (p.related ? `, ${p.related} related` : ''));
  }

  /* ── 3. existing media -> gallery ─────────────────────────────────────── */
  let mediaPlanned = 0, mediaCreated = 0;
  for (const it of items) {
    const assets = [];
    if (it.imagePath) assets.push({ kind: 'IMAGE', url: it.imagePath, sortOrder: 0, featured: true });
    if (it.videoPath) assets.push({ kind: 'VIDEO', url: it.videoPath, sortOrder: 1, featured: false });
    mediaPlanned += assets.length;
    if (!APPLY) continue;
    for (const a of assets) {
      const dup = await prisma.mediaAsset.findFirst({
        where: { restaurantId: RESTAURANT, entityType: 'MENU_ITEM', entityId: it.id, url: a.url },
        select: { id: true },
      });
      if (dup) continue;
      await prisma.mediaAsset.create({
        data: {
          restaurantId: RESTAURANT, entityType: 'MENU_ITEM', entityId: it.id,
          alt: it.name, ...a,
        },
      });
      mediaCreated++;
    }
  }
  console.log(`media       : ${mediaPlanned} existing image/video paths${APPLY ? `, ${mediaCreated} gallery rows written` : ''}`);

  /* ── 4. cut photographs -> gallery ────────────────────────────────────
     The optimized WebP plates already ship with the client build. Registering
     them as MediaAsset rows is what lets an administrator reorder them, add
     more, or attach a video to a cut without a deploy. */
  const CUT_ART = new Set([
    'chuck', 'fillet', 'neck', 'rib', 'rump', 'shin',
    'silverside', 'sirloin', 'thickflank', 'thinflank', 'topside',
  ]);
  let cutMediaPlanned = 0, cutMediaCreated = 0;
  for (const c of CUTS) {
    if (!CUT_ART.has(c.slug)) continue;      // brisket has no photograph yet
    cutMediaPlanned++;
    if (!APPLY) continue;
    const cutId = cutIdBySlug.get(c.slug);
    if (!cutId) continue;
    const url = `${ASSET_BASE}/${c.slug}.webp`;
    const dup = await prisma.mediaAsset.findFirst({
      where: { restaurantId: RESTAURANT, entityType: 'COW_CUT', entityId: cutId, url },
      select: { id: true },
    });
    if (dup) continue;
    await prisma.mediaAsset.create({
      data: {
        restaurantId: RESTAURANT, entityType: 'COW_CUT', entityId: cutId,
        kind: 'IMAGE', url, alt: `${c.name} — raw cut`, sortOrder: 0, featured: true,
      },
    });
    cutMediaCreated++;
  }
  console.log(`cut media   : ${cutMediaPlanned} cut photographs${APPLY ? `, ${cutMediaCreated} rows written` : ''}`);

  console.log(`\ntranslations: none seeded by design — English lives on MenuItem and is the fallback for every locale.`);
  if (!APPLY) console.log('\nDRY RUN — nothing was written. Re-run with --apply.\n');
  else console.log('\nDone.\n');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
