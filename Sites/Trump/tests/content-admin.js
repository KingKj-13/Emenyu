/**
 * Owner content management, end to end against the real server + dev database.
 * Everything it creates, it deletes.
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const { PrismaClient } = require(require('path').join(__dirname, '..', '..', '..', 'node_modules', '@prisma', 'client'));

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3099/Trump';
const DB = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5432/emenyu_dev';
const USER = 'contenttest-owner';
const PASS = 'ContentTest#2026';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let cookie = '';
async function call(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

(async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: DB } } });

  // A throwaway admin, created and removed by this test.
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = `pbkdf2$120000$${salt}$${crypto.pbkdf2Sync(PASS, salt, 120000, 32, 'sha256').toString('hex')}`;
  await prisma.user.upsert({
    where: { username: USER },
    update: { password: hash, role: 'owner', suspended: false },
    create: { username: USER, password: hash, role: 'owner', label: 'content test', createdBy: 'test' },
  });

  const login = await call('/api/auth/login', 'POST', { username: USER, password: PASS });
  check('admin login', login.status === 200, String(login.status));

  const itemId = 52;
  let createdMediaIds = [];

  try {
    // ── media ───────────────────────────────────────────────────────────
    const before = await call(`/api/admin/content/media?entityType=MENU_ITEM&entityId=${itemId}`);
    const beforeCount = before.json?.media?.length ?? 0;
    check('gallery lists existing media', before.status === 200, `${beforeCount} assets`);

    const a = await call('/api/admin/content/media', 'POST', {
      entityType: 'MENU_ITEM', entityId: itemId, kind: 'IMAGE', url: '/Trump/Images/test-a.webp', alt: 'A',
    });
    const b = await call('/api/admin/content/media', 'POST', {
      entityType: 'MENU_ITEM', entityId: itemId, kind: 'VIDEO', url: '/Trump/Video/test-b.mp4', alt: 'B',
    });
    check('media can be added', a.status === 201 && b.status === 201, `${a.status}/${b.status}`);
    createdMediaIds = [a.json?.data?.id, b.json?.data?.id].filter(Boolean);

    // Hostile URLs must be refused — these land in a guest's src attribute.
    const bad = [];
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', '//evil.example/x.png']) {
      const r = await call('/api/admin/content/media', 'POST', {
        entityType: 'MENU_ITEM', entityId: itemId, kind: 'IMAGE', url,
      });
      if (r.status !== 400) bad.push(`${url} -> ${r.status}`);
    }
    check('unsafe media URLs are refused', bad.length === 0, bad.join(' | '));

    // Featured is exclusive.
    await call(`/api/admin/content/media/${createdMediaIds[1]}`, 'PATCH', { featured: true });
    const featured = await prisma.mediaAsset.count({
      where: { restaurantId: 'trump', entityType: 'MENU_ITEM', entityId: itemId, featured: true },
    });
    check('exactly one asset is featured', featured === 1, `${featured} featured`);

    // Reorder, and refuse ids from another item.
    const list = await call(`/api/admin/content/media?entityType=MENU_ITEM&entityId=${itemId}`);
    const ids = list.json.media.map(m => m.id);
    const rev = [...ids].reverse();
    const ro = await call('/api/admin/content/media/reorder', 'POST', { entityType: 'MENU_ITEM', entityId: itemId, ids: rev });
    const after = await call(`/api/admin/content/media?entityType=MENU_ITEM&entityId=${itemId}`);
    check('gallery reorder persists', ro.status === 200 && JSON.stringify(after.json.media.map(m => m.id)) === JSON.stringify(rev));

    const foreign = await prisma.mediaAsset.findFirst({
      where: { restaurantId: 'trump', entityType: 'MENU_ITEM', entityId: { not: itemId } }, select: { id: true },
    });
    const badRo = await call('/api/admin/content/media/reorder', 'POST', {
      entityType: 'MENU_ITEM', entityId: itemId, ids: [...ids, foreign.id],
    });
    check('reorder refuses ids from another dish', badRo.status === 400, String(badRo.status));

    // ── translations ────────────────────────────────────────────────────
    const save = await call('/api/admin/content/translations', 'PUT', {
      entityType: 'MENU_ITEM', entityId: itemId, locale: 'ko',
      fields: { name: '설로인 350g', description: '' },
    });
    check('translation saves', save.status === 200, String(save.status));

    const rows = await prisma.translation.findMany({ where: { entityId: itemId, locale: 'ko' } });
    check('blank field is not stored (falls back to English)',
      rows.length === 1 && rows[0].field === 'name',
      rows.map(r => r.field).join(',') || 'none');

    const menuKo = await call('/api/menu?locale=ko');
    const koName = menuKo.json?.['Trumps Premium Steaks']?.['SOUTH AFRICAN PRIME BEEF - OFF THE BONE']?.items?.[0];
    check('the saved translation reaches the guest menu', koName?.name === '설로인 350g', koName?.name || 'n/a');
    check('untranslated field still English', /Off-the-bone/i.test(koName?.description || ''), (koName?.description || '').slice(0, 34));

    const en = await call('/api/admin/content/translations', 'PUT', {
      entityType: 'MENU_ITEM', entityId: itemId, locale: 'en', fields: { name: 'nope' },
    });
    check('English is refused as a translation locale', en.status === 400, String(en.status));

    const cov = await call('/api/admin/content/translations/coverage');
    check('coverage is computed', cov.status === 200 && typeof cov.json.items === 'number',
      `${cov.json?.items} items, ko ${cov.json?.locales?.find(l => l.locale === 'ko')?.percent ?? 0}%`);

    // ── cuts ────────────────────────────────────────────────────────────
    const cuts = await call('/api/admin/content/cuts');
    check('cuts list loads', cuts.status === 200 && cuts.json.cuts.length === 12, `${cuts.json?.cuts?.length} cuts`);
    const rib = cuts.json.cuts.find(c => c.slug === 'rib');

    const upd = await call(`/api/admin/content/cuts/${rib.id}`, 'PATCH', { texture: 'Test texture' });
    check('cut copy is editable', upd.status === 200, String(upd.status));

    const link = await call(`/api/admin/content/cuts/${rib.id}/items`, 'POST', { menuItemId: itemId, matchType: 'RELATED', label: 'Test link' });
    check('a dish can be linked to a cut', link.status === 201, String(link.status));
    const guestCuts = await call('/api/butchery/cuts');
    const guestRib = guestCuts.json.cuts.find(c => c.slug === 'rib');
    check('the link appears in the guest chart', guestRib.items.some(i => i.menuItemId === itemId));

    const unlink = await call(`/api/admin/content/cuts/${rib.id}/items/${itemId}`, 'DELETE');
    check('a link can be removed', unlink.status === 200, String(unlink.status));

    const badLink = await call(`/api/admin/content/cuts/${rib.id}/items`, 'POST', { menuItemId: 999999 });
    check('linking a non-existent dish is refused', badLink.status === 400, String(badLink.status));

    // ── the edits must actually reach a GUEST, not just the database ────
    // This is the whole promise of the content layer: an owner edits, a guest
    // sees it. Testing the write alone would have passed while the guest screen
    // still read its built-in catalogue.
    const cutsForGuest = await call('/api/butchery/cuts');
    const ribGuest = cutsForGuest.json.cuts.find(c => c.slug === 'rib');
    check('edited cut copy reaches the guest API', ribGuest.texture === 'Test texture', ribGuest.texture);

    const mediaOnCut = await call('/api/admin/content/media', 'POST', {
      entityType: 'COW_CUT', entityId: rib.id, kind: 'IMAGE', url: '/Trump/Images/test-cut.webp', alt: 'test',
    });
    createdMediaIds.push(mediaOnCut.json?.data?.id);
    const cutsAfterMedia = await call('/api/butchery/cuts');
    const ribMedia = cutsAfterMedia.json.cuts.find(c => c.slug === 'rib').media;
    check('cut media reaches the guest API', ribMedia.some(m => m.url === '/Trump/Images/test-cut.webp'),
      `${ribMedia.length} assets`);

    const gallery = await call(`/api/menu/items/${itemId}/gallery`);
    check('item gallery is served to guests', gallery.status === 200 && Array.isArray(gallery.json.media),
      `${gallery.json?.media?.length} assets`);

    // ── restore ─────────────────────────────────────────────────────────
    await call(`/api/admin/content/cuts/${rib.id}`, 'PATCH', { texture: 'Fine grain, heavy marbling, soft fat cap.' });
    await prisma.translation.deleteMany({ where: { entityId: itemId, locale: 'ko' } });
    for (const id of createdMediaIds) await call(`/api/admin/content/media/${id}`, 'DELETE');
    await call('/api/admin/content/media/reorder', 'POST', { entityType: 'MENU_ITEM', entityId: itemId, ids });

    const finalMedia = await prisma.mediaAsset.count({ where: { entityType: 'MENU_ITEM', entityId: itemId } });
    const finalTrans = await prisma.translation.count();
    check('test data cleaned up', finalMedia === beforeCount && finalTrans === 0,
      `${finalMedia} media (was ${beforeCount}), ${finalTrans} translations`);
  } finally {
    await prisma.user.deleteMany({ where: { username: USER } });
    await prisma.$disconnect();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
