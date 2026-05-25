/**
 * ============================================================
 * MYTHOS GREEK RESTAURANT - PROFESSIONAL WAITER INTERFACE
 * ✅ FIX: Quantity undefined bug resolved
 * ✅ FIX: Neutral dark theme (no Greek blue)
 * ✅ NEW: Persistent bell notification panel
 * ✅ NEW: Browser Notification API support
 * ✅ NEW: Smart recommendations strip in order panel
 * ✅ NEW: Dynamic waiter call messages
 * ✅ NEW: joinAsWaiter + waiterResponding sockets
 * ============================================================
 */

(function () {
    'use strict';

    /* ============================================================
       CONFIGURATION
    ============================================================ */
    const CONFIG = {
        RESTAURANT_ID: 'greek',
        SOCKET_URL: window.location.origin,
        API_BASE: window.location.origin,
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000,
        TOAST_DURATION: 4000,
        DEBOUNCE_DELAY: 300
    };

    /* ============================================================
       STATE
    ============================================================ */
    const STATE = {
        waiterName: localStorage.getItem('waiterName') || '',
        selectedTable: null,
        currentOrder: [],
        menuData: {},
        allMenuItems: [],
        tableStatuses: {},
        selectedCategory: 'all',
        socket: null,
        isConnected: false,
        activeBellTables: new Set(),
        notifications: []   // { id, tableId, displayTable, message, time, responded }
    };

    /* ============================================================
       DOM REFERENCES
    ============================================================ */
    const DOM = {
        connectionStatus:    document.getElementById('connectionStatus'),
        connectionText:      document.getElementById('connectionText'),
        waiterNameDisplay:   document.getElementById('waiterNameDisplay'),
        waiterNameModal:     document.getElementById('waiterNameModal'),
        waiterNameInput:     document.getElementById('waiterNameInput'),
        confirmWaiterName:   document.getElementById('confirmWaiterName'),
        tableList:           document.getElementById('tableList'),
        tableSearch:         document.getElementById('tableSearch'),
        menuGrid:            document.getElementById('menuGrid'),
        menuSearch:          document.getElementById('menuSearch'),
        categoryFilters:     document.getElementById('categoryFilters'),
        orderTableNumber:    document.getElementById('orderTableNumber'),
        orderItemsList:      document.getElementById('orderItemsList'),
        orderSummary:        document.getElementById('orderSummary'),
        summaryItemCount:    document.getElementById('summaryItemCount'),
        summaryTotal:        document.getElementById('summaryTotal'),
        sendOrderBtn:        document.getElementById('sendOrderBtn'),
        clearOrderBtn:       document.getElementById('clearOrderBtn'),
        archiveTableBtn:     document.getElementById('archiveTableBtn'),
        archiveModal:        document.getElementById('archiveModal'),
        confirmArchive:      document.getElementById('confirmArchive'),
        cancelArchive:       document.getElementById('cancelArchive'),
        aiPairingModal:      document.getElementById('aiPairingModal'),
        aiPairingClose:      document.getElementById('aiPairingClose'),
        aiPairingTitle:      document.getElementById('aiPairingTitle'),
        aiPairingDescription:document.getElementById('aiPairingDescription'),
        aiPairingTalkTrack:  document.getElementById('aiPairingTalkTrack'),
        aiPairingsList:      document.getElementById('aiPairingsList'),
        loadingOverlay:      document.getElementById('loadingOverlay'),
        toast:               document.getElementById('toast'),
        toastTitle:          document.getElementById('toastTitle'),
        toastMessage:        document.getElementById('toastMessage'),
        // Notification panel (add to waiter.html — see comment at bottom)
        notifBell:           document.getElementById('notifBell'),
        notifBadge:          document.getElementById('notifBadge'),
        notifPanel:          document.getElementById('notifPanel'),
        notifList:           document.getElementById('notifList'),
        // Recommendations strip
        recStrip:            document.getElementById('recStrip'),
        recItems:            document.getElementById('recItems')
    };

    /* ============================================================
       DYNAMIC CALL MESSAGES  (rotated so they never feel canned)
    ============================================================ */
    const CALL_MESSAGES = [
        (t) => `🔔 ${t} needs you right now`,
        (t) => `👋 ${t} is waving for attention`,
        (t) => `⚡ ${t} just rang the bell`,
        (t) => `🙋 Someone at ${t} needs help`,
        (t) => `📣 ${t} flagged you down`,
        (t) => `🍽️ ${t} is ready to order`,
        (t) => `💬 ${t} has a question for you`
    ];

    const MANAGER_MESSAGES = [
        (n) => `📋 Manager called ${n} to the front`,
        (n) => `🔑 Admin needs ${n} immediately`,
        (n) => `📢 Manager alert for ${n}`,
        (n) => `👔 ${n}, the manager is calling you`
    ];

    function randomCallMsg(displayTable) {
        return CALL_MESSAGES[Math.floor(Math.random() * CALL_MESSAGES.length)](displayTable);
    }

    function randomManagerMsg(waiterName) {
        return MANAGER_MESSAGES[Math.floor(Math.random() * MANAGER_MESSAGES.length)](waiterName || 'you');
    }

    /* ============================================================
       UTILS
    ============================================================ */
    const Utils = {
        formatCurrency(amount) { return `R ${parseFloat(amount || 0).toFixed(2)}`; },

        debounce(func, wait) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func(...args), wait);
            };
        },

        normalizeText(text) { return (text || '').toLowerCase().trim(); },
        generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    /* ============================================================
       UI
    ============================================================ */
    const UI = {
        showLoading(text = 'Processing...', subtext = 'Please wait') {
            if (!DOM.loadingOverlay) return;
            const t = DOM.loadingOverlay.querySelector('.loading-text');
            const s = DOM.loadingOverlay.querySelector('.loading-subtext');
            if (t) t.textContent = text;
            if (s) s.textContent = subtext;
            DOM.loadingOverlay.classList.add('active');
        },

        hideLoading() {
            if (DOM.loadingOverlay) DOM.loadingOverlay.classList.remove('active');
        },

        showToast(title, message, type = 'success') {
            if (!DOM.toast) return;
            const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
            DOM.toast.className = `toast ${type}`;
            const icon = DOM.toast.querySelector('.toast-icon');
            if (icon) icon.textContent = icons[type] || '✓';
            if (DOM.toastTitle)   DOM.toastTitle.textContent   = title;
            if (DOM.toastMessage) DOM.toastMessage.textContent = message;
            DOM.toast.classList.add('show');
            setTimeout(() => DOM.toast.classList.remove('show'), CONFIG.TOAST_DURATION);
        },

        updateConnectionStatus(status) {
            if (!DOM.connectionStatus || !DOM.connectionText) return;
            const map = {
                connected:    { text: 'Connected',     cls: 'connected'    },
                disconnected: { text: 'Disconnected',  cls: 'disconnected' },
                connecting:   { text: 'Connecting...', cls: 'connecting'   }
            };
            const c = map[status] || map.connecting;
            DOM.connectionStatus.className = `connection-status ${c.cls}`;
            DOM.connectionText.textContent = c.text;
            STATE.isConnected = (status === 'connected');
        }
    };

    /* ============================================================
       NOTIFICATION MANAGER  (NEW)
    ============================================================ */
    const NotifManager = {
        // Ask browser permission once
        init() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        },

        // Add a new notification entry
        add(tableId, displayTable, message, isManager = false) {
            const id = Utils.generateId();
            STATE.notifications.unshift({
                id,
                tableId,
                displayTable,
                message,
                isManager,
                time: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
                responded: false
            });

            // Keep max 20 notifications
            if (STATE.notifications.length > 20) STATE.notifications.pop();

            this.render();
            this._browserNotif(displayTable, message);

            // Vibrate
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        },

        // Mark as responded
        respond(id, tableId) {
            const notif = STATE.notifications.find(n => n.id === id);
            if (notif) notif.responded = true;

            STATE.activeBellTables.delete(tableId);
            TableManager.renderTable(tableId);
            this.render();

            // Tell server
            if (STATE.socket && STATE.socket.connected) {
                STATE.socket.emit('waiterResponding', {
                    tableId,
                    restaurantId: CONFIG.RESTAURANT_ID
                });
            }

            UI.showToast('On My Way!', `Heading to ${tableId}`, 'success');
        },

        // Dismiss
        dismiss(id) {
            STATE.notifications = STATE.notifications.filter(n => n.id !== id);
            this.render();
        },

        // Render notification panel
        render() {
            const unread = STATE.notifications.filter(n => !n.responded).length;

            // Badge
            if (DOM.notifBadge) {
                DOM.notifBadge.textContent = unread;
                DOM.notifBadge.style.display = unread > 0 ? 'flex' : 'none';
            }

            if (!DOM.notifList) return;

            if (STATE.notifications.length === 0) {
                DOM.notifList.innerHTML = `<div class="notif-empty">No alerts yet</div>`;
                return;
            }

            DOM.notifList.innerHTML = STATE.notifications.map(n => `
                <div class="notif-item ${n.responded ? 'responded' : 'pending'} ${n.isManager ? 'manager-call' : ''}">
                    <div class="notif-header">
                        <span class="notif-table">${Utils.escapeHtml(n.displayTable)}</span>
                        <span class="notif-time">${n.time}</span>
                    </div>
                    <div class="notif-message">${Utils.escapeHtml(n.message)}</div>
                    <div class="notif-actions">
                        ${!n.responded
                            ? `<button class="notif-respond-btn" data-id="${n.id}" data-table="${n.tableId}">✅ On My Way</button>`
                            : `<span class="notif-done">✓ Responded</span>`
                        }
                        <button class="notif-dismiss-btn" data-id="${n.id}">✕</button>
                    </div>
                </div>
            `).join('');

            // Listeners
            DOM.notifList.querySelectorAll('.notif-respond-btn').forEach(btn => {
                btn.addEventListener('click', () => this.respond(btn.dataset.id, btn.dataset.table));
            });
            DOM.notifList.querySelectorAll('.notif-dismiss-btn').forEach(btn => {
                btn.addEventListener('click', () => this.dismiss(btn.dataset.id));
            });
        },

        togglePanel() {
            if (DOM.notifPanel) DOM.notifPanel.classList.toggle('open');
        },

        _browserNotif(title, body) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, { body, icon: '/favicon.ico' });
            }
        }
    };

    /* ============================================================
       API
    ============================================================ */
    const API = {
        async fetchWithRetry(url, options = {}, retries = CONFIG.RETRY_ATTEMPTS) {
            for (let i = 0; i < retries; i++) {
                try {
                    const controller = new AbortController();
                    const tid = setTimeout(() => controller.abort(), 10000);
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal,
                        headers: { 'Content-Type': 'application/json', ...options.headers }
                    });
                    clearTimeout(tid);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return await response.json();
                } catch (err) {
                    if (i === retries - 1) throw err;
                    await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * (i + 1)));
                }
            }
        },

        async loadMenu() {
            const data = await this.fetchWithRetry(`${CONFIG.API_BASE}/api/menu`);
            if (!data || !Object.keys(data).length) return {};
            STATE.menuData = data;
            STATE.allMenuItems = this.flattenMenu(data);
            return data;
        },

        flattenMenu(menuObj) {
            const items = [];
            const traverse = (obj, cat) => {
                if (Array.isArray(obj)) { obj.forEach(i => traverse(i, cat)); return; }
                if (obj && typeof obj === 'object') {
                    if (obj.items && Array.isArray(obj.items)) {
                        obj.items.forEach(item => {
                            if (item && item.name) {
                                // ✅ FIX: Do NOT spread quantity — keep menu item pure
                                items.push({
                                    name:        item.name,
                                    price:       item.price,
                                    description: item.description || '',
                                    img:         item.img || '',
                                    category:    cat
                                });
                            }
                        });
                    }
                    Object.keys(obj).forEach(key => {
                        if (key !== 'items' && typeof obj[key] === 'object') traverse(obj[key], key);
                    });
                }
            };
            traverse(menuObj, 'Main');
            return items;
        },

        async getTableStatus(tableId) {
            try {
                const data = await this.fetchWithRetry(`${CONFIG.API_BASE}/api/waiter/table/${tableId}/status`);
                STATE.tableStatuses[tableId] = data;
                return data;
            } catch {
                return { status: 'empty', orderCount: 0, total: 0 };
            }
        },

        async sendOrder(tableId, items, waiterName) {
            return this.fetchWithRetry(`${CONFIG.API_BASE}/api/waiter/add-items`, {
                method: 'POST',
                body: JSON.stringify({
                    tableId,
                    items: items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, notes: i.notes || '' })),
                    waiterName
                })
            });
        },

        async archiveTable(tableId) {
            return this.fetchWithRetry(`${CONFIG.API_BASE}/api/waiter/archive-table`, {
                method: 'POST',
                body: JSON.stringify({ tableId })
            });
        },

        async getAIPairing(item) {
            return this.fetchWithRetry(`${CONFIG.API_BASE}/api/ai-pairing`, {
                method: 'POST',
                body: JSON.stringify({
                    itemName:        item.name,
                    itemPrice:       item.price,
                    itemDescription: item.description || '',
                    itemCategory:    item.category    || '',
                    waiterName:      STATE.waiterName,
                    currentOrder:    STATE.currentOrder.map(i => ({ name: i.name, price: i.price })),
                    tableId:         STATE.selectedTable
                })
            });
        },

        /* ✅ Recommendations — sends cart correctly */
        async getRecommendations() {
            if (!STATE.currentOrder.length) return [];
            try {
                const data = await this.fetchWithRetry(`${CONFIG.API_BASE}/api/recommend`, {
                    method: 'POST',
                    body: JSON.stringify({
                        cart: STATE.currentOrder.map(i => ({ name: i.name, price: i.price }))
                    })
                });
                return Array.isArray(data) ? data : [];
            } catch {
                return [];
            }
        }
    };

    /* ============================================================
       AI PAIRING MODAL MANAGER
    ============================================================ */
    const AIPairingManager = {
        async show(item) {
            if (!DOM.aiPairingModal) {
                UI.showToast('Fetching pairing...', '', 'info');
                const r = await API.getAIPairing(item);
                if (r) UI.showToast(r.title || "Chef's Pick", (r.talkTrack || r.description || '').substring(0, 90), 'info');
                return;
            }

            if (DOM.aiPairingTitle)        DOM.aiPairingTitle.textContent        = `Pairing for: ${item.name}`;
            if (DOM.aiPairingDescription)  DOM.aiPairingDescription.textContent  = '';
            if (DOM.aiPairingTalkTrack)    DOM.aiPairingTalkTrack.textContent    = '';
            if (DOM.aiPairingsList)        DOM.aiPairingsList.innerHTML           = '<div class="ai-loading">🍷 Asking the AI sommelier...</div>';
            DOM.aiPairingModal.classList.add('active');

            const r = await API.getAIPairing(item);
            if (!r) {
                if (DOM.aiPairingTitle)  DOM.aiPairingTitle.textContent  = 'AI Offline';
                if (DOM.aiPairingsList)  DOM.aiPairingsList.innerHTML    = '<div class="ai-error">Could not fetch suggestion.</div>';
                return;
            }

            if (DOM.aiPairingTitle)       DOM.aiPairingTitle.textContent       = r.title       || "Chef's Pick";
            if (DOM.aiPairingDescription) DOM.aiPairingDescription.textContent = r.description || '';
            if (DOM.aiPairingTalkTrack)   DOM.aiPairingTalkTrack.textContent   = r.talkTrack   || '';
            if (DOM.aiPairingsList && r.pairings) {
                DOM.aiPairingsList.innerHTML = r.pairings.map(p => `
                    <div class="pairing-item">
                        <div class="pairing-name">🍽️ ${Utils.escapeHtml(p.name)}</div>
                        <div class="pairing-reason">${Utils.escapeHtml(p.reason)}</div>
                    </div>
                `).join('');
            }
        },

        hide() { if (DOM.aiPairingModal) DOM.aiPairingModal.classList.remove('active'); }
    };

    /* ============================================================
       RECOMMENDATIONS STRIP  (NEW)
    ============================================================ */
    const RecManager = {
        async refresh() {
            if (!DOM.recStrip || !DOM.recItems) return;
            if (!STATE.currentOrder.length) {
                DOM.recStrip.style.display = 'none';
                return;
            }

            DOM.recStrip.style.display = 'block';
            DOM.recItems.innerHTML = '<span style="opacity:.5;font-size:12px;">Loading suggestions...</span>';

            const recs = await API.getRecommendations();
            if (!recs.length) {
                DOM.recStrip.style.display = 'none';
                return;
            }

            DOM.recItems.innerHTML = recs.map(r => `
                <div class="rec-chip" data-name="${Utils.escapeHtml(r.name)}" data-price="${r.price}">
                    <div class="rec-chip-name">${Utils.escapeHtml(r.name)}</div>
                    <div class="rec-chip-meta">${Utils.formatCurrency(r.price)} · ${Utils.escapeHtml(r.source_title || 'Suggested')}</div>
                    <button class="rec-add-btn">+</button>
                </div>
            `).join('');

            DOM.recItems.querySelectorAll('.rec-add-btn').forEach((btn, idx) => {
                btn.addEventListener('click', () => {
                    OrderManager.addItem({ name: recs[idx].name, price: recs[idx].price }, 1);
                });
            });
        }
    };

    /* ============================================================
       SOCKET.IO
    ============================================================ */
    const SocketManager = {
        connect() {
            if (STATE.socket) STATE.socket.disconnect();
            STATE.socket = io(CONFIG.SOCKET_URL, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000
            });
            this.setupEventListeners();
        },

        setupEventListeners() {
            const s = STATE.socket;

            s.on('connect', () => {
                UI.updateConnectionStatus('connected');
                if (STATE.waiterName) {
                    s.emit('joinAsWaiter', { name: STATE.waiterName, restaurantId: CONFIG.RESTAURANT_ID });
                }
                if (STATE.selectedTable) this.joinTable(STATE.selectedTable);
            });

            s.on('disconnect', () => UI.updateConnectionStatus('disconnected'));
            s.on('reconnecting', () => UI.updateConnectionStatus('connecting'));

            s.on('syncHistory', data => {
                if (data.restaurantId === CONFIG.RESTAURANT_ID && data.tableId === STATE.selectedTable) {
                    this.handleTableUpdate(data.tableId);
                }
            });

            s.on('orderPlaced', data => {
                if (data.restaurantId === CONFIG.RESTAURANT_ID) {
                    UI.showToast('Order Placed', 'New order sent to kitchen', 'success');
                }
            });

            s.on('orderUpdated', data => {
                if (data.restaurantId === CONFIG.RESTAURANT_ID) TableManager.refreshAllTables();
            });

            /* ── Table bell ring ── */
            s.on('incomingWaiterCall', data => {
                if (data.restaurantId !== CONFIG.RESTAURANT_ID) return;

                STATE.activeBellTables.add(data.tableId);
                TableManager.renderTable(data.tableId);

                const msg = randomCallMsg(data.displayTable);
                NotifManager.add(data.tableId, data.displayTable, msg, false);
                UI.showToast(`🔔 ${data.displayTable}`, msg, 'warning');
            });

            /* ── Manager call ── */
            s.on('managerCallWaiter', data => {
                if (data.restaurantId !== CONFIG.RESTAURANT_ID) return;
                const msg = randomManagerMsg(STATE.waiterName);
                NotifManager.add('manager', 'Manager', msg, true);
                UI.showToast('📋 Manager Alert', msg, 'error');
            });

            s.on('waiterOnTheWay', data => {
                if (data.restaurantId !== CONFIG.RESTAURANT_ID) return;
                UI.showToast('Responded!', `${data.waiterName} is going to ${data.tableId}`, 'success');
            });

            s.on('waiterRegistered', data => {
                UI.showToast('Online ✓', data.message || 'You are now online', 'success');
            });
        },

        joinTable(tableId) {
            if (!STATE.socket?.connected) return;
            STATE.socket.emit('joinTable', { tableId, restaurantId: CONFIG.RESTAURANT_ID });
        },

        async handleTableUpdate(tableId) {
            await API.getTableStatus(tableId);
            TableManager.renderTable(tableId);
        }
    };

    /* ============================================================
       TABLE MANAGER
    ============================================================ */
    const TableManager = {
        async init() {
            const tables = Array.from({ length: 30 }, (_, i) => (i + 1).toString());
            await Promise.all(tables.map(id => API.getTableStatus(id)));
            this.renderTables(tables);
        },

        renderTables(tables) {
            if (!DOM.tableList) return;
            DOM.tableList.innerHTML = tables.map(id => this.createTableHTML(id)).join('');
            tables.forEach(id => {
                const el = document.querySelector(`[data-table-id="${id}"]`);
                if (el) el.addEventListener('click', () => this.selectTable(id));
            });
        },

        createTableHTML(tableId) {
            const s = STATE.tableStatuses[tableId] || { status: 'empty', orderCount: 0, total: 0 };
            const active   = STATE.selectedTable === tableId;
            const ringing  = STATE.activeBellTables.has(tableId);

            return `
                <div class="table-item ${active ? 'active' : ''} ${s.orderCount > 0 ? 'has-orders' : ''} ${ringing ? 'bell-ringing' : ''}"
                     data-table-id="${tableId}">
                    <div class="table-item-header">
                        <div class="table-number">Table ${tableId}</div>
                        <div style="display:flex;gap:6px;align-items:center">
                            ${ringing ? '<span class="bell-badge">🔔</span>' : ''}
                            <div class="table-badge ${s.status}">${s.status === 'empty' ? 'Empty' : 'Active'}</div>
                        </div>
                    </div>
                    <div class="table-info">
                        <span>📋 ${s.orderCount} items</span>
                        <span class="table-total">${Utils.formatCurrency(s.total)}</span>
                    </div>
                </div>
            `;
        },

        renderTable(tableId) {
            const el = document.querySelector(`[data-table-id="${tableId}"]`);
            if (!el) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = this.createTableHTML(tableId);
            el.replaceWith(tmp.firstElementChild);
            const newEl = document.querySelector(`[data-table-id="${tableId}"]`);
            if (newEl) newEl.addEventListener('click', () => this.selectTable(tableId));
        },

        selectTable(tableId) {
            STATE.selectedTable = tableId;
            if (DOM.orderTableNumber) DOM.orderTableNumber.textContent = `Table ${tableId}`;

            document.querySelectorAll('.table-item').forEach(el => el.classList.remove('active'));
            const el = document.querySelector(`[data-table-id="${tableId}"]`);
            if (el) el.classList.add('active');

            if (STATE.activeBellTables.has(tableId)) {
                STATE.activeBellTables.delete(tableId);
                this.renderTable(tableId);
            }

            SocketManager.joinTable(tableId);
            OrderManager.clearOrder(true);
            UI.showToast('Table Selected', `Now managing Table ${tableId}`, 'info');
        },

        async refreshAllTables() {
            const tables = Array.from({ length: 30 }, (_, i) => (i + 1).toString());
            await Promise.all(tables.map(id => API.getTableStatus(id)));
            tables.forEach(id => this.renderTable(id));
        },

        searchTables: Utils.debounce(function (q) {
            const n = Utils.normalizeText(q);
            document.querySelectorAll('.table-item').forEach(el => {
                el.style.display = el.dataset.tableId.includes(n) ? '' : 'none';
            });
        }, CONFIG.DEBOUNCE_DELAY)
    };

    /* ============================================================
       MENU MANAGER
    ============================================================ */
    const MenuManager = {
        async init() {
            UI.showLoading('Loading Menu...', 'Please wait');
            await API.loadMenu();
            this.renderCategoryFilters();
            this.renderMenu();
            UI.hideLoading();
        },

        renderCategoryFilters() {
            if (!DOM.categoryFilters) return;
            const cats = ['all', ...new Set(STATE.allMenuItems.map(i => i.category))];
            DOM.categoryFilters.innerHTML = cats.map(c => `
                <div class="filter-chip ${STATE.selectedCategory === c ? 'active' : ''}" data-category="${Utils.escapeHtml(c)}">
                    ${Utils.escapeHtml(c === 'all' ? 'All' : c)}
                </div>
            `).join('');
            DOM.categoryFilters.querySelectorAll('.filter-chip').forEach(chip => {
                chip.addEventListener('click', () => this.filterByCategory(chip.dataset.category));
            });
        },

        filterByCategory(cat) {
            STATE.selectedCategory = cat;
            DOM.categoryFilters?.querySelectorAll('.filter-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.category === cat);
            });
            this.renderMenu();
        },

        renderMenu(q = '') {
            if (!DOM.menuGrid) return;
            const norm = Utils.normalizeText(q);
            let items = STATE.allMenuItems;
            if (STATE.selectedCategory !== 'all') items = items.filter(i => i.category === STATE.selectedCategory);
            if (norm) items = items.filter(i =>
                Utils.normalizeText(i.name).includes(norm) || Utils.normalizeText(i.description).includes(norm)
            );

            if (!items.length) {
                DOM.menuGrid.innerHTML = '<div class="order-empty-state"><div class="empty-title">No items found</div></div>';
                return;
            }

            const grouped = items.reduce((a, i) => {
                (a[i.category] = a[i.category] || []).push(i); return a;
            }, {});

            DOM.menuGrid.innerHTML = Object.keys(grouped).map(cat => `
                <div class="category-section">
                    <div class="category-header">${Utils.escapeHtml(cat)} <span class="category-count">${grouped[cat].length}</span></div>
                    <div class="menu-items-grid">${grouped[cat].map(i => this.createMenuItemHTML(i)).join('')}</div>
                </div>
            `).join('');

            items.forEach(item => {
                const el = DOM.menuGrid.querySelector(`[data-item-id="${CSS.escape(item.name)}"]`);
                if (!el) return;

                el.querySelector('.add-to-order-btn')?.addEventListener('click', e => {
                    e.stopPropagation();
                    const qty = parseInt(el.querySelector('.quantity-display')?.textContent) || 1;
                    OrderManager.addItem(item, qty);
                });

                el.querySelector('.quantity-btn[data-action="minus"]')?.addEventListener('click', e => {
                    e.stopPropagation(); this.changeQty(el, -1);
                });

                el.querySelector('.quantity-btn[data-action="plus"]')?.addEventListener('click', e => {
                    e.stopPropagation(); this.changeQty(el, 1);
                });

                el.querySelector('.ai-pair-btn')?.addEventListener('click', async e => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    btn.textContent = '⏳'; btn.disabled = true;
                    await AIPairingManager.show(item);
                    btn.textContent = '🍷 AI'; btn.disabled = false;
                });
            });
        },

        createMenuItemHTML(item) {
            return `
                <div class="menu-item-card" data-item-id="${Utils.escapeHtml(item.name)}">
                    <div class="menu-item-header">
                        <div class="menu-item-name">${Utils.escapeHtml(item.name)}</div>
                        <div class="menu-item-price">${Utils.formatCurrency(item.price)}</div>
                    </div>
                    ${item.description ? `<div class="menu-item-description">${Utils.escapeHtml(item.description)}</div>` : ''}
                    <div class="menu-item-footer">
                        <div class="quantity-controls">
                            <button class="quantity-btn" data-action="minus">−</button>
                            <div class="quantity-display">1</div>
                            <button class="quantity-btn" data-action="plus">+</button>
                        </div>
                        <button class="ai-pair-btn" title="AI Pairing">🍷 AI</button>
                        <button class="add-to-order-btn">Add</button>
                    </div>
                </div>
            `;
        },

        changeQty(el, delta) {
            const d = el.querySelector('.quantity-display');
            if (d) d.textContent = Math.max(1, Math.min(99, (parseInt(d.textContent) || 1) + delta));
        },

        searchMenu: Utils.debounce(function (q) { MenuManager.renderMenu(q); }, CONFIG.DEBOUNCE_DELAY)
    };

    /* ============================================================
       ORDER MANAGER
    ============================================================ */
    const OrderManager = {
        addItem(item, quantity = 1) {
            if (!STATE.selectedTable) {
                UI.showToast('No Table Selected', 'Please select a table first', 'error');
                return;
            }

            const idx = STATE.currentOrder.findIndex(i => i.name === item.name);
            if (idx >= 0) {
                // ✅ FIX: increment existing quantity properly
                STATE.currentOrder[idx].quantity = (STATE.currentOrder[idx].quantity || 1) + quantity;
            } else {
                STATE.currentOrder.push({
                    id:       Utils.generateId(),
                    name:     item.name,
                    price:    item.price,
                    quantity: quantity   // ✅ explicitly set — never undefined
                });
            }

            this.renderOrder();
            UI.showToast('Item Added', `${item.name} × ${quantity} added`, 'success');

            // Refresh recommendations after adding
            RecManager.refresh();
        },

        removeItem(id) {
            STATE.currentOrder = STATE.currentOrder.filter(i => i.id !== id);
            this.renderOrder();
            RecManager.refresh();
        },

        clearOrder(silent = false) {
            if (!STATE.currentOrder.length) return;
            if (!silent && !confirm('Clear all items from this order?')) return;
            STATE.currentOrder = [];
            this.renderOrder();
            if (DOM.recStrip) DOM.recStrip.style.display = 'none';
        },

        renderOrder() {
            if (!DOM.orderItemsList) return;

            if (!STATE.currentOrder.length) {
                DOM.orderItemsList.innerHTML = `
                    <div class="order-empty-state">
                        <div class="empty-icon">🍽️</div>
                        <div class="empty-title">No items yet</div>
                        <div class="empty-subtitle">Select items from the menu</div>
                    </div>
                `;
                if (DOM.orderSummary) DOM.orderSummary.style.display = 'none';
                if (DOM.sendOrderBtn) DOM.sendOrderBtn.disabled = true;
                return;
            }

            DOM.orderItemsList.innerHTML = STATE.currentOrder.map(item => {
                // ✅ FIX: Guard against undefined quantity
                const qty   = item.quantity  || 1;
                const price = item.price     || 0;
                return `
                    <div class="order-item" data-item-id="${item.id}">
                        <div class="order-item-header">
                            <div class="order-item-name">${Utils.escapeHtml(item.name)}</div>
                            <button class="remove-item-btn" data-item-id="${item.id}">×</button>
                        </div>
                        <div class="order-item-details">
                            <div class="order-qty-controls">
                                <button class="qty-minus" data-id="${item.id}">−</button>
                                <span class="order-item-quantity">${qty}</span>
                                <button class="qty-plus" data-id="${item.id}">+</button>
                            </div>
                            <div class="order-item-price">${Utils.formatCurrency(price * qty)}</div>
                        </div>
                    </div>
                `;
            }).join('');

            // Remove + inline qty controls
            DOM.orderItemsList.querySelectorAll('.remove-item-btn').forEach(btn => {
                btn.addEventListener('click', () => this.removeItem(btn.dataset.itemId));
            });
            DOM.orderItemsList.querySelectorAll('.qty-minus').forEach(btn => {
                btn.addEventListener('click', () => this._changeOrderQty(btn.dataset.id, -1));
            });
            DOM.orderItemsList.querySelectorAll('.qty-plus').forEach(btn => {
                btn.addEventListener('click', () => this._changeOrderQty(btn.dataset.id, 1));
            });

            // Summary
            const totalQty   = STATE.currentOrder.reduce((s, i) => s + (i.quantity || 1), 0);
            const totalPrice = STATE.currentOrder.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
            if (DOM.summaryItemCount) DOM.summaryItemCount.textContent = totalQty;
            if (DOM.summaryTotal)     DOM.summaryTotal.textContent     = Utils.formatCurrency(totalPrice);
            if (DOM.orderSummary)     DOM.orderSummary.style.display   = 'block';
            if (DOM.sendOrderBtn)     DOM.sendOrderBtn.disabled         = false;
        },

        _changeOrderQty(id, delta) {
            const item = STATE.currentOrder.find(i => i.id === id);
            if (!item) return;
            const newQty = (item.quantity || 1) + delta;
            if (newQty < 1) { this.removeItem(id); return; }
            item.quantity = newQty;
            this.renderOrder();
            RecManager.refresh();
        },

        async sendOrder() {
            if (!STATE.selectedTable) { UI.showToast('Error', 'No table selected', 'error'); return; }
            if (!STATE.currentOrder.length) { UI.showToast('Error', 'Order is empty', 'error'); return; }

            UI.showLoading('Sending Order...', 'Communicating with kitchen');
            await API.sendOrder(STATE.selectedTable, STATE.currentOrder, STATE.waiterName);
            UI.hideLoading();
            UI.showToast('Order Sent!', 'Order sent to kitchen', 'success');

            STATE.currentOrder = [];
            this.renderOrder();
            if (DOM.recStrip) DOM.recStrip.style.display = 'none';
            await API.getTableStatus(STATE.selectedTable);
            TableManager.renderTable(STATE.selectedTable);
        }
    };

    /* ============================================================
       ARCHIVE MANAGER
    ============================================================ */
    const ArchiveManager = {
        showArchiveModal() {
            if (!STATE.selectedTable) { UI.showToast('Error', 'No table selected', 'error'); return; }
            if (DOM.archiveModal) DOM.archiveModal.classList.add('active');
            else this.archiveTable();
        },

        hideArchiveModal() { DOM.archiveModal?.classList.remove('active'); },

        async archiveTable() {
            if (!STATE.selectedTable) { UI.showToast('Error', 'No table selected', 'error'); return; }
            if (!confirm(`Archive Table ${STATE.selectedTable}? This moves all orders to history.`)) {
                this.hideArchiveModal(); return;
            }
            this.hideArchiveModal();
            UI.showLoading('Archiving Table...', 'Moving orders to history');
            await API.archiveTable(STATE.selectedTable);
            UI.hideLoading();
            UI.showToast('Table Archived', `Table ${STATE.selectedTable} completed`, 'success');
            await API.getTableStatus(STATE.selectedTable);
            TableManager.renderTable(STATE.selectedTable);
            STATE.currentOrder = [];
            OrderManager.renderOrder();
        }
    };

    /* ============================================================
       WAITER NAME MANAGER
    ============================================================ */
    const WaiterManager = {
        showNameModal() {
            if (!DOM.waiterNameModal) return;
            DOM.waiterNameModal.classList.add('active');
            if (DOM.waiterNameInput) { DOM.waiterNameInput.value = STATE.waiterName; DOM.waiterNameInput.focus(); }
        },

        hideNameModal() { DOM.waiterNameModal?.classList.remove('active'); },

        setName() {
            const name = DOM.waiterNameInput?.value.trim();
            if (!name) { UI.showToast('Error', 'Please enter your name', 'error'); return; }
            STATE.waiterName = name;
            localStorage.setItem('waiterName', name);
            if (DOM.waiterNameDisplay) DOM.waiterNameDisplay.innerHTML = `<strong>${Utils.escapeHtml(name)}</strong>`;
            this.hideNameModal();
            if (STATE.socket?.connected) {
                STATE.socket.emit('joinAsWaiter', { name, restaurantId: CONFIG.RESTAURANT_ID });
            }
            UI.showToast('Welcome!', `Logged in as ${name}`, 'success');
        }
    };

    /* ============================================================
       EVENT LISTENERS
    ============================================================ */
    function setupEventListeners() {
        DOM.confirmWaiterName?.addEventListener('click', () => WaiterManager.setName());
        DOM.waiterNameInput?.addEventListener('keypress', e => { if (e.key === 'Enter') WaiterManager.setName(); });
        DOM.tableSearch?.addEventListener('input', e => TableManager.searchTables(e.target.value));
        DOM.menuSearch?.addEventListener('input', e => MenuManager.searchMenu(e.target.value));
        DOM.clearOrderBtn?.addEventListener('click', () => OrderManager.clearOrder());
        DOM.sendOrderBtn?.addEventListener('click', () => OrderManager.sendOrder());
        DOM.archiveTableBtn?.addEventListener('click', () => ArchiveManager.showArchiveModal());
        DOM.cancelArchive?.addEventListener('click', () => ArchiveManager.hideArchiveModal());
        DOM.confirmArchive?.addEventListener('click', () => ArchiveManager.archiveTable());
        DOM.archiveModal?.addEventListener('click', e => { if (e.target === DOM.archiveModal) ArchiveManager.hideArchiveModal(); });
        DOM.aiPairingClose?.addEventListener('click', () => AIPairingManager.hide());
        DOM.aiPairingModal?.addEventListener('click', e => { if (e.target === DOM.aiPairingModal) AIPairingManager.hide(); });

        // Notification bell toggle
        DOM.notifBell?.addEventListener('click', () => NotifManager.togglePanel());

        // Close notif panel on outside click
        document.addEventListener('click', e => {
            if (DOM.notifPanel?.classList.contains('open') &&
                !DOM.notifPanel.contains(e.target) &&
                !DOM.notifBell?.contains(e.target)) {
                DOM.notifPanel.classList.remove('open');
            }
        });
    }

    /* ============================================================
       INIT
    ============================================================ */
    async function init() {
        console.log('🚀 Waiter Interface Starting...');
        setupEventListeners();
        NotifManager.init();

        if (!STATE.waiterName) {
            WaiterManager.showNameModal();
        } else if (DOM.waiterNameDisplay) {
            DOM.waiterNameDisplay.innerHTML = `<strong>${Utils.escapeHtml(STATE.waiterName)}</strong>`;
        }

        SocketManager.connect();
        await MenuManager.init();
        await TableManager.init();

        console.log('✅ Waiter Interface Ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
