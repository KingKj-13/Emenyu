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
  isViewOnly: false,
  assignedTables: [],
  currentOrder: [],
  menu: {},
  allItems: [],
  tableStatuses: {},
  serviceNotes: {},
  archivedTables: JSON.parse(localStorage.getItem('archivedTables') || '[]'),
  selectedCategory: 'all',
  socket: null,
  isConnected: false,
  todayStats: { sales: 0, upsells: 0, tables: 0 },
  notifications: [],
  activeBellTables: new Set(),
  tableKitchenStatus: {},
  tableTimelines: {}
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
    setConnDot('online');
    if (S.waiterName) {
      S.socket.emit('joinAsWaiter', { name: S.waiterName, restaurantId: CFG.RESTAURANT_ID });
    }
    if (S.selectedTable) joinTable(S.selectedTable);
  });

  S.socket.on('disconnect', () => {
    S.isConnected = false;
    setConnDot('offline');
  });

  S.socket.on('reconnecting', () => {
    setConnDot('connecting');
  });

  S.socket.on('syncCart', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    if (data.tableId === S.selectedTable) {
      S.currentOrder = data.cart || [];
      timelineAdd(data.tableId, 'guest_update', 'Guest updated cart');
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

  S.socket.on('waiterRegistered', (data) => {
    showToast(data.message || 'You are now online', 'success');
  });

  S.socket.on('waiterOnTheWay', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    showToast(data.waiterName + ' is responding to ' + data.tableId, 'success');
  });

  S.socket.on('kitchenStatusUpdate', (data) => {
    if (data.restaurantId !== CFG.RESTAURANT_ID) return;
    S.tableKitchenStatus[data.tableId] = data.status;
    rerenderTableCard(data.tableId);
    if (data.status === 'ready') {
      showToast('Table ' + data.tableId + ' order is ready!', 'success');
      notifAdd(data.tableId, 'Table ' + data.tableId, 'Order ready — bring to table', false);
    }
  });
}

function setConnDot(status) {
  const el = document.getElementById('sbConn');
  if (!el) return;
  el.className = 'sb-dot ' + status;
  el.title = status === 'online' ? 'Connected' : status === 'offline' ? 'Disconnected' : 'Connecting...';
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
  document.getElementById('sbWaiterBtn').textContent = S.waiterName;
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
  const mySection = document.getElementById('myTablesSection');
  const myGrid    = document.getElementById('myTableGrid');
  const allGrid   = document.getElementById('tableGrid');
  const allLabel  = document.getElementById('allTablesLabel');

  if (myGrid) myGrid.innerHTML = '';
  if (allGrid) allGrid.innerHTML = '';

  const hasAssigned = S.assignedTables.length > 0;
  if (mySection) mySection.style.display = hasAssigned ? 'block' : 'none';
  if (allLabel) allLabel.textContent = hasAssigned ? 'All Tables (View Only)' : 'All Tables';

  for (let i = 1; i <= CFG.TOTAL_TABLES; i++) {
    const id = String(i);
    const card = buildTableCard(id);
    if (hasAssigned && S.assignedTables.includes(id)) {
      if (myGrid) myGrid.appendChild(card);
    } else {
      if (allGrid) allGrid.appendChild(card);
    }
  }
}

function buildTableCard(id) {
  const st       = S.tableStatuses[id] || { status: 'empty', orderCount: 0, total: 0 };
  const isActive = S.selectedTable === id;
  const ringing    = S.activeBellTables.has(id);
  const kStatus    = S.tableKitchenStatus[id] || null;
  const isAssigned = S.assignedTables.length === 0 || S.assignedTables.includes(id);
  const isViewOnly = S.assignedTables.length > 0 && !isAssigned;

  const card = document.createElement('div');
  card.className = `table-card${isActive ? ' active' : ''}${st.orderCount > 0 ? ' has-orders' : ''}${ringing ? ' bell-ringing' : ''}${isAssigned && S.assignedTables.length > 0 ? ' assigned' : ''}${isViewOnly ? ' view-only' : ''}`;
  card.id = `tc-${id}`;
  card.onclick = () => selectTable(id);
  card.innerHTML = `
    ${ringing ? '<span class="t-bell">!</span>' : ''}
    <div class="t-num">${escapeHtml(id)}</div>
    <span class="t-stat ${st.status}">${st.status === 'empty' ? 'Empty' : st.status}</span>
    ${st.orderCount > 0 ? `<span class="t-badge">${st.orderCount}</span>` : ''}
    ${kStatus === 'cooking' ? '<span class="t-kitchen cooking">Cooking</span>' : ''}
    ${kStatus === 'ready'   ? '<span class="t-kitchen ready">Ready!</span>'   : ''}
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
  S.isViewOnly = S.assignedTables.length > 0 && !S.assignedTables.includes(id);
  const el = document.getElementById('sbTable');
  if (el) el.textContent = 'Table ' + id;
  if (S.activeBellTables.has(id)) {
    S.activeBellTables.delete(id);
    rerenderTableCard(id);
  }
  timelineAdd(id, 'opened', 'Opened by ' + (S.waiterName || 'Waiter'));
  joinTable(id);
  renderTableGrid();
  renderOrderView();
  const msg = S.isViewOnly ? 'Viewing Table ' + id + ' (read-only)' : 'Managing Table ' + id;
  showToast(msg, S.isViewOnly ? 'warning' : 'success');
  // Switch to order view
  const orderNav = document.querySelector('.nav-item:nth-child(2)');
  if (orderNav) switchView(orderNav, 'viewOrder');
}

function filterTables(query) {
  const q = query.trim().toLowerCase();
  for (let i = 1; i <= CFG.TOTAL_TABLES; i++) {
    const card = document.getElementById(`tc-${i}`);
    if (!card) continue;
    card.classList.toggle('hidden', q !== '' && !String(i).includes(q));
  }
}

/* ════════════════════════════════════════════════════════
   TABLE TIMELINE
════════════════════════════════════════════════════════ */
function timelineAdd(tableId, action, detail) {
  if (!tableId) return;
  if (!S.tableTimelines[tableId]) S.tableTimelines[tableId] = [];
  const icons = { opened: 'O', item_added: '+', sent_to_kitchen: 'K', guest_update: 'G', archived: 'D' };
  S.tableTimelines[tableId].unshift({
    action,
    detail: detail || '',
    icon: icons[action] || '•',
    time: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
  });
  if (S.tableTimelines[tableId].length > 15) S.tableTimelines[tableId].pop();
}

function renderTimeline(tableId) {
  const el = document.getElementById('timelineList');
  if (!el) return;
  const events = S.tableTimelines[tableId] || [];
  if (!events.length) { el.innerHTML = '<div class="tl-empty">No activity yet</div>'; return; }
  el.innerHTML = events.map(e => `
    <div class="tl-event">
      <span class="tl-icon tl-${escapeHtml(e.action)}">${escapeHtml(e.icon)}</span>
      <div class="tl-body">
        <span class="tl-detail">${escapeHtml(e.detail)}</span>
        <span class="tl-time">${escapeHtml(e.time)}</span>
      </div>
    </div>
  `).join('');
}

function toggleTimeline() {
  const list = document.getElementById('timelineList');
  const btn  = document.getElementById('timelineToggleBtn');
  if (!list) return;
  const isOpen = list.style.display !== 'none';
  list.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.textContent = isOpen ? 'Show' : 'Hide';
  if (!isOpen && S.selectedTable) renderTimeline(S.selectedTable);
}

function refreshTimelineIfOpen() {
  const list = document.getElementById('timelineList');
  if (list && list.style.display !== 'none' && S.selectedTable) renderTimeline(S.selectedTable);
}

/* ════════════════════════════════════════════════════════
   SPLIT BILL
════════════════════════════════════════════════════════ */
function openSplitModal() {
  if (!S.selectedTable) { showToast('Select a table first!', 'error'); return; }
  if (!S.currentOrder.length) { showToast('Order is empty!', 'error'); return; }
  const total = S.currentOrder.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  document.getElementById('splitModalSub').textContent =
    `Table ${S.selectedTable} — Total: ${formatCurrency(total)}`;
  document.getElementById('splitN').value = '2';
  renderSplitResult();
  document.getElementById('splitModal').classList.add('open');
}

function closeSplitModal() { document.getElementById('splitModal').classList.remove('open'); }

function adjustSplit(delta) {
  const input = document.getElementById('splitN');
  const v = Math.max(2, Math.min(12, (parseInt(input.value) || 2) + delta));
  input.value = v;
  renderSplitResult();
}

function renderSplitResult() {
  const n = Math.max(2, Math.min(12, parseInt(document.getElementById('splitN').value) || 2));
  const total = S.currentOrder.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const perPerson = total / n;
  const rows = Array.from({ length: n }, (_, i) =>
    `<div class="split-row"><span>Guest ${i + 1}</span><span class="split-amount">${formatCurrency(perPerson)}</span></div>`
  ).join('');
  document.getElementById('splitResult').innerHTML =
    `<div class="split-total-row">${formatCurrency(total)} ÷ ${n} guests</div>${rows}`;
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
      category: item.category || '',
      source:   'waiter'
    });
  }

  timelineAdd(S.selectedTable, 'item_added', item.name + (qty > 1 ? ' ×' + qty : ''));
  syncCart();
  updateOrderBadge();
  renderOrderView();
  loadRecommendations();
  showToast(escapeHtml(item.name) + ' x' + qty + ' added.', 'success');
  closeItemSheet();
}

function changeQty(itemId, delta) {
  const idx = S.currentOrder.findIndex(i => i.id === itemId);
  if (idx === -1) return;
  if (S.isViewOnly) { showToast('View only — not your assigned table', 'warning'); return; }
  S.currentOrder[idx].quantity = Math.max(0, (S.currentOrder[idx].quantity || 1) + delta);
  if (S.currentOrder[idx].quantity === 0) S.currentOrder.splice(idx, 1);
  syncCart();
  updateOrderBadge();
  renderOrderView();
  loadRecommendations();
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
  const itemsEl  = document.getElementById('orderItems');
  const summEl   = document.getElementById('orderSummary');
  const emptyEl  = document.getElementById('orderEmpty');
  const titleEl  = document.getElementById('orderTitle');
  const subEl    = document.getElementById('orderSub');
  const timelineEl   = document.getElementById('timelineSection');
  const viewOnlyBanner = document.getElementById('viewOnlyBanner');
  const quickAddSection = document.getElementById('quickAddSection');

  titleEl.textContent = S.selectedTable ? 'Table ' + S.selectedTable : 'Select a table';
  const notes = S.selectedTable ? S.serviceNotes[S.selectedTable] : null;
  subEl.textContent = notes
    ? notes.substring(0, 60) + (notes.length > 60 ? '…' : '')
    : (S.selectedTable ? 'No notes' : 'Tap a table from the Tables tab');

  if (viewOnlyBanner)  viewOnlyBanner.style.display   = S.isViewOnly ? 'block' : 'none';
  if (quickAddSection) quickAddSection.style.opacity   = S.isViewOnly ? '0.45' : '1';
  if (quickAddSection) quickAddSection.style.pointerEvents = S.isViewOnly ? 'none' : '';
  if (timelineEl)      timelineEl.style.display        = S.selectedTable ? 'block' : 'none';

  const btnSend = document.getElementById('btnSend');
  if (btnSend) btnSend.disabled = S.isViewOnly;

  if (!S.currentOrder.length) {
    if (itemsEl) itemsEl.innerHTML = '';
    if (summEl)  summEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    const recCard = document.getElementById('recCard');
    if (recCard) recCard.style.display = 'none';
    updateHistorySection();
    if (S.selectedTable) refreshTimelineIfOpen();
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (summEl)  summEl.style.display = 'block';

  const total = S.currentOrder.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const totalEl = document.getElementById('summaryTotal');
  if (totalEl) totalEl.textContent = formatCurrency(total);

  if (itemsEl) {
    itemsEl.innerHTML = S.currentOrder.map(item => {
      const qty      = item.quantity || item.qty || 1;
      const isGuest  = item.source === 'guest';
      const itemId   = escapeHtml(item.id || '');
      return `
        <div class="order-row${isGuest ? ' guest-item' : ''}">
          <div class="or-info">
            <div class="or-name-line">
              <span class="or-name">${escapeHtml(item.name)}</span>
              ${isGuest ? '<span class="guest-lbl">Guest</span>' : ''}
            </div>
            <div class="or-unit-price">${formatCurrency(item.price)} each</div>
          </div>
          <div class="or-controls">
            <button class="qty-btn minus" onclick="changeQty('${itemId}', -1)">−</button>
            <span class="qty-num">${qty}</span>
            <button class="qty-btn plus"  onclick="changeQty('${itemId}', 1)">+</button>
          </div>
          <span class="or-total">${formatCurrency((item.price || 0) * qty)}</span>
        </div>
      `;
    }).join('');
  }

  updateHistorySection();
  refreshTimelineIfOpen();
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
function pairingReasonText(item) {
  const type = (item.categoryType || '').toUpperCase();
  const src = item.source_title || '';
  const name = (item.name || '').toLowerCase();
  if (type === 'WINE') {
    if (/shiraz|merlot|cabernet|pinotage/.test(name)) return 'A bold red — pairs beautifully with grilled meats.';
    if (/chardonnay|sauvignon|chenin/.test(name)) return 'A crisp white — the perfect seafood companion.';
    if (/rosé|rose/.test(name)) return 'Elegant rosé — light and versatile at the table.';
    return 'From the cellar — a confident wine pairing.';
  }
  if (type === 'DRINK') {
    if (/beer|lager|cider/.test(name)) return 'Ice-cold beer — the classic grill companion.';
    if (/old fashioned|bourbon|whisky/.test(name)) return 'A signature cocktail to elevate the evening.';
    if (/coffee|espresso/.test(name)) return 'Rich coffee — a perfect way to close the meal.';
    return 'A great drink to round off this course.';
  }
  if (type === 'DESSERT') return 'The perfect sweet note to finish this meal.';
  if (type === 'STARTER') return 'A light start to open the palate beautifully.';
  if (/chips|fries/.test(name)) return 'Classic crispy side — goes with almost everything.';
  if (/garlic bread/.test(name)) return 'Warm garlic bread — perfect to share at the table.';
  if (/salad/.test(name)) return 'Fresh balance alongside a rich main.';
  if (/sauce/.test(name)) return 'Drizzle it over — takes the dish to the next level.';
  if (src === "Chef's Pairing") return "The chef's own recommendation for this dish.";
  if (src === 'People also ordered') return 'Other guests ordering this always add it too.';
  return 'A natural pairing that rounds out the table.';
}

/* ════════════════════════════════════════════════════════
   QUICK ADD
════════════════════════════════════════════════════════ */
function handleQuickAdd(query) {
  const results = document.getElementById('quickAddResults');
  const clearBtn = document.getElementById('quickAddClear');
  if (!results) return;
  if (clearBtn) clearBtn.style.display = query.trim() ? 'block' : 'none';
  if (!query.trim()) { results.style.display = 'none'; return; }

  const q = query.toLowerCase();
  const matches = S.allItems
    .filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) { results.style.display = 'none'; return; }

  results.innerHTML = matches.map(item => `
    <div class="quick-result" onclick="quickAddItem('${escapeHtml(item.name)}')">
      <div class="qr-info">
        <div class="qr-name">${escapeHtml(item.name)}</div>
        <div class="qr-cat">${escapeHtml(item.category || '')}</div>
      </div>
      <span class="qr-price">${formatCurrency(item.price)}</span>
      <span class="qr-add">+</span>
    </div>
  `).join('');
  results.style.display = 'block';
}

function quickAddItem(itemName) {
  clearQuickAdd();
  addToOrder(itemName, 1);
}

function clearQuickAdd() {
  const input   = document.getElementById('quickAddInput');
  const results = document.getElementById('quickAddResults');
  const clearBtn = document.getElementById('quickAddClear');
  if (input)   input.value = '';
  if (results) results.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
}

/* ════════════════════════════════════════════════════════
   CONVERSATIONAL RECOMMENDATION
════════════════════════════════════════════════════════ */
const DRINK_CATS = new Set(['wine', 'beer', 'cocktail', 'drink', 'beverage', 'spirit', 'spirits', 'liqueur', 'soft', 'water', 'coffee', 'tea', 'espresso']);

function cartItemIsDrink(item) {
  const cat = (item.category || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  return DRINK_CATS.has(cat) || [...DRINK_CATS].some(t => name.includes(t));
}

function buildRecommendationPitch(cart, recs) {
  const DRINK_TYPES = new Set(['WINE', 'DRINK', 'COCKTAIL', 'BEVERAGE', 'BEER']);
  const foodInCart  = cart.filter(i => !cartItemIsDrink(i));
  const drinkInCart = cart.filter(i => cartItemIsDrink(i));

  const wineRec  = recs.find(r => r.categoryType === 'WINE');
  const drinkRec = recs.find(r => DRINK_TYPES.has(r.categoryType || ''));
  const foodRec  = recs.find(r => !DRINK_TYPES.has(r.categoryType || ''));

  const mainDish    = foodInCart[0]?.name  || null;
  const cartDrink   = drinkInCart[0]?.name || null;

  // Guest already has a wine/drink → pivot to food pairing
  if (cartDrink && foodRec) {
    const opts = [
      `Since the table's already enjoying the ${cartDrink}, I'd say the ${foodRec.name} is a natural move — they were made for each other.`,
      `The ${cartDrink} pairs beautifully with our ${foodRec.name}. Worth mentioning — guests always love that combination.`,
      `With the ${cartDrink} in the order, the ${foodRec.name} is the perfect companion. It's one of those combinations that just works.`,
    ];
    return { pitch: opts[Math.floor(Math.random() * opts.length)], featured: [foodRec, wineRec || drinkRec].filter(Boolean) };
  }

  // No drink in cart → lead with wine, secondary food
  if (wineRec && foodRec && mainDish) {
    const opts = [
      `My personal favourite with the ${mainDish} is the ${wineRec.name} — bold enough to stand up to it beautifully. The ${foodRec.name} alongside rounds the table out perfectly.`,
      `For the ${mainDish}, I always reach for the ${wineRec.name}. Guests love it every time. Throw in the ${foodRec.name} as well and you've got a complete experience.`,
      `The ${wineRec.name} is what I'd have with the ${mainDish} — the pairing is genuinely special. A ${foodRec.name} on the side makes it memorable.`,
    ];
    return { pitch: opts[Math.floor(Math.random() * opts.length)], featured: [wineRec, foodRec] };
  }

  if (wineRec && mainDish) {
    const opts = [
      `My personal pick for the ${mainDish} is the ${wineRec.name}. I've never had a table turn it down.`,
      `The ${wineRec.name} is an exceptional match for the ${mainDish} — confident suggestion here.`,
      `With the ${mainDish} on the table, I'd reach straight for the ${wineRec.name}.`,
    ];
    return { pitch: opts[Math.floor(Math.random() * opts.length)], featured: [wineRec] };
  }

  if (drinkRec && !wineRec && mainDish) {
    return { pitch: `The ${drinkRec.name} goes really well with the ${mainDish} — worth mentioning to the table.`, featured: [drinkRec] };
  }

  if (foodRec) {
    return { pitch: `A lot of guests add the ${foodRec.name} alongside — it pairs naturally with what's been ordered.`, featured: [foodRec] };
  }

  return null;
}

const debouncedLoadRecs = debounce(async () => {
  const recCard    = document.getElementById('recCard');
  const recPitch   = document.getElementById('recPitch');
  const recActions = document.getElementById('recActions');
  const recSpinner = document.getElementById('recSpinner');

  if (!recCard || !S.currentOrder.length) {
    if (recCard) recCard.style.display = 'none';
    return;
  }

  if (recSpinner) recSpinner.style.display = 'inline-block';
  recCard.style.display = 'block';
  if (recPitch) recPitch.textContent = 'Getting suggestion…';
  if (recActions) recActions.innerHTML = '';

  try {
    const data = await fetchWithRetry(`${CFG.API_BASE}/api/recommend`, {
      method: 'POST',
      body: JSON.stringify({ cart: S.currentOrder.map(i => ({ name: i.name, price: i.price })) })
    });

    if (!Array.isArray(data) || !data.length) { recCard.style.display = 'none'; return; }

    const result = buildRecommendationPitch(S.currentOrder, data);
    if (!result) { recCard.style.display = 'none'; return; }

    if (recPitch) recPitch.textContent = result.pitch;
    if (recActions) {
      recActions.innerHTML = result.featured.map(r => `
        <button class="rec-action-btn" onclick="addToOrder('${escapeHtml(r.name)}', 1)">
          + ${escapeHtml(r.name)} <span class="rec-action-price">${formatCurrency(r.price)}</span>
        </button>
      `).join('');
    }
  } catch (e) {
    recCard.style.display = 'none';
  } finally {
    if (recSpinner) recSpinner.style.display = 'none';
  }
}, 700);

function loadRecommendations() { if (!S.isViewOnly) debouncedLoadRecs(); }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SEND ORDER
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function sendOrder() {
  if (!S.selectedTable) { showToast('No table selected!', 'error'); return; }
  if (!S.currentOrder.length) { showToast('Order is empty!', 'error'); return; }

  if (S.isViewOnly) { showToast('View only — not your assigned table', 'warning'); return; }
  const btn = document.getElementById('btnSend');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';
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
    timelineAdd(S.selectedTable, 'sent_to_kitchen', 'Order sent — ' + formatCurrency(total));

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
    btn.innerHTML = 'Send to Kitchen';
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
    timelineAdd(S.selectedTable, 'archived', 'Table completed — ' + formatCurrency(total));
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
    if (Array.isArray(data.user.assignedTables)) {
      S.assignedTables = data.user.assignedTables.map(String);
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
async function loadServerStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await fetchWithRetry(`${CFG.API_BASE}/api/analytics/summary?from=${today}&to=${today}`);
    if (data && typeof data.revenue === 'number') {
      S.todayStats.sales  = data.revenue;
      S.todayStats.tables = data.orderCount || 0;
      updateStatsDisplay();
    }
  } catch (_) {}
}

async function init() {
  notifInit();
  await loadSessionUser();
  if (!S.waiterName) openWaiterModal();
  else {
    const btn = document.getElementById('sbWaiterBtn');
    if (btn) btn.textContent = S.waiterName;
  }
  setupLogout();
  setupSocket();
  initTables();
  await loadMenu();
  loadServerStats();
  updateStatsDisplay();
  updateHistorySection();
  console.log('Trump Prime Waiter Pro ready');
}

document.addEventListener('DOMContentLoaded', init);
