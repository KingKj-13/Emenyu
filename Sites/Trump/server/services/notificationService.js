'use strict';
// Phase 03 — unified notification center. read/unread is driven by readAt (null =
// unread). Sources: waiter_call | reservation | reassignment | table_transfer |
// ai_warning | system. recipientRole "" = all staff; recipientUser "" = role-wide.
// Emits a socket event (if a socketService is wired) so live UIs refresh.
const { getPrisma } = require('./prismaClient');

function normUser(value) { return String(value || '').trim().toLowerCase(); }

class NotificationService {
  constructor({ config, logger = null, socketService = null, auditService = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.socket = socketService;
    this.audit = auditService;
    this.restaurantId = config?.restaurantId || 'trump';
  }

  async notify({ source = 'system', title, body = '', priority = 3, recipientRole = '', recipientUser = '', tableId = '', metadata = null } = {}) {
    if (!title) return null;
    try {
      const row = await getPrisma().notification.create({
        data: {
          restaurantId: this.restaurantId, source: String(source), title: String(title),
          body: String(body || ''), priority: Number(priority) || 3,
          recipientRole: String(recipientRole || ''), recipientUser: normUser(recipientUser),
          tableId: String(tableId || ''), metadata: metadata || undefined
        }
      });
      try { this.socket?.emitNotification?.(row); } catch { /* socket optional */ }
      return row;
    } catch (error) {
      this.logger?.warn?.('notify_failed', { error: error?.message });
      return null;
    }
  }

  // recipient match: broadcast (role+user empty) OR role-wide match OR specific-user match.
  _recipientWhere(role, username) {
    const u = normUser(username);
    const or = [{ recipientRole: '', recipientUser: '' }];
    if (role) or.push({ recipientRole: String(role), recipientUser: '' });
    if (u) or.push({ recipientUser: u });
    return or;
  }

  // `all: true` is the owner/manager view (every notification); otherwise scoped to
  // broadcasts + this role/user.
  _scopeWhere({ role = '', username = '', all = false, unreadOnly = false } = {}) {
    const where = { restaurantId: this.restaurantId };
    if (!all) where.OR = this._recipientWhere(role, username);
    if (unreadOnly) where.readAt = null;
    return where;
  }

  async list({ role = '', username = '', all = false, unreadOnly = false, limit = 50 } = {}) {
    return getPrisma().notification.findMany({
      where: this._scopeWhere({ role, username, all, unreadOnly }),
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(Number(limit) || 50, 200)
    });
  }

  async unreadCount({ role = '', username = '', all = false } = {}) {
    return getPrisma().notification.count({ where: this._scopeWhere({ role, username, all, unreadOnly: true }) });
  }

  async markRead(id, { actor = '' } = {}) {
    const row = await getPrisma().notification.update({
      where: { id: Number(id) }, data: { readAt: new Date() }
    });
    await this.audit?.record({
      actor: normUser(actor) || 'system', action: 'notification.acknowledged',
      targetType: 'notification', targetId: String(id), summary: `Notification ${id} acknowledged`
    });
    return row;
  }

  async markAllRead({ role = '', username = '', all = false, actor = '' } = {}) {
    const unread = await this.list({ role, username, all, unreadOnly: true, limit: 500 });
    const ids = unread.map(n => n.id);
    if (ids.length) {
      await getPrisma().notification.updateMany({ where: { id: { in: ids } }, data: { readAt: new Date() } });
      await this.audit?.record({
        actor: normUser(actor) || 'system', action: 'notification.acknowledged_all',
        targetType: 'notification', summary: `${ids.length} notifications acknowledged`
      });
    }
    return { marked: ids.length };
  }
}

module.exports = { NotificationService };
