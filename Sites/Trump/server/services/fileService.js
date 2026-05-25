const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const { PrismaMenuService } = require('./prismaMenuService');
const { PrismaOrderService, makeOrderFilename } = require('./prismaOrderService');
const { getTableAliases, normalizeId, safeFileName } = require('../utils/helpers');

function cloneFallback(fallback) {
  if (Array.isArray(fallback) || (fallback && typeof fallback === 'object')) {
    return JSON.parse(JSON.stringify(fallback));
  }

  return fallback;
}


class FileService {
  constructor(config, { logger = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.prismaMenu = new PrismaMenuService({
      restaurantId: config.restaurantId,
      logger
    });
    this.prismaOrder = new PrismaOrderService({
      restaurantId: config.restaurantId,
      logger
    });
    this.menuMigrationStatus = null;
    this.orderMigrationStatus = null;
  }

  async ensureBaseFiles() {
    const directoryList = [
      this.config.directories.food,
      this.config.directories.orders,
      this.config.directories.history,
      this.config.directories.tables,
      this.config.directories.data,
      this.config.directories.uploads,
      this.config.directories.frontend
    ];

    for (const dir of directoryList) {
      await fsPromises.mkdir(dir, { recursive: true });
    }

    await this.ensureJsonFile(this.config.files.deals, []);
    await this.ensureJsonFile(this.config.files.chatLogs, []);

    const hasOperationalData = await this.prismaOrder.hasOperationalData();
    if (!hasOperationalData) {
      const [activeOrders, historyOrders, tableCarts] = await Promise.all([
        this.listOrdersJson('orders'),
        this.listOrdersJson('history'),
        this.listTableCartsJson()
      ]);
      this.orderMigrationStatus = await this.prismaOrder.migrateFromJson({ activeOrders, historyOrders, tableCarts });
      if (this.orderMigrationStatus.unavailable) {
        this.logger?.warn('order_postgres_migration_skipped', this.orderMigrationStatus);
      } else {
        this.logger?.info('order_postgres_migration_complete', this.orderMigrationStatus);
      }
    }
  }

  async ensureJsonFile(filePath, fallbackValue) {
    try {
      await fsPromises.access(filePath);
    } catch {
      await this.writeJson(filePath, fallbackValue);
    }
  }

  async readJson(filePath, fallbackValue) {
    try {
      const raw = await fsPromises.readFile(filePath, 'utf-8');
      if (!raw.trim()) {
        return cloneFallback(fallbackValue);
      }

      return JSON.parse(raw);
    } catch {
      return cloneFallback(fallbackValue);
    }
  }

  async writeJson(filePath, value) {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fsPromises.writeFile(tempPath, JSON.stringify(value, null, 2));
    await fsPromises.rename(tempPath, filePath);
  }

  async loadMenu() {
    return this.prismaMenu.loadMenu();
  }

  async saveMenu(menuData) {
    await this.prismaMenu.saveMenu(menuData);
  }

  async loadDeals() {
    return this.readJson(this.config.files.deals, []);
  }

  async saveDeals(deals) {
    await this.writeJson(this.config.files.deals, deals);
  }

  async loadRecommendations() {
    return (await this.prismaMenu.loadRecommendations()) || [];
  }

  async loadPopular() {
    return (await this.prismaMenu.loadPopular()) || [];
  }

  async saveRecommendations(recommendations) {
    await this.prismaMenu.saveRecommendations(recommendations);
  }

  getMenuMigrationStatus() {
    return {
      postgres: this.prismaMenu.getStatus(),
      migration: this.menuMigrationStatus
    };
  }

  getOrderMigrationStatus() {
    return {
      postgres: this.prismaOrder.getStatus(),
      migration: this.orderMigrationStatus
    };
  }

  async close() {
    await Promise.all([
      this.prismaMenu.close(),
      this.prismaOrder.close()
    ]);
  }

  async loadTableCart(tableId) {
    const postgresCart = await this.prismaOrder.loadTableCart(tableId);
    if (Array.isArray(postgresCart)) {
      return postgresCart;
    }

    let emptyCart = [];

    for (const alias of getTableAliases(tableId)) {
      const filePath = path.join(this.config.directories.tables, `${alias}.json`);
      const cart = await this.readJson(filePath, null);
      if (Array.isArray(cart) && cart.length > 0) {
        return cart;
      }
      if (Array.isArray(cart)) {
        emptyCart = cart;
      }
    }

    return emptyCart;
  }

  async saveTableCart(tableId, cart) {
    const cleanId = normalizeId(tableId);
    const filePath = path.join(this.config.directories.tables, `${cleanId}.json`);
    const nextCart = Array.isArray(cart) ? cart : [];
    await this.writeJson(filePath, nextCart);
    await this.prismaOrder.saveTableCart(cleanId, nextCart);
  }

  async loadTableAdminOverrides(tableId) {
    const postgresOverrides = await this.prismaOrder.loadTableAdminOverrides(tableId);
    if (Array.isArray(postgresOverrides)) {
      return postgresOverrides;
    }

    for (const alias of getTableAliases(tableId)) {
      const filePath = path.join(this.config.directories.tables, `${alias}.overrides.json`);
      const overrides = await this.readJson(filePath, null);
      if (Array.isArray(overrides) && overrides.length > 0) {
        return overrides;
      }
    }

    return [];
  }

  async saveTableAdminOverrides(tableId, overrides) {
    const cleanId = normalizeId(tableId);
    const filePath = path.join(this.config.directories.tables, `${cleanId}.overrides.json`);
    const nextOverrides = Array.isArray(overrides) ? overrides : [];
    await this.writeJson(filePath, nextOverrides);
    await this.prismaOrder.saveTableAdminOverrides(cleanId, nextOverrides);
  }

  async getTableActiveOrders(tableId) {
    const postgresItems = await this.prismaOrder.getTableActiveOrders(tableId);
    if (Array.isArray(postgresItems)) {
      return postgresItems;
    }

    const aliases = getTableAliases(tableId);
    let allItems = [];

    try {
      const files = await fsPromises.readdir(this.config.directories.orders);
      const prefixes = aliases.map(alias => `order_table_${alias}_`);
      const matching = files.filter(fileName => prefixes.some(prefix => fileName.startsWith(prefix)));

      for (const fileName of matching) {
        try {
          const raw = await fsPromises.readFile(path.join(this.config.directories.orders, fileName), 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.items)) {
            allItems = allItems.concat(parsed.items);
          }
        } catch {
          // Skip malformed files but keep the rest of the order history available.
        }
      }
    } catch {
      return [];
    }

    return allItems;
  }

  async saveOrder(order, tableId) {
    const cleanId = normalizeId(tableId || order.table_number);
    const filename = makeOrderFilename(cleanId, Date.now());
    const filePath = path.join(this.config.directories.orders, filename);
    await this.writeJson(filePath, order);
    await this.prismaOrder.saveOrder(order, cleanId, filename, 'orders');
    return { cleanId, filename, filePath };
  }

  async listOrders(kind) {
    const postgresOrders = await this.prismaOrder.listOrders(kind);
    if (Array.isArray(postgresOrders)) {
      return postgresOrders;
    }

    const entries = await this.listOrdersJson(kind);
    return entries.map(entry => entry.order);
  }

  async listOrdersJson(kind) {
    const directory = kind === 'history' ? this.config.directories.history : this.config.directories.orders;

    try {
      const files = await fsPromises.readdir(directory);
      const out = [];

      for (const fileName of files) {
        try {
          const raw = await fsPromises.readFile(path.join(directory, fileName), 'utf-8');
          out.push({
            kind,
            filename: fileName,
            order: { filename: fileName, ...JSON.parse(raw) }
          });
        } catch {
          // Ignore malformed files to preserve the rest of the list.
        }
      }

      return out;
    } catch {
      return [];
    }
  }

  async moveOrder(fromKind, toKind, filename, actor = 'system') {
    const safeName = safeFileName(filename);
    const postgresMoved = await this.prismaOrder.moveOrder(fromKind, toKind, safeName, actor);
    const jsonMoved = await this.moveOrderJson(fromKind, toKind, safeName, Boolean(postgresMoved));
    if (!postgresMoved && !jsonMoved) {
      throw new Error('Order not found.');
    }

    return safeName;
  }

  async moveOrderJson(fromKind, toKind, filename, ignoreMissing = false) {
    const safeName = safeFileName(filename);
    const sourceDirectory = fromKind === 'history' ? this.config.directories.history : this.config.directories.orders;
    const targetDirectory = toKind === 'history' ? this.config.directories.history : this.config.directories.orders;
    try {
      await fsPromises.rename(path.join(sourceDirectory, safeName), path.join(targetDirectory, safeName));
      return safeName;
    } catch (error) {
      if (ignoreMissing && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  async deleteOrder(kind, filename, actor = 'system') {
    const safeName = safeFileName(filename);
    const postgresDeleted = await this.prismaOrder.deleteOrder(kind, safeName, actor);
    const jsonDeleted = await this.deleteOrderJson(kind, safeName, Boolean(postgresDeleted));
    if (!postgresDeleted && !jsonDeleted) {
      throw new Error('Order not found.');
    }

    return safeName;
  }

  async deleteOrderJson(kind, filename, ignoreMissing = false) {
    const safeName = safeFileName(filename);
    const directory = kind === 'history' ? this.config.directories.history : this.config.directories.orders;
    try {
      await fsPromises.unlink(path.join(directory, safeName));
      return safeName;
    } catch (error) {
      if (ignoreMissing && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  async archiveTable(tableId, actor = 'system') {
    const postgresCount = await this.prismaOrder.archiveTable(tableId, actor);
    const aliases = getTableAliases(tableId);
    const files = await fsPromises.readdir(this.config.directories.orders);
    const prefixes = aliases.map(alias => `order_table_${alias}_`);
    const matching = files.filter(fileName => prefixes.some(prefix => fileName.startsWith(prefix)));

    for (const fileName of matching) {
      await fsPromises.rename(
        path.join(this.config.directories.orders, fileName),
        path.join(this.config.directories.history, fileName)
      );
    }

    return Math.max(Number(postgresCount) || 0, matching.length);
  }

  async listTableCartsJson() {
    try {
      const files = await fsPromises.readdir(this.config.directories.tables);
      const carts = [];
      for (const fileName of files) {
        if (!fileName.toLowerCase().endsWith('.json')) {
          continue;
        }

        const tableId = path.basename(fileName, '.json');
        const cart = await this.readJson(path.join(this.config.directories.tables, fileName), []);
        carts.push({
          tableId,
          fileName,
          cart: Array.isArray(cart) ? cart : []
        });
      }

      return carts;
    } catch {
      return [];
    }
  }

  async recordWaiterAssignment(tableId, waiterName, socketId, metadata = {}) {
    await this.prismaOrder.recordWaiterAssignment(tableId, waiterName, socketId, metadata);
  }

  async releaseWaiterAssignments(socketId) {
    await this.prismaOrder.releaseWaiterAssignments(socketId);
  }

  async loadChatHistory() {
    const history = await this.readJson(this.config.files.chatLogs, []);
    return this.normalizeChatHistory(history);
  }

  async appendChatLog(entry) {
    const history = await this.loadChatHistory();
    history.push(entry);
    await this.writeJson(this.config.files.chatLogs, history);
    return entry;
  }

  readJsonSync(filePath, fallbackValue) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw.trim()) {
        return cloneFallback(fallbackValue);
      }

      return JSON.parse(raw);
    } catch {
      return cloneFallback(fallbackValue);
    }
  }

  normalizeChatHistory(rawHistory) {
    if (Array.isArray(rawHistory)) {
      return rawHistory.map(entry => this.normalizeChatEntry(entry));
    }

    if (!rawHistory || typeof rawHistory !== 'object') {
      return [];
    }

    const flattened = [];
    Object.entries(rawHistory).forEach(([tableId, entries]) => {
      if (!Array.isArray(entries)) {
        return;
      }

      entries.forEach(entry => {
        flattened.push(this.normalizeChatEntry(entry, tableId));
      });
    });

    return flattened;
  }

  normalizeChatEntry(entry = {}, tableId = 'unknown') {
    const rawTimestamp = String(entry.timestamp || '');
    const isoDate = rawTimestamp.includes('T') ? rawTimestamp.slice(0, 10) : rawTimestamp.split(' ')[0];
    const clockTime = rawTimestamp.includes('T')
      ? new Date(rawTimestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
      : rawTimestamp.split(' ').slice(1).join(' ');

    return {
      tableId: normalizeId(entry.tableId || tableId),
      date: entry.date || isoDate || new Date().toISOString().slice(0, 10),
      timestamp: entry.timestamp && !entry.date ? clockTime || entry.timestamp : entry.timestamp || clockTime || '',
      message: String(entry.message || entry.user || ''),
      reply: String(entry.reply || entry.bot || ''),
      is_special: Boolean(entry.is_special)
    };
  }
}

module.exports = {
  FileService
};
