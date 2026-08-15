'use strict';
// Data Verification Tool — compares the DATABASE's raw row against what the
// service layer (the exact functions the admin/waiter UIs call) returns for
// the same table, so a future sync/caching/tenant-filter bug is caught by a
// field-by-field diff instead of someone eyeballing two screens. Owner/manager
// only (mounted behind the same auth as the rest of the admin API — see
// server/routes/waiterApiRoutes.js's sibling registration in server.js).
const { getPrisma } = require('../services/prismaClient');
const { getCanonicalTableId } = require('../utils/helpers');

function createDebugController({ config, guestService, aiEventService }) {
  const restaurantId = config?.restaurantId || 'trump';

  return {
    async verifyTable(req, res) {
      const tableId = getCanonicalTableId(req.params.tableId);
      const db = getPrisma();

      const table = await db.table.findUnique({
        where: { restaurantId_tableId: { restaurantId, tableId } },
        select: { metadata: true }
      });
      const guestId = table?.metadata && typeof table.metadata === 'object' ? table.metadata.guestId : null;

      const rawGuest = guestId ? await db.guest.findFirst({ where: { id: Number(guestId), restaurantId } }) : null;
      const serviceGuestIntel = await guestService.getGuestIntel({ tableId });

      const rawAiEvents = await db.aiEvent.findMany({ where: { restaurantId, tableId }, orderBy: { createdAt: 'desc' }, take: 20 });
      const serviceAiEvents = await aiEventService.listEvents({ tableId, status: 'all' });

      const rawActiveOrders = await db.order.findMany({
        where: { restaurantId, tableId, status: 'active' },
        select: { id: true, filename: true, kitchenStatus: true, total: true, waiterName: true }
      });

      // Field-by-field diff between the raw DB guest row and what the service
      // layer (getGuestIntel — the function every UI actually calls) returned.
      const mismatches = [];
      if (rawGuest) {
        const checks = [
          ['name', rawGuest.name, serviceGuestIntel.name],
          ['vip', rawGuest.vip, serviceGuestIntel.vip],
          ['loyaltyTier', rawGuest.loyaltyTier || '', serviceGuestIntel.loyaltyTier || ''],
          ['visitCount', rawGuest.visitCount, serviceGuestIntel.visitCount],
          ['lifetimeSpend', Number(rawGuest.lifetimeSpend || 0), serviceGuestIntel.lifetimeSpend],
          ['allergies', rawGuest.allergies || '', serviceGuestIntel.allergies || ''],
          ['dietary', rawGuest.dietary || '', serviceGuestIntel.dietary || '']
        ];
        for (const [field, dbValue, apiValue] of checks) {
          if (dbValue !== apiValue) mismatches.push({ field, database: dbValue, backendApi: apiValue });
        }
      } else if (serviceGuestIntel.present) {
        mismatches.push({ field: 'present', database: 'no guestId on Table.metadata', backendApi: 'guestIntel.present=true (should be impossible)' });
      }

      if (rawAiEvents.length !== serviceAiEvents.length) {
        mismatches.push({ field: 'aiEventCount', database: rawAiEvents.length, backendApi: serviceAiEvents.length });
      }

      res.json({
        tableId,
        checkedAt: new Date().toISOString(),
        guest: {
          seated: !!guestId,
          database: rawGuest,
          backendApi: serviceGuestIntel
        },
        aiEvents: {
          database: rawAiEvents,
          backendApi: serviceAiEvents
        },
        activeOrders: rawActiveOrders,
        mismatches,
        ok: mismatches.length === 0
      });
    }
  };
}

module.exports = { createDebugController };
