/**
 * Full stack: real Trump server + real (local copy of production) database.
 * Proves the localization path and the analytics path actually round-trip,
 * rather than testing the client against a stub.
 */
const { chromium } = require(require('path').join(__dirname, '..', 'client', 'node_modules', 'playwright'));
const { execSync } = require('child_process');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3099/Trump';
const OUT = process.env.SHOT_DIR || require('os').tmpdir();
const PSQL = process.env.PSQL || '"C:/Program Files/PostgreSQL/18/bin/psql" -U postgres -h 127.0.0.1 -d emenyu_dev -tAc';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

function sql(q) {
  return execSync(`${PSQL} "${q.replace(/"/g, '\\"')}"`, {
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    encoding: 'utf8',
  }).trim();
}

/** Admin session, used only to prove an owner's edit reaches the guest screen. */
async function asAdmin() {
  const crypto = require('crypto');
  const { PrismaClient } = require(require('path').join(__dirname, '..', '..', '..', 'node_modules', '@prisma', 'client'));
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const salt = crypto.randomBytes(16).toString('hex');
  const pass = 'FullStack#2026';
  const hash = `pbkdf2$120000$${salt}$${crypto.pbkdf2Sync(pass, salt, 120000, 32, 'sha256').toString('hex')}`;
  await prisma.user.upsert({
    where: { username: 'fullstack-owner' },
    update: { password: hash, role: 'owner', suspended: false },
    create: { username: 'fullstack-owner', password: hash, role: 'owner', createdBy: 'test' },
  });
  let cookie = '';
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const t = await r.text();
    try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, json: null }; }
  };
  await call('/api/auth/login', 'POST', { username: 'fullstack-owner', password: pass });
  return { call, cleanup: async () => { await prisma.user.deleteMany({ where: { username: 'fullstack-owner' } }); await prisma.$disconnect(); } };
}

(async () => {
  const before = Number(sql('select count(*) from "ViewEvent"'));

  // An owner edits a cut BEFORE the guest journey below, so the assertion is
  // "the guest saw the edit", not "the database accepted it".
  const admin = await asAdmin();
  const cutsRes = await admin.call('/api/admin/content/cuts');
  const ribCut = cutsRes.json.cuts.find(c => c.slug === 'rib');
  const originalTexture = ribCut.texture;
  const EDITED = 'Edited by the owner, seen by the guest.';
  await admin.call(`/api/admin/content/cuts/${ribCut.id}`, 'PATCH', { texture: EDITED });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // ── the real guest journey ───────────────────────────────────────────────
  await page.goto(`${BASE}/table1/menu`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('QR entry reaches the menu on the real server, no gate',
    await page.locator('article').count() > 0);

  // The language switch is a header dropdown now, not a full-screen step.
  await page.getByRole('button', { name: /^Language:/i }).click();
  await page.waitForTimeout(300);
  await page.locator('[role="listbox"] [role="option"]:has-text("Deutsch")').click();
  await page.waitForTimeout(900);

  // The menu must have been REFETCHED for de — check the network, not the DOM.
  const localeRequests = [];
  page.on('request', r => { if (r.url().includes('/api/menu')) localeRequests.push(r.url()); });
  await page.goto(`${BASE}/table1/menu`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('menu is fetched for the active locale',
    localeRequests.some(u => u.includes('locale=de')),
    localeRequests.slice(-1)[0] || 'none');

  const cards = await page.locator('article').count();
  check('real menu renders from Postgres', cards > 300, `${cards} dishes`);
  await page.screenshot({ path: `${OUT}/fs-1-menu-de.png` });

  // ── dish detail: records an ITEM_VIEW with dwell ─────────────────────────
  await page.locator('article').first().click();
  await page.waitForTimeout(1500);          // let dwell accumulate
  await page.keyboard.press('Escape');
  await page.waitForTimeout(5000);          // let the flush timer run


  // ── butchery: cuts + media come from the database ────────────────────────
  await page.goto(`${BASE}/table1/butchery?cut=rib`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const cutName = await page.locator('aside h2').first().textContent();
  check('butchery opens the deep-linked cut', (cutName || '').trim() === 'Prime Rib', cutName || '');
  const panel = await page.locator('aside').first().innerText();
  check('cut panel lists dishes from the live menu', /RIBEYE|TOMAHAWK/i.test(panel));
  // The point of the whole content layer.
  check('an owner edit is visible on the guest screen', panel.includes(EDITED),
    panel.includes(EDITED) ? 'edited copy rendered' : 'guest still shows the built-in catalogue');
  await page.screenshot({ path: `${OUT}/fs-2-butchery.png` });

  await page.locator('nav[aria-label="Primal cuts"] button').nth(6).click();
  await page.waitForTimeout(1600);

  // Genuinely background the page (CDP), the way locking a tablet does, so the
  // beacon path is exercised rather than simulated.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageVisibilityOverride', { visibility: 'hidden' }).catch(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  });
  await page.waitForTimeout(1500);
  await browser.close();
  await new Promise(r => setTimeout(r, 1500));

  // ── did the events actually land in Postgres? ────────────────────────────
  const after = Number(sql('select count(*) from "ViewEvent"'));
  check('engagement events reached the database', after > before, `${before} -> ${after}`);

  const types = sql(`select "eventType"||' x'||count(*) from "ViewEvent" group by "eventType" order by 1`)
    .split('\n').filter(Boolean).join(', ');
  check('the expected event types were recorded',
    /MENU_VIEW/.test(types) && /ITEM_VIEW/.test(types) && /CUT_VIEW/.test(types) && /LANGUAGE_SELECT/.test(types),
    types);

  const locales = sql(`select locale||' x'||count(*) from "ViewEvent" group by locale order by 1`)
    .split('\n').filter(Boolean).join(', ');
  check('the selected language is recorded on events', /de/.test(locales), locales);

  const dwell = sql(`select coalesce(max("dwellMs"),0) from "ViewEvent" where "eventType"='ITEM_VIEW'`);
  check('dish dwell time is measured', Number(dwell) > 500, `${dwell}ms`);

  const noPii = sql(`select count(*) from information_schema.columns where table_name='ViewEvent' and column_name in ('email','name','phone','ip','ipAddress','userId')`);
  check('the event table stores no personal identifiers', noPii === '0', `${noPii} PII-ish columns`);

  await admin.call(`/api/admin/content/cuts/${ribCut.id}`, 'PATCH', { texture: originalTexture });
  await admin.cleanup();

  const real = errors.filter(e => !/socket|websocket|net::ERR|Failed to load resource|404/i.test(e));
  check('no console errors on the real stack', real.length === 0, real.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
