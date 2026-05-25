const fsPromises = require('fs').promises;
const path = require('path');

const dotenv = require('dotenv');

const { getCanonicalTableId, getTableAliases, normalizeId, tableIdFromFilename } = require('../utils/helpers');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PRISMA_RETRY_MS = 30000;
const DEFAULT_RESTAURANT_ID = 'trump';
const STATUS_BY_KIND = {
  orders: 'active',
  history: 'history'
};

const ITEM_BASE_KEYS = new Set([
  'name',
  'price',
  'qty',
  'quantity',
  'note',
  'img',
  'description'
]);

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function loadDatabaseEnv() {
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });
}

function loadPrismaClient() {
  const candidates = [
    path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'),
    '@prisma/client'
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next resolution path.
    }
  }

  return null;
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error)
  };
}

function toDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function getQuantity(item = {}) {
  const quantity = Number(item.quantity ?? item.qty ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function calculateTotals(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = Number(order.totals?.subtotal);
  const computedSubtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * getQuantity(item), 0);

  return {
    subtotal: Number.isFinite(subtotal) ? subtotal : computedSubtotal,
    vat: Number(order.totals?.vat) || 0,
    service: Number(order.totals?.service) || 0,
    tip: Number(order.totals?.tip) || 0,
    total: Number(order.totals?.total) || (Number.isFinite(subtotal) ? subtotal : computedSubtotal)
  };
}

function itemMetadata(item = {}) {
  const metadata = {};
  Object.entries(item).forEach(([key, value]) => {
    if (!ITEM_BASE_KEYS.has(key)) {
      metadata[key] = value;
    }
  });

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function orderItemsToCreate(items = []) {
  return items
    .filter(item => item && item.name)
    .map((item, index) => ({
      name: String(item.name || ''),
      price: Number(item.price) || 0,
      quantity: getQuantity(item),
      note: String(item.note || ''),
      imagePath: String(item.img || item.imagePath || ''),
      description: String(item.description || ''),
      metadata: itemMetadata(item),
      sortOrder: index
    }));
}

function dbItemToJson(item) {
  return {
    ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
    name: item.name,
    price: Number(item.price) || 0,
    qty: Number(item.quantity) || 1,
    note: item.note || '',
    img: item.imagePath || '',
    description: item.description || ''
  };
}

function orderKindFromStatus(status) {
  return status === 'history' ? 'history' : 'orders';
}

function makeOrderFilename(tableId, timestamp = Date.now()) {
  return `order_table_${normalizeId(tableId)}_${timestamp}.json`;
}

function orderToDbData(order = {}, filename, kind, restaurantId) {
  const rawTable = order.table_number || order.tableId || tableIdFromFilename(filename) || 'unknown';
  const tableId = getCanonicalTableId(rawTable);
  const timestamp = toDate(order.timestamp, new Date());
  const totals = calculateTotals(order);

  return {
    restaurantId,
    filename,
    tableId,
    status: STATUS_BY_KIND[kind] || order.status || 'active',
    waiterName: String(order.waiterName || order.waiter || ''),
    notes: String(order.notes || ''),
    subtotal: totals.subtotal,
    vat: totals.vat,
    service: totals.service,
    tip: totals.tip,
    total: totals.total,
    timestamp,
    sourceKind: kind,
    raw: {
      ...order,
      filename
    }
  };
}

function dbOrderToJson(order) {
  const raw = order.raw && typeof order.raw === 'object' ? order.raw : {};
  const items = Array.isArray(raw.items) && raw.items.length > 0
    ? raw.items
    : (order.items || []).sort((left, right) => left.sortOrder - right.sortOrder).map(dbItemToJson);

  return {
    ...raw,
    filename: order.filename,
    table_number: raw.table_number || order.tableId,
    waiterName: raw.waiterName || order.waiterName || undefined,
    notes: raw.notes || order.notes || undefined,
    items,
    timestamp: raw.timestamp || order.timestamp.toISOString(),
    totals: raw.totals || {
      subtotal: order.subtotal,
      vat: order.vat,
      service: order.service,
      tip: order.tip,
      total: order.total
    },
    status: order.status === 'history' ? 'complete' : (order.status || raw.status || 'pending')
  };
}

class PrismaOrderService {
  constructor({ restaurantId = DEFAULT_RESTAURANT_ID, logger = null } = {}) {
    loadDatabaseEnv();

    this.restaurantId = restaurantId || DEFAULT_RESTAURANT_ID;
    this.logger = logger;
    this.enabled = parseBoolean(process.env.TRUMP_ORDER_POSTGRES_ENABLED, true) && Boolean(process.env.DATABASE_URL);
    this.ready = false;
    this.disabledUntil = 0;
    this.lastError = null;
    this.lastMigration = null;
    this.client = null;

    if (this.enabled) {
      const prismaModule = loadPrismaClient();
      if (prismaModule?.PrismaClient) {
        this.client = new prismaModule.PrismaClient();
      } else {
        this.enabled = false;
        this.lastError = 'Prisma client is not available';
      }
    }
  }

  get isConfigured() {
    return this.enabled && Boolean(this.client);
  }

  async ensureReady() {
    if (!this.isConfigured) {
      return false;
    }

    if (this.ready) {
      return true;
    }

    if (this.disabledUntil && Date.now() < this.disabledUntil) {
      return false;
    }

    try {
      await this.client.$connect();
      await this.client.$queryRaw`SELECT 1`;
      this.ready = true;
      this.lastError = null;
      return true;
    } catch (error) {
      this.markUnavailable('order_postgres_unavailable', error);
      return false;
    }
  }

  markUnavailable(event, error) {
    this.ready = false;
    this.disabledUntil = Date.now() + PRISMA_RETRY_MS;
    this.lastError = error?.message || String(error);
    this.logger?.warn(event, { error: serializeError(error) });
  }

  async withPrisma(event, operation, fallback = null) {
    if (!(await this.ensureReady())) {
      return fallback;
    }

    try {
      return await operation(this.client);
    } catch (error) {
      this.markUnavailable(event, error);
      return fallback;
    }
  }

  async ensureTable(tx, tableId, metadata = {}) {
    const cleanId = getCanonicalTableId(tableId);
    return tx.table.upsert({
      where: {
        restaurantId_tableId: {
          restaurantId: this.restaurantId,
          tableId: cleanId
        }
      },
      create: {
        restaurantId: this.restaurantId,
        tableId: cleanId,
        displayName: cleanId.replace(/^table/, 'Table '),
        metadata
      },
      update: {
        status: 'active',
        metadata
      }
    });
  }

  async hasOperationalData() {
    return this.withPrisma(
      'order_postgres_count_failed',
      async prisma => {
        const [orders, carts] = await Promise.all([
          prisma.order.count({ where: { restaurantId: this.restaurantId } }),
          prisma.activeCartState.count({ where: { restaurantId: this.restaurantId } })
        ]);
        return orders > 0 || carts > 0;
      },
      false
    );
  }

  async saveOrder(order, tableId, filename, kind = 'orders') {
    const targetFilename = filename || makeOrderFilename(tableId);
    const data = orderToDbData(order, targetFilename, kind, this.restaurantId);
    return this.withPrisma(
      'order_postgres_save_failed',
      async prisma => {
        await prisma.$transaction(async tx => {
          await this.ensureTable(tx, data.tableId);
          const where = {
            restaurantId_sourceKind_filename: {
              restaurantId: this.restaurantId,
              sourceKind: kind,
              filename: targetFilename
            }
          };
          const existing = await tx.order.findUnique({ where });
          const saved = await tx.order.upsert({
            where,
            create: {
              ...data,
              items: {
                create: orderItemsToCreate(order.items)
              },
              statusHistory: {
                create: {
                  toStatus: data.status,
                  actor: 'system',
                  reason: 'order_saved'
                }
              }
            },
            update: data
          });

          if (existing) {
            await tx.orderItem.deleteMany({ where: { orderId: saved.id } });
            const nextItems = orderItemsToCreate(order.items).map(item => ({ ...item, orderId: saved.id }));
            if (nextItems.length > 0) {
              await tx.orderItem.createMany({ data: nextItems });
            }
          }
        });
        return targetFilename;
      },
      null
    );
  }

  async listOrders(kind) {
    const status = STATUS_BY_KIND[kind] || 'active';
    return this.withPrisma(
      'order_postgres_list_failed',
      async prisma => {
        const orders = await prisma.order.findMany({
          where: {
            restaurantId: this.restaurantId,
            status
          },
          include: {
            items: true
          },
          orderBy: {
            timestamp: 'desc'
          }
        });

        return orders.map(dbOrderToJson);
      },
      null
    );
  }

  async getTableActiveOrders(tableId) {
    const aliases = getTableAliases(tableId).map(alias => getCanonicalTableId(alias));
    return this.withPrisma(
      'order_postgres_table_history_failed',
      async prisma => {
        const orders = await prisma.order.findMany({
          where: {
            restaurantId: this.restaurantId,
            tableId: { in: aliases },
            status: 'active'
          },
          include: { items: true },
          orderBy: { timestamp: 'asc' }
        });

        return orders.flatMap(order => dbOrderToJson(order).items || []);
      },
      null
    );
  }

  async moveOrder(fromKind, toKind, filename, actor = 'system') {
    const fromStatus = STATUS_BY_KIND[fromKind] || fromKind;
    const toStatus = STATUS_BY_KIND[toKind] || toKind;
    return this.withPrisma(
      'order_postgres_move_failed',
      async prisma => {
        const order = await prisma.order.findFirst({
          where: {
            restaurantId: this.restaurantId,
            sourceKind: fromKind,
            filename,
            status: fromStatus
          }
        });
        if (!order) {
          return null;
        }

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: toStatus,
            sourceKind: toKind,
            raw: {
              ...(order.raw && typeof order.raw === 'object' ? order.raw : {}),
              filename,
              status: toStatus === 'history' ? 'complete' : 'pending'
            },
            statusHistory: {
              create: {
                fromStatus,
                toStatus,
                actor,
                reason: 'order_moved'
              }
            }
          }
        });

        return filename;
      },
      null
    );
  }

  async deleteOrder(kind, filename, actor = 'system') {
    const status = STATUS_BY_KIND[kind] || kind;
    return this.withPrisma(
      'order_postgres_delete_failed',
      async prisma => {
        const order = await prisma.order.findFirst({
          where: {
            restaurantId: this.restaurantId,
            sourceKind: kind,
            filename,
            status
          }
        });
        if (!order) {
          return null;
        }

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'deleted',
            sourceKind: 'deleted',
            statusHistory: {
              create: {
                fromStatus: status,
                toStatus: 'deleted',
                actor,
                reason: 'order_deleted'
              }
            }
          }
        });

        return filename;
      },
      null
    );
  }

  async archiveTable(tableId, actor = 'system') {
    const aliases = getTableAliases(tableId).map(alias => getCanonicalTableId(alias));
    return this.withPrisma(
      'order_postgres_archive_table_failed',
      async prisma => {
        const orders = await prisma.order.findMany({
          where: {
            restaurantId: this.restaurantId,
            tableId: { in: aliases },
            status: 'active'
          },
          select: { id: true, filename: true, status: true }
        });

        await prisma.$transaction(
          orders.map(order => prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'history',
              sourceKind: 'history',
              statusHistory: {
                create: {
                  fromStatus: order.status,
                  toStatus: 'history',
                  actor,
                  reason: 'table_archived'
                }
              }
            }
          }))
        );

        return orders.length;
      },
      null
    );
  }

  async loadTableCart(tableId) {
    const cleanId = getCanonicalTableId(tableId);
    return this.withPrisma(
      'order_postgres_cart_load_failed',
      async prisma => {
        const state = await prisma.activeCartState.findUnique({
          where: {
            restaurantId_tableId: {
              restaurantId: this.restaurantId,
              tableId: cleanId
            }
          }
        });

        return state && Array.isArray(state.cart) ? state.cart : null;
      },
      null
    );
  }

  async saveTableCart(tableId, cart, updatedBy = 'system') {
    const cleanId = getCanonicalTableId(tableId);
    const nextCart = Array.isArray(cart) ? cart : [];
    return this.withPrisma(
      'order_postgres_cart_save_failed',
      async prisma => {
        await prisma.$transaction(async tx => {
          await this.ensureTable(tx, cleanId);
          await tx.activeCartState.upsert({
            where: {
              restaurantId_tableId: {
                restaurantId: this.restaurantId,
                tableId: cleanId
              }
            },
            create: {
              restaurantId: this.restaurantId,
              tableId: cleanId,
              cart: nextCart,
              updatedBy
            },
            update: {
              cart: nextCart,
              updatedBy
            }
          });
        });
        return nextCart;
      },
      null
    );
  }

  async loadTableAdminOverrides(tableId) {
    const cleanId = getCanonicalTableId(tableId);
    return this.withPrisma(
      'order_postgres_overrides_load_failed',
      async prisma => {
        const state = await prisma.activeCartState.findUnique({
          where: {
            restaurantId_tableId: {
              restaurantId: this.restaurantId,
              tableId: cleanId
            }
          }
        });

        return state && Array.isArray(state.adminOverrides) ? state.adminOverrides : null;
      },
      null
    );
  }

  async saveTableAdminOverrides(tableId, overrides, updatedBy = 'system') {
    const cleanId = getCanonicalTableId(tableId);
    const nextOverrides = Array.isArray(overrides) ? overrides : [];
    return this.withPrisma(
      'order_postgres_overrides_save_failed',
      async prisma => {
        await prisma.$transaction(async tx => {
          await this.ensureTable(tx, cleanId);
          await tx.activeCartState.upsert({
            where: {
              restaurantId_tableId: {
                restaurantId: this.restaurantId,
                tableId: cleanId
              }
            },
            create: {
              restaurantId: this.restaurantId,
              tableId: cleanId,
              cart: [],
              adminOverrides: nextOverrides,
              updatedBy
            },
            update: {
              adminOverrides: nextOverrides,
              updatedBy
            }
          });
        });
        return nextOverrides;
      },
      null
    );
  }

  async recordWaiterAssignment(tableId, waiterName, socketId = '', metadata = {}) {
    const cleanId = getCanonicalTableId(tableId || 'waiter');
    return this.withPrisma(
      'order_postgres_waiter_assignment_failed',
      async prisma => {
        await prisma.$transaction(async tx => {
          await this.ensureTable(tx, cleanId);
          await tx.waiterAssignment.create({
            data: {
              restaurantId: this.restaurantId,
              tableId: cleanId,
              waiterName: String(waiterName || 'Waiter'),
              socketId: String(socketId || ''),
              metadata
            }
          });
        });
        return true;
      },
      false
    );
  }

  async releaseWaiterAssignments(socketId) {
    if (!socketId) {
      return false;
    }

    return this.withPrisma(
      'order_postgres_waiter_release_failed',
      async prisma => {
        await prisma.waiterAssignment.updateMany({
          where: {
            restaurantId: this.restaurantId,
            socketId,
            status: 'active'
          },
          data: {
            status: 'released',
            releasedAt: new Date()
          }
        });
        return true;
      },
      false
    );
  }

  async migrateFromJson({ activeOrders = [], historyOrders = [], tableCarts = [] } = {}) {
    const summary = {
      activeOrders: 0,
      historyOrders: 0,
      tableCarts: 0,
      unavailable: false
    };

    if (!(await this.ensureReady())) {
      summary.unavailable = true;
      this.lastMigration = summary;
      return summary;
    }

    const migrated = await this.withPrisma(
      'order_postgres_migration_failed',
      async prisma => {
        await prisma.$transaction(async tx => {
          for (const entry of [...activeOrders, ...historyOrders]) {
            const kind = entry.kind || 'orders';
            const data = orderToDbData(entry.order, entry.filename, kind, this.restaurantId);
            await this.ensureTable(tx, data.tableId, { migratedFrom: entry.filename });
            const where = {
              restaurantId_sourceKind_filename: {
                restaurantId: this.restaurantId,
                sourceKind: kind,
                filename: entry.filename
              }
            };
            const existing = await tx.order.findUnique({ where });
            const saved = await tx.order.upsert({
              where,
              create: {
                ...data,
                items: { create: orderItemsToCreate(entry.order.items) },
                statusHistory: {
                  create: {
                    toStatus: data.status,
                    actor: 'migration',
                    reason: `json_${kind}`
                  }
                }
              },
              update: data
            });

            if (existing) {
              await tx.orderItem.deleteMany({ where: { orderId: saved.id } });
              const nextItems = orderItemsToCreate(entry.order.items).map(item => ({ ...item, orderId: saved.id }));
              if (nextItems.length > 0) {
                await tx.orderItem.createMany({ data: nextItems });
              }
            }

            if (kind === 'history') summary.historyOrders += 1;
            else summary.activeOrders += 1;
          }

          for (const entry of tableCarts) {
            const cleanId = getCanonicalTableId(entry.tableId);
            await this.ensureTable(tx, cleanId, { migratedFrom: entry.fileName });
            await tx.activeCartState.upsert({
              where: {
                restaurantId_tableId: {
                  restaurantId: this.restaurantId,
                  tableId: cleanId
                }
              },
              create: {
                restaurantId: this.restaurantId,
                tableId: cleanId,
                cart: Array.isArray(entry.cart) ? entry.cart : [],
                updatedBy: 'migration'
              },
              update: {
                cart: Array.isArray(entry.cart) ? entry.cart : [],
                updatedBy: 'migration'
              }
            });
            summary.tableCarts += 1;
          }
        }, { timeout: 20000 });

        return summary;
      },
      { ...summary, unavailable: true }
    );

    this.lastMigration = migrated;
    return migrated;
  }

  async getCounts() {
    return this.withPrisma(
      'order_postgres_counts_failed',
      async prisma => {
        const [activeOrders, historyOrders, deletedOrders, tableCarts, waiterAssignments] = await Promise.all([
          prisma.order.count({ where: { restaurantId: this.restaurantId, status: 'active' } }),
          prisma.order.count({ where: { restaurantId: this.restaurantId, status: 'history' } }),
          prisma.order.count({ where: { restaurantId: this.restaurantId, status: 'deleted' } }),
          prisma.activeCartState.count({ where: { restaurantId: this.restaurantId } }),
          prisma.waiterAssignment.count({ where: { restaurantId: this.restaurantId } })
        ]);

        return { activeOrders, historyOrders, deletedOrders, tableCarts, waiterAssignments };
      },
      null
    );
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      ready: this.ready,
      fallbackEnabled: true,
      lastError: this.lastError,
      lastMigration: this.lastMigration
    };
  }

  async close() {
    if (this.client) {
      await this.client.$disconnect();
    }
  }
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const raw = await fsPromises.readFile(filePath, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

module.exports = {
  PrismaOrderService,
  dbOrderToJson,
  makeOrderFilename,
  readJsonFile
};
