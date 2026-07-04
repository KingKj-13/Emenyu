// Revenue Opportunity Engine — deterministic. Wraps aiService.recommend() (no AI here).
// Turns the current cart into a structured "best next action". Phase 1
// (Recommendation Brain): probability/increase are no longer computed here —
// aiService.recommend() already scores every candidate (confidence +
// replacement-aware expected value) via recommendationScoring.js, so this
// service just reads those fields off the best candidate. One source of truth.

function quantity(item = {}) {
  return Number(item.qty || item.quantity || 1) || 1;
}

function cartTotal(cart = []) {
  return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * quantity(item), 0);
}

function actionLabel(categoryType, name = '') {
  switch ((categoryType || '').toUpperCase()) {
    case 'WINE': return 'Pour a premium red';
    case 'DRINK': return /coffee|espresso|cognac|whisky/i.test(name) ? 'Offer a digestif' : 'Suggest a drink';
    case 'DESSERT': return 'Offer dessert';
    case 'STARTER': return 'Add a starter';
    default: return 'Suggest a side';
  }
}

function createOpportunityService({ config, aiService }) {
  async function getOpportunity({ cart = [], guestIntel = null } = {}) {
    const currentBill = Number(cartTotal(cart).toFixed(2));
    let recs = [];
    try {
      recs = await aiService.recommend({ cart, limit: 6, guestIntel });
    } catch {
      recs = [];
    }

    if (!recs.length) {
      return {
        hasOpportunity: false,
        currentBill,
        potentialBill: currentBill,
        increase: 0,
        suggestedItem: null,
        bestAction: null,
        probability: 0,
        alternatives: []
      };
    }

    const best = recs[0];
    const price = Number(best.price) || 0;
    // Phase 1: read the brain's own confidence + replacement-aware increase —
    // never recompute a second probability model for the same recommendation.
    const probability = Number(best.confidence) || 0;
    const increase = Number(best.netRevenueIncrease ?? price);
    const potentialBill = Number((currentBill + increase).toFixed(2));

    return {
      hasOpportunity: true,
      currentBill,
      potentialBill,
      increase: Number(increase.toFixed(2)),
      probability,
      expectedValue: Number(best.expectedValue) || 0,
      replacement: best.replacement || null,
      bestAction: actionLabel(best.categoryType, best.name),
      suggestedItem: {
        name: best.name,
        price,
        img: best.img,
        categoryType: best.categoryType,
        source: best.source_title,
        reason: best.reason || ''
      },
      alternatives: recs.slice(1, 4).map(r => ({
        name: r.name,
        price: Number(r.price) || 0,
        img: r.img,
        categoryType: r.categoryType,
        source: r.source_title,
        confidence: r.confidence,
        expectedValue: r.expectedValue
      }))
    };
  }

  return { getOpportunity };
}

module.exports = { createOpportunityService };
