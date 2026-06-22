// Service Recovery — deterministic triggers. No AI. Wording added by nlg layer.
// Detects delays (oldest active order age) and low ratings, then proposes actions.
const { getPrisma } = require('./prismaClient');
const { getCanonicalTableId, getTableAliases } = require('../utils/helpers');

const ACTIONS = {
  high: ['manager_visit', 'comp_dessert', 'priority_fire', 'apology'],
  medium: ['priority_fire', 'apology'],
  low: ['apology']
};

function createServiceRecoveryService({ config }) {
  const restaurantId = config?.restaurantId || 'trump';

  async function getRecovery({ tableId, delayMinutes } = {}) {
    const db = getPrisma();
    const aliases = getTableAliases(tableId).map(getCanonicalTableId);

    let waitMinutes = Number(delayMinutes) || 0;
    let rating = null;

    try {
      const oldest = await db.order.findFirst({
        where: { restaurantId, tableId: { in: aliases }, status: 'active' },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true }
      });
      if (oldest && !delayMinutes) {
        waitMinutes = Math.max(waitMinutes, Math.floor((Date.now() - new Date(oldest.timestamp).getTime()) / 60000));
      }
      const latestRating = await db.orderRating.findFirst({
        where: { restaurantId, tableId: { in: aliases } },
        orderBy: { createdAt: 'desc' },
        select: { rating: true }
      });
      rating = latestRating ? latestRating.rating : null;
    } catch {
      // fall through to whatever delayMinutes we were given
    }

    let severity = 'none';
    if (waitMinutes > 20 || (rating !== null && rating <= 2)) severity = 'high';
    else if (waitMinutes > 12 || (rating !== null && rating <= 3)) severity = 'medium';
    else if (waitMinutes > 8) severity = 'low';

    return {
      tableId: getCanonicalTableId(tableId),
      severity,
      triggered: severity !== 'none',
      waitMinutes,
      rating,
      suggestedActions: severity === 'none' ? [] : ACTIONS[severity]
    };
  }

  return { getRecovery };
}

module.exports = { createServiceRecoveryService };
