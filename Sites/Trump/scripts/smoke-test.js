#!/usr/bin/env node
'use strict';
// Production smoke test (Phase 6, Step 4). Verifies the live recommendation/menu/analytics
// surfaces immediately after a deployment. No dependencies (Node 18+ global fetch).
//
//   SMOKE_BASE_URL=https://your-host \
//   SMOKE_LOGIN_USER=owner SMOKE_LOGIN_PASS=... \   # (or SMOKE_COOKIE="trump_session=...")
//   node scripts/smoke-test.js
//
// Read-only by default. Set SMOKE_WRITE=1 to also exercise order/reservation/rating writes
// (these create real rows — use a test table and clean up). Exit 0 = all run checks passed.

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3012').replace(/\/$/, '');
const TABLE = process.env.SMOKE_TABLE || 'table1';
const WRITE = process.env.SMOKE_WRITE === '1';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 8000);
let COOKIE = process.env.SMOKE_COOKIE || '';

const results = [];
function record(group, name, pass, detail = '') { results.push({ group, name, pass, detail }); }

async function http(method, path, { body, auth = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && COOKIE) headers.Cookie = COOKIE;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, ok: res.ok, json, res };
  } catch (e) {
    return { status: 0, ok: false, json: null, error: e.message };
  } finally { clearTimeout(t); }
}

async function login() {
  if (COOKIE) return true;
  const user = process.env.SMOKE_LOGIN_USER, pass = process.env.SMOKE_LOGIN_PASS;
  if (!user || !pass) return false;
  const r = await http('POST', '/Trump/api/auth/login', { body: { username: user, password: pass } });
  if (!r.ok) return false;
  const setCookie = r.res.headers.getSetCookie ? r.res.headers.getSetCookie() : [r.res.headers.get('set-cookie')].filter(Boolean);
  const sc = (setCookie || []).find(c => /trump_session=/.test(c));
  if (sc) { COOKIE = sc.split(';')[0]; return true; }
  return false;
}

// check(group, name, request, predicate) — predicate(result) → true/false
async function check(group, name, req, predicate) {
  const r = await req();
  let pass = r.ok;
  let detail = `HTTP ${r.status}${r.error ? ' ' + r.error : ''}`;
  if (pass && predicate) { try { pass = !!predicate(r); if (!pass) detail += ' (shape check failed)'; } catch (e) { pass = false; detail += ' ' + e.message; } }
  record(group, name, pass, detail);
}

async function main() {
  console.log(`Smoke test → ${BASE}  (table=${TABLE}, writes=${WRITE ? 'ON' : 'off'})\n`);
  const hasAuth = await login();

  // ── CUSTOMER (public) ──
  await check('Customer', 'QR menu / browsing (GET /api/menu)', () => http('GET', '/Trump/api/menu'), r => r.json && typeof r.json === 'object');
  await check('Customer', 'Recommendations (POST /api/recommend)', () => http('POST', '/Trump/api/recommend', { body: { items: [{ name: 'Ribeye', price: 369 }] } }), r => Array.isArray(r.json));
  await check('Customer', 'Item pairings (POST /api/ai-pairing)', () => http('POST', '/Trump/api/ai-pairing', { body: { name: 'Ribeye', price: 369 } }), r => r.json && ('foodPairings' in r.json || 'drinkPairings' in r.json || 'pairings' in r.json));
  await check('Customer', 'Chatbot (POST /api/chat)', () => http('POST', '/Trump/api/chat', { body: { message: 'whats good here', tableId: TABLE } }), r => r.json && typeof r.json.reply === 'string');
  await check('Customer', 'Bundle recommendations (GET /api/menu/bundles)', () => http('GET', '/Trump/api/menu/bundles'), r => Array.isArray(r.json));
  await check('Customer', 'Analytics ingestion (POST /api/reco/events)', () => http('POST', '/Trump/api/reco/events', { body: { eventType: 'impression', recommendedName: 'Smoke probe', source: 'smoke' } }), r => r.status === 202 || (r.json && r.json.ok));
  await check('Customer', 'Deals (GET /api/deals)', () => http('GET', '/Trump/api/deals'), r => Array.isArray(r.json));
  if (WRITE) {
    await check('Customer', 'Reservation create (POST /api/reservations)', () => http('POST', '/Trump/api/reservations', { body: { name: 'Smoke Test', phone: '0000000000', partySize: 2, date: new Date(Date.now() + 86400000).toISOString(), notes: 'smoke-test' } }), r => r.json && (r.json.ok || r.json.id));
    await check('Customer', 'Order placement (POST /submit_order)', () => http('POST', '/Trump/submit_order', { body: { items: [{ name: 'Ribeye', price: 369, qty: 1 }], table_number: TABLE } }), r => r.json && r.json.ok);
  }

  // ── WAITER (auth) ──
  const waiter = [
    ['Table management (GET /api/floor)', () => http('GET', '/Trump/api/floor', { auth: true }), r => r.json && (Array.isArray(r.json.tables) || typeof r.json === 'object')],
    ['Recommendations (POST /api/waiter/cart-recommendations)', () => http('POST', '/Trump/api/waiter/cart-recommendations', { auth: true, body: { cart: [{ name: 'Ribeye', price: 369, qty: 1 }] } }), r => r.json && Array.isArray(r.json.recommendations)],
    ['AI coach (POST /api/waiter/coach)', () => http('POST', '/Trump/api/waiter/coach', { auth: true, body: { tableId: TABLE, tone: 'professional' } }), r => r.json && typeof r.json === 'object'],
    ['Sommelier (POST /api/sommelier)', () => http('POST', '/Trump/api/sommelier', { auth: true, body: { dish: 'Ribeye' } }), r => r.json && ('wine' in r.json || 'explanation' in r.json)],
    ['Guest information (GET /api/waiter/table/:id/intel)', () => http('GET', `/Trump/api/waiter/table/${TABLE}/intel`, { auth: true }), r => r.json && typeof r.json === 'object']
  ];
  // ── OWNER / ADMIN (auth) ──
  const owner = [
    ['Menu management (GET /api/menu/items)', () => http('GET', '/Trump/api/menu/items', { auth: true }), r => Array.isArray(r.json)],
    ['Chef-rec management (GET /api/menu/chef-recs)', () => http('GET', '/Trump/api/menu/chef-recs', { auth: true }), r => Array.isArray(r.json)],
    ['Bundle management (GET /api/menu/bundles/admin)', () => http('GET', '/Trump/api/menu/bundles/admin', { auth: true }), r => Array.isArray(r.json)],
    ['Analytics dashboard (GET /api/analytics/recommendations)', () => http('GET', '/Trump/api/analytics/recommendations', { auth: true }), r => r.json && r.json.totals],
    ['Optimization insights (GET /api/analytics/recommendations/insights)', () => http('GET', '/Trump/api/analytics/recommendations/insights', { auth: true }), r => r.json && 'insights' in r.json],
    ['Sales analytics (GET /api/analytics/summary)', () => http('GET', '/Trump/api/analytics/summary', { auth: true }), r => r.json && 'revenue' in r.json],
    ['User management (GET /api/auth/accounts)', () => http('GET', '/Trump/api/auth/accounts', { auth: true }), r => Array.isArray(r.json)]
  ];

  if (!hasAuth) {
    for (const [name] of [...waiter, ...owner]) record('Waiter/Owner', name, null, 'SKIPPED — set SMOKE_LOGIN_USER/PASS or SMOKE_COOKIE');
  } else {
    for (const [name, req, pred] of waiter) await check('Waiter', name, req, pred);
    for (const [name, req, pred] of owner) await check('Owner/Admin', name, req, pred);
  }

  // ── Report ──
  let lastGroup = '';
  for (const r of results) {
    if (r.group !== lastGroup) { console.log(`\n${r.group}`); lastGroup = r.group; }
    const mark = r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
    console.log(`  ${mark}  ${r.name}${r.pass === false ? `  — ${r.detail}` : ''}`);
  }
  const run = results.filter(r => r.pass !== null);
  const failed = run.filter(r => !r.pass);
  const skipped = results.filter(r => r.pass === null);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${run.length - failed.length}/${run.length} checks passed${skipped.length ? `, ${skipped.length} skipped (no auth)` : ''}.` + (failed.length ? `  ${failed.length} FAILED.` : '  ALL PASSED.'));
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('Smoke test crashed:', e.message); process.exit(2); });
