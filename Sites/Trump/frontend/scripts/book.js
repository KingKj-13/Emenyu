import {
  api,
  CONFIG,
  connectSocket,
  createDeviceIdentity,
  getTableContext,
  loadComponentHtml,
  normalizeName,
  resolveAssetPath
} from './api.js';
import { CartStore } from './cart.js';
import { FilterStore, FILTER_OPTIONS, flattenMenu } from './filters.js';
import { DEALS } from './deals-data.js';

// ============================================================
// CHAPTER MAPS
// ============================================================

const FOOD_CHAPTERS = [
  { key: 'starters',  title: 'To Start',               apiKey: 'Starters',              subs: ['SMALL PLATES'] },
  { key: 'tempura',   title: 'Tempura',                  apiKey: 'Starters',              subs: ['TEMPURA'] },
  { key: 'salads',    title: 'Bespoke Salads',            apiKey: 'Salads',                subs: null },
  { key: 'sushi',     title: 'Sushi & Sashimi',           apiKey: 'Sushi',                 subs: null },
  { key: 'seafood',   title: 'Signature Seafood',         apiKey: 'Signature Seafood',     subs: null },
  { key: 'steaks',    title: 'Trumps Premium Steaks',     apiKey: 'Trumps Premium Steaks', subs: null },
  { key: 'pork',      title: 'Pork & Ribs',               apiKey: 'Pork & Ribs',           subs: null },
  { key: 'lamb',      title: 'Lamb',                      apiKey: 'Lamb',                  subs: null },
  { key: 'venison',   title: 'Venison & Game',            apiKey: 'Venison & Game',        subs: null },
  { key: 'oxtail',    title: 'Oxtail & Beef Ribs',        apiKey: 'Oxtail & Beef Ribs',    subs: null },
  { key: 'combos',    title: 'Signature Combos',          apiKey: 'Signature Combos',      subs: ["SIGNATURE COMBO'S SINCE 1994"] },
  { key: 'platters',  title: 'Signature Platters',        apiKey: 'Signature Combos',      subs: ['TRUMPS SIGNATURE PLATTERS'] },
  { key: 'burgers',   title: 'Gourmet Burgers',           apiKey: 'Burgers',               subs: null },
  { key: 'chicken',   title: 'Chicken Dishes',            apiKey: 'Chicken Dishes',        subs: null },
  { key: 'pastas',    title: 'Trumps Pastas',             apiKey: 'Pastas',                subs: null },
  { key: 'veg',       title: 'Vegetarian',                apiKey: 'Vegetarian',            subs: null },
  { key: 'sides',     title: 'Sides & Extras',            apiKey: 'Sides',                 subs: null },
  { key: 'dessert',   title: 'Dessert & Cakes',           apiKey: 'Dessert',               subs: null }
];

const DRINKS_CHAPTERS = [
  { key: 'sparkling', title: 'Sparkling',              apiKey: 'Champagne',                   subs: null },
  { key: 'white',     title: 'White Wine',              apiKey: 'White Wine',                  subs: null },
  { key: 'red',       title: 'Red Wine',                apiKey: 'Red Wine',                    subs: null },
  { key: 'beer',      title: 'Beer & Cider',            apiKey: 'Beers',                       subs: null },
  { key: 'spirits',   title: 'Spirits',                 apiKey: 'Spirits',
    excludeSubs: ['LIQUEURS', 'DIGESTIFS, PORTS & APERITIFS'] },
  { key: 'liqueurs',  title: 'Liqueurs & After-Dinner', apiKey: 'Spirits',
    subs: ['LIQUEURS', 'DIGESTIFS, PORTS & APERITIFS'] },
  { key: 'soft',      title: 'Soft & Hot',              apiKey: 'Mocktails & Cold Beverages',  subs: null },
  { key: 'cocktails', title: 'Cocktails',               apiKey: 'Cocktails',                   subs: null }
];

const FOOD_INFO_SPREADS = [
  { isInfo: true, chapterKey: '__info1__', leftType: 'info-welcome', rightType: 'info-payment' },
  { isInfo: true, chapterKey: '__info2__', leftType: 'info-beef',    rightType: 'info-wine'    }
];

// 6 items per page, 2 pages per spread = 12 items per spread
const ITEMS_PER_SPREAD = 12;
const FLIP_DUR = 420;

// ============================================================
// STATE
// ============================================================

const state = {
  table: getTableContext(),
  device: createDeviceIdentity(),
  cart: new CartStore(),
  filters: new FilterStore(),
  templates: new Map(),
  socket: null,
  menuData: {},
  itemIndex: new Map(),
  transientItems: new Map(),
  books: { food: [], drinks: [] },
  currentBook: 'food',
  spreads: [],
  chapters: [],
  currentSpreadIndex: 0,
  introActive: false,
  starTimer: null,
  currentItem: null,
  waiterCooldown: false,
  chatOpen: false,
  searchQuery: '',
  filterBarOpen: false
};

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initBookPage().catch(err => console.error('[book]', err));
});

async function initBookPage() {
  await mountSharedComponents();
  hydrateHeader();
  bindBookEvents();
  wireStoreSubscriptions();
  connectMenuSocket();
  setConnectionStatus('Connecting...', false);
  await loadMenuData();
  renderFilterControls();
  renderHistory();
  renderCart();
  renderBottomCartBar();
}

async function mountSharedComponents() {
  await mountComponent('header');
  await ensureTemplate('menu-card');
  await ensureTemplate('category-section');
  await Promise.all([
    mountComponent('filter-bar'),
    mountComponent('cart'),
    mountComponent('chat'),
    mountComponent('bottom-cart')
  ]);
}

async function mountComponent(name) {
  const mount = document.querySelector(`[data-component="${name}"]`);
  if (!mount) return;
  mount.innerHTML = await loadComponentHtml(name);
}

async function ensureTemplate(name) {
  if (state.templates.has(name)) return state.templates.get(name);
  const html = await loadComponentHtml(name);
  const container = document.createElement('div');
  container.innerHTML = html.trim();
  const template = container.querySelector('template');
  state.templates.set(name, template);
  return template;
}

function cloneTemplate(name) {
  const template = state.templates.get(name);
  if (!template) throw new Error(`Template "${name}" not loaded.`);
  return template.content.firstElementChild.cloneNode(true);
}

function hydrateHeader() {
  const brandLink = document.getElementById('brandLink');
  const tablePill = document.getElementById('headerTablePill');
  const menuNavLink = document.querySelector('[data-nav-link="menu"]');

  if (brandLink) brandLink.href = state.table.routePath;
  if (menuNavLink) menuNavLink.href = state.table.routePath;
  if (tablePill) {
    tablePill.hidden = false;
    tablePill.textContent = state.table.formatted;
  }

  document.querySelectorAll('[data-nav-link]').forEach(link => {
    link.classList.toggle('is-active', link.getAttribute('data-nav-link') === 'menu');
  });

  const heroLabel = document.getElementById('heroTableLabel');
  if (heroLabel) heroLabel.textContent = state.table.formatted;
}

// ============================================================
// MENU DATA + BOOK BUILDING
// ============================================================

async function loadMenuData() {
  state.menuData = (await api.getMenu()) || {};
  buildItemIndex();
  buildBooksFromMenu();
  await setCurrentBook('food', false);
}

function buildItemIndex() {
  const flatItems = flattenMenu(state.menuData);
  state.itemIndex = new Map();
  flatItems.forEach(item => {
    item.img = item.img || inferImageForItem(item);
    state.itemIndex.set(normalizeName(item.name), item);
  });
}

function extractChapterItems(menuData, desc) {
  const cat = menuData[desc.apiKey];
  if (!cat || cat.visible === false) return [];
  const items = [];
  if (Array.isArray(cat.items)) {
    items.push(...cat.items.filter(i => i.visible !== false));
  }
  Object.entries(cat).forEach(([subKey, subVal]) => {
    if (subKey === 'items' || subKey === 'visible' || !subVal || typeof subVal !== 'object') return;
    if (subVal.visible === false) return;
    if (desc.excludeSubs && desc.excludeSubs.some(e => normalizeName(e) === normalizeName(subKey))) return;
    if (desc.subs && !desc.subs.some(s => normalizeName(s) === normalizeName(subKey))) return;
    if (Array.isArray(subVal.items)) {
      items.push(...subVal.items.filter(i => i.visible !== false));
    }
  });
  return items;
}

function buildBooksFromMenu() {
  state.books.food = FOOD_CHAPTERS
    .map(ch => ({ ...ch, items: extractChapterItems(state.menuData, ch) }))
    .filter(ch => ch.items.length > 0);

  state.books.drinks = DRINKS_CHAPTERS
    .map(ch => ({ ...ch, items: extractChapterItems(state.menuData, ch) }))
    .filter(ch => ch.items.length > 0);
}

// ============================================================
// BOOK SWITCHING + SPREAD BUILDING
// ============================================================

async function setCurrentBook(bookKey, skipIntro = false) {
  state.currentBook = bookKey;

  document.getElementById('ribbonFood')?.classList.toggle('is-active', bookKey === 'food');
  document.getElementById('ribbonDrinks')?.classList.toggle('is-active', bookKey === 'drinks');

  document.body.classList.remove('book--food', 'book--drinks');
  document.body.classList.add(`book--${bookKey}`);

  rebuildSpreads();
  state.currentSpreadIndex = 0;
  renderCurrentSpread();
  renderChapterIndex();

  if (!skipIntro) {
    await playIntro(bookKey);
    renderCurrentSpread(); // Re-render after intro — ensures content is visible
  }

  scheduleGoldStar();
}

function rebuildSpreads() {
  const chapters = state.books[state.currentBook] || [];
  state.spreads = [];
  state.chapters = [];

  if (state.currentBook === 'food') {
    FOOD_INFO_SPREADS.forEach(s => state.spreads.push(s));
  }

  chapters.forEach(chapter => {
    const filtered = chapter.items.filter(item =>
      !state.filters.shouldHideItem(item) && matchesSearch(item, state.searchQuery)
    );
    if (filtered.length === 0) return;

    const firstSpreadIndex = state.spreads.length;
    const totalPages = Math.ceil(filtered.length / 6); // 6 items per page
    state.chapters.push({ key: chapter.key, title: chapter.title, firstSpreadIndex });

    for (let i = 0; i < filtered.length; i += ITEMS_PER_SPREAD) {
      const batch = filtered.slice(i, i + ITEMS_PER_SPREAD);
      const leftItems  = batch.slice(0, 6);
      const rightItems = batch.slice(6);
      const leftPageNum  = Math.floor(i / 6) + 1;
      const rightPageNum = leftPageNum + 1;

      state.spreads.push({
        chapterKey: chapter.key,
        chapterTitle: chapter.title,
        leftItems,
        rightItems,
        leftPageNum,
        rightPageNum,
        totalPages
      });
    }
  });
}

function matchesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [item.name, item.description, item.allergens, item.types].join(' ').toLowerCase().includes(q);
}

// ============================================================
// RENDER CURRENT SPREAD
// ============================================================

function renderCurrentSpread() {
  const container = document.getElementById('flipBook');
  if (!container) return;
  container.innerHTML = '';

  if (state.spreads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'book-empty';
    empty.textContent = 'No items match the current filters.';
    container.appendChild(empty);
    updateNavButtons();
    return;
  }

  const spread = state.spreads[state.currentSpreadIndex];
  if (!spread) { console.error('[book] No spread at index', state.currentSpreadIndex, '/', state.spreads.length); return; }

  const spreadEl = document.createElement('div');
  spreadEl.className = 'book-spread';

  if (spread.isInfo) {
    spreadEl.appendChild(buildInfoPage(spread.leftType, 'left'));
    spreadEl.appendChild(buildInfoPage(spread.rightType, 'right'));
  } else {
    spreadEl.appendChild(buildPage(
      spread.leftItems, spread.chapterTitle,
      spread.leftPageNum, spread.totalPages, 'left'
    ));
    spreadEl.appendChild(buildPage(
      spread.rightItems, spread.chapterTitle,
      spread.rightPageNum, spread.totalPages, 'right'
    ));
  }

  container.appendChild(spreadEl);
  updateNavButtons();
}

function buildPage(items, chapterTitle, pageNum, totalPages, side) {
  const page = document.createElement('div');
  page.className = `page page--${side}`;

  if (!items || items.length === 0) {
    page.classList.add('page--blank');
    return page;
  }

  const inner = document.createElement('div');
  inner.className = 'page__inner';

  // Logo row (two corners)
  const logoRow = document.createElement('div');
  logoRow.className = 'page__logo-row';
  logoRow.innerHTML =
    `<img class="page__logo" src="/Trump/Images/Logo.png" alt="" aria-hidden="true">` +
    `<img class="page__logo" src="/Trump/Images/Logo.png" alt="" aria-hidden="true">`;
  inner.appendChild(logoRow);

  // Chapter title with red rule lines
  const chBlock = document.createElement('div');
  chBlock.className = 'page__chapter-block';
  chBlock.innerHTML =
    `<div class="page__rule"></div>` +
    `<p class="page__chapter-title">${escapeHtml(chapterTitle)}</p>` +
    `<div class="page__rule"></div>`;
  inner.appendChild(chBlock);

  // Items list
  const list = document.createElement('ul');
  list.className = 'page__items';
  items.forEach(item => {
    rememberItem(item);
    const li = document.createElement('li');
    li.className = 'page__item';
    li.dataset.itemName = item.name;
    li.dataset.action = 'open-item';
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.innerHTML =
      `<div class="page__item-row">` +
        `<span class="page__item-name">${escapeHtml(item.name)}</span>` +
        `<span class="page__item-price">${formatPrice(item.price)}</span>` +
      `</div>` +
      (item.description
        ? `<div class="page__item-desc">${escapeHtml(item.description)}</div>`
        : '');
    list.appendChild(li);
  });
  inner.appendChild(list);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'page__footer';
  if (totalPages > 2) {
    footer.textContent = `${chapterTitle}  ·  ${pageNum} / ${totalPages}`;
  }
  inner.appendChild(footer);

  page.appendChild(inner);
  return page;
}

function buildInfoPage(type, side) {
  const page = document.createElement('div');
  page.className = `page page--${side} page--info`;
  const inner = document.createElement('div');
  inner.className = 'page__inner page__inner--info';

  if (type === 'info-welcome') {
    inner.innerHTML = `
      <div class="info__logo-wrap"><img src="/Trump/Images/Logo.png" alt="Trumps" class="info__logo"></div>
      <div class="page__rule"></div>
      <h2 class="info__title">TRUMP PRIME GRILLHOUSE</h2>
      <div class="page__rule"></div>
      <p class="info__tagline">UPMARKET &amp; CONTEMPORARY GRILLHOUSE<br>WINE CELLAR · BUTCHERY · BILTONG SHOP</p>
      <p class="info__est">EST 1994</p>
      <p class="info__sub">Purveyors of Prime Quality<br>South African Beef, Biltong &amp; Prestigious Wine</p>`;
  } else if (type === 'info-payment') {
    inner.innerHTML = `
      <h3 class="info__heading">PAYMENT</h3>
      <div class="page__rule"></div>
      <p class="info__body">For tables of 8 or more, we recommend a 10% service charge. All major credit cards accepted. Prices include 15% VAT. No cheques.</p>
      <h3 class="info__heading">EQUITABLE SHARING</h3>
      <div class="page__rule"></div>
      <p class="info__body info__body--italic">All tips shared — 75% to waiters, 25% to all other staff.</p>
      <div class="info__contact">
        <p>+27 (11) 784 2366</p>
        <p>bookings@trumps-grill.com</p>
        <p>www.trumps-grill.com</p>
      </div>`;
  } else if (type === 'info-beef') {
    inner.innerHTML = `
      <h3 class="info__heading">OUR FOCUS IS PURELY ON PRIME BEEF</h3>
      <div class="page__rule"></div>
      <p class="info__body info__body--italic">Trumps was the first restaurant on Nelson Mandela Square in 1994. Our primal cuts — Rump, Sirloin, T-bone, Prime Rib and Rib-eye — are matured 21–40 days.</p>
      <p class="info__body">A-grade, grain-fed Karan and Chalmar Beef. Expertly aged by our on-site butcher. Our beef and lamb melt in your mouth. Our ribs fall off the bone.</p>
      <p class="info__body info__body--bold">ALL STEAKS SALT &amp; PEPPER-CRUSTED OR BASTED WITH OUR IN-HOUSE BBQ GLAZE.</p>`;
  } else if (type === 'info-wine') {
    inner.innerHTML = `
      <h3 class="info__heading">PRESTIGIOUS WINE CELLAR</h3>
      <div class="page__rule"></div>
      <p class="info__body info__body--italic">A delectable selection from the finest Cape Winelands. All cellar wines 20% off restaurant price for take-home.</p>
      <h3 class="info__heading">PRIVATE DINING</h3>
      <div class="page__rule"></div>
      <p class="info__body">Vilafonte VIP Wine Room — 20–28 guests.<br>Two Glenfiddich VIP Grill Rooms — 12–16 guests each.</p>
      <p class="info__note">Right of Admission Reserved. Tables are booked in advance.</p>`;
  }

  page.appendChild(inner);
  return page;
}

function updateNavButtons() {
  const prev = document.getElementById('bookPrev');
  const next = document.getElementById('bookNext');
  if (prev) prev.disabled = state.currentSpreadIndex === 0;
  if (next) next.disabled = state.currentSpreadIndex >= state.spreads.length - 1;
}

// ============================================================
// CHAPTER INDEX
// ============================================================

function renderChapterIndex() {
  const nav = document.getElementById('chapterIndex');
  if (!nav) return;
  nav.innerHTML = '';

  state.chapters.forEach(ch => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chapter-pill';
    btn.textContent = ch.title;
    btn.dataset.chapterKey = ch.key;
    nav.appendChild(btn);
  });

  syncChapterHighlight();
}

function syncChapterHighlight() {
  const spread = state.spreads[state.currentSpreadIndex];
  if (!spread) return;

  document.querySelectorAll('.chapter-pill').forEach(pill => {
    pill.classList.toggle('is-active', pill.dataset.chapterKey === spread.chapterKey);
  });

  const activePill = document.querySelector('.chapter-pill.is-active');
  activePill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// ============================================================
// FLIP NAVIGATION
// ============================================================

function flipToSpread(targetIndex, direction) {
  if (targetIndex < 0 || targetIndex >= state.spreads.length) return;
  if (targetIndex === state.currentSpreadIndex) return;

  const container = document.getElementById('flipBook');
  if (!container) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) {
    state.currentSpreadIndex = targetIndex;
    renderCurrentSpread();
    syncChapterHighlight();
    return;
  }

  const cls = direction === 'forward' ? 'is-flipping-forward' : 'is-flipping-backward';
  container.classList.add(cls);

  setTimeout(() => {
    state.currentSpreadIndex = targetIndex;
    renderCurrentSpread();
    syncChapterHighlight();
  }, FLIP_DUR * 0.45);

  setTimeout(() => container.classList.remove(cls), FLIP_DUR + 30);
}

function goNext() {
  if (state.currentSpreadIndex < state.spreads.length - 1) {
    flipToSpread(state.currentSpreadIndex + 1, 'forward');
  }
}

function goPrev() {
  if (state.currentSpreadIndex > 0) {
    flipToSpread(state.currentSpreadIndex - 1, 'backward');
  }
}

function jumpToChapter(chapterKey) {
  const ch = state.chapters.find(c => c.key === chapterKey);
  if (!ch) return;
  const dir = ch.firstSpreadIndex > state.currentSpreadIndex ? 'forward' : 'backward';
  flipToSpread(ch.firstSpreadIndex, dir);
}

// ============================================================
// INTRO ANIMATION
// ============================================================

async function playIntro(bookKey) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const overlay = document.getElementById('bookIntro');
  if (!overlay) return;

  overlay.className = '';
  overlay.classList.add(`book-intro--${bookKey}`);

  const titleEl    = document.getElementById('bookIntroTitle');
  const card       = document.getElementById('bookIntroCard');
  const cardContent = document.getElementById('bookIntroCardContent');
  const cover      = document.getElementById('bookIntroCover');

  if (titleEl) {
    titleEl.innerHTML = bookKey === 'food'
      ? `<img class="book-intro__logo" src="/Trump/Images/Logo.png" alt="Trump Prime Grillhouse">` +
        `<p class="book-intro__name">Trump Prime Grillhouse</p>` +
        `<p class="book-intro__sub">Est 1994</p>` +
        `<p class="book-intro__tap-hint">Tap to open</p>`
      : `<p class="book-intro__name">Wine List &amp; Drinks</p>` +
        `<p class="book-intro__sub">Trump Prime Grillhouse</p>` +
        `<p class="book-intro__tap-hint">Tap to open</p>`;
  }

  if (cardContent) {
    cardContent.innerHTML = bookKey === 'food'
      ? `<div class="intro-card__logo-wrap"><img class="intro-card__logo" src="/Trump/Images/Logo.png" alt="Trumps"></div>
         <p class="intro-card__title">TRUMP PRIME GRILLHOUSE</p>
         <div class="intro-card__rule"></div>
         <p class="intro-card__tagline">UPMARKET &amp; CONTEMPORARY GRILLHOUSE<br>WINE CELLAR · BUTCHERY · BILTONG SHOP</p>
         <p class="intro-card__est">EST 1994</p>
         <p class="intro-card__sub">Purveyors of Prime Quality South African Beef,<br>Biltong &amp; Prestigious Wine</p>
         <p class="intro-card__hint">Tap to open</p>`
      : `<div class="intro-card__logo-wrap"><img class="intro-card__logo" src="/Trump/Images/Logo.png" alt="Trumps"></div>
         <p class="intro-card__title">WINE LIST &amp; DRINKS</p>
         <div class="intro-card__rule"></div>
         <p class="intro-card__tagline">TRUMP PRIME GRILLHOUSE</p>
         <p class="intro-card__est">EST 1994</p>
         <p class="intro-card__hint">Tap to open</p>`;
  }

  if (reduced) return;

  overlay.hidden = false;
  if (card)   { card.hidden = false; card.classList.remove('is-exiting'); }
  if (cover)  cover.hidden = true;
  if (titleEl) titleEl.hidden = true;
  state.introActive = true;

  await new Promise(resolve => {
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      overlay.hidden = true;
      if (card)   { card.hidden = true; card.classList.remove('is-exiting'); }
      if (cover)  cover.hidden = false;
      if (titleEl) titleEl.hidden = false;
      state.introActive = false;
      resolve();
    }

    function openBook() {
      if (finished) return;
      if (card) card.classList.add('is-exiting');
      setTimeout(() => {
        if (finished) return;
        if (card)   card.hidden = true;
        if (cover)  cover.hidden = false;
        if (titleEl) titleEl.hidden = false;
        requestAnimationFrame(() => {
          overlay.classList.add('book-intro--opening');
          const left = overlay.querySelector('.book-intro__cover-left');
          if (left) left.addEventListener('animationend', finish, { once: true });
          setTimeout(finish, 1500);
        });
      }, 350);
    }

    overlay.addEventListener('click', finish, { once: true });
    setTimeout(openBook, 2600);
  });
}

// ============================================================
// GOLD STAR + DEALS
// ============================================================

function scheduleGoldStar() {
  clearTimeout(state.starTimer);
  state.starTimer = setTimeout(showGoldStar, 5000);
}

function showGoldStar() {
  const btn = document.getElementById('goldStarBtn');
  if (btn) btn.hidden = false;
}

function openDealsDrawer() {
  const drawer = document.getElementById('dealsDrawer');
  const content = document.getElementById('dealsContent');
  if (!drawer || !content) return;

  content.innerHTML = '';
  DEALS.forEach(deal => {
    const card = document.createElement('div');
    card.className = 'deal-card';
    card.innerHTML =
      `<p class="deal-card__title">${escapeHtml(deal.title)}</p>` +
      `<p class="deal-card__desc">${escapeHtml(deal.desc)}</p>` +
      `<p class="deal-card__offer">${escapeHtml(deal.offer)}</p>`;
    content.appendChild(card);
  });

  drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add('is-open'));
}

function closeDealsDrawer() {
  const drawer = document.getElementById('dealsDrawer');
  if (!drawer) return;
  drawer.classList.remove('is-open');
  setTimeout(() => { drawer.hidden = true; }, 340);
}

// ============================================================
// BIND EVENTS
// ============================================================

function bindBookEvents() {
  document.body.addEventListener('click', event => {
    // Book ribbon
    const ribbonBtn = event.target.closest('[data-book]');
    if (ribbonBtn) {
      const book = ribbonBtn.dataset.book;
      if (book !== state.currentBook) {
        setCurrentBook(book, false).catch(console.error);
      }
      return;
    }

    // Filter toggle
    if (event.target.id === 'ribbonFilterToggle') {
      toggleFilterBar();
      return;
    }

    // Filter drawer close
    if (event.target.id === 'filterDrawerClose' || event.target.id === 'filterDrawerBackdrop') {
      closeFilterDrawer();
      return;
    }

    // Chapter pill
    const pill = event.target.closest('.chapter-pill');
    if (pill) {
      jumpToChapter(pill.dataset.chapterKey);
      return;
    }

    // Nav arrows
    if (event.target.id === 'bookPrev' || event.target.closest('#bookPrev')) {
      goPrev();
      return;
    }
    if (event.target.id === 'bookNext' || event.target.closest('#bookNext')) {
      goNext();
      return;
    }

    // Book item → open modal
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.getAttribute('data-action');

      if (action === 'open-item') {
        const name = actionTarget.closest('[data-item-name]')?.dataset.itemName;
        if (name) openItemModalByName(name);
        return;
      }
      if (action === 'add-item') {
        const name = actionTarget.closest('[data-item-name]')?.dataset.itemName;
        if (name) addItemByName(name);
        return;
      }
      if (action === 'toggle-chat') { toggleChat(); return; }
      if (action === 'close-cart') { closeModal('cartModal'); return; }
      if (action === 'open-history') { openHistoryModal(); return; }
      if (action === 'close-history') { closeModal('historyModal'); return; }
      if (action === 'close-item-detail') { closeModal('itemDetailModal'); return; }
      if (action === 'cart-decrease') {
        state.cart.updateQty(Number(actionTarget.dataset.index), -1);
        syncCartToServer();
        return;
      }
      if (action === 'cart-increase') {
        state.cart.updateQty(Number(actionTarget.dataset.index), 1);
        syncCartToServer();
        return;
      }
      if (action === 'cart-remove') {
        state.cart.removeAt(Number(actionTarget.dataset.index));
        syncCartToServer();
        return;
      }
      return;
    }

    // Filter chips
    const filterBtn = event.target.closest('[data-filter-key]');
    if (filterBtn) { state.filters.toggle(filterBtn.dataset.filterKey); return; }

    const removeFilterBtn = event.target.closest('[data-remove-filter]');
    if (removeFilterBtn) { state.filters.remove(removeFilterBtn.dataset.removeFilter); return; }

    // Gold star
    if (event.target.id === 'goldStarBtn') { openDealsDrawer(); return; }

    // Deals close
    if (event.target.id === 'dealsCloseBtn') { closeDealsDrawer(); return; }
    if (event.target.id === 'dealsBackdrop') { closeDealsDrawer(); return; }

    // Cart / checkout / history
    if (event.target.id === 'bottomCartButton') { openCartModal(); return; }
    if (event.target.id === 'bottomHistoryButton') { openHistoryModal(); return; }
    if (event.target.id === 'checkoutButton') { checkout(); return; }
    if (event.target.id === 'itemDetailAddButton' && state.currentItem) {
      addItem(state.currentItem);
      closeModal('itemDetailModal');
      return;
    }

    // Waiter
    if (event.target.id === 'waiterButton') { callWaiter(); return; }

    // Search clear
    if (event.target.id === 'menuSearchClear') {
      state.searchQuery = '';
      const input = document.getElementById('menuSearchInput');
      if (input) input.value = '';
      rebuildSpreads();
      state.currentSpreadIndex = 0;
      renderCurrentSpread();
      renderChapterIndex();
      return;
    }

    // Chat
    if (event.target.id === 'chatSendButton') { sendChatMessage(); return; }

    const chatPrompt = event.target.closest('[data-chat-prompt]');
    if (chatPrompt) { sendChatMessage(chatPrompt.dataset.chatPrompt); return; }
  });

  // Keyboard: Enter/Space on page items
  document.body.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.page__item')) {
      event.preventDefault();
      const name = event.target.closest('.page__item').dataset.itemName;
      if (name) openItemModalByName(name);
    }
  });

  // Arrow keys
  document.addEventListener('keydown', event => {
    if (state.introActive) return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key) &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
      event.key === 'ArrowRight' ? goNext() : goPrev();
    }
  });

  // Swipe gestures
  let touchStartX = 0;
  document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60 && !state.introActive) {
      dx < 0 ? goNext() : goPrev();
    }
  }, { passive: true });

  // Cart note blur
  document.body.addEventListener('focusout', event => {
    const noteInput = event.target.closest('.cart-note-input');
    if (noteInput) {
      state.cart.setNote(Number(noteInput.dataset.index), noteInput.value);
      syncCartToServer();
    }
  }, true);

  // Search input
  document.body.addEventListener('input', event => {
    if (event.target.id === 'menuSearchInput') {
      state.searchQuery = event.target.value.trim();
      rebuildSpreads();
      state.currentSpreadIndex = 0;
      renderCurrentSpread();
      renderChapterIndex();
    } else if (event.target.id === 'customTipInput') {
      renderCartTotals();
    }
  });

  document.body.addEventListener('change', event => {
    if (event.target.name === 'tipMode') renderCartTotals();
  });

  document.body.addEventListener('keydown', event => {
    if (event.target.id === 'chatInput' && event.key === 'Enter') {
      event.preventDefault();
      sendChatMessage();
    }
  });
}

function toggleFilterBar() {
  const drawer = document.getElementById('filterDrawer');
  const btn = document.getElementById('ribbonFilterToggle');
  if (!drawer) return;
  state.filterBarOpen = !state.filterBarOpen;
  drawer.hidden = !state.filterBarOpen;
  if (btn) btn.classList.toggle('is-active', state.filterBarOpen);
}

function closeFilterDrawer() {
  const drawer = document.getElementById('filterDrawer');
  const btn = document.getElementById('ribbonFilterToggle');
  state.filterBarOpen = false;
  if (drawer) drawer.hidden = true;
  if (btn) btn.classList.remove('is-active');
}

function wireStoreSubscriptions() {
  state.cart.subscribe(() => {
    renderCart();
    renderHistory();
    renderBottomCartBar();
  });

  state.filters.subscribe(() => {
    renderFilterControls();
    rebuildSpreads();
    state.currentSpreadIndex = 0;
    renderCurrentSpread();
    renderChapterIndex();
  });
}

// ============================================================
// SOCKET
// ============================================================

function connectMenuSocket() {
  state.socket = connectSocket();

  state.socket.on('connect', () => {
    setConnectionStatus('Live', true);
    state.socket.emit('joinTable', {
      tableId: state.table.normalized,
      restaurantId: CONFIG.RESTAURANT_ID,
      deviceId: state.device.deviceId
    });
  });

  state.socket.on('disconnect', () => {
    setConnectionStatus('Offline', false);
  });

  state.socket.on('syncCart', payload => {
    if (payload?.restaurantId && payload.restaurantId !== CONFIG.RESTAURANT_ID) return;
    state.cart.replaceCart(payload?.cart || payload || []);
  });

  state.socket.on('syncHistory', payload => {
    if (payload?.restaurantId && payload.restaurantId !== CONFIG.RESTAURANT_ID) return;
    state.cart.setHistory(payload?.history || payload || []);
  });

  state.socket.on('menuUpdated', async () => {
    state.menuData = (await api.getMenu()) || {};
    buildItemIndex();
    buildBooksFromMenu();
    rebuildSpreads();
    renderCurrentSpread();
    renderChapterIndex();
  });

  state.socket.on('waiterOnTheWay', payload => {
    showToast(payload?.message || 'A waiter is on the way.', 4000);
  });

  state.socket.on('orderStatusChanged', payload => {
    if (!payload || normalizeName(payload.tableId) !== state.table.normalized) return;
    if (payload.status === 'cooking') showToast('The kitchen has started your order.', 3000);
    else if (payload.status === 'ready') showToast('Your order is ready to be served.', 3500);
  });
}

// ============================================================
// CART
// ============================================================

function addItem(item) {
  const resolved = rememberItem(item);
  state.cart.addItem({ ...resolved, qty: 1 });
  syncCartToServer();
  animateCartFeedback();
  showToast(`${resolved.name} added.`, 1500);
}

function addItemByName(name) {
  const item = getItemByName(name);
  if (item) addItem(item);
}

function syncCartToServer() {
  if (!state.socket) return;
  state.socket.emit('updateCart', {
    tableId: state.table.normalized,
    restaurantId: CONFIG.RESTAURANT_ID,
    cart: state.cart.items,
    deviceId: state.device.deviceId
  });
}

function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const cartTableDisplay = document.getElementById('cartTableDisplay');
  if (!cartItems || !cartTableDisplay) return;

  cartTableDisplay.textContent = `Table: ${state.table.formatted}`;
  cartItems.innerHTML = '';

  if (state.cart.items.length === 0) {
    cartItems.innerHTML = '<div class="empty-state">The cart is empty. Start with a few plates or a drinks pairing.</div>';
    renderCartTotals();
    return;
  }

  state.cart.items.forEach((item, index) => {
    const entry = document.createElement('div');
    entry.className = 'cart-entry';
    entry.innerHTML = `
      <div class="cart-entry__top">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p class="history-entry__meta">${formatPrice(item.price)} each</p>
        </div>
        <strong>${formatPrice(item.price * item.qty)}</strong>
      </div>
      <div class="cart-entry__bottom">
        <div class="cart-controls">
          <button class="icon-button" type="button" data-action="cart-decrease" data-index="${index}" aria-label="Decrease quantity">-</button>
          <span>${item.qty}</span>
          <button class="icon-button" type="button" data-action="cart-increase" data-index="${index}" aria-label="Increase quantity">+</button>
        </div>
        <button class="icon-button" type="button" data-action="cart-remove" data-index="${index}">Remove</button>
      </div>
      <label class="search-field">
        <span class="search-field__label">Special request</span>
        <textarea class="cart-note-input" data-index="${index}" placeholder="Sauce on the side, extra cook note...">${escapeHtml(item.note)}</textarea>
      </label>
    `;
    cartItems.appendChild(entry);
  });

  renderCartTotals();
}

function renderCartTotals() {
  const tipMode = document.querySelector('input[name="tipMode"]:checked')?.value || '0';
  const customTip = document.getElementById('customTipInput')?.value || '0';
  const totals = state.cart.getTotals(tipMode, customTip);
  setText('subtotalValue', formatPrice(totals.subtotal));
  setText('vatValue', formatPrice(totals.vat));
  setText('serviceValue', formatPrice(totals.service));
  setText('tipValue', formatPrice(totals.tip));
  setText('totalValue', formatPrice(totals.total));
}

function renderBottomCartBar() {
  const bar = document.getElementById('bottomCartBar');
  if (!bar) return;
  const count = state.cart.getCount();
  bar.hidden = count === 0;
  setText('bottomCartCount', `${count} ${count === 1 ? 'item' : 'items'}`);
  setText('bottomCartTotal', formatPrice(state.cart.getSubtotal()));
}

function animateCartFeedback() {
  const bar = document.getElementById('bottomCartBar');
  if (!bar) return;
  bar.classList.remove('is-pulsing');
  requestAnimationFrame(() => bar.classList.add('is-pulsing'));
}

function renderHistory() {
  const historyMount = document.getElementById('historyItems');
  if (!historyMount) return;
  historyMount.innerHTML = '';

  if (state.cart.history.length === 0) {
    historyMount.innerHTML = '<div class="empty-state">No active food orders for this table right now.</div>';
    return;
  }

  state.cart.history.forEach(item => {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.innerHTML = `
      <div class="history-entry__title">${escapeHtml(item.name)}</div>
      <div class="history-entry__meta">Qty ${item.qty}</div>
    `;
    historyMount.appendChild(entry);
  });
}

// ============================================================
// MODALS
// ============================================================

function openCartModal() { openModal('cartModal'); }

function openHistoryModal() {
  openModal('historyModal');
  if (state.socket) {
    state.socket.emit('fetchHistory', {
      tableId: state.table.normalized,
      restaurantId: CONFIG.RESTAURANT_ID,
      deviceId: state.device.deviceId
    });
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function openItemModalByName(name) {
  const item = getItemByName(name);
  if (item) openItemModal(item);
}

function openItemModal(item) {
  state.currentItem = rememberItem(item);
  setText('itemDetailTitle', state.currentItem.name);
  setText('itemDetailDescription', state.currentItem.description || 'No description available yet.');
  setText('itemDetailPrice', formatPrice(state.currentItem.price));
  setText('itemDetailMeta', buildFootnote(state.currentItem));
  setText(
    'itemDetailAllergens',
    state.currentItem.allergens ? `Allergens: ${state.currentItem.allergens}` : 'Allergens: Not listed'
  );

  const mediaMount = document.getElementById('itemDetailMedia');
  if (mediaMount) {
    mediaMount.innerHTML = '';
    if (state.currentItem.video && state.currentItem.videoVisible !== false) {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.src = resolveAssetPath(state.currentItem.video);
      mediaMount.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = resolveImage(state.currentItem);
      img.alt = state.currentItem.name;
      img.onerror = () => { img.src = resolveAssetPath('Images/Tomahawk.jpg'); };
      mediaMount.appendChild(img);
    }
  }

  openModal('itemDetailModal');
}

async function checkout() {
  if (state.cart.items.length === 0) { showToast('The cart is empty.', 2200); return; }

  const tipMode = document.querySelector('input[name="tipMode"]:checked')?.value || '0';
  const customTip = document.getElementById('customTipInput')?.value || '0';
  const totals = state.cart.getTotals(tipMode, customTip);

  const order = {
    table_number: state.table.normalized,
    restaurantId: CONFIG.RESTAURANT_ID,
    deviceId: state.device.deviceId,
    items: state.cart.items,
    totals,
    timestamp: new Date().toISOString()
  };

  try {
    await api.submitOrder(order);
    state.cart.clear();
    closeModal('cartModal');
    showToast('Order placed successfully.', 3000);
  } catch {
    showToast('Order failed. Please try again.', 3200);
  }
}

// ============================================================
// FILTERS
// ============================================================

function renderFilterControls() {
  const chipList = document.getElementById('filterChipList');
  const activeList = document.getElementById('activeFilterList');
  if (!chipList || !activeList) return;

  chipList.innerHTML = '';
  activeList.innerHTML = '';

  FILTER_OPTIONS.forEach(option => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-chip${state.filters.has(option.key) ? ' is-active' : ''}`;
    btn.dataset.filterKey = option.key;
    btn.textContent = option.label;
    chipList.appendChild(btn);
  });

  state.filters.values().forEach(filterKey => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'active-filter';
    chip.dataset.removeFilter = filterKey;
    chip.innerHTML = `<span>${filterKey}</span><span class="active-filter__remove">Clear</span>`;
    activeList.appendChild(chip);
  });
}

// ============================================================
// WAITER + TOAST + CONNECTION
// ============================================================

function callWaiter() {
  if (state.waiterCooldown || !state.socket) return;
  state.waiterCooldown = true;
  state.socket.emit('callWaiter', {
    tableId: state.table.normalized,
    restaurantId: CONFIG.RESTAURANT_ID,
    deviceId: state.device.deviceId
  });
  showToast('A waiter has been requested.', 3200);
  setTimeout(() => { state.waiterCooldown = false; }, 4000);
}

function showToast(message, duration = 2600) {
  const toast = document.getElementById('waiterToast');
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.hidden = true; }, duration);
}

function setConnectionStatus(label, connected) {
  const badge = document.getElementById('connectionBadge');
  if (!badge) return;
  badge.textContent = label;
  badge.style.color = connected ? 'var(--color-gold-soft)' : 'var(--color-sand)';
}

// ============================================================
// CHAT
// ============================================================

function toggleChat() {
  const launcher = document.getElementById('chatLauncher');
  const panel = document.getElementById('chatPanel');
  if (!launcher || !panel) return;
  state.chatOpen = !state.chatOpen;
  panel.hidden = !state.chatOpen;
  launcher.setAttribute('aria-expanded', String(state.chatOpen));
}

async function sendChatMessage(forcedMessage = '') {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const message = String(forcedMessage || input.value).trim();
  if (!message) return;

  appendChatMessage(message, 'user');
  input.value = '';

  try {
    const response = await api.chat({
      message,
      tableId: state.table.normalized,
      restaurantId: CONFIG.RESTAURANT_ID,
      deviceId: state.device.deviceId,
      cart: state.cart.items
    });
    appendChatMessage(response.reply || 'I am checking that now.', 'bot');
    renderChatSuggestions(response.suggestions || []);
  } catch {
    appendChatMessage('Sorry, the concierge is having trouble right now.', 'bot');
  }
}

function appendChatMessage(text, role) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble${role === 'user' ? ' chat-bubble--user' : ''}`;
  bubble.innerHTML = decorateChatText(text);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;

  bubble.querySelectorAll('[data-chat-item]').forEach(btn => {
    btn.addEventListener('click', () => openItemModalByName(btn.dataset.chatItem));
  });
}

function decorateChatText(text) {
  const raw = String(text || '');
  const names = [...state.itemIndex.values()].map(i => i.name).filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return escapeHtml(raw);

  const nameLookup = new Map(names.map(n => [normalizeName(n), n]));
  const matcher = new RegExp(names.map(escapeRegExp).join('|'), 'gi');
  let output = '';
  let cursor = 0;
  let match;

  while ((match = matcher.exec(raw)) !== null) {
    const resolved = nameLookup.get(normalizeName(match[0]));
    output += escapeHtml(raw.slice(cursor, match.index));
    output += `<button type="button" class="chat-bubble__link" data-chat-item="${escapeAttribute(resolved || match[0])}">${escapeHtml(match[0])}</button>`;
    cursor = match.index + match[0].length;
  }
  output += escapeHtml(raw.slice(cursor));
  return output;
}

function renderChatSuggestions(suggestions) {
  const mount = document.getElementById('chatSuggestions');
  if (!mount) return;
  mount.innerHTML = '';
  suggestions.forEach(item => {
    rememberItem(item);
    const card = document.createElement('div');
    card.className = 'chat-suggestion-card';
    card.innerHTML = `
      <strong>${escapeHtml(item.name)}</strong>
      <span>${formatPrice(item.price)}</span>
      <div class="overlay-sheet__actions">
        <button class="button button--ghost" type="button">View</button>
        <button class="button button--accent" type="button">Add</button>
      </div>
    `;
    const [viewBtn, addBtn] = card.querySelectorAll('button');
    viewBtn.addEventListener('click', () => openItemModal(item));
    addBtn.addEventListener('click', () => addItem(item));
    mount.appendChild(card);
  });
}

// ============================================================
// HELPERS
// ============================================================

function rememberItem(item) {
  if (!item?.name) return item;
  const key = normalizeName(item.name);
  if (state.itemIndex.has(key)) return state.itemIndex.get(key);
  state.transientItems.set(key, item);
  return item;
}

function getItemByName(name) {
  const key = normalizeName(name);
  return state.itemIndex.get(key) || state.transientItems.get(key) || null;
}

function resolveImage(item = {}) {
  return resolveAssetPath(item.img || item.image || inferImageForItem(item));
}

function inferImageForItem(item = {}) {
  const text = `${item.name || ''} ${item.description || ''} ${item.category || ''} ${item.subcategory || ''}`.toLowerCase();
  const bank = [
    { terms: ['tomahawk', 't-bone', 'ribeye'], image: 'Images/Tomahawk.jpg' },
    { terms: ['fillet'], image: 'Images/Beef fillet.jpg' },
    { terms: ['rump', 'sirloin', 'wagyu', 'steak'], image: 'Images/Rump Steak.jpg' },
    { terms: ['prawn'], image: 'Images/Butter-garlic-prawns.jpg' },
    { terms: ['oyster'], image: 'Images/Oyster.jpg' },
    { terms: ['calamari'], image: 'Images/Calamari.jpeg' },
    { terms: ['salmon', 'fish', 'hake', 'kingklip'], image: 'Images/Fish & Chips.jpg' },
    { terms: ['mussel'], image: 'Images/Mussels.jpg' },
    { terms: ['burger'], image: 'Images/Bifteki Burger.jpg' },
    { terms: ['pork', 'chop'], image: 'Images/Crispy Pork Chops.jpg' },
    { terms: ['lamb'], image: 'Images/Crispy Lamb Chops.jpg' },
    { terms: ['chicken'], image: 'Images/Chicken Livers.jpeg' },
    { terms: ['pasta'], image: 'Images/Chicken Pasta.jpg' },
    { terms: ['salad', 'vegetarian', 'halloumi'], image: 'Images/Halloumi.jpg' },
    { terms: ['dessert', 'cake', 'ice cream', 'malva', 'pudding'], image: 'Images/Cheese Cake.jpg' },
    { terms: ['old fashioned'], image: 'Images/Old Fashioned.jpg' },
    { terms: ['cocktail', 'margarita'], image: 'Images/Margarita.jpg' },
    { terms: ['wine', 'shiraz', 'cabernet', 'merlot', 'pinotage'], image: 'Images/Porcupine Ridge Shiraz.jpg' },
    { terms: ['beer', 'lager'], image: 'Images/Heineken (330ml).jpg' }
  ];
  const match = bank.find(e => e.terms.some(t => text.includes(t)));
  return match ? match.image : 'Images/Tomahawk.jpg';
}

function buildFootnote(item) {
  const parts = [];
  if (item.volume) parts.push(item.volume);
  if (item.weight) parts.push(item.weight);
  if (item.spice) parts.push(`Spice ${item.spice}`);
  if (item.calories) parts.push(`${item.calories} cal`);
  return parts.join(' | ');
}

function formatPrice(value) {
  return `R${(Number(value) || 0).toFixed(2)}`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
