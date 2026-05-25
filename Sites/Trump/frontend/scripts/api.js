const COMPONENT_CACHE = new Map();
const APP_BASE = '/Trump';

export const CONFIG = {
  BASE_PATH: APP_BASE,
  API_PREFIX: APP_BASE,
  RESTAURANT_ID: 'trump'
};

export function resolveAssetPath(path) {
  const raw = String(path || '').trim();
  if (!raw) {
    return raw;
  }

  if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }

  if (raw.startsWith(`${CONFIG.BASE_PATH}/`)) {
    return raw;
  }

  if (raw.startsWith('/')) {
    return `${CONFIG.BASE_PATH}${raw}`;
  }

  return `${CONFIG.BASE_PATH}/${raw}`;
}

export function normalizeName(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isTableSegment(segment) {
  const lower = String(segment || '').toLowerCase();
  return Boolean(lower) && !lower.includes('.') && lower !== 'trump' && lower !== 'frontend' && lower !== 'pages';
}

function readStoredTable() {
  try {
    return localStorage.getItem('trump_active_table') || 'table1';
  } catch {
    return 'table1';
  }
}

function persistTable(rawTable) {
  try {
    localStorage.setItem('trump_active_table', rawTable);
  } catch {
    // Ignore storage failures and keep the page functional.
  }
}

export function formatTableLabel(rawValue) {
  const raw = String(rawValue || 'unknown');
  if (raw.toLowerCase().startsWith('table')) {
    return raw.replace(/^table/i, 'Table ');
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function getTableContext(pathname = window.location.pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const rawSegment = parts[parts.length - 1] || '';
  const rawTable = isTableSegment(rawSegment) ? rawSegment : readStoredTable();

  if (isTableSegment(rawSegment)) {
    persistTable(rawSegment);
  }

  const normalized = normalizeName(rawTable) || 'table1';

  return {
    normalized,
    display: rawTable || 'table1',
    formatted: formatTableLabel(rawTable || 'table1'),
    routePath: `${CONFIG.BASE_PATH}/${rawTable || 'table1'}`
  };
}

export function createDeviceIdentity() {
  try {
    const stored = localStorage.getItem('trump_device_identity');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Fall through to generate a new identity.
  }

  const identity = {
    deviceId: `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    timestamp: new Date().toISOString()
  };

  try {
    localStorage.setItem('trump_device_identity', JSON.stringify(identity));
  } catch {
    // Ignore storage failures.
  }

  return identity;
}

export function connectSocket() {
  if (typeof window.io !== 'function') {
    throw new Error('Socket.io client is not available on the page.');
  }

  return window.io({ path: `${CONFIG.BASE_PATH}/socket.io` });
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }

  return JSON.parse(raw);
}

export async function postJson(url, payload) {
  return fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function loadComponentHtml(name) {
  if (!COMPONENT_CACHE.has(name)) {
    const response = await fetch(resolveAssetPath(`/frontend/components/${name}.html`));
    if (!response.ok) {
      throw new Error(`Failed to load component ${name}`);
    }

    COMPONENT_CACHE.set(name, await response.text());
  }

  return COMPONENT_CACHE.get(name);
}

export const api = {
  getMenu() {
    return fetchJson(`${CONFIG.API_PREFIX}/api/menu`);
  },

  getDeals() {
    return fetchJson(`${CONFIG.API_PREFIX}/api/deals`);
  },

  getRecommendations(payload) {
    return postJson(`${CONFIG.API_PREFIX}/api/recommend`, payload);
  },

  chat(payload) {
    return postJson(`${CONFIG.API_PREFIX}/api/chat`, payload);
  },

  aiPairing(payload) {
    return postJson(`${CONFIG.API_PREFIX}/api/ai-pairing`, payload);
  },

  submitOrder(payload) {
    return postJson(`${CONFIG.API_PREFIX}/submit_order`, payload);
  },

  getCollection(fileName) {
    return fetchJson(resolveAssetPath(`/food/${fileName}`));
  }
};
