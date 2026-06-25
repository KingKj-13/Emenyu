'use strict';
// Phase 03 — immutable operational audit trail. Append-only writes to AuditLog.
// Every privileged mutation (shift, ownership, account, notification) calls record().
// Never throws: auditing must never break the action it records.
const { getPrisma } = require('./prismaClient');

class AuditService {
  constructor({ config, logger = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.restaurantId = config?.restaurantId || 'trump';
  }

  async record({
    actor = 'system', actorRole = '', action,
    targetType = '', targetId = '', summary = '', reason = '', metadata = null
  } = {}) {
    if (!action) return null;
    try {
      return await getPrisma().auditLog.create({
        data: {
          restaurantId: this.restaurantId,
          actor: String(actor || 'system'),
          actorRole: String(actorRole || ''),
          action: String(action),
          targetType: String(targetType || ''),
          targetId: String(targetId || ''),
          summary: String(summary || ''),
          reason: String(reason || ''),
          metadata: metadata || undefined
        }
      });
    } catch (error) {
      this.logger?.warn?.('audit_write_failed', { action, error: error?.message });
      return null;
    }
  }

  async list({ limit = 100, action = null, actor = null, targetType = null, targetId = null, since = null } = {}) {
    try {
      const where = { restaurantId: this.restaurantId };
      if (action) where.action = String(action);
      if (actor) where.actor = String(actor);
      if (targetType) where.targetType = String(targetType);
      if (targetId) where.targetId = String(targetId);
      if (since) where.createdAt = { gte: new Date(since) };
      return await getPrisma().auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 100, 500)
      });
    } catch (error) {
      this.logger?.warn?.('audit_list_failed', { error: error?.message });
      return [];
    }
  }
}

module.exports = { AuditService };
