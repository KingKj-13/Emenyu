const socketIO = require('socket.io');

const { isAllowedOrigin } = require('../middleware/security');
const { getCanonicalTableId, getTableAliases, normalizeId } = require('../utils/helpers');
const pushService = require('./pushService');

class SocketService {
  constructor(config, fileService, logger = null) {
    this.config = config;
    this.fileService = fileService;
    this.logger = logger;
    this.io = null;
    this.tableMemory = {};
    this.connectedWaiters = {};
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
      this.logger?.debug('socket_connected', {
        socketId: socket.id,
        ip: socket.handshake?.address
      });
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

  getWaiterRoom() {
    return `${this.config.restaurantId}:waiters`;
  }

  getAdminRoom() {
    return `${this.config.restaurantId}:admin`;
  }

  getKitchenRoom() {
    return `${this.config.restaurantId}:kitchen`;
  }

  // ─── Table state management ───────────────────────────────────────────────────

  async getTableState(tableId) {
    const cleanId = getCanonicalTableId(tableId);

    if (!this.tableMemory[cleanId]) {
      const [cart, adminOverrides] = await Promise.all([
        this.fileService.loadTableCart(tableId),
        this.fileService.loadTableAdminOverrides(tableId)
      ]);
      this.tableMemory[cleanId] = {
        cart: Array.isArray(cart) ? cart : [],
        adminOverrides: Array.isArray(adminOverrides) ? adminOverrides : []
      };
    }

    return this.tableMemory[cleanId];
  }

  async replaceTableCart(tableId, cart, options = {}) {
    const cleanId = getCanonicalTableId(tableId);
    const state = await this.getTableState(tableId);
    state.cart = Array.isArray(cart) ? cart : [];
    await this.fileService.saveTableCart(cleanId, state.cart);

    if (options.emit !== false) {
      this.emitTableCart(tableId, state.cart);
    }

    return state;
  }

  async setTableAdminOverrides(tableId, overrides, options = {}) {
    const cleanId = getCanonicalTableId(tableId);
    const state = await this.getTableState(tableId);
    state.adminOverrides = Array.isArray(overrides) ? overrides : [];

    // Persist overrides so they survive server restarts.
    await this.fileService.saveTableAdminOverrides(cleanId, state.adminOverrides);

    if (options.emit !== false) {
      this.emitAdminOverride(tableId, state.adminOverrides);
    }

    return state;
  }

  async resetTableState(tableId, options = {}) {
    const cleanId = getCanonicalTableId(tableId);
    const state = await this.getTableState(tableId);
    const preserveAdminOverrides = options.preserveAdminOverrides !== false;

    state.cart = [];
    state.adminOverrides = preserveAdminOverrides ? state.adminOverrides : [];

    await this.fileService.saveTableCart(cleanId, []);

    if (!preserveAdminOverrides) {
      await this.fileService.saveTableAdminOverrides(cleanId, []);
    }

    if (options.emit !== false) {
      this.emitTableCart(tableId, []);
      if (!preserveAdminOverrides) {
        this.emitAdminOverride(tableId, []);
      }
    }

    return state;
  }

  // ─── Emit helpers ─────────────────────────────────────────────────────────────

  emitTableCart(tableId, cart) {
    if (!this.io) {
      return;
    }

    this.io.to(this.getTableRooms(tableId)).emit('syncCart', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      cart: Array.isArray(cart) ? cart : []
    });
  }

  emitCartToSocket(socket, tableId, cart) {
    socket.emit('syncCart', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      cart: Array.isArray(cart) ? cart : []
    });
  }

  async emitTableHistory(tableId) {
    if (!this.io) {
      return;
    }

    const cleanId = getCanonicalTableId(tableId);
    const history = await this.fileService.getTableActiveOrders(cleanId);
    this.io.to(this.getTableRooms(tableId)).emit('syncHistory', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      history
    });
  }

  async emitHistoryToSocket(socket, tableId) {
    const cleanId = getCanonicalTableId(tableId);
    const history = await this.fileService.getTableActiveOrders(cleanId);
    socket.emit('syncHistory', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      history
    });
  }

  emitAdminOverride(tableId, overrides) {
    if (!this.io) {
      return;
    }

    this.io.to(this.getTableRooms(tableId)).emit('adminOverrideUpdate', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      overrides: Array.isArray(overrides) ? overrides : []
    });
  }

  emitAdminOverrideToSocket(socket, tableId, overrides) {
    socket.emit('adminOverrideUpdate', {
      restaurantId: this.config.restaurantId,
      tableId: normalizeId(tableId),
      overrides: Array.isArray(overrides) ? overrides : []
    });
  }

  emitMenuUpdated() {
    if (this.io) {
      this.io.emit('menuUpdated');
    }
  }

  emitDealUpdated() {
    if (this.io) {
      this.io.emit('dealUpdated');
    }
  }

  emitRecommendationUpdated() {
    if (this.io) {
      this.io.emit('recommendationUpdated');
    }
  }

  emitOrderPlaced(order) {
    if (this.io) {
      this.io
        .to(this.getAdminRoom())
        .to(this.getWaiterRoom())
        .to(this.getKitchenRoom())
        .emit('orderPlaced', {
          restaurantId: this.config.restaurantId,
          order
        });
    }
    const tableId = order?.table_number || order?.tableId || '';
    if (tableId) {
      pushService.notifyNewOrder(this.config.restaurantId, tableId).catch(() => {});
    }
  }

  emitKitchenStatusUpdate(orderId, tableId, kitchenStatus, order = null) {
    if (!this.io) return;
    const payload = {
      restaurantId: this.config.restaurantId,
      orderId,
      tableId: normalizeId(tableId),
      kitchenStatus,
      order
    };
    this.io
      .to(this.getAdminRoom())
      .to(this.getWaiterRoom())
      .to(this.getKitchenRoom())
      .to(this.getTableRooms(tableId))
      .emit('kitchenStatusUpdate', payload);
    if (kitchenStatus === 'ready') {
      pushService.notifyOrderReady(this.config.restaurantId, tableId).catch(() => {});
    }
  }

  emitOrderUpdated() {
    if (this.io) {
      // Staff rooms only — customers track state via syncHistory/syncCart.
      this.io.to(this.getAdminRoom()).to(this.getWaiterRoom()).emit('orderUpdated', {
        restaurantId: this.config.restaurantId
      });
    }
  }

  emitNewChatLog(log) {
    if (this.io) {
      this.io.emit('newChatLog', log);
    }
  }

  // ─── Connection handler ───────────────────────────────────────────────────────

  async handleConnection(socket) {
    socket.on('joinTable', async payload => {
      await this.handleJoinTable(socket, payload);
    });

    socket.on('joinAsWaiter', async payload => {
      await this.handleJoinAsWaiter(socket, payload);
    });

    socket.on('joinAdmin', payload => {
      this.handleJoinAdmin(socket, payload);
    });

    socket.on('joinKitchen', payload => {
      this.handleJoinKitchen(socket, payload);
    });

    socket.on('callWaiter', payload => {
      this.handleCallWaiter(payload);
    });

    socket.on('waiterResponding', async payload => {
      await this.handleWaiterResponding(socket, payload);
    });

    socket.on('fetchHistory', async payload => {
      await this.handleFetchHistory(socket, payload);
    });

    socket.on('updateCart', async payload => {
      await this.handleUpdateCart(payload);
    });

    socket.on('updateAdminOverrides', async payload => {
      await this.handleUpdateAdminOverrides(payload);
    });

    socket.on('adminResetTable', async payload => {
      await this.handleAdminResetTable(socket, payload);
    });

    socket.on('disconnect', async () => {
      await this.handleDisconnect(socket);
    });
  }

  // ─── Payload validation ───────────────────────────────────────────────────────

  isValidRestaurant(restaurantId) {
    return restaurantId === this.config.restaurantId;
  }

  isValidTableId(tableId) {
    const cleanId = normalizeId(tableId);
    return Boolean(cleanId) && cleanId !== 'unknown';
  }

  // ─── Event handlers ───────────────────────────────────────────────────────────

  async handleJoinTable(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      this.logger?.warn('socket_join_table_invalid_id', { tableId: payload.tableId, socketId: socket.id });
      return;
    }

    const cleanId = normalizeId(payload.tableId);
    socket.join(this.getTableRooms(cleanId));
    const state = await this.getTableState(cleanId);
    this.emitCartToSocket(socket, cleanId, state.cart);
    await this.emitHistoryToSocket(socket, cleanId);
    this.emitAdminOverrideToSocket(socket, cleanId, state.adminOverrides);
  }

  async handleJoinAsWaiter(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    const name = String(payload.name || 'Unnamed Waiter').trim();

    // Release any stale socket for a waiter with the same name reconnecting.
    const previousSocketId = this.findWaiterSocketByName(name);
    if (previousSocketId && previousSocketId !== socket.id) {
      this.logger?.debug('socket_waiter_stale_replaced', { name, previousSocketId, newSocketId: socket.id });
      delete this.connectedWaiters[previousSocketId];
      await this.fileService.releaseWaiterAssignments(previousSocketId);
    }

    socket.join(this.getWaiterRoom());
    this.connectedWaiters[socket.id] = {
      name,
      socketId: socket.id
    };
    await this.fileService.recordWaiterAssignment('waiter', name, socket.id, {
      event: 'joinAsWaiter'
    });

    socket.emit('waiterRegistered', {
      restaurantId: this.config.restaurantId,
      name,
      message: `You are now online as ${name}`
    });
  }

  handleJoinKitchen(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    socket.join(this.getKitchenRoom());
  }

  handleJoinAdmin(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    socket.join(this.getAdminRoom());
  }

  handleCallWaiter(payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.io) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    const cleanId = normalizeId(payload.tableId);
    const displayTable = cleanId.replace(/^table/, 'Table ').toUpperCase();
    const timestamp = new Date().toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    });

    this.io.to(this.getWaiterRoom()).emit('incomingWaiterCall', {
      restaurantId: this.config.restaurantId,
      tableId: cleanId,
      displayTable,
      message: `${displayTable} is calling you.`,
      timestamp
    });
    pushService.notifyCallWaiter(this.config.restaurantId, cleanId).catch(() => {});

    this.io.to(this.getAdminRoom()).emit('waiterCallAlert', {
      restaurantId: this.config.restaurantId,
      tableId: cleanId,
      displayTable,
      message: `${displayTable} has called for a waiter.`,
      type: 'incoming',
      timestamp
    });
  }

  async handleWaiterResponding(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.io) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    const cleanId = normalizeId(payload.tableId);
    const displayTable = cleanId.replace(/^table/, 'Table ').toUpperCase();
    const waiter = this.connectedWaiters[socket.id];
    const waiterName = waiter ? waiter.name : 'A Waiter';
    const timestamp = new Date().toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    });

    this.io.to(this.getAdminRoom()).emit('waiterCallAlert', {
      restaurantId: this.config.restaurantId,
      tableId: cleanId,
      displayTable,
      waiterName,
      message: `Waiter ${waiterName} is responding to ${displayTable}.`,
      type: 'responding',
      timestamp
    });

    this.io.to(this.getTableRooms(cleanId)).emit('waiterOnTheWay', {
      restaurantId: this.config.restaurantId,
      tableId: cleanId,
      waiterName,
      message: `${waiterName} is on the way.`
    });

    await this.fileService.recordWaiterAssignment(cleanId, waiterName, socket.id, {
      event: 'waiterResponding'
    });
  }

  async handleFetchHistory(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    await this.emitHistoryToSocket(socket, payload.tableId);
  }

  async handleUpdateCart(payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    await this.replaceTableCart(payload.tableId, payload.cart, { emit: true });
  }

  async handleUpdateAdminOverrides(payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    await this.setTableAdminOverrides(payload.tableId, payload.overrides, { emit: true });
  }

  async handleAdminResetTable(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.io) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    const cleanId = normalizeId(payload.tableId);
    const preserveOverrides = payload.preserveAdminOverrides !== false;

    await this.resetTableState(cleanId, {
      preserveAdminOverrides: preserveOverrides,
      emit: true
    });

    this.logger?.info('socket_admin_reset_table', {
      tableId: cleanId,
      preserveAdminOverrides: preserveOverrides,
      actor: payload.actor || 'admin'
    });
  }

  async handleDisconnect(socket) {
    if (this.connectedWaiters[socket.id]) {
      const { name } = this.connectedWaiters[socket.id];
      delete this.connectedWaiters[socket.id];
      this.logger?.debug('socket_waiter_disconnected', { name, socketId: socket.id });
    }

    await this.fileService.releaseWaiterAssignments(socket.id);

    this.logger?.debug('socket_disconnected', { socketId: socket.id });
  }

  // ─── Utility ──────────────────────────────────────────────────────────────────

  findWaiterSocketByName(name) {
    for (const [socketId, waiter] of Object.entries(this.connectedWaiters)) {
      if (waiter.name === name) {
        return socketId;
      }
    }

    return null;
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
