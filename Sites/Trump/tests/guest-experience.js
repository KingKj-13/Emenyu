/**
 * Verifies the redesigned QR menu against the built client:
 * no login, no cart, no chatbot, 14 languages incl. RTL, and the cow selector
 * as an information experience rather than an ordering one.
 */
const { chromium } = require(require('path').join(__dirname, '..', 'client', 'node_modules', 'playwright'));

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3099/Trump';
const OUT = process.env.SHOT_DIR || require('os').tmpdir();

/**
 * NOT networkidle. The guest menu batches engagement beacons on a timer, so the
 * network never goes quiet for the 500ms Playwright wants — against production
 * that turns every navigation into a 30s timeout. Wait for the document instead
 * and let the individual assertions wait on the elements they care about.
 */
const NAV = { waitUntil: 'domcontentloaded', timeout: 60000 };

/**
 * Navigate and wait for the screen to actually have content. domcontentloaded
 * fires long before the menu has been fetched and rendered, so without this the
 * assertions race the first paint.
 */
async function go(page, url) {
  await page.goto(url, NAV);
  await Promise.race([
    page.locator('article').first().waitFor({ timeout: 45000 }),
    page.locator('aside h2').first().waitFor({ timeout: 45000 }),
  ]).catch(() => {});
  await page.waitForTimeout(400);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/** Nothing in the guest experience may offer ordering. */
async function assertNoOrdering(page, where) {
  const found = await page.evaluate(() => {
    const bad = [];
    const text = document.body.innerText || '';
    if (/\bAdd to cart\b/i.test(text)) bad.push('text: add to cart');
    if (/\bcheckout\b/i.test(text)) bad.push('text: checkout');
    document.querySelectorAll('button,a,[role="button"]').forEach(el => {
      const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`;
      if (/\b(add to cart|open cart|checkout|place order|submit order)\b/i.test(label)) {
        bad.push(`control: ${label.trim().slice(0, 40)}`);
      }
    });
    return bad;
  });
  check(`no ordering affordance — ${where}`, found.length === 0, found.slice(0, 3).join(' | '));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  // ── 1. QR scan goes straight to the food, with no login and no gate ─────
  //     There is no language step in front of the door any more; the switch
  //     lives in the header chrome, so entry must reach content immediately.
  await go(page, `${BASE}/table1`);
  await page.waitForTimeout(600);
  const gateVisible = await page.locator('text=Choose your language').first().isVisible().catch(() => false);
  check('no full-screen language gate on entry', !gateVisible);
  const loginish = await page.evaluate(() =>
    /password|sign in|log in|create account|register|otp/i.test(document.body.innerText || ''));
  check('no customer login / registration anywhere on entry', !loginish);
  await page.screenshot({ path: `${OUT}/qr-1-entry.png` });

  // ── 2. the language dropdown in the header ──────────────────────────────
  await go(page, `${BASE}/table1/menu`);
  await page.waitForTimeout(900);
  const langBtn = page.getByRole('button', { name: /^Language:/i });
  check('header carries a language button', await langBtn.count() === 1);
  await langBtn.click();
  await page.waitForTimeout(300);
  const optionCount = await page.locator('[role="listbox"] [role="option"]').count();
  check('14 languages offered in the dropdown', optionCount === 14, String(optionCount));

  // The endonym must lead — a guest scans for "Français", not "French".
  const natives = await page.locator('[role="listbox"] [role="option"] span:first-child')
    .allInnerTexts();
  check('language names shown in their own script',
    ['Deutsch', 'Français', 'Español', '中文', '日本語', '한국어', 'العربية']
      .every(n => natives.includes(n)),
    natives.join(', '));
  await page.screenshot({ path: `${OUT}/qr-2-language-dropdown.png` });

  await page.locator('[role="listbox"] [role="option"]:has-text("Deutsch")').click();
  await page.waitForTimeout(700);
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  check('document lang follows the choice', htmlLang === 'de', htmlLang);
  // Assert on chrome that is actually on screen — the drawer strings
  // (Schnellzugriff, Weine…) only exist once the side drawer is opened.
  // Poll rather than sleep: switching locale refetches the menu, and against
  // production that round trip outlasts any fixed wait.
  const germanShown = await page.waitForFunction(
    () => /Tippen Sie auf das Tier|Die Fleischerei|Unschlüssig/i.test(document.body.innerText || ''),
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  check('UI chrome switches to German', germanShown);
  check('dropdown closes after choosing', await page.locator('[role="listbox"]').count() === 0);
  await page.screenshot({ path: `${OUT}/qr-2b-german.png` });

  // back to English for the remaining assertions
  await page.getByRole('button', { name: /^Sprache:/i }).click();
  await page.waitForTimeout(300);
  await page.locator('[role="listbox"] [role="option"]:has-text("English")').click();
  await page.waitForTimeout(700);
  await assertNoOrdering(page, 'menu entry');

  // ── 3. the menu itself ──────────────────────────────────────────────────
  const cards = await page.locator('article').count();
  check('menu renders dishes', cards > 20, `${cards} cards`);
  await assertNoOrdering(page, 'menu');
  const chat = await page.locator('[class*="chat" i], [aria-label*="chat" i], [aria-label*="sommelier" i]').count();
  check('no chatbot on the menu', chat === 0, String(chat));

  // ── 3b. the cow sits inline on the menu, ABOVE the bundles ──────────────
  const cowInline = await page.locator('svg[data-cow-chart]').count();
  check('cow selector is inline on the menu', cowInline === 1, String(cowInline));
  const reco = await page.locator('h2:has-text("Not sure what to order")').count();
  check('"Not sure what to order?" is back', reco > 0, String(reco));
  // compareDocumentPosition, not bounding boxes: the cow lives in a bounded
  // stage whose contents transform during flight, so its box is not a
  // reliable proxy for where the section sits in the page.
  const order = await page.evaluate(() => {
    const cow = document.querySelector('svg[data-cow-chart]');
    const bundles = [...document.querySelectorAll('h2')]
      .find(h => /not sure what to order/i.test(h.textContent || ''));
    if (!cow || !bundles) return `missing cow=${!!cow} bundles=${!!bundles}`;
    // FOLLOWING (4) means bundles come after the cow in document order.
    return (cow.compareDocumentPosition(bundles) & Node.DOCUMENT_POSITION_FOLLOWING)
      ? 'cow-above-reco' : 'reco-above-cow';
  });
  check('cow sits above the bundles', order === 'cow-above-reco', order);

  // The Trump book view was removed outright — no toggle, no route.
  const bookToggle = await page.locator('[aria-label*="book" i], button:has-text("Book")').count();
  check('book view is gone', bookToggle === 0, String(bookToggle));
  await page.screenshot({ path: `${OUT}/qr-3-menu.png` });

  // ── 4. a dish opens with information, not an order form ─────────────────
  await page.locator('article').first().click();
  await page.waitForTimeout(700);
  const modalText = await page.locator('[role="dialog"]').first().innerText().catch(() => '');
  check('dish detail opens', modalText.length > 40, `${modalText.length} chars`);
  check('dish shows the order-through-waiter hint', /speak to your waiter/i.test(modalText));
  const qty = await page.locator('[aria-label="Increase quantity"], [aria-label="Decrease quantity"]').count();
  check('no quantity controls', qty === 0);
  await assertNoOrdering(page, 'dish detail');
  await page.screenshot({ path: `${OUT}/qr-4-dish.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ── 5. the butchery ─────────────────────────────────────────────────────
  await go(page, `${BASE}/table1/butchery?cut=rib`);
  await page.waitForTimeout(1800);
  const cutName = await page.locator('aside h2').first().textContent();
  check('cow selector opens the deep-linked cut', (cutName || '').trim() === 'Prime Rib', cutName || '');
  const panelText = await page.locator('aside').first().innerText();
  check('cut lists real menu items', /RIBEYE|TOMAHAWK/i.test(panelText));
  await assertNoOrdering(page, 'butchery');
  const plusButtons = await page.locator('aside button[aria-label^="Add "]').count();
  check('no add buttons in the cut panel', plusButtons === 0, String(plusButtons));
  await page.screenshot({ path: `${OUT}/qr-5-butchery.png` });

  // tapping a dish row opens the dish
  await page.locator('aside li button').first().click();
  await page.waitForTimeout(700);
  const dlg = await page.locator('[role="dialog"]').count();
  check('cut row opens the dish detail', dlg > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ── 6. Arabic: right-to-left throughout ─────────────────────────────────
  await page.evaluate(() => { localStorage.setItem('emenyu.locale', 'ar'); });
  await go(page, `${BASE}/table1/menu`);
  await page.waitForTimeout(900);
  const dir = await page.evaluate(() => document.documentElement.dir);
  check('Arabic sets document direction to rtl', dir === 'rtl', dir);
  const arabicUi = await page.evaluate(() => /القائمة|الأقسام|النادل|قسم اللحوم/.test(document.body.innerText || ''));
  check('Arabic UI strings render', arabicUi);
  // Menu CONTENT is now translated too. Dish names and descriptions arrive in
  // the guest's language; what deliberately stays Latin is the restaurant's own
  // name and the wine/spirit PRODUCER names, because a guest orders that exact
  // bottle and renaming it would break service.
  const arabicContent = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const arabicRuns = (text.match(/[؀-ۿ]{3,}/g) || []).length;
    return { arabicRuns, hasBrand: /Trump/.test(text) };
  });
  check('menu content is translated, not just the chrome',
    arabicContent.arabicRuns > 40, `${arabicContent.arabicRuns} Arabic runs`);
  check('the brand name stays Latin', arabicContent.hasBrand);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow in RTL', overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: `${OUT}/qr-6-arabic.png` });

  // ── 7. CJK: layout survives different character widths ──────────────────
  await page.evaluate(() => { localStorage.setItem('emenyu.locale', 'ja'); });
  await go(page, `${BASE}/table1/butchery`);
  await page.waitForTimeout(1000);
  const jaDir = await page.evaluate(() => document.documentElement.dir);
  const jaLang = await page.evaluate(() => document.documentElement.lang);
  check('Japanese sets lang and stays ltr', jaLang === 'ja' && jaDir === 'ltr', `${jaLang}/${jaDir}`);
  const jaOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow in Japanese', jaOverflow <= 1, `${jaOverflow}px`);
  await page.screenshot({ path: `${OUT}/qr-7-japanese.png` });

  // ── 8. in-app language switch ───────────────────────────────────────────
  await page.evaluate(() => { localStorage.setItem('emenyu.locale', 'en'); });
  await go(page, `${BASE}/table1/menu`);
  await page.waitForTimeout(800);
  const midMenuLang = page.locator('header button[aria-label^="Language"]');
  check('header carries a language switch', await midMenuLang.count() === 1);
  if (await midMenuLang.count()) {
    await midMenuLang.click();
    await page.waitForTimeout(500);
    await page.locator('[role="option"]:has-text("한국어")').click();
    await page.waitForTimeout(600);
    const koLang = await page.evaluate(() => document.documentElement.lang);
    check('switching language mid-menu works', koLang === 'ko', koLang);
    await page.screenshot({ path: `${OUT}/qr-8-korean.png` });
  }

  // ── 8b. the engagement events that used to be declared but never sent ───
  await page.evaluate(() => { localStorage.setItem('emenyu.locale', 'en'); });
  await go(page, `${BASE}/table1/menu`);
  await page.waitForTimeout(1000);

  const sent = [];
  page.on('request', r => {
    if (!r.url().includes('/api/engagement')) return;
    try { sent.push(...JSON.parse(r.postData() || '{}').events.map(e => e.eventType)); } catch { /* beacon */ }
  });

  // Scrolling a chapter into view must register it.
  await page.evaluate(() => {
    document.getElementById('section-trumps-premium-steaks')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(1200);

  // Searching must register the settled query, not every keystroke.
  const menuBtn = page.locator('header button[aria-label]').last();
  await menuBtn.click().catch(() => {});
  await page.waitForTimeout(500);
  const searchBox = page.locator('aside input[type="search"], aside input').first();
  if (await searchBox.count()) {
    await searchBox.fill('ribeye');
    await page.waitForTimeout(1800);
  }
  await page.waitForTimeout(4500);   // let the flush timer run

  check('CATEGORY_VIEW is emitted', sent.includes('CATEGORY_VIEW'), sent.join(',') || 'none');
  check('SEARCH is emitted once settled',
    sent.filter(e => e === 'SEARCH').length === 1,
    `${sent.filter(e => e === 'SEARCH').length} SEARCH events`);

  // ── 9. admin login still protected ──────────────────────────────────────
  await go(page, `${BASE}/Admin`);
  await page.waitForTimeout(900);
  const url = page.url();
  check('admin still requires authentication', /login/i.test(url), url);

  const real = errors.filter(e => !/socket|websocket|net::ERR|Failed to load resource|404/i.test(e));
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
