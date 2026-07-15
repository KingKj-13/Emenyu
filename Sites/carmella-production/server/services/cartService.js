const path = require('path');
const dotenv = require('dotenv');
const { getCanonicalTableId } = require('../utils/helpers');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RETRY_MS = 30000;
// A cart nobody has touched in 3 hours is treated as abandoned (returns
// empty rather than stale items) — same threshold the platform's order
// service already used for this purpose.
const STALE_CART_MS = 3 * 60 * 60 * 1000;

function loadDatabaseEnv() {
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });
}

function loadPrismaClient() {
  const candidates = [path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'), '@prisma/client'];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

// The live, order-free cart: what a guest currently has open, synced to the
// Admin "Live Carts" view. No order/kitchen/payment concept touches this.
class CartService {
  constructor({ restaurantId, logger = null } = {}) {
    loadDatabaseEnv();
    this.restaurantId = restaurantId;
    this.logger = logger;
    this.enabled = Boolean(process.env.DATABASE_URL);
    this.ready = false;
    this.disabledUntil = 0;
    this.client = null;

    if (this.enabled) {
      const prismaModule = loadPrismaClient();
      if (prismaModule?.PrismaClient) {
        this.client = new prismaModule.PrismaClient();
      } else {
        this.enabled = false;
      }
    }
  }

  get isConfigured() {
    return this.enabled && Boolean(this.client);
  }

  async ensureReady() {
    if (!this.isConfigured) return false;
    if (this.ready) return true;
    if (this.disabledUntil && Date.now() < this.disabledUntil) return false;
    try {
      await this.client.$connect();
      await this.client.$queryRaw`SELECT 1`;
      this.ready = true;
      return true;
    } catch (error) {
      this.markUnavailable(error);
      return false;
    }
  }

  markUnavailable(error) {
    this.ready = false;
    this.disabledUntil = Date.now() + RETRY_MS;
    this.logger?.warn('cart_postgres_unavailable', { error: error?.message || String(error) });
  }

  async withPrisma(operation, fallback) {
    if (!(await this.ensureReady())) return fallback;
    try {
      return await operation(this.client);
    } catch (error) {
      this.markUnavailable(error);
      return fallback;
    }
  }

  async ensureTable(tx, tableId) {
    const cleanId = getCanonicalTableId(tableId);
    return tx.table.upsert({
      where: { restaurantId_tableId: { restaurantId: this.restaurantId, tableId: cleanId } },
      create: { restaurantId: this.restaurantId, tableId: cleanId, displayName: cleanId.replace(/^table/, 'Table ') },
      update: {}
    });
  }

  async loadTableCart(tableId) {
    const cleanId = getCanonicalTableId(tableId);
    return this.withPrisma(async prisma => {
      const state = await prisma.activeCartState.findUnique({
        where: { restaurantId_tableId: { restaurantId: this.restaurantId, tableId: cleanId } }
      });
      if (!state || !Array.isArray(state.cart)) return [];
      if (state.cart.length > 0 && Date.now() - new Date(state.updatedAt).getTime() > STALE_CART_MS) {
        return [];
      }
      return state.cart;
    }, []);
  }

  async saveTableCart(tableId, cart, updatedBy = 'guest') {
    const cleanId = getCanonicalTableId(tableId);
    const nextCart = Array.isArray(cart) ? cart : [];
    return this.withPrisma(async prisma => {
      await prisma.$transaction(async tx => {
        await this.ensureTable(tx, cleanId);
        await tx.activeCartState.upsert({
          where: { restaurantId_tableId: { restaurantId: this.restaurantId, tableId: cleanId } },
          create: { restaurantId: this.restaurantId, tableId: cleanId, cart: nextCart, updatedBy },
          update: { cart: nextCart, updatedBy }
        });
      });
      return true;
    }, false);
  }

  // STEP 5/10 — every currently-open cart, for the Admin "Live Carts" view and
  // for the analytics dashboard's "Active Live Carts" tile. Only carts touched
  // within the stale window count as active.
  async listActiveCarts() {
    return this.withPrisma(async prisma => {
      const rows = await prisma.activeCartState.findMany({
        where: { restaurantId: this.restaurantId },
        orderBy: { updatedAt: 'desc' }
      });
      const cutoff = Date.now() - STALE_CART_MS;
      return rows
        .filter(row => Array.isArray(row.cart) && row.cart.length > 0 && new Date(row.updatedAt).getTime() >= cutoff)
        .map(row => ({
          tableId: row.tableId,
          cart: row.cart,
          updatedAt: row.updatedAt
        }));
    }, []);
  }

  async close() {
    if (this.client) {
      await this.client.$disconnect();
    }
  }
}

module.exports = { CartService };
