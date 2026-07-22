const socketIO = require('socket.io');

const { isAllowedOrigin } = require('../middleware/security');
const { getCanonicalTableId, getTableAliases, normalizeId } = require('../utils/helpers');
const pushService = require('./pushService');

const STAFF_ROLES = ['owner', 'manager', 'waiter', 'kitchen'];
const TABLE_CONTROL_ROLES = ['owner', 'manager', 'waiter'];
const ADMIN_ROLES = ['owner', 'manager'];
const KITCHEN_ROLES = ['owner', 'manager', 'kitchen'];

class SocketService {
  constructor(config, fileService, logger = null, { auth = null } = {}) {
    this.config = config;
    this.fileService = fileService;
    this.logger = logger;
    this.auth = auth;
    this.io = null;
    this.tableMemory = {};
    this.connectedWaiters = {};
    // Listeners notified when menu / recommendation / order data mutates. Used by
    // aiService to drop its reco caches immediately so owner edits show without
    // waiting out the cache TTL. Independent of socket connectivity.
    this._dataChangeListeners = [];
    // notificationService is constructed after SocketService (it needs a live
    // socketService to emit through) — wired in via this setter once it exists,
    // rather than a constructor param, to avoid the circular dependency.
    this.notifications = null;
  }

  setNotificationService(notificationService) {
    this.notifications = notificationService;
  }

  // Register a callback fired on every menu/recommendation/order mutation. The
  // scope ('menu' | 'recommendations' | 'orders') is passed through for listeners
  // that want to be selective.
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

    // Handshake authentication. The connection is always allowed (guests scan a
    // QR code without logging in), but we attach the authenticated staff identity
    // when present. Two credential sources, in order:
    //   1. Web cookie — rides the same-origin handshake automatically (HttpOnly,
    //      SameSite=Lax). UNCHANGED behaviour for browser clients.
    //   2. Phase 04B — Bearer ACCESS token in handshake.auth.token (or ?token=),
    //      for native clients that have no cookie jar. Same HMAC + active-user
    //      check as REST (auth.getUserFromToken), so suspension revokes it too.
    // Per-event handlers then enforce role/table authorization.
    this.io.use(async (socket, next) => {
      socket.data.user = null;
      socket.data.tables = new Set();

      try {
        let user = null;
        if (this.auth?.authenticateCookieHeader) {
          user = await this.auth.authenticateCookieHeader(socket.handshake?.headers?.cookie || '');
        } else {
          this.logger?.warn('socket_auth_unconfigured', { socketId: socket.id });
        }

        if (!user && this.auth?.getUserFromToken) {
          const token = socket.handshake?.auth?.token || socket.handshake?.query?.token || '';
          if (token) {
            user = await this.auth.getUserFromToken(String(token));
            if (user) socket.data.authVia = 'bearer';
          }
        }

        if (user) {
          socket.data.user = user;
        }
      } catch (error) {
        this.logger?.warn('socket_auth_error', { socketId: socket.id, error: error?.message });
      }

      return next();
    });

    this.io.on('connection', socket => {
      this.logger?.debug('socket_connected', {
        socketId: socket.id,
        role: this.socketRole(socket) || 'guest',
        ip: socket.handshake?.address
      });
      this.handleConnection(socket);
    });

    return this.io;
  }

  // ─── Authorization helpers ────────────────────────────────────────────────────

  socketRole(socket) {
    return socket?.data?.user?.role || null;
  }

  socketHasRole(socket, roles) {
    const role = this.socketRole(socket);
    return Boolean(role && roles.includes(role));
  }

  // Staff (waiter/manager/owner) may act on any table; a guest may act only on a
  // table room it explicitly joined during this session (set on joinTable).
  socketCanControlTable(socket, tableId) {
    if (this.socketHasRole(socket, TABLE_CONTROL_ROLES)) {
      return true;
    }

    const canonical = getCanonicalTableId(tableId);
    return Boolean(socket?.data?.tables?.has(canonical));
  }

  denySocket(socket, event, payload = {}) {
    this.logger?.warn('socket_event_denied', {
      event,
      socketId: socket.id,
      role: this.socketRole(socket) || 'guest',
      tableId: payload && payload.tableId ? normalizeId(payload.tableId) : undefined
    });
    socket.emit('authError', { event, message: 'Not authorized for this action.' });
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

  // Per-user room (Phase 04B) — lets notifications target a specific staff member
  // (e.g. a table transfer) regardless of which device/socket they are on.
  getUserRoom(username) {
    return `${this.config.restaurantId}:user:${normalizeId(username)}`;
  }

  getRoleRoom(role) {
    if (role === 'waiter') return this.getWaiterRoom();
    if (role === 'kitchen') return this.getKitchenRoom();
    if (role === 'owner' || role === 'manager') return this.getAdminRoom();
    return null;
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
    this._notifyDataChange('menu');
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
    this._notifyDataChange('recommendations');
    if (this.io) {
      this.io.emit('recommendationUpdated');
    }
  }

  emitOrderPlaced(order) {
    this._notifyDataChange('orders');
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
      pushService.notifyNewOrder(this.config.restaurantId, tableId, this.config.publicBasePath).catch(() => {});
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
      pushService.notifyOrderReady(this.config.restaurantId, tableId, this.config.publicBasePath).catch(() => {});
    }
  }

  emitOrderUpdated() {
    this._notifyDataChange('orders');
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

  // Phase 04B — live delivery of a Notification row to the right staff. Mirrors the
  // notificationService recipient rules so the in-app bell updates instantly without
  // polling. Background/offline delivery is handled separately by pushDispatcher.
  //   recipientUser set            -> that user's room
  //   recipientRole set (no user)  -> that role's room
  //   both empty (broadcast)       -> all staff rooms
  emitNotification(row) {
    if (!this.io || !row) return;
    const event = 'notification';
    const recipientUser = String(row.recipientUser || '').trim();
    const recipientRole = String(row.recipientRole || '').trim();

    let target;
    if (recipientUser) {
      target = this.io.to(this.getUserRoom(recipientUser));
    } else if (recipientRole) {
      const room = this.getRoleRoom(recipientRole);
      target = room ? this.io.to(room) : null;
    } else {
      target = this.io
        .to(this.getAdminRoom())
        .to(this.getWaiterRoom())
        .to(this.getKitchenRoom());
    }

    target?.emit(event, { restaurantId: this.config.restaurantId, notification: row });
  }

  // Real-time special-occasion alert for staff (waiter + admin/owner consoles).
  emitGuestEvent(payload = {}) {
    if (!this.io) return;
    this.io
      .to(this.getAdminRoom())
      .to(this.getWaiterRoom())
      .emit('guestEvent', {
        restaurantId: this.config.restaurantId,
        tableId: normalizeId(payload.tableId || 'unknown'),
        event: payload.event || null,
        at: Date.now()
      });
  }

  // ─── Connection handler ───────────────────────────────────────────────────────

  async handleConnection(socket) {
    // Authenticated staff auto-join their personal room so targeted notifications
    // (Phase 04B) reach them without an explicit join handshake. Additive — does
    // not change guest behaviour or any existing room logic.
    const connectedUser = socket.data.user;
    if (connectedUser?.username) {
      socket.join(this.getUserRoom(connectedUser.username));
    }

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
      this.handleCallWaiter(socket, payload);
    });

    socket.on('waiterResponding', async payload => {
      await this.handleWaiterResponding(socket, payload);
    });

    socket.on('fetchHistory', async payload => {
      await this.handleFetchHistory(socket, payload);
    });

    socket.on('updateCart', async payload => {
      await this.handleUpdateCart(socket, payload);
    });

    socket.on('updateAdminOverrides', async payload => {
      await this.handleUpdateAdminOverrides(socket, payload);
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
    // Remember this table so the guest may control only this cart (see
    // socketCanControlTable). Staff are not constrained by this set.
    socket.data.tables.add(getCanonicalTableId(cleanId));

    // Fires on every phone connect/reconnect/refresh — a transient DB/file
    // read error here must not become an unhandled rejection that takes down
    // every table's connection (same reasoning as handleUpdateCart below).
    try {
      const state = await this.getTableState(cleanId);
      this.emitCartToSocket(socket, cleanId, state.cart);
      await this.emitHistoryToSocket(socket, cleanId);
      this.emitAdminOverrideToSocket(socket, cleanId, state.adminOverrides);
    } catch (error) {
      this.logger?.warn?.('socket_join_table_failed', { tableId: cleanId, error });
    }
  }

  async handleJoinAsWaiter(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.socketHasRole(socket, TABLE_CONTROL_ROLES)) {
      return this.denySocket(socket, 'joinAsWaiter', payload);
    }

    // Identity is taken from the authenticated session, not the client payload,
    // so a waiter cannot register under an arbitrary or spoofed name.
    const user = socket.data.user;
    const name = String(user?.label || user?.username || 'Waiter').trim();

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

    if (!this.socketHasRole(socket, KITCHEN_ROLES)) {
      return this.denySocket(socket, 'joinKitchen', payload);
    }

    socket.join(this.getKitchenRoom());
  }

  handleJoinAdmin(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.socketHasRole(socket, ADMIN_ROLES)) {
      return this.denySocket(socket, 'joinAdmin', payload);
    }

    socket.join(this.getAdminRoom());
  }

  handleCallWaiter(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.io) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    // Only the guest seated at this table (joined room) or staff may ring.
    if (!this.socketCanControlTable(socket, payload.tableId)) {
      return this.denySocket(socket, 'callWaiter', payload);
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
    pushService.notifyCallWaiter(this.config.restaurantId, cleanId, this.config.publicBasePath).catch(() => {});

    this.io.to(this.getAdminRoom()).emit('waiterCallAlert', {
      restaurantId: this.config.restaurantId,
      tableId: cleanId,
      displayTable,
      message: `${displayTable} has called for a waiter.`,
      type: 'incoming',
      timestamp
    });

    this.notifications?.notify({
      source: 'waiter_call',
      title: `${displayTable} is calling`,
      body: `${displayTable} has called for a waiter.`,
      priority: 1,
      recipientRole: 'waiter',
      tableId: cleanId
    });
  }

  async handleWaiterResponding(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.io) {
      return;
    }

    if (!this.socketHasRole(socket, TABLE_CONTROL_ROLES)) {
      return this.denySocket(socket, 'waiterResponding', payload);
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

    if (!this.socketCanControlTable(socket, payload.tableId)) {
      return this.denySocket(socket, 'fetchHistory', payload);
    }

    try {
      await this.emitHistoryToSocket(socket, payload.tableId);
    } catch (error) {
      this.logger?.warn?.('socket_fetch_history_failed', { tableId: payload.tableId, error });
    }
  }

  async handleUpdateCart(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    // A guest may only write to the cart of the table it joined; staff may write
    // to any table. This is the core fix for unauthenticated cart tampering.
    if (!this.socketCanControlTable(socket, payload.tableId)) {
      return this.denySocket(socket, 'updateCart', payload);
    }

    // Never let a transient cart-write error become an unhandled rejection that
    // crashes the whole server — log and continue serving.
    try {
      await this.replaceTableCart(payload.tableId, payload.cart, { emit: true });
    } catch (error) {
      this.logger?.warn?.('socket_update_cart_failed', { tableId: payload.tableId, error });
    }
  }

  async handleUpdateAdminOverrides(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId)) {
      return;
    }

    if (!this.socketHasRole(socket, ADMIN_ROLES)) {
      return this.denySocket(socket, 'updateAdminOverrides', payload);
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    try {
      await this.setTableAdminOverrides(payload.tableId, payload.overrides, { emit: true });
    } catch (error) {
      this.logger?.warn?.('socket_update_admin_overrides_failed', { tableId: payload.tableId, error });
    }
  }

  async handleAdminResetTable(socket, payload = {}) {
    if (!this.isValidRestaurant(payload.restaurantId) || !this.io) {
      return;
    }

    if (!this.socketHasRole(socket, ADMIN_ROLES)) {
      return this.denySocket(socket, 'adminResetTable', payload);
    }

    if (!this.isValidTableId(payload.tableId)) {
      return;
    }

    const cleanId = normalizeId(payload.tableId);
    const preserveOverrides = payload.preserveAdminOverrides !== false;

    try {
      await this.resetTableState(cleanId, {
        preserveAdminOverrides: preserveOverrides,
        emit: true
      });

      this.logger?.info('socket_admin_reset_table', {
        tableId: cleanId,
        preserveAdminOverrides: preserveOverrides,
        actor: socket.data.user?.username || 'admin'
      });
    } catch (error) {
      this.logger?.warn?.('socket_admin_reset_table_failed', { tableId: cleanId, error });
    }
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
