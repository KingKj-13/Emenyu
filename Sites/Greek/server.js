/**
 * ============================================================
 * GREEK RESTAURANT – COMPLETE ISOLATED SERVER
 * Port 3002 | Chatbot Port 5001 | Recommend Port 5002
 * Routes: /Greek/*
 * ✅ NETWORK FIX APPLIED: Listens on 0.0.0.0 to fix Connection Refused
 * ✅ ALL 11 ISOLATION FIXES APPLIED
 * 🔒 100% Cart/Order/History Isolation from IMLI
 * ✅ ADMIN OVERRIDE SUPPORT ADDED
 * ✅ WAITER CALL SYSTEM: Bell → Admin + Waiter notifications
 * ✅ AI PAIRING: recommend.py on port 5002
 * ✅ WAITER UI: /Greek/Waiter route added
 * ✅ JOSH 11.0: Auto-spawned (debug=False required in app.py)
 * ✅ CRASH PROTECTION: spawn errors won't take down other sites
 * ============================================================
 */


const express = require('express');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const http = require('http');
const cors = require('cors');
const socketIO = require('socket.io');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
const multer = require('multer');
const axios = require('axios');


dotenv.config();
// Also load root .env so DATABASE_URL is available for Prisma
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { PrismaMenuService } = require('../../shared/prismaMenuService');
const prismaMenu = new PrismaMenuService({ restaurantId: 'greek' });


// ✅ Global safety net — no uncaught error can kill all sites
process.on('uncaughtException', err => {
  console.error('[server.js] Uncaught Exception (server kept alive):', err.message);
});


process.on('unhandledRejection', (reason) => {
  console.error('[server.js] Unhandled Rejection (server kept alive):', reason);
});


/* ============================================================
   1. BASIC CONFIGURATION + RESTAURANT IDENTIFIER
============================================================ */


// 🔒 FIX #1: Restaurant Identity Lock
const RESTAURANT_ID = "greek";


const PORT = process.env.PORT || 3002;


/* ---- ADMIN AUTH ---- */
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.STAGING_PASS || 'Kshitij';


/* ---- BASE DIRECTORIES ---- */
const BASE_DIR = __dirname;
const FOOD_DIR = path.join(BASE_DIR, 'food');
const ORDERS_DIR = path.join(BASE_DIR, 'orders');
const HISTORY_DIR = path.join(BASE_DIR, 'history');
const TABLES_DIR = path.join(BASE_DIR, 'tables');
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');


/* ---- DATA FILES ---- */
const DEAL_OF_DAY_FILE = path.join(FOOD_DIR, 'DealOfDay.json');


/* ---- PYTHON ---- */
const PYTHON_EXE = 'python';
const CHATBOT_SCRIPT = path.join(BASE_DIR, 'josh_enterprise', 'api', 'app.py');
const CHATBOT_URL = 'http://127.0.0.1:5001';


/* ---- AI PAIRING ---- */
const RECOMMEND_URL    = 'http://127.0.0.1:5002';
const RECOMMEND_SCRIPT = path.join(BASE_DIR, 'recommend.py');


/* ============================================================
   2. EXPRESS + SOCKET SETUP
============================================================ */


const app = express();
const server = http.createServer(app);


const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }
});


app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(BASE_DIR));


/* ============================================================
   ✅ WAITER CALL SYSTEM – Connected Waiters Registry
============================================================ */


const connectedWaiters = {}; // { socketId: { name, socketId } }


/* ============================================================
   3. ADMIN AUTH MIDDLEWARE
============================================================ */


function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;


  if (!authHeader) {
    res.set('WWW-Authenticate', 'Basic');
    return res.sendStatus(401);
  }


  const token = authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);


  const decoded = Buffer.from(token, 'base64').toString();
  const parts = decoded.split(':');


  const username = parts[0];
  const password = parts[1];


  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return next();
  }


  return res.sendStatus(403);
}


/* ============================================================
   4. BASIC HELPERS
============================================================ */


function normalizeId(raw) {
  if (!raw) return 'unknown';
  return raw.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}


function normalizeName(raw) {
  if (!raw) return '';
  return raw.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}


function getCategoryType(categoryName) {
    const lower = categoryName.toLowerCase();


    if (lower.includes('starter') || lower.includes('meze') || lower.includes('tapas') || lower.includes('soup')) {
        return 'STARTER';
    }
    if (lower.includes('dessert') || lower.includes('sweet') || lower.includes('cake') || lower.includes('ice cream')) {
        return 'DESSERT';
    }
    if (lower.includes('drink') || lower.includes('beverage') || lower.includes('wine') || lower.includes('beer') || lower.includes('coffee') || lower.includes('tea') || lower.includes('cocktail')) {
        return 'DRINK';
    }
    return 'MAIN';
}


/* ============================================================
   HELPER: GET TABLE ACTIVE ORDERS
============================================================ */
async function getTableActiveOrders(tableId) {
  const cleanId = normalizeId(tableId);
  let allItems = [];


  try {
    const files = await fsPromises.readdir(ORDERS_DIR);
    const targetPrefix = `order_table_${cleanId}_`;
    const matchingFiles = files.filter(f => f.startsWith(targetPrefix));


    for (const f of matchingFiles) {
      try {
        const raw = await fsPromises.readFile(path.join(ORDERS_DIR, f), 'utf-8');
        const order = JSON.parse(raw);
        if (order.items && Array.isArray(order.items)) {
            allItems = allItems.concat(order.items);
        }
      } catch (err) {}
    }
  } catch (err) {}
  return allItems;
}


/* ============================================================
   5. ADMIN PANEL ROUTE
============================================================ */


app.get('/Greek/Admin', adminAuth, (req, res) => {
  res.sendFile(path.join(BASE_DIR, 'admin.html'));
});


/* ============================================================
   5b. WAITER UI ROUTE  ← must be ABOVE /Greek/:tableId
============================================================ */


app.get('/Greek/Waiter', (req, res) => {
  res.sendFile(path.join(BASE_DIR, 'waiter.html'));
});


/* ============================================================
   6. MENU ROUTES
============================================================ */


app.get('/api/menu', async (req, res) => {
  try {
    const menu = await prismaMenu.loadMenu();
    res.json(menu || {});
  } catch (e) {
    res.status(500).json({ error: 'Menu load failed' });
  }
});


app.post('/api/menu', adminAuth, async (req, res) => {
  try {
    await prismaMenu.saveMenu(req.body);
    io.emit('menuUpdated');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Menu save failed' });
  }
});


/* ============================================================
   7. DEAL OF THE DAY
============================================================ */


app.get('/api/deals', async (req, res) => {
  try {
    const raw = await fsPromises.readFile(DEAL_OF_DAY_FILE, 'utf-8');
    res.json(JSON.parse(raw));
  } catch {
    res.json([]);
  }
});


app.post('/api/deals', adminAuth, async (req, res) => {
  try {
    await fsPromises.writeFile(DEAL_OF_DAY_FILE, JSON.stringify(req.body, null, 2));
    io.emit('dealUpdated');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Deal save failed' });
  }
});


/* ============================================================
   8. ADMIN RECOMMENDATIONS
============================================================ */


app.get('/api/recommendations', adminAuth, async (req, res) => {
  try {
    const recs = await prismaMenu.loadRecommendations();
    res.json(recs || []);
  } catch {
    res.json([]);
  }
});


app.post('/api/recommendations', adminAuth, async (req, res) => {
  try {
    await prismaMenu.saveRecommendations(req.body);
    io.emit('recommendationUpdated');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Recommendation save failed' });
  }
});


/* ============================================================
   9. FILE UPLOAD
============================================================ */


const upload = multer({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '_' + file.originalname);
  }
});


app.post('/api/upload', adminAuth, upload.single('mediaFile'), (req, res) => {
  res.json({
    filePath: `/uploads/${req.file.filename}`,
    type: req.file.mimetype
  });
});


/* ============================================================
   10. TABLE CART STORAGE
============================================================ */


const tableMemory = {};


async function loadTableCart(tableId) {
  const cleanId = normalizeId(tableId);
  try {
    const raw = await fsPromises.readFile(path.join(TABLES_DIR, `${cleanId}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}


async function saveTableCart(tableId, cart) {
  const cleanId = normalizeId(tableId);
  try {
    await fsPromises.writeFile(path.join(TABLES_DIR, `${cleanId}.json`), JSON.stringify(cart, null, 2));
  } catch {}
}


/* ============================================================
   11. SOCKET.IO – ALL HANDLERS
============================================================ */


io.on('connection', socket => {


  console.log(`⚡ New Client Connected: ${socket.id}`);


  /* ── ① CUSTOMER joins table ── */
  socket.on('joinTable', async ({ tableId, restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) {
      console.warn(`❌ Blocked join attempt from wrong restaurant: ${restaurantId}`);
      return;
    }


    const cleanId = normalizeId(tableId);
    const room = `${RESTAURANT_ID}:${cleanId}`;
    socket.join(room);
    console.log(`✅ Table ${cleanId} joined room: ${room}`);


    if (!tableMemory[cleanId]) {
      const cartFromDisk = await loadTableCart(cleanId);
      tableMemory[cleanId] = { cart: cartFromDisk, adminOverrides: [] };
    }


    socket.emit('syncCart', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      cart: tableMemory[cleanId].cart
    });


    const activeOrders = await getTableActiveOrders(cleanId);
    socket.emit('syncHistory', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      history: activeOrders
    });


    const adminOverrides = tableMemory[cleanId]?.adminOverrides || [];
    socket.emit('adminOverrideUpdate', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      overrides: adminOverrides
    });
  });


  /* ── ② WAITER registers with their name ── */
  socket.on('joinAsWaiter', ({ name, restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) return;


    socket.join(`${RESTAURANT_ID}:waiters`);
    connectedWaiters[socket.id] = { name: name || 'Unnamed Waiter', socketId: socket.id };
    console.log(`👨‍💼 Waiter "${name}" joined (${socket.id})`);


    socket.emit('waiterRegistered', {
      restaurantId: RESTAURANT_ID,
      name,
      message: `You are now online as ${name}`
    });
  });


  /* ── ③ ADMIN registers to receive alerts ── */
  socket.on('joinAdmin', ({ restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) return;
    socket.join(`${RESTAURANT_ID}:admin`);
    console.log(`🔑 Admin panel connected (${socket.id})`);
  });


  /* ── ④ 🔔 CUSTOMER presses the bell ── */
  socket.on('callWaiter', ({ tableId, restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) return;


    const cleanId = normalizeId(tableId);
    const displayTable = cleanId.replace(/^table/, 'Table ').toUpperCase();
    const timestamp = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });


    io.to(`${RESTAURANT_ID}:waiters`).emit('incomingWaiterCall', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      displayTable,
      message: `🔔 ${displayTable} is calling you!`,
      timestamp
    });


    io.to(`${RESTAURANT_ID}:admin`).emit('waiterCallAlert', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      displayTable,
      message: `🔔 ${displayTable} has called for a waiter`,
      type: 'incoming',
      timestamp
    });


    console.log(`🔔 Waiter called at ${displayTable} (${timestamp})`);
  });


  /* ── ⑤ WAITER taps "I'm on my way" ── */
  socket.on('waiterResponding', ({ tableId, restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) return;


    const cleanId = normalizeId(tableId);
    const displayTable = cleanId.replace(/^table/, 'Table ').toUpperCase();
    const waiter = connectedWaiters[socket.id];
    const waiterName = waiter ? waiter.name : 'A Waiter';
    const timestamp = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });


    io.to(`${RESTAURANT_ID}:admin`).emit('waiterCallAlert', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      displayTable,
      waiterName,
      message: `✅ Waiter ${waiterName} to ${displayTable}`,
      type: 'responding',
      timestamp
    });


    io.to(`${RESTAURANT_ID}:${cleanId}`).emit('waiterOnTheWay', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      waiterName,
      message: `✅ ${waiterName} is on their way!`
    });


    console.log(`✅ Waiter "${waiterName}" responding to ${displayTable}`);
  });


  /* ── ⑥ fetchHistory ── */
  socket.on('fetchHistory', async ({ tableId, restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) return;
    const cleanId = normalizeId(tableId);
    const activeOrders = await getTableActiveOrders(cleanId);
    socket.emit('syncHistory', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      history: activeOrders
    });
  });


  /* ── ⑦ updateCart ── */
  socket.on('updateCart', async data => {
    if (data.restaurantId !== RESTAURANT_ID) return;
    const cleanId = normalizeId(data.tableId);


    if (!tableMemory[cleanId]) {
        tableMemory[cleanId] = { cart: [], adminOverrides: [] };
    }
    tableMemory[cleanId].cart = data.cart;
    await saveTableCart(cleanId, data.cart);


    const room = `${RESTAURANT_ID}:${cleanId}`;
    io.to(room).emit('syncCart', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      cart: data.cart
    });
  });


  /* ── ⑧ Admin Override ── */
  socket.on('updateAdminOverrides', async (data) => {
    if (data.restaurantId !== RESTAURANT_ID) return;


    const cleanId = normalizeId(data.tableId);
    const room = `${RESTAURANT_ID}:${cleanId}`;


    if (!tableMemory[cleanId]) {
      tableMemory[cleanId] = { cart: [], adminOverrides: [] };
    }
    tableMemory[cleanId].adminOverrides = data.overrides || [];
    console.log(`🔒 Admin override updated for table ${cleanId}:`, data.overrides);


    io.to(room).emit('adminOverrideUpdate', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      overrides: data.overrides || []
    });
  });


  /* ── ⑨ Cleanup on disconnect ── */
  socket.on('disconnect', () => {
    if (connectedWaiters[socket.id]) {
      console.log(`👋 Waiter "${connectedWaiters[socket.id].name}" disconnected`);
      delete connectedWaiters[socket.id];
    }
    console.log(`⚡ Client Disconnected: ${socket.id}`);
  });


});


/* ============================================================
   12. CHATBOT PROXY → JOSH 11.0 on :5001
   ✅ Retries 5x with 3s gap while JOSH loads its ML model
============================================================ */


app.post('/api/chat', async (req, res) => {
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.post(`${CHATBOT_URL}/chat`, req.body, { timeout: 15000 });
      return res.json(response.data);
    } catch (err) {
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  res.json({ reply: "Bot is still loading, please try again in a moment!" });
});


/* ============================================================
   12b. AI PAIRING PROXY  →  recommend.py :5002
============================================================ */


app.post('/api/ai-pairing', async (req, res) => {
  try {
    const response = await axios.post(`${RECOMMEND_URL}/ai-pairing`, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 12000
    });
    res.json(response.data);
  } catch (err) {
    console.error('[/api/ai-pairing]', err.message);
    res.json({
      title: "Chef's Pick",
      description: "A great choice for your guests tonight.",
      pairings: [
        { name: "House White Wine", reason: "Crisp and refreshing with any main." },
        { name: "Greek Salad",      reason: "A fresh classic to complement the dish." }
      ],
      talkTrack: "I'd really recommend this one — it's a guest favourite tonight."
    });
  }
});


/* ============================================================
   13. SMART RECOMMENDATION LOGIC
============================================================ */


app.post('/api/recommend', async (req, res) => {
  let cart = [];


  if (Array.isArray(req.body)) {
      cart = req.body;
  } else if (req.body && req.body.cart) {
      cart = req.body.cart;
  } else if (req.body && req.body.items) {
      cart = req.body.items;
  }


  const itemCount = cart.length;
  const REC_LIMIT = Math.min(5, Math.max(3, itemCount));


  let fullMenu = {};
  let categorizedMenu = { 'STARTER': [], 'MAIN': [], 'DESSERT': [], 'DRINK': [] };
  let allItemKeys = [];


  try {
    const menuJson = await prismaMenu.loadMenu();
    if (!menuJson) return res.json([]);


    function walk(node, currentCategoryType = 'MAIN') {
      if (Array.isArray(node)) {
          node.forEach(i => walk(i, currentCategoryType));
      } else if (node && typeof node === 'object') {
        if (Array.isArray(node.items)) {
            node.items.forEach(i => {
                if (i.name) {
                    const key = normalizeName(i.name);
                    const itemWithType = { ...i, categoryType: currentCategoryType };
                    fullMenu[key] = itemWithType;
                    allItemKeys.push(key);
                    if (categorizedMenu[currentCategoryType]) {
                        categorizedMenu[currentCategoryType].push(itemWithType);
                    }
                }
            });
        }
        Object.keys(node).forEach(key => {
            if (key !== 'items' && typeof node[key] === 'object') {
                const nextType = getCategoryType(key) !== 'MAIN' ? getCategoryType(key) : currentCategoryType;
                walk(node[key], nextType);
            }
        });
      }
    }
    walk(menuJson);
  } catch {
      return res.json([]);
  }


  const cartNames = cart.map(i => normalizeName(i.name));
  let hasStarter = false;
  let hasDrink = false;
  let hasDessert = false;


  cartNames.forEach(name => {
      const item = fullMenu[name];
      if (item) {
          if (item.categoryType === 'STARTER') hasStarter = true;
          if (item.categoryType === 'DRINK') hasDrink = true;
          if (item.categoryType === 'DESSERT') hasDessert = true;
      }
  });


  let candidates = [];
  let seen = new Set(cartNames);


  let adminGroups = [];
  try {
      adminGroups = (await prismaMenu.loadRecommendations()) || [];
  } catch {}


  for (const group of adminGroups) {
    if (!group.items) continue;
    const isRelevant = group.items.some(gItem => cartNames.includes(normalizeName(gItem.name)));
    if (isRelevant) {
      const missing = group.items.filter(gItem => !cartNames.includes(normalizeName(gItem.name)));
      for (const m of missing) {
          const mKey = normalizeName(m.name);
          let match = fullMenu[mKey];
          if (!match) {
              const fuzzy = allItemKeys.find(k => k.includes(mKey) || mKey.includes(k));
              if (fuzzy) match = fullMenu[fuzzy];
          }
          if (match && !seen.has(normalizeName(match.name))) {
              candidates.push({
                  item: match,
                  source: group.description || "Chef's Pairing",
                  score: 100,
                  type: match.categoryType
              });
              seen.add(normalizeName(match.name));
          }
      }
    }
  }


  function addRandomFromCategory(catType, sourceTitle, score) {
      const options = categorizedMenu[catType];
      if (!options || options.length === 0) return;
      const shuffled = options.sort(() => 0.5 - Math.random());
      for (const opt of shuffled) {
          const k = normalizeName(opt.name);
          if (!seen.has(k)) {
              candidates.push({ item: opt, source: sourceTitle, score: score, type: catType });
              seen.add(k);
              return;
          }
      }
  }


  if (!hasStarter) addRandomFromCategory('STARTER', "Start with a Starter", 80);
  if (!hasDrink)   addRandomFromCategory('DRINK',   "Thirsty?",             70);
  if (!hasDessert) addRandomFromCategory('DESSERT',  "Sweet Treat",          60);


  let attempts = 0;
  while (candidates.length < REC_LIMIT + 2 && attempts < 50) {
      attempts++;
      const rndKey = allItemKeys[Math.floor(Math.random() * allItemKeys.length)];
      if (!seen.has(rndKey)) {
          const item = fullMenu[rndKey];
          candidates.push({ item: item, source: "You might also like", score: 10, type: item.categoryType });
          seen.add(rndKey);
      }
  }


  candidates.sort((a, b) => b.score - a.score);


  const finalSelection = candidates.slice(0, REC_LIMIT).map(c => ({
      name: c.item.name,
      price: c.item.price,
      description: c.item.description,
      img: c.item.img,
      video: c.item.video,
      categoryType: c.item.categoryType,
      source_title: c.source
  }));


  res.json(finalSelection);
});


/* ============================================================
   14. ORDER SUBMISSION
============================================================ */


app.post('/submit_order', async (req, res) => {
  const order = req.body;
  if (!order || !order.items || !order.items.length) {
    return res.status(400).json({ error: 'Empty order' });
  }


  const tableId = normalizeId(order.table_number);
  const filename = `order_table_${tableId}_${Date.now()}.json`;
  const room = `${RESTAURANT_ID}:${tableId}`;


  try {
    await fsPromises.writeFile(
        path.join(ORDERS_DIR, filename),
        JSON.stringify(order, null, 2)
    );


    await saveTableCart(tableId, []);
    tableMemory[tableId] = { cart: [], adminOverrides: tableMemory[tableId]?.adminOverrides || [] };


    io.to(room).emit('syncCart', { restaurantId: RESTAURANT_ID, tableId, cart: [] });


    const activeOrders = await getTableActiveOrders(tableId);
    io.to(room).emit('syncHistory', { restaurantId: RESTAURANT_ID, tableId, history: activeOrders });


    io.emit('orderPlaced', { restaurantId: RESTAURANT_ID, order });


    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Save failed' });
  }
});


/* ============================================================
   15. WAITER API ROUTES
============================================================ */


app.get('/api/waiter/table/:tableId/status', async (req, res) => {
  const cleanId = normalizeId(req.params.tableId);
  const mem = tableMemory[cleanId];
  const cart = mem ? mem.cart : await loadTableCart(cleanId);
  const orderCount = cart.reduce((s, i) => s + (i.quantity || 1), 0);
  const total = cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  res.json({
    status: orderCount > 0 ? 'active' : 'empty',
    orderCount,
    total
  });
});


app.post('/api/waiter/add-items', async (req, res) => {
  const { tableId, items, waiterName, notes } = req.body;
  if (!tableId || !items || !items.length) {
    return res.status(400).json({ error: 'Missing tableId or items' });
  }


  const cleanId = normalizeId(tableId);
  const filename = `order_table_${cleanId}_${Date.now()}.json`;
  const room = `${RESTAURANT_ID}:${cleanId}`;


  const order = {
    table_number: cleanId,
    waiterName: waiterName || 'Waiter',
    notes: notes || '',
    items,
    timestamp: new Date().toISOString(),
    restaurantId: RESTAURANT_ID
  };


  try {
    await fsPromises.writeFile(path.join(ORDERS_DIR, filename), JSON.stringify(order, null, 2));


    await saveTableCart(cleanId, []);
    if (tableMemory[cleanId]) {
      tableMemory[cleanId].cart = [];
    }


    io.to(room).emit('syncCart', { restaurantId: RESTAURANT_ID, tableId: cleanId, cart: [] });


    const activeOrders = await getTableActiveOrders(cleanId);
    io.to(room).emit('syncHistory', { restaurantId: RESTAURANT_ID, tableId: cleanId, history: activeOrders });


    io.emit('orderPlaced', { restaurantId: RESTAURANT_ID, order });


    res.json({ ok: true });
  } catch (e) {
    console.error('add-items error:', e);
    res.status(500).json({ error: 'Failed to save order' });
  }
});


app.post('/api/waiter/archive-table', async (req, res) => {
  const { tableId } = req.body;
  if (!tableId) return res.status(400).json({ error: 'Missing tableId' });


  const cleanId = normalizeId(tableId);
  const room = `${RESTAURANT_ID}:${cleanId}`;


  try {
    const files = await fsPromises.readdir(ORDERS_DIR);
    const prefix = `order_table_${cleanId}_`;
    const matching = files.filter(f => f.startsWith(prefix));


    for (const f of matching) {
      await fsPromises.rename(
        path.join(ORDERS_DIR, f),
        path.join(HISTORY_DIR, f)
      );
    }


    await saveTableCart(cleanId, []);
    tableMemory[cleanId] = { cart: [], adminOverrides: [] };


    io.to(room).emit('syncCart', { restaurantId: RESTAURANT_ID, tableId: cleanId, cart: [] });
    io.to(room).emit('syncHistory', { restaurantId: RESTAURANT_ID, tableId: cleanId, history: [] });
    io.emit('orderUpdated', { restaurantId: RESTAURANT_ID });


    console.log(`✅ Table ${cleanId} archived (${matching.length} orders moved to history)`);
    res.json({ ok: true, archivedCount: matching.length });
  } catch (e) {
    console.error('archive-table error:', e);
    res.status(500).json({ error: 'Archive failed' });
  }
});


/* ============================================================
   16. ADMIN ORDERS / HISTORY MANIPULATION
============================================================ */


app.get('/orders', adminAuth, async (req, res) => {
  try {
    const files = fs.readdirSync(ORDERS_DIR);
    const out = [];
    for (const f of files) {
      try { out.push({ filename: f, ...JSON.parse(fs.readFileSync(path.join(ORDERS_DIR, f))) }); } catch {}
    }
    res.json(out);
  } catch { res.json([]); }
});


app.get('/history', adminAuth, async (req, res) => {
  try {
    const files = fs.readdirSync(HISTORY_DIR);
    const out = [];
    for (const f of files) {
      try { out.push({ filename: f, ...JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f))) }); } catch {}
    }
    res.json(out);
  } catch { res.json([]); }
});


app.post('/complete', adminAuth, async (req, res) => {
  try {
    const filename = req.body.filename;
    await fsPromises.rename(
      path.join(ORDERS_DIR, filename),
      path.join(HISTORY_DIR, filename)
    );
    io.emit('orderUpdated', { restaurantId: RESTAURANT_ID });


    const parts = filename.split('_');
    if (parts.length >= 3) {
      const tId = parts[2];
      const room = `${RESTAURANT_ID}:${tId}`;
      const activeOrders = await getTableActiveOrders(tId);
      io.to(room).emit('syncHistory', { restaurantId: RESTAURANT_ID, tableId: tId, history: activeOrders });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Move failed' });
  }
});


app.post('/incomplete', adminAuth, async (req, res) => {
  try {
    const filename = req.body.filename;
    await fsPromises.rename(
      path.join(HISTORY_DIR, filename),
      path.join(ORDERS_DIR, filename)
    );
    io.emit('orderUpdated', { restaurantId: RESTAURANT_ID });


    const parts = filename.split('_');
    if (parts.length >= 3) {
      const tId = parts[2];
      const room = `${RESTAURANT_ID}:${tId}`;
      const activeOrders = await getTableActiveOrders(tId);
      io.to(room).emit('syncHistory', { restaurantId: RESTAURANT_ID, tableId: tId, history: activeOrders });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Move failed' });
  }
});


app.delete('/delete/:type/:file', adminAuth, async (req, res) => {
  const dir = req.params.type === 'orders' ? ORDERS_DIR : HISTORY_DIR;
  try {
    const filename = req.params.file;
    await fsPromises.unlink(path.join(dir, filename));
    io.emit('orderUpdated', { restaurantId: RESTAURANT_ID });


    if (req.params.type === 'orders') {
        const parts = filename.split('_');
        if (parts.length >= 3) {
          const tId = parts[2];
          const room = `${RESTAURANT_ID}:${tId}`;
          const activeOrders = await getTableActiveOrders(tId);
          io.to(room).emit('syncHistory', { restaurantId: RESTAURANT_ID, tableId: tId, history: activeOrders });
        }
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Delete failed' });
  }
});


/* ============================================================
   17. TABLE VIEW ROUTE  ← wildcard, must stay LAST
============================================================ */


app.get('/Greek/:tableId', (req, res) => {
  res.sendFile(path.join(BASE_DIR, 'index.html'));
});


/* ============================================================
   18. STARTUP
============================================================ */


(async () => {
  for (const dir of [FOOD_DIR, ORDERS_DIR, HISTORY_DIR, TABLES_DIR, DATA_DIR, UPLOADS_DIR]) {
    try { await fsPromises.mkdir(dir, { recursive: true }); } catch {}
  }


  try { await fsPromises.access(DEAL_OF_DAY_FILE); }
  catch { await fsPromises.writeFile(DEAL_OF_DAY_FILE, '[]'); }




  // ✅ Spawn JOSH 11.0 — crash protected
  const chatbotProc = spawn(PYTHON_EXE, [CHATBOT_SCRIPT], {
    cwd: BASE_DIR, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  chatbotProc.on('error', err => console.error('[JOSH] Failed to start:', err.message));
  chatbotProc.stdout.on('data', d => console.log('[JOSH]', d.toString().trim()));
  chatbotProc.stderr.on('data', d => console.error('[JOSH ERR]', d.toString().trim()));
  chatbotProc.on('close', code => console.log(`[JOSH] exited with code: ${code}`));


  // ✅ Spawn recommend.py — crash protected
  const recommendProc = spawn(PYTHON_EXE, [RECOMMEND_SCRIPT], {
    cwd: BASE_DIR, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  recommendProc.on('error', err => console.error('[recommend.py] Failed to start:', err.message));
  recommendProc.stdout.on('data', d => console.log('[recommend.py]', d.toString().trim()));
  recommendProc.stderr.on('data', d => console.error('[recommend.py ERR]', d.toString().trim()));
  recommendProc.on('close', code => console.log(`[recommend.py] exited: ${code}`));


  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   🇬🇷  GREEK Restaurant Server (ISOLATED)         ║
║                                                    ║
║   ✅ Server:    http://localhost:${PORT}             ║
║   🔒 Restaurant ID: greek                         ║
║   📍 Routes prefix: /Greek/                       ║
║   🤖 JOSH 11.0: port 5001 (loading...)            ║
║   🍷 AI Pairing: port 5002                        ║
║   👨‍💼 Admin:    http://localhost:${PORT}/Greek/Admin║
║   🍽️  Waiter:   http://localhost:${PORT}/Greek/Waiter║
║   🔔 Waiter Call System: ACTIVE                   ║
║   🛡️  100% Isolated from IMLI                     ║
║   🆕 Admin Override: Enabled                      ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);
    console.log('⏳ JOSH is loading ML model — chat ready in ~30s...');
  });
})();