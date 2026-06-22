// Revenue Opportunity Engine — deterministic. Wraps aiService.recommend() (no AI here).
// Turns the current cart into a structured "best next action" with a probability,
// derived purely from the recommendation source/category. Wording added by nlg layer.

function quantity(item = {}) {
  return Number(item.qty || item.quantity || 1) || 1;
}

function cartTotal(cart = []) {
  return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * quantity(item), 0);
}

// Conversion likelihood keyed off the deterministic recommendation source + course.
function probabilityFor(source, categoryType) {
  const s = String(source || '').toLowerCase();
  if (s.includes('people also ordered')) return 0.78;
  if (s.includes('perfect') || s.includes('pairing')) return 0.82;
  if (s.includes('sweet finish') || categoryType === 'DESSERT') return 0.74;
  if (categoryType === 'WINE') return 0.8;
  if (categoryType === 'DRINK') return 0.7;
  if (s.includes('start')) return 0.66;
  if (s.includes('popular')) return 0.6;
  return 0.62;
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
  async function getOpportunity({ cart = [] } = {}) {
    const currentBill = Number(cartTotal(cart).toFixed(2));
    let recs = [];
    try {
      recs = await aiService.recommend({ cart, limit: 6 });
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
    const probability = probabilityFor(best.source_title, best.categoryType);
    const potentialBill = Number((currentBill + price).toFixed(2));

    return {
      hasOpportunity: true,
      currentBill,
      potentialBill,
      increase: Number(price.toFixed(2)),
      probability,
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
        source: r.source_title
      }))
    };
  }

  return { getOpportunity };
}

module.exports = { createOpportunityService };
