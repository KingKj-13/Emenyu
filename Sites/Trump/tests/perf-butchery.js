#!/usr/bin/env node
/**
 * Performance budget for the guest experience on the real floor device.
 *
 * The design target is a landscape tablet (11–13"), which is slower than any
 * development laptop, so these numbers are measured under 4x CPU throttling
 * rather than on bare metal. A pass here means the experience holds up on the
 * hardware it actually runs on.
 *
 *   node tests/perf-butchery.js [--base http://127.0.0.1:3099/Trump]
 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'client', 'node_modules', 'playwright'));

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:3099/Trump');
const CPU_THROTTLE = Number(arg('cpu', 4));

/** What "good enough on a tablet" means. Failing one of these is a real regression. */
const BUDGET = {
  menuTransferKb: 1800,     // everything the menu screen pulls, first visit
  butcheryTransferKb: 900,  // the butchery route on top of a warm cache
  menuDomReadyMs: 6000,     // throttled 4x
  liftOffP95Ms: 34,         // ~30fps floor during the cut animation
  // Steady state, i.e. every cut after the first. The FIRST open of a session
  // costs more (compositor layer creation + first raster of a large
  // photograph) and is measured separately below — folding it into the same
  // number would either hide a real regression or fail forever on a cost that
  // is inherent and one-off.
  liftOffWorstMs: 120,
  firstOpenWorstMs: 340,
  heapMb: 90,
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(42)} ${detail}`);
};

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1194, height: 834 },   // iPad Pro 11", landscape
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: false,
  });
  const page = await context.newPage();

  // Count real transfer, not resource count: a 14 KB silhouette and a 140 KB
  // steak photograph are the same "one image" and very different experiences.
  let bytes = 0;
  page.on('response', async res => {
    try {
      const len = Number(res.headers()['content-length'] || 0);
      bytes += len || (await res.body().catch(() => Buffer.alloc(0))).length;
    } catch { /* redirects and aborted requests have no body */ }
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  console.log(`\nLandscape tablet profile · CPU throttled ${CPU_THROTTLE}x · ${BASE}\n`);

  // ── menu screen, cold ────────────────────────────────────────────────────
  await page.goto(`${BASE}/table1/menu`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('emenyu.locale', 'en');
    localStorage.setItem('emenyu.locale.chosen', '1');
  });
  bytes = 0;
  const t0 = Date.now();
  await page.goto(`${BASE}/table1/menu`, { waitUntil: 'networkidle' });
  await page.waitForSelector('article', { timeout: 30000 });
  const menuMs = Date.now() - t0;
  const menuKb = Math.round(bytes / 1024);
  check('menu screen weight', menuKb <= BUDGET.menuTransferKb, `${menuKb} KB (budget ${BUDGET.menuTransferKb})`);
  check('menu screen ready', menuMs <= BUDGET.menuDomReadyMs, `${menuMs} ms (budget ${BUDGET.menuDomReadyMs})`);

  const cards = await page.locator('article').count();
  check('full menu rendered', cards > 300, `${cards} dishes`);

  // ── butchery route ───────────────────────────────────────────────────────
  bytes = 0;
  const t1 = Date.now();
  await page.goto(`${BASE}/table1/butchery`, { waitUntil: 'networkidle' });
  await page.waitForSelector('nav[aria-label="Primal cuts"]', { timeout: 30000 });
  const butcheryMs = Date.now() - t1;
  const butcheryKb = Math.round(bytes / 1024);
  check('butchery route weight', butcheryKb <= BUDGET.butcheryTransferKb,
    `${butcheryKb} KB (budget ${BUDGET.butcheryTransferKb})`);
  check('butchery ready', butcheryMs <= BUDGET.menuDomReadyMs, `${butcheryMs} ms`);

  // Let the idle-time warm-up of the cut photographs finish, so the lift-off
  // measured below is the real "photograph flies off the animal" path.
  await page.waitForTimeout(4000);

  // ── the lift-off animation ───────────────────────────────────────────────
  // Frame deltas are recorded in the page via rAF: an animation that reads
  // smooth on a laptop can drop frames badly under throttling, and the average
  // hides it — the p95 and the worst frame are what a guest actually notices.
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = now => {
      window.__frames.push(now - last);
      last = now;
      window.__raf = requestAnimationFrame(tick);
    };
    window.__raf = requestAnimationFrame(tick);
  });

  // First open, measured on its own.
  await page.locator('#cut-rib').click();
  await page.waitForTimeout(1100);
  const firstFrames = await page.evaluate(() => {
    const f = window.__frames.slice(1).filter(x => x > 0 && x < 2000);
    window.__frames = [];
    return f;
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const firstWorst = Math.max(...firstFrames);
  check('first open (one-off layer + raster cost)', firstWorst <= BUDGET.firstOpenWorstMs,
    `worst ${firstWorst.toFixed(0)} ms (budget ${BUDGET.firstOpenWorstMs})`);

  // Steady state: every cut after the first.
  await page.evaluate(() => { window.__frames = []; });
  for (const cut of ['sirloin', 'fillet', 'rump', 'rib']) {
    await page.locator(`#cut-${cut}`).click();
    await page.waitForTimeout(1100);          // full flight + settle
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);           // full return flight
  }

  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__frames.slice(1).filter(f => f > 0 && f < 2000);
  });

  const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  const p95 = percentile(frames, 95);
  const worst = Math.max(...frames);
  check('lift-off p95 frame time (steady state)', p95 <= BUDGET.liftOffP95Ms,
    `${p95.toFixed(1)} ms (~${(1000 / p95).toFixed(0)} fps, budget ${BUDGET.liftOffP95Ms})`);
  check('no long stall (steady state)', worst <= BUDGET.liftOffWorstMs,
    `worst ${worst.toFixed(0)} ms (budget ${BUDGET.liftOffWorstMs})`);
  console.log(`      ${frames.length} frames, avg ${avg.toFixed(1)} ms (~${(1000 / avg).toFixed(0)} fps)`);

  // ── memory after exercising both screens ─────────────────────────────────
  const heap = await page.evaluate(() => {
    const m = performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  });
  if (heap != null) {
    check('JS heap', heap <= BUDGET.heapMb, `${heap} MB (budget ${BUDGET.heapMb})`);
  }

  // ── touch: a tap must select a cut, not just a mouse click ───────────────
  await page.locator('#cut-sirloin').tap();
  await page.waitForTimeout(1200);
  const opened = (await page.locator('aside h2').first().textContent()) || '';
  check('touch tap selects a cut', /sirloin|strip loin/i.test(opened), opened.trim());

  // ── portrait phone still fits ────────────────────────────────────────────
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
  const pp = await phone.newPage();
  await pp.goto(`${BASE}/table1/butchery`, { waitUntil: 'networkidle' });
  await pp.evaluate(() => {
    localStorage.setItem('emenyu.locale', 'en');
    localStorage.setItem('emenyu.locale.chosen', '1');
  });
  await pp.reload({ waitUntil: 'networkidle' });
  await pp.waitForTimeout(1200);
  const overflow = await pp.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow on a phone', overflow <= 1, `${overflow} px`);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} within budget\n`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('PERF HARNESS ERROR', e); process.exit(2); });
