'use strict';

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CONFIG
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const CFG = {
  RESTAURANT_ID: 'trump',
  APP_BASE: '/Trump',
  API_BASE: `${window.location.origin}/Trump`,
  SOCKET_PATH: '/Trump/socket.io',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  TOAST_DURATION: 3500,
  DEBOUNCE_DELAY: 300,
  TOTAL_TABLES: 30
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STATE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const S = {
  waiterName: localStorage.getItem('waiterName') || '',
  selectedTable: null,
  currentOrder: [],
  menu: {},
  allItems: [],
  tableStatuses: {},
  serviceNotes: {},
  archivedTables: JSON.parse(localStorage.getItem('archivedTables') || '[]'),
  selectedCategory: 'all',
  isRushMode: false,
  socket: null,
  isConnected: false,
  todayStats: { sales: 0, upsells: 0, tables: 0 },
  notifications: [],          // NEW
  activeBellTables: new Set() // NEW
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DYNAMIC CALL MESSAGES  (NEW)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const CALL_MSGS = [
  (t) => `${t} needs service`,
  (t) => `${t} is ready for attention`,
  (t) => `${t} just rang the service bell`,
  (t) => `Someone at ${t} needs help`,
  (t) => `${t} flagged the floor team`,
  (t) => `${t} is ready to order`,
  (t) => `${t} has a question`
];
const MGR_MSGS = [
  (n) => `Manager called ${n} to the front`,
  (n) => `Admin needs ${n} immediately`,
  (n) => `Manager alert for ${n}`,
  (n) => `${n}, the manager is calling you`
];
const randCallMsg  = (tbl)  => CALL_MSGS[Math.floor(Math.random() * CALL_MSGS.length)](tbl);
const randMgrMsg   = (name) => MGR_MSGS[Math.floor(Math.random() * MGR_MSGS.length)](name || 'you');

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   UTILS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = String(text || '');
  return d.innerHTML;
}
function formatCurrency(n) { return 'R ' + parseFloat(n || 0).toFixed(2); }
function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
const debounceSearch = debounce((q) => renderMenu(q), CFG.DEBOUNCE_DELAY);
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
function resolveAssetPath(path) {
  const raw = String(path || '').trim();
  if (!raw) return raw;
  if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith(`${CFG.APP_BASE}/`)) return raw;
  if (raw.startsWith('/')) return `${CFG.APP_BASE}${raw}`;
  return `${CFG.APP_BASE}/${raw}`;
}

function inferImageForWaiter(item = {}) {
  const text = `${item.name || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();
  const bank = [
    { terms: ['tomahawk', 't-bone', 'ribeye'], image: 'Images/Tomahawk.jpg' },
    { terms: ['fillet', 'steak', 'rump', 'wagyu'], image: 'Images/Rump Steak.jpg' },
    { terms: ['prawn'], image: 'Images/Butter-garlic-prawns.jpg' },
    { terms: ['calamari'], image: 'Images/Calamari.jpeg' },
    { terms: ['salmon', 'fish', 'kingklip'], image: 'Images/Fish & Chips.jpg' },
    { terms: ['burger'], image: 'Images/Bifteki Burger.jpg' },
    { terms: ['lamb'], image: 'Images/Crispy Lamb Chops.jpg' },
    { terms: ['chicken'], image: 'Images/Chicken Livers.jpeg' },
    { terms: ['pasta'], image: 'Images/Chicken Pasta.jpg' },
    { terms: ['dessert', 'cake', 'ice cream', 'malva'], image: 'Images/Cheese Cake.jpg' },
    { terms: ['wine', 'shiraz', 'cabernet', 'chardonnay'], image: 'Images/Porcupine Ridge Shiraz.jpg' },
    { terms: ['cocktail', 'margarita'], image: 'Images/Margarita.jpg' }
  ];
  const match = bank.find(entry => entry.terms.some(term => text.includes(term)));
  return match ? match.image : 'Images/Tomahawk.jpg';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RETRY FETCH
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function fetchWithRetry(url, options = {}, retries = CFG.RETRY_ATTEMPTS) {
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, {
        ...options,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(tid);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, CFG.RETRY_DELAY * (i + 1)));
    }
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TOAST
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
let toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), CFG.TOAST_DURATION);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   NOTIFICATION MANAGER  (NEW)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function notifInit() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function notifAdd(tableId, displayTable, message, isManager = false) {
  const id = genId();
  S.notifications.unshift({
    id, tableId, displayTable, message, isManager,
    time: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
    responded: false
  });
  if (S.notifications.length > 20) S.notifications.pop();
  notifRender();
  notifBrowserPush(displayTable, message);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function notifRespond(id, tableId) {
  const n = S.notifications.find(x => x.id === id);
  if (n) n.responded = true;
  S.activeBellTables.delete(tableId);
  rerenderTableCard(tableId);
  notifRender();
  if (S.socket && S.socket.connected) {
    S.socket.emit('waiterResponding', { tableId, restaurantId: CFG.RESTAURANT_ID });
  }
  showToast('On my way to Table ' + tableId, 'success');
}

function notifDismiss(id) {
  S.notifications = S.notifications.filter(x => x.id !== id);
  notifRender();
}

function notifRender() {
  const unread = S.notifications.filter(n => !n.responded).length;
  const badge = document.getElementById('notifBadge');
  if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }

  const list = document.getElementById('notifList');
  if (!list) return;
  if (!S.notifications.length) { list.innerHTML = '<div class="notif-empty">No alerts yet</div>'; return; }

  list.innerHTML = S.notifications.map(n => `
    <div class="notif-item ${n.responded ? '' : 'pending'} ${n.isManager ? 'manager-call' : ''}">
      <div class="notif-item-hdr">
        <span class="notif-table-lbl">${escapeHtml(n.displayTable)}</span>
        <span class="notif-time">${n.time}</span>
      </div>
      <div class="notif-msg">${escapeHtml(n.message)}</div>
      <div class="notif-actions">
        ${!n.responded
          ? `<button class="notif-respond" onclick="notifRespond('${n.id}','${n.tableId}')">On My Way</button>`
          : `<span class="notif-done-lbl">Responded</span>`
        }
        <button class="notif-dismiss" onclick="notifDismiss('${n.id}')">Dismiss</button>
      </div>
    </div>
  `).join('');
}

function toggleNotifPanel() {
  document.getElementById('notifPanel').classList.toggle('open');
}

function notifBrowserPush(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: resolveAssetPath('/favicon.ico') });
  }
}

// Close notif panel when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notifPanel');
  const bell  = document.getElementById('notifBell');
  if (panel && panel.classList.contains('open') && !panel.contains(e.target) && !bell.contains(e.target)) {
    panel.classList.remove('open');
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SOCKET.IO
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function setupSocket() {
  S.socket = io(window.location.origin, {
    path: CFG.SOCKET_PATH,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  S.socket.on('connect', () => {
    S.isConnected = true;
    setPill('connPill', 'Online', ['connecting', 'offline'], 'pill-conn');
    // Register as waiter (NEW)
    if (S.waiterName) {
      S.socket.emit('joinAsWaiter', { name: S.waiterName, restaurantId: CFG.RESTAURANT_ID });
    }
    if (S.selectedTable) joinTable(S.selectedTable);
  });

  S.socket.on('disconnect', () => {
    S.isConnected = false;
    setPill('connPill', 'Offline', ['pill-conn'], 'pill-conn offline');
  });

  S.socket.on('reconnecting', () => {
    setPill('connPill', 'Reconnecting...', ['pill-conn', 'offline'], 'pill-conn connecting');
  });

  S.socket.on('syncCart', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    if (data.tableId === S.selectedTable) {
      S.currentOrder = data.cart || [];
      renderOrderView();
      updateOrderBadge();
    }
  });

  S.socket.on('syncHistory', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    if (data.tableId === S.selectedTable) updateTableStatus(data.tableId);
  });

  S.socket.on('orderPlaced', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    showToast('Order confirmed by kitchen.', 'success');
  });

  // NEW: table bell ring
  S.socket.on('incomingWaiterCall', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    S.activeBellTables.add(data.tableId);
    rerenderTableCard(data.tableId);
    const msg = randCallMsg(data.displayTable);
    notifAdd(data.tableId, data.displayTable, msg, false);
    showToast(msg, 'warning');
  });

  // NEW: manager calls waiter
  S.socket.on('managerCallWaiter', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    const msg = randMgrMsg(S.waiterName);
    notifAdd('manager', 'Manager', msg, true);
    showToast(msg, 'error');
  });

  // NEW: waiter registered confirmation
  S.socket.on('waiterRegistered', (data) => {
    showToast(data.message || 'You are now online', 'success');
  });

  // NEW: customer confirmation that waiter is coming
  S.socket.on('waiterOnTheWay', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    showToast(data.waiterName + ' is responding to ' + data.tableId, 'success');
  });
}

function setPill(id, text, removeClasses, addClass) {
  const el = document.getElementById(id);
  if (!el) return;
  removeClasses.forEach(c => el.classList.remove(c));
  el.className = `pill ${addClass}`;
  el.textContent = text;
}

function joinTable(tableId) {
  if (S.socket && S.socket.connected) {
    S.socket.emit('joinTable', { tableId, restaurantId: CFG.RESTAURANT_ID });
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   WAITER NAME
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function openWaiterModal() {
  document.getElementById('waiterInput').value = S.waiterName;
  document.getElementById('waiterModal').classList.add('open');
  setTimeout(() => document.getElementById('waiterInput').focus(), 300);
}

function saveWaiterName() {
  const name = document.getElementById('waiterInput').value.trim();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  S.waiterName = escapeHtml(name);
  localStorage.setItem('waiterName', S.waiterName);
  document.getElementById('waiterPill').textContent = S.waiterName;
  document.getElementById('waiterModal').classList.remove('open');
  // Register with socket (NEW)
  if (S.socket && S.socket.connected) {
    S.socket.emit('joinAsWaiter', { name: S.waiterName, restaurantId: CFG.RESTAURANT_ID });
  }
  showToast('Welcome, ' + S.waiterName + '.', 'success');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RUSH MODE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function toggleRush() {
  S.isRushMode = !S.isRushMode;
  const btn = document.getElementById('rushBtn');
  btn.textContent = S.isRushMode ? 'Rush ON' : 'Rush';
  btn.classList.toggle('active', S.isRushMode);
  showToast(S.isRushMode ? 'Rush mode active.' : 'Rush mode off.', S.isRushMode ? 'warning' : 'success');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TABLE MANAGEMENT
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function initTables() {
  for (let i = 1; i <= CFG.TOTAL_TABLES; i++) {
    S.tableStatuses[String(i)] = { status: 'empty', orderCount: 0, total: 0 };
  }
  renderTableGrid();
  loadAllTableStatuses();
}

async function loadAllTableStatuses() {
  const ids = Array.from({ length: CFG.TOTAL_TABLES }, (_, i) => String(i + 1));
  await Promise.all(ids.map(id => updateTableStatus(id)));
}

async function updateTableStatus(tableId) {
  try {
    const data = await fetchWithRetry(`${CFG.API_BASE}/api/waiter/table/${tableId}/status`);
    S.tableStatuses[tableId] = data;
    rerenderTableCard(tableId);
  } catch (_) {}
}

function renderTableGrid() {
  const grid = document.getElementById('tableGrid');
  grid.innerHTML = '';
  for (let i = 1; i <= CFG.TOTAL_TABLES; i++) grid.appendChild(buildTableCard(String(i)));
}

function buildTableCard(id) {
  const st       = S.tableStatuses[id] || { status: 'empty', orderCount: 0, total: 0 };
  const isActive = S.selectedTable === id;
  const ringing  = S.activeBellTables.has(id);

  const card = document.createElement('div');
  card.className = `table-card${isActive ? ' active' : ''}${st.orderCount > 0 ? ' has-orders' : ''}${ringing ? ' bell-ringing' : ''}`;
  card.id = `tc-${id}`;
  card.onclick = () => selectTable(id);
  card.innerHTML = `
    ${ringing ? '<span class="t-bell">!</span>' : ''}
    <div class="t-num">${escapeHtml(id)}</div>
    <span class="t-stat ${st.status}">${st.status === 'empty' ? 'Empty' : st.status}</span>
    ${st.orderCount > 0 ? `<span class="t-badge">${st.orderCount}</span>` : ''}
  `;
  return card;
}

function rerenderTableCard(id) {
  const existing = document.getElementById(`tc-${id}`);
  if (existing) existing.replaceWith(buildTableCard(id));
}

function selectTable(id) {
  S.selectedTable = id;
  S.currentOrder = [];
  document.getElementById('tablePill').textContent = 'Table ' + id;
  document.getElementById('orderViewTitle').textContent = 'Table ' + id + ' - Order';
  document.getElementById('orderViewSub').textContent =
    S.serviceNotes[id] ? 'Note: ' + S.serviceNotes[id].substring(0, 40) + '...' : 'No notes yet';
  // Clear bell when waiter selects ringing table
  if (S.activeBellTables.has(id)) {
    S.activeBellTables.delete(id);
    rerenderTableCard(id);
  }
  joinTable(id);
  renderTableGrid();
  renderOrderView();
  showToast('Managing Table ' + id, 'success');
  document.querySelector('[data-view="Menu"]').click();
}

function filterTables(query) {
  const q = query.trim().toLowerCase();
  for (let i = 1; i <= CFG.TOTAL_TABLES; i++) {
    const card = document.getElementById(`tc-${i}`);
    if (!card) continue;
    card.classList.toggle('hidden', q !== '' && !String(i).includes(q));
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MENU
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function loadMenu() {
  try {
    const data = await fetchWithRetry(`${CFG.API_BASE}/api/menu`);
    S.menu = data;
    S.allItems = flattenMenu(data);
    renderCategoryChips();
    renderMenu('');
  } catch (e) {
    showToast('Failed to load menu', 'error');
  }
}

function flattenMenu(menuObj) {
  const items = [];
  function walk(obj, cat) {
    if (Array.isArray(obj)) { obj.forEach(i => walk(i, cat)); return; }
    if (obj && typeof obj === 'object') {
      if (obj.items && Array.isArray(obj.items)) {
        obj.items.forEach(i => {
          if (i && i.name) {
            // Keep waiter cart items free of stale quantity values.
            items.push({
              name:        i.name,
              price:       i.price,
              description: i.description || '',
              img:         i.img         || inferImageForWaiter({ ...i, category: cat }),
              chefPick:    i.chefPick    || false,
              popular:     i.popular     || false,
              prepTime:    i.prepTime    || null,
              allergens:   i.allergens   || '',
              category:    cat
            });
          }
        });
      }
      Object.keys(obj).forEach(k => { if (k !== 'items' && typeof obj[k] === 'object') walk(obj[k], k); });
    }
  }
  walk(menuObj, 'Main');
  return items;
}

function renderCategoryChips() {
  const cats = ['all', ...new Set(S.allItems.map(i => i.category))];
  document.getElementById('catChips').innerHTML = cats.map(c => `
    <button class="cat-chip${c === S.selectedCategory ? ' active' : ''}" onclick="filterCategory('${escapeHtml(c)}')">
      ${escapeHtml(c === 'all' ? 'All' : c)}
    </button>
  `).join('');
}

function filterCategory(cat) {
  S.selectedCategory = cat;
  renderCategoryChips();
  renderMenu(document.getElementById('menuSearch').value);
}

function renderMenu(query = '') {
  const q = query.toLowerCase().trim();
  let items = S.allItems;
  if (S.selectedCategory !== 'all') items = items.filter(i => i.category === S.selectedCategory);
  if (q) items = items.filter(i =>
    (i.name || '').toLowerCase().includes(q) ||
    (i.description || '').toLowerCase().includes(q)
  );

  const grid = document.getElementById('menuGrid');
  if (!items.length) {
    grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-secondary)">
      <span class="material-icons" style="font-size:24px;opacity:0.5;display:block;margin-bottom:12px">No matches</span>
      <div style="font-size:16px;font-weight:600">No items found</div></div>`;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="menu-card" onclick="openItemDetail('${escapeHtml(item.name)}')">
      <div class="card-img">
        ${item.img
          ? `<img src="${escapeHtml(resolveAssetPath(item.img))}" alt="${escapeHtml(item.name)}" loading="lazy">`
          : `<div class="card-img-ph">${getEmoji(item)}</div>`}
        <div class="card-bdgs">
          ${item.chefPick ? '<span class="cbadge chef">Chef Pick</span>' : ''}
          ${item.popular  ? '<span class="cbadge popular">Popular</span>' : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.name)}</div>
        <div class="card-price">${formatCurrency(item.price)}</div>
        ${item.description ? `<div class="card-desc">${escapeHtml(item.description)}</div>` : ''}
        <div class="card-meta">
          <span>${escapeHtml(item.category || 'Main')}</span>
          ${item.prepTime ? `<span>${escapeHtml(String(item.prepTime))} min</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ITEM DETAIL + AI PAIRING
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function openItemDetail(itemName) {
  const item = S.allItems.find(i => i.name === itemName);
  if (!item) return;

  document.getElementById('itemSheetTitle').textContent = escapeHtml(item.name);
  const bodyEl = document.getElementById('itemSheetBody');
  bodyEl.innerHTML = `
    <div class="item-emoji">${getEmoji(item)}</div>
    <div class="item-price-big">${formatCurrency(item.price)}</div>
    <div style="padding:0 18px">
      <div class="pairing-card pairing-loading" id="pairingCard">
        <h3>AI Pairing <span class="pairing-ai-badge">AI</span></h3>
        <p style="display:flex;align-items:center;gap:8px;color:#64748B">
          <span class="spinner"></span> Getting personalised recommendation...
        </p>
      </div>
      <div class="detail-grid" style="padding:0 0 12px">
        <div><strong>Category</strong>${escapeHtml(item.category || '-')}</div>
        <div><strong>Price</strong>${formatCurrency(item.price)}</div>
        <div><strong>Prep Time</strong>${item.prepTime ? item.prepTime + ' min' : '~15 min'}</div>
        <div><strong>Allergens</strong>${escapeHtml(item.allergens || 'None listed')}</div>
      </div>
    </div>
    <div class="detail-actions">
      <button class="btn-add-main" onclick="addToOrder('${escapeHtml(item.name)}',1)">+ Add to Order</button>
      <button class="btn-add-multi" onclick="addMultiple('${escapeHtml(item.name)}')">Multiple</button>
    </div>
  `;

  openSheet('itemSheet');
  fetchAIPairing(item);
}

async function fetchAIPairing(item) {
  try {
    const data = await fetchWithRetry(`${CFG.API_BASE}/api/ai-pairing`, {
      method: 'POST',
      body: JSON.stringify({
        itemName:        item.name,
        itemPrice:       item.price,
        itemDescription: item.description || '',
        itemCategory:    item.category    || '',
        waiterName:      S.waiterName,
        currentOrder:    S.currentOrder.map(i => ({ name: i.name, price: i.price })),
        tableId:         S.selectedTable
      })
    });

    const card = document.getElementById('pairingCard');
    if (!card) return;
    card.classList.remove('pairing-loading');

    const suggestionsHtml = (data.pairings || []).map(p => `
      <button class="pairing-btn" onclick="addPairingItem('${escapeHtml(p.name)}')" title="${escapeHtml(p.reason || '')}">
        + ${escapeHtml(p.name)}
      </button>
    `).join('');

    card.innerHTML = `
      <h3>${escapeHtml(data.title || 'Chef Recommends')} <span class="pairing-ai-badge">AI</span></h3>
      <p>${escapeHtml(data.description || '')}</p>
      ${data.talkTrack ? `<div class="talk-track">${escapeHtml(data.talkTrack)}</div>` : ''}
      ${suggestionsHtml ? `<div class="pairing-suggestions">${suggestionsHtml}</div>` : ''}
    `;

    S.todayStats.upsells++;
    updateStatsDisplay();
  } catch (e) {
    const card = document.getElementById('pairingCard');
    if (card) {
      card.classList.remove('pairing-loading');
      card.innerHTML = `
        <h3>Chef's Recommendation</h3>
        <p>Ask the kitchen for today's suggested pairing.</p>
      `;
    }
  }
}

function addPairingItem(name) {
  const item = S.allItems.find(i => i.name === name);
  if (item) { addToOrder(name, 1); showToast('+ ' + name + ' added!', 'success'); }
  else showToast(name + ' not in menu - noted.', 'warning');
}

function addMultiple(itemName) {
  const picked = prompt('How many? (1-10)', '2');
  const n = parseInt(picked);
  if (!isNaN(n) && n >= 1 && n <= 10) addToOrder(itemName, n);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ORDER MANAGEMENT
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function addToOrder(itemName, qty = 1) {
  if (!S.selectedTable) { showToast('Select a table first!', 'error'); return; }
  const item = S.allItems.find(i => i.name === itemName);
  if (!item) return;

  const existing = S.currentOrder.find(i => i.name === itemName);
  if (existing) {
    existing.quantity += qty;
  } else {
    // FIX: quantity always explicitly set
    S.currentOrder.push({
      id:       genId(),
      name:     item.name,
      price:    item.price,
      quantity: qty,
      category: item.category || ''
    });
  }

  syncCart();
  updateOrderBadge();
  renderOrderView();
  loadRecommendations(); // NEW: refresh recs after add
  showToast(escapeHtml(item.name) + ' x' + qty + ' added.', 'success');
  closeItemSheet();
}

function changeQty(itemId, delta) {
  const idx = S.currentOrder.findIndex(i => i.id === itemId);
  if (idx === -1) return;
  S.currentOrder[idx].quantity = Math.max(0, (S.currentOrder[idx].quantity || 1) + delta);
  if (S.currentOrder[idx].quantity === 0) S.currentOrder.splice(idx, 1);
  syncCart();
  updateOrderBadge();
  renderOrderView();
  loadRecommendations(); // NEW
}

function syncCart() {
  if (S.socket && S.socket.connected) {
    S.socket.emit('updateCart', {
      restaurantId: CFG.RESTAURANT_ID,
      tableId: S.selectedTable,
      cart: S.currentOrder
    });
  }
}

function renderOrderView() {
  const listEl  = document.getElementById('orderList');
  const summEl  = document.getElementById('orderSummaryCard');
  const emptyEl = document.getElementById('orderEmpty');
  const titleEl = document.getElementById('orderViewTitle');
  const subEl   = document.getElementById('orderViewSub');

  titleEl.textContent = S.selectedTable ? 'Table ' + S.selectedTable + ' - Order' : 'Current Order';
  const notes = S.selectedTable ? S.serviceNotes[S.selectedTable] : null;
  subEl.textContent = notes
    ? 'Note: ' + notes.substring(0, 50) + (notes.length > 50 ? '...' : '')
    : (S.selectedTable ? 'No notes for this table' : 'Select a table first');

  if (!S.currentOrder.length) {
    listEl.innerHTML = '';
    summEl.style.display = 'none';
    emptyEl.style.display = 'block';
    document.getElementById('recStrip').style.display = 'none';
    updateHistorySection();
    return;
  }

  emptyEl.style.display = 'none';
  summEl.style.display = 'block';

  const total = S.currentOrder.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  document.getElementById('orderTotalVal').textContent = formatCurrency(total);

  // Keep quantity labels stable even when older carts omit a quantity field.
  listEl.innerHTML = S.currentOrder.map(item => {
    const qty = item.quantity || 1;
    return `
      <div class="order-row">
        <div class="or-info">
          <div class="or-name">${escapeHtml(item.name)}</div>
          <div class="or-price">${formatCurrency(item.price)} each</div>
        </div>
        <div class="qty-ctrl">
          <button class="qty-btn minus" onclick="changeQty('${escapeHtml(item.id)}', -1)">-</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn plus"  onclick="changeQty('${escapeHtml(item.id)}', 1)">+</button>
        </div>
        <div class="or-total">${formatCurrency((item.price || 0) * qty)}</div>
      </div>
    `;
  }).join('');

  updateHistorySection();
}

function updateOrderBadge() {
  const count = S.currentOrder.reduce((s, i) => s + (i.quantity || 1), 0);
  const badge = document.getElementById('orderBadge');
  badge.style.display = count ? 'flex' : 'none';
  badge.textContent = count;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RECOMMENDATIONS  (NEW â€” fixed payload)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const debouncedLoadRecs = debounce(async () => {
  const strip = document.getElementById('recStrip');
  const chips = document.getElementById('recChips');
  if (!strip || !chips) return;
  if (!S.currentOrder.length) { strip.style.display = 'none'; return; }

  try {
    const data = await fetchWithRetry(`${CFG.API_BASE}/api/recommend`, {
      method: 'POST',
      body: JSON.stringify({
        cart: S.currentOrder.map(i => ({ name: i.name, price: i.price }))
      })
    });

    if (!Array.isArray(data) || !data.length) { strip.style.display = 'none'; return; }

    strip.style.display = 'block';
    chips.innerHTML = data.map((r, idx) => `
      <div class="rec-chip" onclick="addToOrder('${escapeHtml(r.name)}',1)">
        <div class="rec-chip-name">${escapeHtml(r.name)}</div>
        <div class="rec-chip-meta">${formatCurrency(r.price)} - ${escapeHtml(r.source_title || 'Suggested')}</div>
        <span class="rec-chip-add">+</span>
      </div>
    `).join('');
  } catch (e) {
    strip.style.display = 'none';
  }
}, 600);

function loadRecommendations() { debouncedLoadRecs(); }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SEND ORDER
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function sendOrder() {
  if (!S.selectedTable) { showToast('No table selected!', 'error'); return; }
  if (!S.currentOrder.length) { showToast('Order is empty!', 'error'); return; }

  const btn = document.getElementById('btnKitchen');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    await fetchWithRetry(`${CFG.API_BASE}/api/waiter/add-items`, {
      method: 'POST',
      body: JSON.stringify({
        tableId:    S.selectedTable,
        items:      S.currentOrder.map(i => ({ name: i.name, price: i.price, quantity: i.quantity || 1 })),
        waiterName: S.waiterName,
        notes:      S.serviceNotes[S.selectedTable] || ''
      })
    });

    const total = S.currentOrder.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    S.todayStats.sales += total;
    S.todayStats.tables++;
    updateStatsDisplay();

    S.currentOrder = [];
    syncCart();
    updateOrderBadge();
    renderOrderView();
    updateTableStatus(S.selectedTable);
    showToast('Order sent to kitchen.', 'success');
  } catch (e) {
    showToast('Failed to send. Retrying...', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons" style="font-size:18px">Send</span> Send to Kitchen';
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ARCHIVE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function openArchiveModal() {
  if (!S.selectedTable) { showToast('No table selected!', 'error'); return; }
  document.getElementById('archiveModalSub').textContent =
    `Archive Table ${S.selectedTable}? This marks it complete and moves orders to history.`;
  document.getElementById('archiveModal').classList.add('open');
}

function closeArchiveModal() { document.getElementById('archiveModal').classList.remove('open'); }

async function archiveTable() {
  if (!S.selectedTable) return;
  closeArchiveModal();
  try {
    await fetchWithRetry(`${CFG.API_BASE}/api/waiter/archive-table`, {
      method: 'POST',
      body: JSON.stringify({ tableId: S.selectedTable })
    });

    const total = S.currentOrder.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    S.archivedTables.unshift({
      tableId: S.selectedTable,
      waiter: S.waiterName,
      items: [...S.currentOrder],
      total,
      time: new Date().toLocaleTimeString(),
      archivedAt: Date.now()
    });
    localStorage.setItem('archivedTables', JSON.stringify(S.archivedTables.slice(0, 50)));

    S.currentOrder = [];
    S.tableStatuses[S.selectedTable] = { status: 'empty', orderCount: 0, total: 0 };
    syncCart();
    updateOrderBadge();
    rerenderTableCard(S.selectedTable);
    renderOrderView();
    showToast('Table ' + S.selectedTable + ' archived.', 'success');
  } catch (e) {
    showToast('Archive failed. Try again.', 'error');
  }
}

function updateHistorySection() {
  const sec  = document.getElementById('historySection');
  const list = document.getElementById('historyList');
  if (!S.archivedTables.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  list.innerHTML = S.archivedTables.slice(0, 8).map(r => `
    <div class="history-row">
      <div>
        <div class="history-name">Table ${escapeHtml(r.tableId)}</div>
        <div class="history-meta">${escapeHtml(r.waiter || 'Waiter')} - ${escapeHtml(r.time || '')} - ${r.items ? r.items.length : 0} items</div>
      </div>
      <div style="text-align:right">
        <div class="history-total">${formatCurrency(r.total)}</div>
        <span class="archived-badge">Done</span>
      </div>
    </div>
  `).join('');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SERVICE NOTES
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function openNotesModal() {
  if (!S.selectedTable) { showToast('Select a table first!', 'error'); return; }
  document.getElementById('notesModalSub').textContent = `Table ${S.selectedTable} - allergies, preferences, special requests`;
  document.getElementById('notesInput').value = S.serviceNotes[S.selectedTable] || '';
  document.getElementById('notesModal').classList.add('open');
  setTimeout(() => document.getElementById('notesInput').focus(), 300);
}

function closeNotesModal() { document.getElementById('notesModal').classList.remove('open'); }

function saveNotes() {
  const note = document.getElementById('notesInput').value.trim();
  if (S.selectedTable) {
    S.serviceNotes[S.selectedTable] = note;
    const dot = document.getElementById('fabNote').querySelector('.note-dot');
    if (note && !dot) {
      const d = document.createElement('span'); d.className = 'note-dot';
      document.getElementById('fabNote').appendChild(d);
    } else if (!note && dot) dot.remove();
  }
  closeNotesModal();
  renderOrderView();
  showToast('Notes saved.', 'success');
}

function callManager() {
  if (S.socket && S.socket.connected) {
    S.socket.emit('callWaiter', { tableId: S.selectedTable || 'waiter', restaurantId: CFG.RESTAURANT_ID });
    showToast('Manager notified.', 'warning');
  } else {
    showToast('Not connected', 'error');
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ANALYTICS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function updateStatsDisplay() {
  const { sales, tables, upsells } = S.todayStats;
  document.getElementById('statSales').textContent   = formatCurrency(sales);
  document.getElementById('statUpsell').textContent  = tables > 0 ? Math.round((upsells / tables) * 100) + '%' : '0%';
  document.getElementById('statTables').textContent  = tables;
  document.getElementById('statAvg').textContent     = tables > 0 ? formatCurrency(sales / tables) : 'R0';

  const cats = { STARTER: 0, MAIN: 0, DRINK: 0, DESSERT: 0 };
  S.currentOrder.forEach(i => {
    const cat = (i.category || '').toUpperCase();
    if (cats.hasOwnProperty(cat)) cats[cat] += (i.price || 0) * (i.quantity || 1);
  });
  const catTotal = Object.values(cats).reduce((a, b) => a + b, 0) || 1;
  [['Starter','STARTER'],['Main','MAIN'],['Drink','DRINK'],['Dessert','DESSERT']].forEach(([lbl, key]) => {
    const pct = Math.round((cats[key] / catTotal) * 100);
    const el = document.getElementById('pct' + lbl);
    const fl = document.getElementById('fill' + lbl);
    if (el) el.textContent = pct + '%';
    if (fl) fl.style.width = pct + '%';
  });
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SHEET / MODAL HELPERS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function openSheet(id)    { document.getElementById(id).classList.add('open'); document.getElementById('backdrop').classList.add('open'); }
function closeItemSheet() { document.getElementById('itemSheet').classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); }
function closeAllSheets() { document.querySelectorAll('.sheet').forEach(s => s.classList.remove('open')); document.getElementById('backdrop').classList.remove('open'); }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   NAVIGATION
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function switchView(btn, viewId) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  btn.classList.add('active');
  switchViewById(viewId);
}
function switchViewById(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(viewId);
  if (el) el.classList.add('active');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HELPERS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function getEmoji(item) {
  const category = String(item.category || 'Menu').trim();
  return category.slice(0, 2).toUpperCase() || 'M';
}

async function loadSessionUser() {
  try {
    const response = await fetch(`${CFG.APP_BASE}/api/auth/me`);
    const data = response.ok ? await response.json() : {};
    if (!data.user) {
      window.location.href = `${CFG.APP_BASE}/Login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    if (!S.waiterName && data.user.label) {
      S.waiterName = data.user.label;
      localStorage.setItem('waiterName', S.waiterName);
    }
  } catch (_) {}
}

function setupLogout() {
  const button = document.getElementById('waiterLogout');
  if (!button) return;
  button.addEventListener('click', async () => {
    await fetch(`${CFG.APP_BASE}/api/auth/logout`, { method: 'POST' });
    window.location.href = `${CFG.APP_BASE}/Login`;
  });
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   INIT
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function init() {
  notifInit();
  await loadSessionUser();
  if (!S.waiterName) openWaiterModal();
  else document.getElementById('waiterPill').textContent = S.waiterName;
  setupLogout();
  setupSocket();
  initTables();
  await loadMenu();
  updateStatsDisplay();
  updateHistorySection();
  console.log('Trump Prime Waiter Pro ready');
}

document.addEventListener('DOMContentLoaded', init);
