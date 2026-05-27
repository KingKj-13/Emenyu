'use strict';

const APP_BASE = '/Trump';
const API = (path) => `${APP_BASE}${path}`;
const TOTAL_TABLES = 30;

function fmtCurrency(n) {
  return 'R ' + parseFloat(n || 0).toFixed(2);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

// --- Auth ---
async function loadCurrentUser() {
  try {
    const res = await fetch(API('/api/auth/me'));
    const data = res.ok ? await res.json() : {};
    if (!data.user) {
      window.location.href = `${APP_BASE}/Login?next=${encodeURIComponent(window.location.pathname)}`;
      return null;
    }
    const pill = document.getElementById('ownerUserPill');
    if (pill) pill.textContent = data.user.label || data.user.username || 'Owner';
    return data.user;
  } catch {
    window.location.href = `${APP_BASE}/Login?next=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }
}

// --- Analytics ---
async function loadKPIs() {
  const today = new Date().toISOString().split('T')[0];
  const qs = `?from=${today}&to=${today}`;
  try {
    const [summary, items, hours] = await Promise.all([
      fetch(API('/api/analytics/summary' + qs)).then(r => r.ok ? r.json() : {}),
      fetch(API('/api/analytics/items' + qs)).then(r => r.ok ? r.json() : []),
      fetch(API('/api/analytics/hours' + qs)).then(r => r.ok ? r.json() : [])
    ]);

    document.getElementById('kpiRevenue').textContent = fmtCurrency(summary.revenue ?? summary.totalRevenue);
    document.getElementById('kpiOrders').textContent = summary.orderCount ?? '0';
    document.getElementById('kpiAvg').textContent = fmtCurrency(summary.avgOrderValue);
    document.getElementById('kpiTopTable').textContent = summary.topTable ? 'Table ' + summary.topTable : '—';
    const topRev = document.getElementById('kpiTopTableRev');
    if (topRev) topRev.textContent = summary.topTableRevenue ? fmtCurrency(summary.topTableRevenue) : '';

    renderTopItems(items);
    renderHourlyChart(hours);
  } catch (err) {
    console.error('KPI load failed:', err);
  }
}

function renderTopItems(items) {
  const el = document.getElementById('ownerTopItems');
  if (!el) return;
  const rows = Array.isArray(items) ? items.slice(0, 10) : [];
  if (!rows.length) {
    el.innerHTML = '<div class="owner-placeholder">No orders yet today</div>';
    return;
  }
  el.innerHTML = rows.map((it, i) => `
    <div class="owner-item-row">
      <span class="owner-item-rank">${i + 1}</span>
      <span class="owner-item-name">${escapeHtml(it.name || it.itemName || '')}</span>
      <span class="owner-item-qty">${it.quantity ?? it.qty ?? '—'}×</span>
      <span class="owner-item-rev">${it.revenue != null ? fmtCurrency(it.revenue) : '—'}</span>
    </div>
  `).join('');
}

function renderHourlyChart(hours) {
  const chartEl = document.getElementById('ownerHourlyChart');
  const labelsEl = document.getElementById('ownerHourlyLabels');
  if (!chartEl) return;

  if (!Array.isArray(hours) || !hours.length) {
    chartEl.innerHTML = '<div class="owner-placeholder">No hourly data yet</div>';
    return;
  }

  const maxVal = Math.max(...hours.map(h => h.count ?? h.orders ?? 0), 1);
  chartEl.innerHTML = hours.map(h => {
    const count = h.count ?? h.orders ?? 0;
    const pct = Math.round((count / maxVal) * 100);
    return `
      <div class="hourly-bar" title="Hour ${h.hour ?? ''}: ${count} orders">
        <div class="hourly-bar-inner" style="height:${pct}%;min-height:${count > 0 ? 2 : 0}px;"></div>
      </div>
    `;
  }).join('');

  if (labelsEl) {
    labelsEl.innerHTML = hours.map(h => `<span>${String(h.hour ?? '').padStart(2, '0')}</span>`).join('');
  }
}

// --- Table Status ---
const tableStatuses = {};

async function loadTableStatuses() {
  const ids = Array.from({ length: TOTAL_TABLES }, (_, i) => String(i + 1));
  await Promise.all(ids.map(async (id) => {
    try {
      const data = await fetch(API(`/api/waiter/table/${id}/status`)).then(r => r.ok ? r.json() : {});
      tableStatuses[id] = data;
    } catch { tableStatuses[id] = { status: 'empty' }; }
  }));
  renderTableGrid();
}

function renderTableGrid() {
  const grid = document.getElementById('ownerTableGrid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: TOTAL_TABLES }, (_, i) => {
    const id = String(i + 1);
    const st = tableStatuses[id] || { status: 'empty' };
    const cls = st.status === 'ringing' ? 'ringing' : st.orderCount > 0 ? 'active' : 'empty';
    return `<div class="owner-table-cell ${cls}" title="Table ${id} — ${st.status || 'empty'}">${id}</div>`;
  }).join('');
}

// --- Staff ---
async function loadStaff() {
  const el = document.getElementById('ownerStaffGrid');
  if (!el) return;
  try {
    const data = await fetch(API('/api/auth/accounts')).then(r => r.ok ? r.json() : []);
    const accounts = Array.isArray(data) ? data : (data.accounts || []);
    if (!accounts.length) {
      el.innerHTML = '<div class="owner-placeholder">No staff accounts found</div>';
      return;
    }
    el.innerHTML = accounts.map(acc => {
      const initials = (acc.label || acc.username || '?').slice(0, 2).toUpperCase();
      const roleCls = `role-${acc.role || 'waiter'}`;
      const statusCls = acc.suspended ? 'status-suspended' : 'status-active';
      const statusLabel = acc.suspended ? 'Suspended' : 'Active';
      return `
        <div class="owner-staff-card">
          <div class="owner-staff-avatar">${escapeHtml(initials)}</div>
          <div class="owner-staff-info">
            <div class="owner-staff-name">${escapeHtml(acc.label || acc.username || '—')}</div>
            <div class="owner-staff-role ${roleCls}">${escapeHtml(acc.role || 'waiter')}</div>
          </div>
          <span class="owner-staff-status ${statusCls}">${statusLabel}</span>
        </div>
      `;
    }).join('');
  } catch {
    el.innerHTML = '<div class="owner-placeholder">Failed to load staff</div>';
  }
}

// --- Socket live updates ---
function setupSocket() {
  const socket = io(window.location.origin, {
    path: `${APP_BASE}/socket.io`,
    transports: ['websocket', 'polling'],
    reconnection: true
  });

  socket.on('syncCart', () => {
    // Refresh table statuses when any cart changes
    setTimeout(loadTableStatuses, 500);
  });

  socket.on('incomingWaiterCall', (data) => {
    if (data.tableId) {
      tableStatuses[data.tableId] = { ...tableStatuses[data.tableId], status: 'ringing' };
      renderTableGrid();
    }
  });
}

// --- Logout ---
function setupLogout() {
  const btn = document.getElementById('ownerLogoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await fetch(API('/api/auth/logout'), { method: 'POST' });
    window.location.href = `${APP_BASE}/Login`;
  });
}

// --- Init ---
async function init() {
  const user = await loadCurrentUser();
  if (!user) return;
  setupLogout();
  setupSocket();
  await Promise.all([
    loadKPIs(),
    loadTableStatuses(),
    loadStaff()
  ]);
}

document.addEventListener('DOMContentLoaded', init);
