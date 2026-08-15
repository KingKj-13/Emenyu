const socketIO = require('socket.io');

const { isAllowedOrigin } = require('../middleware/security');
const { getCanonicalTableId, getTableAliases, normalizeId } = require('../utils/helpers');

class SocketService {
  constructor(config, fileService, logger = null) {
    this.config = config;
    this.fileService = fileService;
    this.logger = logger;
    this.io = null;
    this.tableMemory = {};
    // Listeners notified when menu data mutates, so the response cache drops
    // immediately instead of waiting out its TTL.
    this._dataChangeListeners = [];
  }

  onDataChange(listener) {
    if (typeof listener === 'function') {
      this._dataChangeListeners.push(listener);
    }
  }

  _notifyDataChange(scope) {
    for (const listener of this._dataChangeListeners) {
      try {
        listener(scope);
      } catch (error) {
        this.logger?.warn('data_change_listener_failed', { scope, error: error?.message });
      }
    }
  }

  initialize(server) {
    this.io = socketIO(server, {
      path: `${this.config.publicBasePath}/socket.io`,
      cors: {
        origin: (origin, callback) => {
          const allowed = isAllowedOrigin(origin, this.config);
          if (!allowed) {
            this.logger?.warn('socket_origin_blocked', { origin });
          }
          callback(null, allowed);
        },
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
        credentials: true
      }
    });

    this.io.on('connection', socket => {
      this.logger?.debug('socket_connected', { socketId: socket.id, ip: socket.handshake?.address });
      this.handleConnection(socket);
    });

    return this.io;
  }

  // ─── Room helpers ────────────────────────────────────────────────────────────

  getTableRoom(tableId) {
    return `${this.config.restaurantId}:${normalizeId(tableId)}`;
  }

  getTableRooms(tableId) {
    return getTableAliases(tableId).map(alias => this.getTableRoom(alias));
  }

  getAdminRoom() {
    return `${this.config.restaurantId}:admin`;
  }

  // ─── Table cart state (the single live-cart source of truth) ────────────────

  async getTableState(tableId) {
    const cleanId = getCanonicalTableId(tableId);
    if (!this.tableMemory[cleanId]) {
      const cart = await this.fileService.loadTableCart(tableId);
      this.tableMemory[cleanId] = { cart: Array.isArray(cart) ? cart : [] };
    }
    return this.tableMemory[cleanId];
  }

  async replaceTableCart(tableId, cart, options = {}) {
    const cleanId = getCanonicalTableId(tableId);
    const state = await this.getTableState(tableId);
    state.cart = Array.isArray(cart) ? cart : [];
    await this.fileService.saveTableCart(cleanId, state.cart);

    if (options.emit !== false) {
      await this.emitTableCart(tableId, state.cart);
      this.emitAdminCartsChanged();
    }

    return state;
  }

  // ─── Emit helpers ─────────────────────────────────────────────────────────────

  async emitTableCart(tableId, cart) {
    if (!this.io) return;
    const devices = await this.fileService.listDevices(tableId);
    this.io.to(this.getTableRooms(tableId)).emit('syncCart', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      cart: Array.isArray(cart) ? cart : [],
      devices
    });
  }

  async emitCartToSocket(socket, tableId, cart) {
    const devices = await this.fileService.listDevices(tableId);
    socket.emit('syncCart', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      cart: Array.isArray(cart) ? cart : [],
      devices
    });
  }

  // STEP 5 — tells any open Admin "Live Carts" view to re-fetch the list.
  emitAdminCartsChanged() {
    if (!this.io) return;
    this.io.to(this.getAdminRoom()).emit('liveCartsChanged', { restaurantId: this.config.restaurantId });
  }

  emitMenuUpdated() {
    this._notifyDataChange('menu');
    if (this.io) this.io.emit('menuUpdated');
  }

  emitPromotionsUpdated() {
    if (this.io) this.io.emit('promotionsUpdated');
  }

  // STEP 2 — broadcast to every connected socket (not just the admin room):
  // the theme must flip instantly on the customer menu too, not just Admin.
  emitThemeUpdated() {
    if (this.io) this.io.emit('themeUpdated');
  }

  // ─── Connection handler ───────────────────────────────────────────────────────

  handleConnection(socket) {
    socket.on('joinTable', async payload => {
      await this.handleJoinTable(socket, payload);
    });

    socket.on('joinAdmin', payload => {
      this.handleJoinAdmin(socket, payload);
    });

    socket.on('updateCart', async payload => {
      await this.handleUpdateCart(socket, payload);
    });

    socket.on('disconnect', () => {
      this.logger?.debug('socket_disconnected', { socketId: socket.id });
    });
  }

  isValidRestaurant(restaurantId) {
    return restaurantId === this.config.restaurantId;
  }

  isValidTableId(tableId) {
    const cleanId = normalizeId(tableId);
    return Boolean(cleanId) && cleanId !== 'unknown';
  }

  async handleJoinTable(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.isValidTableId(payload.tableId)) {
      return;
    }

    const cleanId = normalizeId(payload.tableId);
    socket.join(this.getTableRooms(cleanId));
    // A guest may only write to the cart of the table it joined (enforced in
    // handleUpdateCart) — this is what stops one guest tampering with another
    // table's cart, no login involved.
    socket.data.tables = socket.data.tables || new Set();
    socket.data.tables.add(getCanonicalTableId(cleanId));

    // STEP 12 — assign/confirm this device's stable D1/D2/D3 number for the
    // Shared Cart split. A device that's new to this table changes the
    // roster everyone else at the table sees, so that case broadcasts to the
    // whole room; a returning/reconnecting device only needs its own ack.
    if (payload.deviceId) {
      socket.data.deviceId = String(payload.deviceId);
      const { isNew } = await this.fileService.ensureDevice(cleanId, socket.data.deviceId);
      if (isNew) {
        const state = await this.getTableState(cleanId);
        await this.emitTableCart(cleanId, state.cart);
        return;
      }
    }

    const state = await this.getTableState(cleanId);
    await this.emitCartToSocket(socket, cleanId, state.cart);
  }

  // Admin has no login (product decision) — anyone with the URL can open the
  // live-carts view, same as every other admin surface.
  handleJoinAdmin(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }
    socket.join(this.getAdminRoom());
  }

  async handleUpdateCart(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.isValidTableId(payload.tableId)) {
      return;
    }

    const canControl = socket.data.tables?.has(getCanonicalTableId(payload.tableId));
    if (!canControl) {
      this.logger?.warn('socket_event_denied', { event: 'updateCart', socketId: socket.id, tableId: normalizeId(payload.tableId) });
      socket.emit('authError', { event: 'updateCart', message: 'Join this table before updating its cart.' });
      return;
    }

    try {
      await this.replaceTableCart(payload.tableId, payload.cart, { emit: true });
    } catch (error) {
      this.logger?.warn?.('socket_update_cart_failed', { tableId: payload.tableId, error });
    }
  }

  close() {
    if (this.io) {
      this.io.close();
      this.io = null;
    }
  }
}

module.exports = {
  SocketService
};
