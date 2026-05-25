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
import { buildMenuSections, FilterStore, FILTER_OPTIONS, flattenMenu } from './filters.js';

const state = {
  page: document.body.dataset.page || '',
  table: getTableContext(),
  device: createDeviceIdentity(),
  cart: new CartStore(),
  filters: new FilterStore(),
  menuData: {},
  itemIndex: new Map(),
  transientItems: new Map(),
  templates: new Map(),
  socket: null,
  deals: [],
  currentDealIndex: 0,
  searchQuery: '',
  categorySections: [],
  featuredItems: [],
  popularItems: [],
  intelligenceSections: [],
  activeIntelligenceKey: 'chef',
  cartRecommendations: [],
  currentItem: null,
  recommendationTimer: null,
  chatOpen: false,
  waiterCooldown: false
};

document.addEventListener('DOMContentLoaded', () => {
  init().catch(error => {
    console.error('[frontend]', error);
  });
});

async function init() {
  if (state.page === 'legacy-shell') {
    redirectLegacyShell();
    return;
  }

  await mountSharedComponents();
  hydrateHeader();

  if (state.page === 'menu') {
    await initMenuPage();
    return;
  }

  if (state.page === 'drinks' || state.page === 'butchery') {
    await initCollectionPage();
  }
}

function redirectLegacyShell() {
  const target = document.body.dataset.redirect;
  if (!target) {
    return;
  }

  window.location.replace(`${target}${window.location.search}${window.location.hash}`);
}

async function mountSharedComponents() {
  await mountComponent('header');
  await ensureTemplate('menu-card');
  await ensureTemplate('category-section');

  if (state.page === 'menu') {
    await Promise.all([
      mountComponent('filter-bar'),
      mountComponent('cart'),
      mountComponent('chat'),
      mountComponent('bottom-cart')
    ]);
  }
}

async function mountComponent(name) {
  const mount = document.querySelector(`[data-component="${name}"]`);
  if (!mount) {
    return;
  }

  mount.innerHTML = await loadComponentHtml(name);
}

async function ensureTemplate(name) {
  if (state.templates.has(name)) {
    return state.templates.get(name);
  }

  const html = await loadComponentHtml(name);
  const container = document.createElement('div');
  container.innerHTML = html.trim();
  const template = container.querySelector('template');
  state.templates.set(name, template);
  return template;
}

function cloneTemplate(name) {
  const template = state.templates.get(name);
  if (!template) {
    throw new Error(`Template "${name}" has not been loaded.`);
  }

  return template.content.firstElementChild.cloneNode(true);
}

function hydrateHeader() {
  const brandLink = document.getElementById('brandLink');
  const tablePill = document.getElementById('headerTablePill');
  const menuNavLink = document.querySelector('[data-nav-link="menu"]');

  if (brandLink) {
    brandLink.href = state.table.routePath;
  }

  if (menuNavLink) {
    menuNavLink.href = state.table.routePath;
  }

  if (tablePill) {
    tablePill.hidden = false;
    tablePill.textContent = state.table.formatted;
  }

  document.querySelectorAll('[data-nav-link]').forEach(link => {
    const target = link.getAttribute('data-nav-link');
    link.classList.toggle('is-active', target === state.page);
  });

  const heroLabel = document.getElementById('heroTableLabel');
  if (heroLabel) {
    heroLabel.textContent = state.table.formatted;
  }
}

async function initMenuPage() {
  bindMenuEvents();
  wireStoreSubscriptions();
  connectMenuSocket();
  setConnectionStatus('Connecting...', false);

  await Promise.all([loadMenuData(), loadDeals()]);
  renderFilterControls();
  renderHistory();
  renderCart();
  renderBottomCartBar();
  scheduleRecommendations();
}

function bindMenuEvents() {
  document.body.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.getAttribute('data-action');
      if (action === 'toggle-chat') {
        toggleChat();
      } else if (action === 'close-cart') {
        closeModal('cartModal');
      } else if (action === 'open-history') {
        openHistoryModal();
      } else if (action === 'close-history') {
        closeModal('historyModal');
      } else if (action === 'close-item-detail') {
        closeModal('itemDetailModal');
      } else if (action === 'open-item') {
        const name = actionTarget.closest('[data-item-name]')?.dataset.itemName;
        if (name) {
          openItemModalByName(name);
        }
      } else if (action === 'add-item') {
        const name = actionTarget.closest('[data-item-name]')?.dataset.itemName;
        if (name) {
          addItemByName(name);
        }
      } else if (action === 'cart-decrease') {
        state.cart.updateQty(Number(actionTarget.dataset.index), -1);
        syncCartToServer();
      } else if (action === 'cart-increase') {
        state.cart.updateQty(Number(actionTarget.dataset.index), 1);
        syncCartToServer();
      } else if (action === 'cart-remove') {
        state.cart.removeAt(Number(actionTarget.dataset.index));
        syncCartToServer();
      }
      return;
    }

    const filterButton = event.target.closest('[data-filter-key]');
    if (filterButton) {
      state.filters.toggle(filterButton.dataset.filterKey);
      return;
    }

    const activeFilterButton = event.target.closest('[data-remove-filter]');
    if (activeFilterButton) {
      state.filters.remove(activeFilterButton.dataset.removeFilter);
      return;
    }

    const dealTab = event.target.closest('[data-deal-index]');
    if (dealTab) {
      state.currentDealIndex = Number(dealTab.dataset.dealIndex);
      renderDeals();
      return;
    }

    const intelligenceTab = event.target.closest('[data-intelligence-key]');
    if (intelligenceTab) {
      state.activeIntelligenceKey = intelligenceTab.dataset.intelligenceKey;
      renderMenuIntelligence();
      return;
    }

    const chatPrompt = event.target.closest('[data-chat-prompt]');
    if (chatPrompt) {
      sendChatMessage(chatPrompt.dataset.chatPrompt);
      return;
    }

    if (event.target.id === 'addDealToCartBtn') {
      addCurrentDealToCart();
      return;
    }

    if (event.target.id === 'bottomCartButton') {
      openCartModal();
      return;
    }

    if (event.target.id === 'bottomHistoryButton') {
      openHistoryModal();
      return;
    }

    if (event.target.id === 'checkoutButton') {
      checkout();
      return;
    }

    if (event.target.id === 'itemDetailAddButton' && state.currentItem) {
      addItem(state.currentItem);
      closeModal('itemDetailModal');
      return;
    }

    if (event.target.id === 'waiterButton') {
      callWaiter();
    }
  });

  document.body.addEventListener(
    'focusout',
    event => {
      const noteInput = event.target.closest('.cart-note-input');
      if (!noteInput) {
        return;
      }

      state.cart.setNote(Number(noteInput.dataset.index), noteInput.value);
      syncCartToServer();
    },
    true
  );

  const searchInput = document.getElementById('menuSearchInput');
  const clearSearchButton = document.getElementById('menuSearchClear');
  const customTipInput = document.getElementById('customTipInput');
  const chatInput = document.getElementById('chatInput');
  const chatSendButton = document.getElementById('chatSendButton');

  if (searchInput) {
    searchInput.addEventListener('input', event => {
      state.searchQuery = event.target.value.trim();
      renderMenu();
      updateSearchState();
    });
  }

  if (clearSearchButton) {
    clearSearchButton.addEventListener('click', () => {
      state.searchQuery = '';
      searchInput.value = '';
      renderMenu();
      updateSearchState();
      searchInput.focus();
    });
  }

  document.querySelectorAll('input[name="tipMode"]').forEach(input => {
    input.addEventListener('change', () => {
      renderCartTotals();
    });
  });

  if (customTipInput) {
    customTipInput.addEventListener('input', () => {
      renderCartTotals();
    });
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendChatMessage();
      }
    });
  }

  if (chatSendButton) {
    chatSendButton.addEventListener('click', () => {
      sendChatMessage();
    });
  }
}

function wireStoreSubscriptions() {
  state.cart.subscribe(() => {
    renderCart();
    renderHistory();
    renderBottomCartBar();
    scheduleRecommendations();
  });

  state.filters.subscribe(() => {
    renderFilterControls();
    renderMenu();
  });
}

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
    if (payload?.restaurantId && payload.restaurantId !== CONFIG.RESTAURANT_ID) {
      return;
    }
    state.cart.replaceCart(payload?.cart || payload || []);
  });

  state.socket.on('syncHistory', payload => {
    if (payload?.restaurantId && payload.restaurantId !== CONFIG.RESTAURANT_ID) {
      return;
    }
    state.cart.setHistory(payload?.history || payload || []);
  });

  state.socket.on('menuUpdated', async () => {
    await loadMenuData();
  });

  state.socket.on('dealUpdated', async () => {
    await loadDeals();
  });

  state.socket.on('waiterOnTheWay', payload => {
    showToast(payload?.message || 'A waiter is on the way.', 4000);
  });

  state.socket.on('orderStatusChanged', payload => {
    if (!payload || normalizeName(payload.tableId) !== state.table.normalized) {
      return;
    }

    if (payload.status === 'cooking') {
      showToast('The kitchen has started your order.', 3000);
    } else if (payload.status === 'ready') {
      showToast('Your order is ready to be served.', 3500);
    }
  });
}

async function loadMenuData() {
  state.menuData = (await api.getMenu()) || {};
  const flatItems = flattenMenu(state.menuData);
  state.itemIndex = new Map();
  flatItems.forEach(item => {
    item.img = item.img || inferImageForItem(item);
    state.itemIndex.set(normalizeName(item.name), item);
  });
  state.featuredItems = pickFeaturedItems(flatItems, 6);
  state.popularItems = pickPopularItems(flatItems, 6);
  state.intelligenceSections = buildMenuIntelligence(flatItems);
  renderCategoryTabs();
  renderFeatureRails();
  renderMenuIntelligence();
  renderMenu();
}

function rememberItem(item) {
  if (!item?.name) {
    return item;
  }

  const key = normalizeName(item.name);
  if (state.itemIndex.has(key)) {
    return state.itemIndex.get(key);
  }

  state.transientItems.set(key, item);
  return item;
}

function getItemByName(name) {
  const key = normalizeName(name);
  return state.itemIndex.get(key) || state.transientItems.get(key) || null;
}

function renderCategoryTabs() {
  const tabs = document.getElementById('categoryTabs');
  if (!tabs || state.categorySections.length === 0) {
    return;
  }

  tabs.innerHTML = '';
  state.categorySections.forEach((section, index) => {
    const link = document.createElement('a');
    link.className = `category-tab${index === 0 ? ' is-active' : ''}`;
    link.href = `#${section.id}`;
    link.textContent = section.title;
    tabs.appendChild(link);
  });
}

function renderFeatureRails() {
  renderRail('featuredRail', state.featuredItems, 'Chef pick');
  renderRail('popularRail', state.popularItems, 'Popular');
}

function renderMenuIntelligence() {
  const section = document.getElementById('menuIntelligenceSection');
  const tabs = document.getElementById('intelligenceTabs');
  const rail = document.getElementById('intelligenceRail');
  if (!section || !tabs || !rail) {
    return;
  }

  const sections = getVisibleIntelligenceSections();
  if (sections.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  if (!sections.some(entry => entry.key === state.activeIntelligenceKey)) {
    state.activeIntelligenceKey = sections[0].key;
  }

  tabs.innerHTML = '';
  sections.forEach(entry => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `intelligence-tab${entry.key === state.activeIntelligenceKey ? ' is-active' : ''}`;
    button.dataset.intelligenceKey = entry.key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(entry.key === state.activeIntelligenceKey));
    button.textContent = entry.label;
    tabs.appendChild(button);
  });

  const active = sections.find(entry => entry.key === state.activeIntelligenceKey) || sections[0];
  setText('intelligenceTitle', active.title);
  rail.innerHTML = '';
  active.items.forEach(item => {
    rail.appendChild(createMenuCard({ ...item, source_title: active.cardTag }, { tag: active.cardTag }));
  });
}

function getVisibleIntelligenceSections() {
  const baseSections = state.intelligenceSections.filter(section => Array.isArray(section.items) && section.items.length > 0);
  if (state.cartRecommendations.length === 0) {
    return baseSections;
  }

  return [
    {
      key: 'alsoOrdered',
      label: 'People Also Ordered',
      title: 'Smart Add-Ons For This Cart',
      cardTag: 'People also ordered',
      items: state.cartRecommendations
    },
    ...baseSections
  ];
}

function renderRail(mountId, items, tag) {
  const mount = document.getElementById(mountId);
  if (!mount) {
    return;
  }

  mount.innerHTML = '';
  items.forEach(item => {
    mount.appendChild(createMenuCard({ ...item, source_title: tag }, { tag }));
  });
}

function pickFeaturedItems(items = [], limit = 6) {
  const keywords = ['tomahawk', 'wagyu', 'fillet', 'ribeye', 'prawn', 'salmon', 'kingklip', 'margarita', 'malva'];
  return pickByKeywords(items, keywords, limit);
}

function pickPopularItems(items = [], limit = 6) {
  const keywords = ['rump', 'ribeye', 'wings', 'burger', 'calamari', 'prawn', 'fillet', 'margarita', 'cabernet', 'malva'];
  return pickByKeywords(items, keywords, limit);
}

function buildMenuIntelligence(items = []) {
  const groups = [
    {
      key: 'popular',
      label: 'Most Popular',
      title: 'Most Popular Tonight',
      cardTag: 'Most popular',
      keywords: ['rump', 'fillet', 'calamari', 'prawn', 'burger', 'margarita', 'malva', 'ribeye']
    },
    {
      key: 'trending',
      label: 'Trending',
      title: 'Trending Around The Room',
      cardTag: 'Trending',
      keywords: ['sushi', 'dragon', 'rainbow', 'wagyu', 'tomahawk', 'firecracker', 'old fashioned', 'daiquiri']
    },
    {
      key: 'chef',
      label: 'Chef Recommended',
      title: 'Chef Recommended',
      cardTag: 'Chef recommended',
      keywords: ['tomahawk', 'wagyu', 'fillet', 'kingklip', 'salmon', 'lamb', 'oxtail', 'chef']
    },
    {
      key: 'pairings',
      label: 'Perfect Pairings',
      title: 'Perfect Pairings',
      cardTag: 'Perfect pairing',
      keywords: ['shiraz', 'cabernet', 'chardonnay', 'sauvignon', 'pepper sauce', 'creamy cheese sauce', 'malva', 'irish coffee']
    }
  ];

  return groups.map(group => ({
    ...group,
    items: pickByKeywords(items, group.keywords, 8)
  }));
}

function pickByKeywords(items = [], keywords = [], limit = 6) {
  const seen = new Set();
  const scored = items
    .filter(item => item.visible !== false)
    .map(item => {
      const text = itemSearchText(item);
      const score = keywords.reduce(
        (sum, keyword, index) => (textMatchesTerm(text, keyword) ? sum + keywords.length - index : sum),
        0
      );
      return { item, score };
    })
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map(entry => entry.item);

  const fallback = items.filter(item => item.visible !== false);
  return [...scored, ...fallback].filter(item => {
    const key = normalizeName(item.name);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function itemSearchText(item = {}) {
  return `${item.name || ''} ${item.description || ''} ${item.category || ''} ${item.subcategory || ''}`.toLowerCase();
}

function textMatchesTerm(text, term) {
  const escaped = String(term || '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) {
    return false;
  }

  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function sectionId(title) {
  return `section-${normalizeName(title) || 'menu'}`;
}

function renderMenu() {
  const mount = document.getElementById('menuSections');
  if (!mount) {
    return;
  }

  const sections = buildMenuSections(state.menuData, state.filters, state.searchQuery);
  state.categorySections = sections.map(section => ({
    title: section.title,
    id: sectionId(section.title)
  }));
  renderCategoryTabs();
  mount.innerHTML = '';

  if (sections.length === 0) {
    mount.innerHTML = '<div class="empty-state">Nothing matches the current filters yet. Try clearing a few chips or broadening the search.</div>';
    updateSearchState(true);
    return;
  }

  sections.forEach(section => {
    const sectionNode = cloneTemplate('category-section');
    sectionNode.id = sectionId(section.title);
    sectionNode.querySelector('[data-role="section-title"]').textContent = section.title;
    const eyebrow = sectionNode.querySelector('[data-role="section-eyebrow"]');
    if (eyebrow) {
      const count = section.items.length + section.subSections.reduce((sum, subSection) => sum + subSection.items.length, 0);
      eyebrow.textContent = `${count} selections`;
    }
    const itemsMount = sectionNode.querySelector('[data-role="section-items"]');

    section.items.forEach(item => {
      itemsMount.appendChild(createMenuCard(item));
    });

    section.subSections.forEach(subSection => {
      const wrapper = document.createElement('div');
      wrapper.className = 'menu-subsection';
      const heading = document.createElement('h3');
      heading.className = 'menu-subsection__title';
      heading.textContent = subSection.title;
      wrapper.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'menu-grid';
      subSection.items.forEach(item => {
        grid.appendChild(createMenuCard(item));
      });
      wrapper.appendChild(grid);
      itemsMount.appendChild(wrapper);
    });

    mount.appendChild(sectionNode);
  });

  updateSearchState(false);
  setupCategoryScrollSpy();
}

function setupCategoryScrollSpy() {
  if (setupCategoryScrollSpy.observer) {
    setupCategoryScrollSpy.observer.disconnect();
  }

  const tabs = [...document.querySelectorAll('.category-tab')];
  const sections = state.categorySections
    .map(section => document.getElementById(section.id))
    .filter(Boolean);

  if (tabs.length === 0 || sections.length === 0 || typeof IntersectionObserver !== 'function') {
    return;
  }

  setupCategoryScrollSpy.observer = new IntersectionObserver(
    entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) {
        return;
      }

      tabs.forEach(tab => {
        tab.classList.toggle('is-active', tab.getAttribute('href') === `#${visible.target.id}`);
      });
    },
    {
      rootMargin: '-35% 0px -55% 0px',
      threshold: [0.1, 0.25, 0.5]
    }
  );

  sections.forEach(section => setupCategoryScrollSpy.observer.observe(section));
}

function createMenuCard(item, options = {}) {
  rememberItem(item);
  const card = cloneTemplate('menu-card');
  card.dataset.itemName = item.name;

  const image = card.querySelector('.menu-card__image');
  const mediaButton = card.querySelector('.menu-card__media');
  const mediaBadge = card.querySelector('[data-role="media-badge"]');
  const tag = card.querySelector('[data-role="tag"]');
  const title = card.querySelector('[data-role="title"]');
  const description = card.querySelector('[data-role="description"]');
  const price = card.querySelector('[data-role="price"]');
  const footnote = card.querySelector('[data-role="footnote"]');
  const addButton = card.querySelector('[data-action="add-item"]');

  image.src = resolveImage(item);
  image.alt = item.name;
  image.onerror = () => {
    image.src = resolveAssetPath('Images/Tomahawk.jpg');
  };

  if (item.video && item.video.trim()) {
    mediaBadge.hidden = false;
  }

  if (item.source_title || item.category || options.tag) {
    tag.hidden = false;
    tag.textContent = options.tag || item.source_title || item.category;
  }

  title.textContent = item.name;
  description.textContent = item.description || 'No description available yet.';
  price.textContent = formatPrice(item.price);
  footnote.textContent = buildFootnote(item);

  if (options.staticCard) {
    mediaButton.disabled = true;
    mediaButton.removeAttribute('data-action');
    addButton.remove();
  }

  return card;
}

function buildFootnote(item) {
  const parts = [];

  if (item.volume) {
    parts.push(item.volume);
  }
  if (item.weight) {
    parts.push(item.weight);
  }
  if (item.spice) {
    parts.push(`Spice ${item.spice}`);
  }
  if (item.calories) {
    parts.push(`${item.calories} cal`);
  }

  return parts.join(' | ');
}

async function loadDeals() {
  const deals = (await api.getDeals()) || [];
  state.deals = Array.isArray(deals) ? deals.filter(deal => deal.visible !== false && deal.hidden !== true) : [];
  state.currentDealIndex = 0;
  renderDeals();
}

function renderDeals() {
  const section = document.getElementById('dealSection');
  const tabs = document.getElementById('dealTabs');
  const items = document.getElementById('dealItems');
  const original = document.getElementById('dealOriginalTotal');
  const price = document.getElementById('dealPrice');

  if (!section || !tabs || !items || !original || !price) {
    return;
  }

  if (state.deals.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  tabs.innerHTML = '';
  items.innerHTML = '';

  state.deals.forEach((deal, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `deal-tab${index === state.currentDealIndex ? ' is-active' : ''}`;
    button.dataset.dealIndex = String(index);
    button.textContent = deal.name || `Deal ${index + 1}`;
    tabs.appendChild(button);
  });

  const currentDeal = state.deals[state.currentDealIndex];
  let originalTotal = 0;
  (currentDeal.items || []).forEach(item => {
    originalTotal += Number(item.price) || 0;
    items.appendChild(createMenuCard(item));
  });

  original.textContent = `Original ${formatPrice(originalTotal)}`;
  price.textContent = `Deal ${formatPrice(currentDeal.price)}`;
}

function addCurrentDealToCart() {
  const currentDeal = state.deals[state.currentDealIndex];
  if (!currentDeal) {
    return;
  }

  (currentDeal.items || []).forEach(item => {
    addItem(item);
  });
  showToast(`${currentDeal.name || 'Deal'} added to cart.`, 2500);
}

function renderFilterControls() {
  const chipList = document.getElementById('filterChipList');
  const activeList = document.getElementById('activeFilterList');
  if (!chipList || !activeList) {
    return;
  }

  chipList.innerHTML = '';
  activeList.innerHTML = '';

  FILTER_OPTIONS.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-chip${state.filters.has(option.key) ? ' is-active' : ''}`;
    button.dataset.filterKey = option.key;
    button.textContent = option.label;
    chipList.appendChild(button);
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

function updateSearchState(forceEmptyState = false) {
  const clearSearchButton = document.getElementById('menuSearchClear');
  const noResults = document.getElementById('searchNoResults');

  if (clearSearchButton) {
    clearSearchButton.hidden = state.searchQuery.length === 0;
  }

  if (noResults) {
    noResults.hidden = !forceEmptyState;
  }
}

function addItem(item) {
  const resolved = rememberItem(item);
  state.cart.addItem({
    ...resolved,
    qty: 1
  });
  syncCartToServer();
  animateCartFeedback();
  showToast(`${resolved.name} added.`, 1500);
}

function addItemByName(name) {
  const item = getItemByName(name);
  if (!item) {
    return;
  }

  addItem(item);
}

function syncCartToServer() {
  if (!state.socket) {
    return;
  }

  state.socket.emit('updateCart', {
    tableId: state.table.normalized,
    restaurantId: CONFIG.RESTAURANT_ID,
    cart: state.cart.items,
    deviceId: state.device.deviceId
  });
}

function openCartModal() {
  openModal('cartModal');
}

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
  const modal = document.getElementById(id);
  if (modal) {
    modal.hidden = false;
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.hidden = true;
  }
}

function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const cartTableDisplay = document.getElementById('cartTableDisplay');
  if (!cartItems || !cartTableDisplay) {
    return;
  }

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
        <textarea class="cart-note-input" data-index="${index}" placeholder="Sauce on the side, extra cook note, allergies...">${escapeHtml(item.note)}</textarea>
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
  if (!bar) {
    return;
  }

  const count = state.cart.getCount();
  bar.hidden = count === 0;
  setText('bottomCartCount', `${count} ${count === 1 ? 'item' : 'items'}`);
  setText('bottomCartTotal', formatPrice(state.cart.getSubtotal()));
}

function animateCartFeedback() {
  const bar = document.getElementById('bottomCartBar');
  if (!bar) {
    return;
  }

  bar.classList.remove('is-pulsing');
  requestAnimationFrame(() => {
    bar.classList.add('is-pulsing');
  });
}

function renderHistory() {
  const historyMount = document.getElementById('historyItems');
  if (!historyMount) {
    return;
  }

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

function scheduleRecommendations() {
  clearTimeout(state.recommendationTimer);
  state.recommendationTimer = setTimeout(() => {
    loadRecommendations().catch(error => {
      console.error('[recommendations]', error);
    });
  }, 150);
}

async function loadRecommendations() {
  const section = document.getElementById('recommendationsSection');
  const list = document.getElementById('recommendationList');
  if (!section || !list) {
    return;
  }

  if (state.cart.items.length === 0) {
    const starterSet = [...state.featuredItems, ...state.popularItems].slice(0, 4);
    state.cartRecommendations = [];
    renderMenuIntelligence();
    if (starterSet.length === 0) {
      section.hidden = true;
      list.innerHTML = '';
      return;
    }
    setText('recommendationsEyebrow', 'Recommended for you');
    setText('recommendationsTitle', 'Build a beautiful first round');
    list.innerHTML = '';
    section.hidden = false;
    starterSet.forEach(item => {
      list.appendChild(createMenuCard({ ...item, source_title: 'Recommended for you' }));
    });
    return;
  }

  setText('recommendationsEyebrow', 'Pairs well with');
  setText('recommendationsTitle', 'Recommended For This Table');

  let recommendations = [];
  try {
    recommendations =
      (await api.getRecommendations({
        cart: state.cart.items,
        tableId: state.table.normalized,
        deviceId: state.device.deviceId
      })) || [];
  } catch {
    recommendations = [];
  }

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    const cartNames = new Set(state.cart.items.map(item => normalizeName(item.name)));
    recommendations = flattenMenu(state.menuData)
      .filter(item => !cartNames.has(normalizeName(item.name)))
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
  }

  state.cartRecommendations = recommendations.slice(0, 6);
  renderMenuIntelligence();

  list.innerHTML = '';
  if (recommendations.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  recommendations.forEach(item => {
    list.appendChild(createMenuCard(item));
  });
}

function openItemModalByName(name) {
  const item = getItemByName(name);
  if (!item) {
    return;
  }

  openItemModal(item);
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
      const image = document.createElement('img');
      image.src = resolveImage(state.currentItem);
      image.alt = state.currentItem.name;
      image.onerror = () => {
        image.src = resolveAssetPath('Images/Tomahawk.jpg');
      };
      mediaMount.appendChild(image);
    }
  }

  openModal('itemDetailModal');
}

async function checkout() {
  if (state.cart.items.length === 0) {
    showToast('The cart is empty.', 2200);
    return;
  }

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

function toggleChat() {
  const launcher = document.getElementById('chatLauncher');
  const panel = document.getElementById('chatPanel');
  if (!launcher || !panel) {
    return;
  }

  state.chatOpen = !state.chatOpen;
  panel.hidden = !state.chatOpen;
  launcher.setAttribute('aria-expanded', String(state.chatOpen));
}

async function sendChatMessage(forcedMessage = '') {
  const input = document.getElementById('chatInput');
  if (!input) {
    return;
  }

  const message = String(forcedMessage || input.value).trim();
  if (!message) {
    return;
  }

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
  if (!messages) {
    return;
  }

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble${role === 'user' ? ' chat-bubble--user' : ''}`;
  bubble.innerHTML = decorateChatText(text);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;

  bubble.querySelectorAll('[data-chat-item]').forEach(button => {
    button.addEventListener('click', () => {
      openItemModalByName(button.dataset.chatItem);
    });
  });
}

function decorateChatText(text) {
  const raw = String(text || '');
  const names = [...state.itemIndex.values()]
    .map(item => item.name)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (names.length === 0) {
    return escapeHtml(raw);
  }

  const nameLookup = new Map(names.map(name => [normalizeName(name), name]));
  const matcher = new RegExp(names.map(escapeRegExp).join('|'), 'gi');
  let output = '';
  let cursor = 0;
  let match;

  while ((match = matcher.exec(raw)) !== null) {
    const matchedText = match[0];
    const resolvedName = nameLookup.get(normalizeName(matchedText));
    output += escapeHtml(raw.slice(cursor, match.index));
    output += `<button type="button" class="chat-bubble__link" data-chat-item="${escapeAttribute(
      resolvedName || matchedText
    )}">${escapeHtml(matchedText)}</button>`;
    cursor = match.index + matchedText.length;
  }

  output += escapeHtml(raw.slice(cursor));

  return output;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderChatSuggestions(suggestions) {
  const mount = document.getElementById('chatSuggestions');
  if (!mount) {
    return;
  }

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
    const [viewButton, addButton] = card.querySelectorAll('button');
    viewButton.addEventListener('click', () => openItemModal(item));
    addButton.addEventListener('click', () => addItem(item));
    mount.appendChild(card);
  });
}

function callWaiter() {
  if (state.waiterCooldown || !state.socket) {
    return;
  }

  state.waiterCooldown = true;
  state.socket.emit('callWaiter', {
    tableId: state.table.normalized,
    restaurantId: CONFIG.RESTAURANT_ID,
    deviceId: state.device.deviceId
  });
  showToast('A waiter has been requested.', 3200);
  window.setTimeout(() => {
    state.waiterCooldown = false;
  }, 4000);
}

function showToast(message, duration = 2600) {
  const toast = document.getElementById('waiterToast');
  if (!toast) {
    return;
  }

  toast.hidden = false;
  toast.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

function setConnectionStatus(label, connected) {
  const badge = document.getElementById('connectionBadge');
  if (!badge) {
    return;
  }

  badge.textContent = label;
  badge.style.color = connected ? 'var(--color-gold-soft)' : 'var(--color-sand)';
}

async function initCollectionPage() {
  const mount = document.getElementById('collectionSections');
  const fileName = document.body.dataset.collectionFile;
  if (!mount || !fileName) {
    return;
  }

  let data = null;
  try {
    data = await api.getCollection(fileName);
  } catch {
    data = null;
  }

  mount.innerHTML = '';
  const sections = normalizeCollectionSections(data);
  if (sections.length === 0) {
    mount.innerHTML =
      '<div class="empty-state">This section is being refreshed right now. Please check back with the grillhouse shortly.</div>';
    return;
  }

  sections.forEach(section => {
    const sectionNode = cloneTemplate('category-section');
    sectionNode.querySelector('[data-role="section-title"]').textContent = section.title;
    const itemsMount = sectionNode.querySelector('[data-role="section-items"]');
    section.items.forEach(item => {
      itemsMount.appendChild(createMenuCard(item, { staticCard: true }));
    });
    mount.appendChild(sectionNode);
  });
}

function normalizeCollectionSections(data) {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data.length ? [{ title: 'Selection', items: data }] : [];
  }

  return Object.entries(data)
    .map(([title, value]) => {
      if (Array.isArray(value)) {
        return { title, items: value };
      }

      if (Array.isArray(value?.items)) {
        return { title, items: value.items };
      }

      return { title, items: [] };
    })
    .filter(section => section.items.length > 0);
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
  const match = bank.find(entry => entry.terms.some(term => text.includes(term)));
  return match ? match.image : 'Images/Tomahawk.jpg';
}

function formatPrice(value) {
  return `R${(Number(value) || 0).toFixed(2)}`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
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
