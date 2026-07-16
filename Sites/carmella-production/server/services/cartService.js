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
  //
  // STEP 12 — each cart is additionally broken down per-device (see
  // TableDevice / ensureDevice below) so Admin can see "Table 6 -> D1/D2/D3"
  // exactly the way the customer-facing Shared Cart does, rather than one
  // undifferentiated item list.
  async listActiveCarts() {
    return this.withPrisma(async prisma => {
      const rows = await prisma.activeCartState.findMany({
        where: { restaurantId: this.restaurantId },
        orderBy: { updatedAt: 'desc' }
      });
      const cutoff = Date.now() - STALE_CART_MS;
      const active = rows.filter(row => Array.isArray(row.cart) && row.cart.length > 0 && new Date(row.updatedAt).getTime() >= cutoff);
      if (active.length === 0) return [];

      const tableIds = active.map(row => row.tableId);
      const [devices, tables] = await Promise.all([
        prisma.tableDevice.findMany({
          where: { restaurantId: this.restaurantId, tableId: { in: tableIds } },
          orderBy: { deviceNumber: 'asc' }
        }),
        prisma.table.findMany({
          where: { restaurantId: this.restaurantId, tableId: { in: tableIds } },
          select: { tableId: true, status: true }
        })
      ]);
      const devicesByTable = new Map();
      for (const d of devices) {
        if (!devicesByTable.has(d.tableId)) devicesByTable.set(d.tableId, []);
        devicesByTable.get(d.tableId).push(d);
      }
      const statusByTable = new Map(tables.map(t => [t.tableId, t.status]));

      return active.map(row => {
        const cart = Array.isArray(row.cart) ? row.cart : [];
        const roster = devicesByTable.get(row.tableId) || [];
        const deviceBreakdown = roster.map(d => {
          const items = cart.filter(item => item.deviceId === d.deviceId);
          return {
            deviceId: d.deviceId,
            deviceNumber: d.deviceNumber,
            items,
            subtotal: items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0)
          };
        });
        // Items with no deviceId (older carts written before this feature, or
        // a caller that never joined via a device) fall into their own
        // "unassigned" bucket rather than being silently dropped from view.
        const unassigned = cart.filter(item => !roster.some(d => d.deviceId === item.deviceId));
        if (unassigned.length > 0) {
          deviceBreakdown.push({
            deviceId: null,
            deviceNumber: null,
            items: unassigned,
            subtotal: unassigned.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0)
          });
        }

        return {
          tableId: row.tableId,
          cart,
          updatedAt: row.updatedAt,
          status: statusByTable.get(row.tableId) || 'active',
          devices: deviceBreakdown,
          tableTotal: cart.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0)
        };
      });
    }, []);
  }

  // Assigns a stable, table-scoped sequence number to a device on its first
  // join ("Device 1" = whichever device joined first), and just touches
  // lastSeenAt on every later join/reconnect. The number never changes for
  // the life of a seating (see resetCart, which is the only thing that clears
  // it) -- every guest at the table sees the same D1/D2/D3 labels regardless
  // of who's currently looking at the cart.
  //
  // This is a check-then-act sequence (look up -> compute next number ->
  // insert), so it MUST be serialized against concurrent calls for the same
  // table, or two devices joining at nearly the same moment can both read
  // "no existing row" / the same current max before either commits, and end
  // up with duplicate or skipped device numbers. socket.io's own client
  // buffers an emit made before the connection is established and then
  // re-fires it again on 'connect' (see CartContext.tsx's joinTable effect),
  // so a single page load routinely sends two near-simultaneous joins --
  // this isn't a rare edge case, it happens on nearly every fresh session.
  // `pg_advisory_xact_lock` keyed by (restaurantId, tableId) serializes only
  // the (rare, cheap) device-registration path, not cart reads/writes.
  async ensureDevice(tableId, deviceId) {
    const cleanId = getCanonicalTableId(tableId);
    const lockKey = `${this.restaurantId}:${cleanId}`;
    return this.withPrisma(async prisma => {
      return prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', lockKey);

        const existing = await tx.tableDevice.findUnique({
          where: { restaurantId_tableId_deviceId: { restaurantId: this.restaurantId, tableId: cleanId, deviceId } }
        });
        if (existing) {
          const touched = await tx.tableDevice.update({ where: { id: existing.id }, data: {} });
          return { deviceId, deviceNumber: touched.deviceNumber, isNew: false };
        }
        const maxRow = await tx.tableDevice.aggregate({
          where: { restaurantId: this.restaurantId, tableId: cleanId },
          _max: { deviceNumber: true }
        });
        const deviceNumber = (maxRow._max.deviceNumber || 0) + 1;
        await tx.tableDevice.create({
          data: { restaurantId: this.restaurantId, tableId: cleanId, deviceId, deviceNumber }
        });
        return { deviceId, deviceNumber, isNew: true };
      });
    }, { deviceId, deviceNumber: 1, isNew: false });
  }

  async listDevices(tableId) {
    const cleanId = getCanonicalTableId(tableId);
    return this.withPrisma(async prisma => {
      const rows = await prisma.tableDevice.findMany({
        where: { restaurantId: this.restaurantId, tableId: cleanId },
        orderBy: { deviceNumber: 'asc' }
      });
      return rows.map(r => ({ deviceId: r.deviceId, deviceNumber: r.deviceNumber }));
    }, []);
  }

  // "This table has paid and left" -- full teardown. The NEXT party to sit
  // here starts a completely fresh device roster (D1 again from scratch),
  // not a continuation of the last seating's numbering.
  async resetCart(tableId) {
    const cleanId = getCanonicalTableId(tableId);
    return this.withPrisma(async prisma => {
      await prisma.$transaction([
        prisma.activeCartState.deleteMany({ where: { restaurantId: this.restaurantId, tableId: cleanId } }),
        prisma.tableDevice.deleteMany({ where: { restaurantId: this.restaurantId, tableId: cleanId } }),
        prisma.table.updateMany({ where: { restaurantId: this.restaurantId, tableId: cleanId }, data: { status: 'active' } })
      ]);
      return true;
    }, false);
  }

  // Empties everyone's items but the SAME seating continues -- device numbers
  // (D1/D2/D3) stay exactly as they were, unlike resetCart.
  async clearTable(tableId) {
    return this.saveTableCart(tableId, [], 'admin');
  }

  // Removes only one device's items, leaving every other device's cart (and
  // the whole roster) untouched.
  async clearDevice(tableId, deviceId) {
    const cleanId = getCanonicalTableId(tableId);
    return this.withPrisma(async prisma => {
      const state = await prisma.activeCartState.findUnique({
        where: { restaurantId_tableId: { restaurantId: this.restaurantId, tableId: cleanId } }
      });
      if (!state || !Array.isArray(state.cart)) return false;
      const nextCart = state.cart.filter(item => item.deviceId !== deviceId);
      await this.saveTableCart(cleanId, nextCart, 'admin');
      return true;
    }, false);
  }

  // Display-only marker so staff can see which tables have been billed but
  // not yet reset for the next party -- Reset Cart is what actually clears it.
  async markFinished(tableId) {
    const cleanId = getCanonicalTableId(tableId);
    return this.withPrisma(async prisma => {
      await prisma.table.updateMany({
        where: { restaurantId: this.restaurantId, tableId: cleanId },
        data: { status: 'finished' }
      });
      return true;
    }, false);
  }

  async close() {
    if (this.client) {
      await this.client.$disconnect();
    }
  }
}

module.exports = { CartService };
