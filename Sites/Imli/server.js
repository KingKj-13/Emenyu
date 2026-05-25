/**
 * ============================================================
 * IMLI RESTAURANT – COMPLETE ISOLATED SERVER
 * Port 3001 | Chatbot Port 5002 | Routes: /Imli/*
 * 
 * ✅ ALL 11 ISOLATION FIXES APPLIED
 * 🔒 100% Cart/Order/History Isolation from Greek
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
const prismaMenu = new PrismaMenuService({ restaurantId: 'imli' });

/* ============================================================
   1. BASIC CONFIGURATION + RESTAURANT IDENTIFIER
============================================================ */

// 🔒 FIX #1: Restaurant Identity Lock
const RESTAURANT_ID = "imli";

const PORT = process.env.PORT || 3001; // IMLI Port

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
const IS_WINDOWS = process.platform === 'win32';
const PYTHON_EXE = process.env.PYTHON_EXE || (IS_WINDOWS ? 'python' : 'python3');
const CHATBOT_SCRIPT = path.join(BASE_DIR, 'ChatBot.py');
const CHATBOT_PORT = 5002;
const CHATBOT_URL = `http://127.0.0.1:${CHATBOT_PORT}`;

/* ============================================================
   2. EXPRESS + SOCKET SETUP
============================================================ */

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
  path: '/Imli/socket.io',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files under /Imli prefix
app.use('/Imli', express.static(BASE_DIR));

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

/* --- HELPER: Detect Category Type (Smart Logic) --- */
function getCategoryType(categoryName) {
    const lower = categoryName.toLowerCase();

    // Identify Starters
    if (lower.includes('starter') || lower.includes('street food') || lower.includes('appetizer') || 
        lower.includes('meze') || lower.includes('tapas') || lower.includes('soup') || 
        lower.includes('samosa') || lower.includes('pakora')) {
        return 'STARTER';
    }

    // Identify Desserts
    if (lower.includes('dessert') || lower.includes('sweet') || lower.includes('cake') || 
        lower.includes('ice cream') || lower.includes('gulab') || lower.includes('kheer')) {
        return 'DESSERT';
    }

    // Identify Drinks
    if (lower.includes('drink') || lower.includes('beverage') || lower.includes('lassi') || 
        lower.includes('chai') || lower.includes('coffee') || lower.includes('tea') || 
        lower.includes('water') || lower.includes('juice')) {
        return 'DRINK';
    }

    // Default to Main Course
    return 'MAIN';
}

/* ============================================================
   HELPER: GET TABLE ACTIVE ORDERS
   (Scans ONLY the 'orders' folder for active items)
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
      } catch (err) {
          // Ignore bad files
      }
    }
  } catch (err) {
      // Ignore if folder missing
  }
  return allItems;
}

/* ============================================================
   5. ADMIN PANEL ROUTE
============================================================ */

app.get('/Imli/Admin', adminAuth, (req, res) => {
  res.sendFile(path.join(BASE_DIR, 'admin.html'));
});

/* ============================================================
   6. MENU ROUTES
============================================================ */

app.get('/Imli/api/menu', async (req, res) => {
  try {
    const menu = await prismaMenu.loadMenu();
    res.json(menu || {});
  } catch (e) {
    res.status(500).json({ error: 'Menu load failed' });
  }
});

app.post('/Imli/api/menu', adminAuth, async (req, res) => {
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

app.get('/Imli/api/deals', async (req, res) => {
  try {
    const raw = await fsPromises.readFile(DEAL_OF_DAY_FILE, 'utf-8');
    res.json(JSON.parse(raw));
  } catch {
    res.json([]);
  }
});

app.post('/Imli/api/deals', adminAuth, async (req, res) => {
  try {
    await fsPromises.writeFile(
      DEAL_OF_DAY_FILE,
      JSON.stringify(req.body, null, 2)
    );
    io.emit('dealUpdated');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Deal save failed' });
  }
});

/* ============================================================
   8. ADMIN RECOMMENDATIONS
============================================================ */

app.get('/Imli/api/recommendations', adminAuth, async (req, res) => {
  try {
    const recs = await prismaMenu.loadRecommendations();
    res.json(recs || []);
  } catch {
    res.json([]);
  }
});

app.post('/Imli/api/recommendations', adminAuth, async (req, res) => {
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

app.post('/Imli/api/upload', adminAuth, upload.single('mediaFile'), (req, res) => {
  res.json({
    filePath: `/Imli/uploads/${req.file.filename}`,
    type: req.file.mimetype
  });
});

/* ============================================================
   10. CHAT HISTORY (for Admin Dashboard)
============================================================ */

app.get('/Imli/api/chat-history', adminAuth, async (req, res) => {
    try {
        const historyPath = path.join(HISTORY_DIR, 'full_chat_history.json');
        const data = await fsPromises.readFile(historyPath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) { 
        res.json([]); 
    }
});

/* ============================================================
   11. TABLE CART STORAGE
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
   12. SOCKET.IO – TABLE SYNC (🔒 ALL ISOLATION FIXES)
============================================================ */

io.on('connection', socket => {

  // 🔒 FIX #2, #3: Namespaced Rooms + Validation
  socket.on('joinTable', async ({ tableId, restaurantId }) => {
    // 🔒 FIX #3: Validate Restaurant ID
    if (restaurantId !== RESTAURANT_ID) {
      console.warn(`❌ Blocked join attempt from wrong restaurant: ${restaurantId}`);
      return;
    }

    const cleanId = normalizeId(tableId);

    // 🔒 FIX #2: Use namespaced room
    const room = `${RESTAURANT_ID}:${cleanId}`;
    socket.join(room);

    console.log(`✅ Table ${cleanId} joined room: ${room}`);

    if (!tableMemory[cleanId]) {
      const cartFromDisk = await loadTableCart(cleanId);
      tableMemory[cleanId] = { cart: cartFromDisk };
    }

    // 🔒 FIX #5: Structured payload
    socket.emit('syncCart', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      cart: tableMemory[cleanId].cart
    });

    // 🔒 FIX #6: Structured history payload
    const activeOrders = await getTableActiveOrders(cleanId);
    socket.emit('syncHistory', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      history: activeOrders
    });
  });

  // 🔒 FIX #7: Validate fetchHistory
  socket.on('fetchHistory', async ({ tableId, restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) return;

    const cleanId = normalizeId(tableId);
    const activeOrders = await getTableActiveOrders(cleanId);

    // 🔒 FIX #6: Structured payload
    socket.emit('syncHistory', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      history: activeOrders
    });
  });

  // 🔒 FIX #8: Validate updateCart
  socket.on('updateCart', async data => {
    // 🔒 FIX #8: Block wrong restaurant
    if (data.restaurantId !== RESTAURANT_ID) return;

    const cleanId = normalizeId(data.tableId);

    if (!tableMemory[cleanId]) {
        tableMemory[cleanId] = { cart: [] };
    }

    tableMemory[cleanId].cart = data.cart;
    await saveTableCart(cleanId, data.cart);

    // 🔒 FIX #4: Namespaced emit + FIX #5: Structured payload
    const room = `${RESTAURANT_ID}:${cleanId}`;
    io.to(room).emit('syncCart', {
      restaurantId: RESTAURANT_ID,
      tableId: cleanId,
      cart: data.cart
    });
  });

  // 🔒 FIX #9: Validate admin reset
  socket.on('adminResetTable', async ({ tableId, restaurantId }) => {
    if (restaurantId !== RESTAURANT_ID) return;

    const cleanId = normalizeId(tableId);
    const room = `${RESTAURANT_ID}:${cleanId}`;

    if(tableMemory[cleanId]) {
        tableMemory[cleanId].cart = [];
        await saveTableCart(cleanId, []);

        // 🔒 FIX #4, #5, #6: Namespaced + structured
        io.to(room).emit('syncCart', {
          restaurantId: RESTAURANT_ID,
          tableId: cleanId,
          cart: []
        });

        io.to(room).emit('syncHistory', {
          restaurantId: RESTAURANT_ID,
          tableId: cleanId,
          history: []
        });
    }
  });
});

/* ============================================================
   13. CHATBOT PROXY
============================================================ */

app.post('/Imli/api/chat', async (req, res) => {
  try {
    const response = await axios.post(`${CHATBOT_URL}/chat`, req.body);

    // Forward chat log to admin dashboard
    if (response.data && response.data.log) { 
        // 🔒 FIX #11: Optional namespaced admin emit
        io.emit('newChatLog', {
          restaurantId: RESTAURANT_ID,
          log: response.data.log
        }); 
    }

    res.json(response.data);
  } catch (err) {
    res.json({ reply: "Bot offline" });
  }
});

/* ============================================================
   14. SMART RECOMMENDATION LOGIC
   Features:
   - Min 3 / Max 5 recommendations
   - Prioritizes Chef Pairings
   - Fills Gaps (Missing Drink? Suggest Drink)
   - Fallback to Random Items
============================================================ */

app.post('/Imli/api/recommend', async (req, res) => {
  let cart = [];

  // Handle various formats from frontend
  if (Array.isArray(req.body)) {
      cart = req.body;
  } else if (req.body && req.body.cart) {
      cart = req.body.cart;
  } else if (req.body && req.body.items) {
      cart = req.body.items;
  }

  // --- 1. DETERMINE LIMIT (Min 3, Max 5) ---
  const itemCount = cart.length;
  const REC_LIMIT = Math.min(5, Math.max(3, itemCount));

  // --- 2. LOAD & CATEGORIZE MENU ---
  let fullMenu = {}; 
  let categorizedMenu = { 'STARTER': [], 'MAIN': [], 'DESSERT': [], 'DRINK': [] };
  let allItemKeys = [];

  try {
    const menuJson = await prismaMenu.loadMenu();
    if (!menuJson) return res.json([]);

    // Recursive walker that tags items with their category type
    function walk(node, currentCategoryType = 'MAIN') {
      if (Array.isArray(node)) {
          node.forEach(i => walk(i, currentCategoryType));
      } else if (node && typeof node === 'object') {

        // If this node contains items, process them
        if (Array.isArray(node.items)) {
            node.items.forEach(i => {
                if (i.name) {
                    const key = normalizeName(i.name);
                    const itemWithType = { ...i, categoryType: currentCategoryType };

                    fullMenu[key] = itemWithType;
                    allItemKeys.push(key);

                    if(categorizedMenu[currentCategoryType]) {
                        categorizedMenu[currentCategoryType].push(itemWithType);
                    }
                }
            });
        }

        // Check subkeys to detect category changes
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

  // --- 3. ANALYZE CART GAPS ---
  const cartNames = cart.map(i => normalizeName(i.name));
  let hasStarter = false;
  let hasDrink = false;
  let hasDessert = false;

  // Check what categories are already present
  cartNames.forEach(name => {
      const item = fullMenu[name];
      if (item) {
          if (item.categoryType === 'STARTER') hasStarter = true;
          if (item.categoryType === 'DRINK') hasDrink = true;
          if (item.categoryType === 'DESSERT') hasDessert = true;
      }
  });

  // --- 4. BUILD CANDIDATES ---
  let candidates = [];
  let seen = new Set(cartNames);

  // A. CHEF PAIRINGS (Priority 1: Score 100)
  let adminGroups = [];
  try {
      adminGroups = (await prismaMenu.loadRecommendations()) || [];
  } catch {}

  for (const group of adminGroups) {
    if (!group.items) continue;

    // Is this rule relevant?
    const isRelevant = group.items.some(gItem => cartNames.includes(normalizeName(gItem.name)));

    if (isRelevant) {
      // Find items in this rule that are MISSING from cart
      const missing = group.items.filter(gItem => !cartNames.includes(normalizeName(gItem.name)));

      for (const m of missing) {
          const mKey = normalizeName(m.name);
          let match = fullMenu[mKey];

          // Fuzzy match fallback
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

  // B. CATEGORY GAPS (Priority 2: Score 60-80)
  function addRandomFromCategory(catType, sourceTitle, score) {
      const options = categorizedMenu[catType];
      if (!options || options.length === 0) return;

      const shuffled = options.sort(() => 0.5 - Math.random());

      for (const opt of shuffled) {
          const k = normalizeName(opt.name);
          if (!seen.has(k)) {
              candidates.push({ 
                  item: opt, 
                  source: sourceTitle, 
                  score: score, 
                  type: catType 
              });
              seen.add(k);
              return;
          }
      }
  }

  if (!hasStarter) addRandomFromCategory('STARTER', "Start with a Starter", 80);
  if (!hasDrink) addRandomFromCategory('DRINK', "Refresh yourself", 70);
  if (!hasDessert) addRandomFromCategory('DESSERT', "Sweet ending", 60);

  // C. RANDOM FILLERS (Priority 3: Score 10)
  let attempts = 0;
  while (candidates.length < REC_LIMIT + 2 && attempts < 50) {
      attempts++;
      const rndKey = allItemKeys[Math.floor(Math.random() * allItemKeys.length)];

      if (!seen.has(rndKey)) {
          const item = fullMenu[rndKey];
          candidates.push({ 
              item: item, 
              source: "You might also like", 
              score: 10, 
              type: item.categoryType 
          });
          seen.add(rndKey);
      }
  }

  // --- 5. FINALIZE ---
  candidates.sort((a, b) => b.score - a.score);

  const finalSelection = candidates.slice(0, REC_LIMIT).map(c => {
      return {
          name: c.item.name,
          price: c.item.price,
          description: c.item.description,
          img: c.item.img,
          video: c.item.video,
          categoryType: c.item.categoryType,
          source_title: c.source
      };
  });

  res.json(finalSelection);
});

/* ============================================================
   15. ORDER SUBMISSION (🔒 FIX #10: Namespaced emits)
============================================================ */

app.post('/Imli/submit_order', async (req, res) => {
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

    // Clear Cart
    await saveTableCart(tableId, []);
    tableMemory[tableId] = { cart: [] };

    // 🔒 FIX #4, #5: Namespaced room + structured payload
    io.to(room).emit('syncCart', {
      restaurantId: RESTAURANT_ID,
      tableId,
      cart: []
    });

    const activeOrders = await getTableActiveOrders(tableId);

    // 🔒 FIX #4, #6: Namespaced + structured
    io.to(room).emit('syncHistory', {
      restaurantId: RESTAURANT_ID,
      tableId,
      history: activeOrders
    });

    // 🔒 FIX #11: Namespaced admin emit
    io.emit('orderPlaced', {
      restaurantId: RESTAURANT_ID,
      order
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Save failed' });
  }
});

/* ============================================================
   16. ADMIN ORDERS / HISTORY MANIPULATION
============================================================ */

app.get('/Imli/orders', adminAuth, async (req, res) => {
  try {
    const files = fs.readdirSync(ORDERS_DIR);
    const out = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(ORDERS_DIR, f));
        out.push({ filename: f, ...JSON.parse(raw) });
      } catch {}
    }
    res.json(out);
  } catch { res.json([]); }
});

app.get('/Imli/history', adminAuth, async (req, res) => {
  try {
    const files = fs.readdirSync(HISTORY_DIR);
    const out = [];
    for (const f of files) {
      // Skip full_chat_history.json
      if (f === 'full_chat_history.json') continue;

      try {
        const raw = fs.readFileSync(path.join(HISTORY_DIR, f));
        out.push({ filename: f, ...JSON.parse(raw) });
      } catch {}
    }
    res.json(out);
  } catch { res.json([]); }
});

// MARK AS COMPLETE
app.post('/Imli/complete', adminAuth, async (req, res) => {
  try {
    const filename = req.body.filename;
    await fsPromises.rename(
      path.join(ORDERS_DIR, filename),
      path.join(HISTORY_DIR, filename)
    );

    // 🔒 FIX #11: Namespaced admin emit
    io.emit('orderUpdated', { restaurantId: RESTAURANT_ID });

    const parts = filename.split('_');
    if (parts.length >= 3) {
      const tId = parts[2];
      const room = `${RESTAURANT_ID}:${tId}`;
      const activeOrders = await getTableActiveOrders(tId);

      // 🔒 FIX #4, #6: Namespaced + structured
      io.to(room).emit('syncHistory', {
        restaurantId: RESTAURANT_ID,
        tableId: tId,
        history: activeOrders
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Move failed' });
  }
});

// MARK AS INCOMPLETE
app.post('/Imli/incomplete', adminAuth, async (req, res) => {
  try {
    const filename = req.body.filename;
    await fsPromises.rename(
      path.join(HISTORY_DIR, filename),
      path.join(ORDERS_DIR, filename)
    );

    // 🔒 FIX #11: Namespaced admin emit
    io.emit('orderUpdated', { restaurantId: RESTAURANT_ID });

    const parts = filename.split('_');
    if (parts.length >= 3) {
      const tId = parts[2];
      const room = `${RESTAURANT_ID}:${tId}`;
      const activeOrders = await getTableActiveOrders(tId);

      // 🔒 FIX #4, #6: Namespaced + structured
      io.to(room).emit('syncHistory', {
        restaurantId: RESTAURANT_ID,
        tableId: tId,
        history: activeOrders
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Move failed' });
  }
});

app.delete('/Imli/delete/:type/:file', adminAuth, async (req, res) => {
  const dir = req.params.type === 'orders' ? ORDERS_DIR : HISTORY_DIR;
  try {
    const filename = req.params.file;
    await fsPromises.unlink(path.join(dir, filename));

    // 🔒 FIX #11: Namespaced admin emit
    io.emit('orderUpdated', { restaurantId: RESTAURANT_ID });

    if (req.params.type === 'orders') {
        const parts = filename.split('_');
        if (parts.length >= 3) {
          const tId = parts[2];
          const room = `${RESTAURANT_ID}:${tId}`;
          const activeOrders = await getTableActiveOrders(tId);

          // 🔒 FIX #4, #6: Namespaced + structured
          io.to(room).emit('syncHistory', {
            restaurantId: RESTAURANT_ID,
            tableId: tId,
            history: activeOrders
          });
        }
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Legacy routes for compatibility
app.delete('/Imli/delete/orders/:filename', adminAuth, async (req,res) => {
    try { 
        await fsPromises.unlink(path.join(ORDERS_DIR, req.params.filename)); 
        res.json({msg:'Deleted'}); 
    } catch { 
        res.status(500).send('Err'); 
    }
});

app.delete('/Imli/delete/history/:filename', adminAuth, async (req,res) => {
    try { 
        await fsPromises.unlink(path.join(HISTORY_DIR, req.params.filename)); 
        res.json({msg:'Deleted'}); 
    } catch { 
        res.status(500).send('Err'); 
    }
});

/* ============================================================
   17. TABLE VIEW ROUTE
============================================================ */

app.get('/Imli/:tableId', (req, res) => {
  res.sendFile(path.join(BASE_DIR, 'index.html'));
});

/* ============================================================
   18. PYTHON CHATBOT PROCESS
============================================================ */

let pythonProcess = null;
let restarting = false;

function startPythonChatbot() {
    if (pythonProcess && !pythonProcess.killed) return;

    console.log(`🤖 Starting IMLI Chatbot on port ${CHATBOT_PORT}...`);
    pythonProcess = spawn(PYTHON_EXE, [CHATBOT_SCRIPT]);

    pythonProcess.stdout.on('data', d => console.log(`[IMLI BOT] ${d}`));
    pythonProcess.stderr.on('data', d => console.error(`[IMLI BOT ERROR] ${d}`));

    pythonProcess.on('close', (code) => {
        console.log(`🤖 Chatbot exited with code ${code}`);
        pythonProcess = null;

        if (code !== 0 && !restarting) {
            console.log('🔄 Restarting chatbot in 3 seconds...');
            restarting = true;
            setTimeout(() => { 
                restarting = false; 
                startPythonChatbot(); 
            }, 3000);
        }
    });
}

/* ============================================================
   19. STARTUP
============================================================ */

(async () => {
  // Create all necessary directories
  for (const dir of [
    FOOD_DIR,
    ORDERS_DIR,
    HISTORY_DIR,
    TABLES_DIR,
    DATA_DIR,
    UPLOADS_DIR
  ]) {
    try {
      await fsPromises.mkdir(dir, { recursive: true });
    } catch {}
  }

  // Initialize files if they don't exist
  try { await fsPromises.access(DEAL_OF_DAY_FILE); } 
  catch { await fsPromises.writeFile(DEAL_OF_DAY_FILE, '[]'); }


  // Start Python chatbot
  startPythonChatbot();

  // Start Express server
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   🍛  IMLI Restaurant Server (ISOLATED)           ║
║                                                    ║
║   ✅ Server: http://localhost:${PORT}               ║
║   🔒 Restaurant ID: ${RESTAURANT_ID}                      ║
║   📍 Routes prefix: /Imli/                        ║
║   🤖 Chatbot: port ${CHATBOT_PORT}                        ║
║   👨‍💼 Admin: http://localhost:${PORT}/Imli/Admin    ║
║   🛡️  100% Isolated from Greek                    ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);
  });
})();