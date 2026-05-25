/**
 * ============================================================
 * AL PESCATORE – SEAFOOD & ITALIAN SERVER (FULL PRODUCTION)
 * Port 3005 | Chatbot Port 5005 | Routes: / (Root)
 * ✅ NETWORK FIX APPLIED (0.0.0.0)
 * ✅ NGINX COMPATIBLE (Handles stripped paths)
 * ✅ CSP REMOVED (No blocking)
 * ✅ FAVICON HANDLED
 * ✅ COCKTAIL BUG FIXED
 * 🔒 100% Isolated from Mythos/Imli
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
const prismaMenu = new PrismaMenuService({ restaurantId: 'al_pescatore' });

/* ============================================================
   1. BASIC CONFIGURATION + RESTAURANT IDENTIFIER
============================================================ */

// 🔒 FIX #1: Restaurant Identity Lock
const RESTAURANT_ID = "al_pescatore";

const PORT = process.env.PORT || 3005; // Al Pescatore Port

/* ---- ADMIN AUTH ---- */
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.STAGING_PASS || 'admin';

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

/* ---- PYTHON CHATBOT ---- */
const PYTHON_EXE = path.join(BASE_DIR, 'venv', 'bin', 'python');
const CHATBOT_SCRIPT = path.join(BASE_DIR, 'ChatBot.py');
const CHATBOT_URL = 'http://127.0.0.1:5005';

/* ============================================================
   2. EXPRESS + SOCKET SETUP
============================================================ */

const app = express();
const server = http.createServer(app);

// ✅ CRITICAL NGINX FIX: 
// Listen on the DEFAULT path "/socket.io" because Nginx 
// strips the "/AlPescatore" prefix before it reaches here.
const io = socketIO(server, {
  path: "/socket.io", 
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ REQUEST LOGGER - See what paths Express receives
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path}`);
  next();
});

app.use(express.static(BASE_DIR));

/* ============================================================
   ❌ CSP DISABLED - Was blocking Google Fonts
   Re-enable later with proper config if needed
============================================================ */

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
    if (lower.includes('starter') || lower.includes('antipast') || lower.includes('tapas') || lower.includes('soup') || lower.includes('insalata') || lower.includes('salad')) {
        return 'STARTER';
    }

    // Identify Desserts
    if (lower.includes('dessert') || lower.includes('dolc') || lower.includes('sweet') || lower.includes('cake') || lower.includes('gelato') || lower.includes('tiramisu')) {
        return 'DESSERT';
    }

    // Identify Drinks
    if (lower.includes('drink') || lower.includes('wine') || lower.includes('vino') || lower.includes('beer') || lower.includes('birra') || lower.includes('coffee') || lower.includes('tea') || lower.includes('cocktail')) {
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

app.get('/Admin', adminAuth, (req, res) => {
  res.sendFile(path.join(BASE_DIR, 'admin.html'));
});

/* ============================================================
   ✅ FAVICON FIX
============================================================ */
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

/* ============================================================
   6. MENU ROUTES (AUTO-MERGE LOGIC)
   Combines Food, Wine, and Cocktail JSONs
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
   11. SOCKET.IO – TABLE SYNC (🔒 ALL ISOLATION FIXES)
============================================================ */

io.on('connection', socket => {

  // ✅ DEBUG LOG: Confirm connection works
  console.log(`⚡ Client Connected: ${socket.id}`);

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
});

/* ============================================================
   12. CHATBOT PROXY
============================================================ */

app.post('/api/chat', async (req, res) => {
  try {
    const response = await axios.post(`${CHATBOT_URL}/chat`, req.body);
    res.json(response.data);
  } catch (err) {
    res.json({ reply: "Sommelier is currently busy." });
  }
});

/* ============================================================
   13. SMART RECOMMENDATION LOGIC
   Features:
   - Min 3 / Max 5 recommendations
   - Prioritizes Chef Pairings
   - Fills Gaps (Missing Drink? Suggest Drink)
   - Fallback to Random Items
============================================================ */

app.post('/api/recommend', async (req, res) => {
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
    const mergedMenu = await prismaMenu.loadMenu();
    if (!mergedMenu) return res.json([]);

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

        // Check subkeys to detect category changes (e.g., "Starters" object)
        Object.keys(node).forEach(key => {
            if (key !== 'items' && typeof node[key] === 'object') {
                const nextType = getCategoryType(key) !== 'MAIN' ? getCategoryType(key) : currentCategoryType;
                walk(node[key], nextType);
            }
        });
      }
    }
    walk(mergedMenu);
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
  let seen = new Set(cartNames); // Don't recommend duplicate items

  // A. CHEF PAIRINGS (Priority 1: Score 100)
  let adminGroups = [];
  try {
      adminGroups = (await prismaMenu.loadRecommendations()) || [];
  } catch {}

  for (const group of adminGroups) {
    if (!group.items) continue;

    // Is this rule relevant? (Does cart contain a trigger item?)
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
                  source: group.description || "Sommelier's Pairing", 
                  score: 100, 
                  type: match.categoryType 
              });
              seen.add(normalizeName(match.name));
          }
      }
    }
  }

  // B. CATEGORY GAPS (Priority 2: Score 60-80)
  // Helper to add ONE random item from a needed category
  function addRandomFromCategory(catType, sourceTitle, score) {
      const options = categorizedMenu[catType];
      if (!options || options.length === 0) return;

      // Shuffle to keep it fresh
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
              return; // Only add one suggestion per category gap
          }
      }
  }

  // Logic: "if no starters... recommend starter till 1 is added"
  if (!hasStarter) addRandomFromCategory('STARTER', "Begin with Antipasti", 80);
  if (!hasDrink) addRandomFromCategory('DRINK', "Pair with a Wine", 70);
  if (!hasDessert) addRandomFromCategory('DESSERT', "Dolce Vita", 60);

  // C. RANDOM FILLERS (Priority 3: Score 10)
  // Fill enough candidates to ensure we hit the Min 3 limit
  let attempts = 0;
  // We fetch a few extras just in case
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
  // Sort by Score (High -> Low)
  candidates.sort((a, b) => b.score - a.score);

  // Apply Limit (Min 3, Max 5)
  const finalSelection = candidates.slice(0, REC_LIMIT).map(c => {
      // Return clean object structure for frontend
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
   14. ORDER SUBMISSION (🔒 FIX #10: Namespaced emits)
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
   15. ADMIN ORDERS / HISTORY MANIPULATION
============================================================ */

app.get('/orders', adminAuth, async (req, res) => {
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

app.get('/history', adminAuth, async (req, res) => {
  try {
    const files = fs.readdirSync(HISTORY_DIR);
    const out = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(HISTORY_DIR, f));
        out.push({ filename: f, ...JSON.parse(raw) });
      } catch {}
    }
    res.json(out);
  } catch { res.json([]); }
});

// MARK AS COMPLETE
app.post('/complete', adminAuth, async (req, res) => {
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
      
      // Notify client order is done
      io.to(room).emit('orderStatusChanged', {
          tableId: tId,
          status: 'ready'
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Move failed' });
  }
});

// MARK AS INCOMPLETE
app.post('/incomplete', adminAuth, async (req, res) => {
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

app.delete('/delete/:type/:file', adminAuth, async (req, res) => {
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

/* ============================================================
   16. TABLE VIEW ROUTE (NGINX COMPATIBLE)
============================================================ */

// 1. Handle Root (https://emenyu.com/AlPescatore/)
app.get('/', (req, res) => {
  console.log('✅ Serving index.html for /');
  res.sendFile(path.join(BASE_DIR, 'index.html'));
});

// 2. Handle Table ID (https://emenyu.com/AlPescatore/Table1)
app.get('/:tableId', (req, res) => {
  const tId = req.params.tableId;
  // Prevent catching system files like socket.io or favicon
  if (tId === 'socket.io' || tId === 'favicon.ico' || tId === 'api') return res.sendStatus(404);
  console.log(`✅ Serving index.html for /${tId}`);
  res.sendFile(path.join(BASE_DIR, 'index.html'));
});

/* ============================================================
   17. STARTUP
============================================================ */

(async () => {
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

  try { await fsPromises.access(DEAL_OF_DAY_FILE); } 
  catch { await fsPromises.writeFile(DEAL_OF_DAY_FILE, '[]'); }


  // Start Chatbot on Port 5005
  spawn(PYTHON_EXE, [CHATBOT_SCRIPT, '5005']);

  // ✅ NETWORK FIX: Listen on 0.0.0.0
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   🇮🇹  AL PESCATORE Server (PRODUCTION READY)      ║
║                                                    ║
║   ✅ Server: http://localhost:${PORT}               ║
║   🔒 Restaurant ID: ${RESTAURANT_ID}                    ║
║   📍 Routes: / and /:tableId                       ║
║   🍷 Merged Menus: Food + Wine + Cocktails         ║
║   🤖 Chatbot: port 5005                            ║
║   👨‍💼 Admin: http://localhost:${PORT}/Admin          ║
║   ✅ Request Logging Enabled                       ║
║   ✅ Cocktail Bug Fixed                            ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);
  });
})();
