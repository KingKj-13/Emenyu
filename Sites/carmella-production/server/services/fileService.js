const fsPromises = require('fs').promises;
const path = require('path');

const { PrismaMenuService } = require('./prismaMenuService');
const { CartService } = require('./cartService');

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
    this.prismaMenu = new PrismaMenuService({ restaurantId: config.restaurantId, logger });
    this.cart = new CartService({ restaurantId: config.restaurantId, logger });
    this.menuMigrationStatus = null;
  }

  async ensureBaseFiles() {
    const directoryList = [
      this.config.directories.food,
      this.config.directories.data,
      this.config.directories.uploads
    ];
    for (const dir of directoryList) {
      await fsPromises.mkdir(dir, { recursive: true });
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
    this._writeSeq = (this._writeSeq || 0) + 1;
    const unique = `${process.pid}.${Date.now()}.${this._writeSeq}.${Math.random().toString(36).slice(2, 8)}`;
    const tempPath = `${filePath}.${unique}.tmp`;
    try {
      await fsPromises.writeFile(tempPath, JSON.stringify(value, null, 2));
      await fsPromises.rename(tempPath, filePath);
    } catch (error) {
      await fsPromises.unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  // Source-level menu memo — a short TTL + single-flight so concurrent
  // requests during a cold cache collapse into one Postgres load.
  async loadMenu() {
    const TTL = 30 * 1000;
    if (this._menuCacheValue && Date.now() - this._menuCacheAt <= TTL) {
      return this._menuCacheValue;
    }
    if (!this._menuCachePromise) {
      this._menuCachePromise = (async () => {
        try {
          const menu = await this.prismaMenu.loadMenu();
          if (menu != null) {
            this._menuCacheValue = menu;
            this._menuCacheAt = Date.now();
          }
          return menu;
        } finally {
          this._menuCachePromise = null;
        }
      })();
    }
    return this._menuCachePromise;
  }

  async saveMenu(menuData) {
    await this.prismaMenu.saveMenu(menuData);
    this._menuCacheValue = null;
  }

  getMenuMigrationStatus() {
    return { postgres: this.prismaMenu.getStatus(), migration: this.menuMigrationStatus };
  }

  async close() {
    await Promise.all([this.prismaMenu.close(), this.cart.close()]);
  }

  async loadTableCart(tableId) {
    return this.cart.loadTableCart(tableId);
  }

  async saveTableCart(tableId, cart, updatedBy) {
    return this.cart.saveTableCart(tableId, cart, updatedBy);
  }

  async listActiveCarts() {
    return this.cart.listActiveCarts();
  }

  async ensureDevice(tableId, deviceId) {
    return this.cart.ensureDevice(tableId, deviceId);
  }

  async listDevices(tableId) {
    return this.cart.listDevices(tableId);
  }

  async resetCart(tableId) {
    return this.cart.resetCart(tableId);
  }

  async clearTable(tableId) {
    return this.cart.clearTable(tableId);
  }

  async clearDevice(tableId, deviceId) {
    return this.cart.clearDevice(tableId, deviceId);
  }

  async markFinished(tableId) {
    return this.cart.markFinished(tableId);
  }
}

module.exports = {
  FileService
};
