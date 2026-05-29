// Always-on, offline NLG provider. Composes high-quality hospitality copy from the
// structured decision data. This is BOTH the default and the fallback — the app must
// read well with zero LLM configured, so the templates carry real weight.
const { NlgProvider, KINDS, normalizeTone } = require('./nlgProvider');

function money(value) {
  const n = Number(value) || 0;
  return `R${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function lc(value) {
  return String(value || '').toLowerCase();
}

function joinList(names = []) {
  const clean = names.filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

// Tasting notes for common cellar/bar items so wine talk feels expert offline.
function flavorNotes(name) {
  const n = lc(name);
  if (/cabernet/.test(n)) return 'blackcurrant and cedar with a firm, structured finish';
  if (/shiraz|syrah/.test(n)) return 'dark berry, pepper and a warm, smoky depth';
  if (/pinotage/.test(n)) return 'ripe plum and a savoury, smoky edge';
  if (/merlot/.test(n)) return 'soft red fruit and a rounded, velvety finish';
  if (/chardonnay/.test(n)) return 'citrus, stone fruit and a creamy texture';
  if (/sauvignon/.test(n)) return 'crisp green apple and bright acidity';
  if (/chenin/.test(n)) return 'fresh pear and a clean, lifted finish';
  if (/champagne|mcc|sparkl/.test(n)) return 'fine bubbles and a celebratory crispness';
  if (/rosé|rose/.test(n)) return 'delicate red berry and a dry, refreshing finish';
  return 'a balanced profile that sits beautifully at the table';
}

// A confident hook describing a dish. Keyword-enriched, with a graceful generic fallback.
function dishHook(name, description) {
  const n = lc(name);
  if (/tomahawk|ribeye|t-bone/.test(n)) return 'a showpiece cut, dry-aged for depth and grilled over the coals';
  if (/fillet|wagyu/.test(n)) return 'one of the most tender cuts we carve';
  if (/rump|sirloin|steak|beef/.test(n)) return 'grilled hard and fast for a proper char';
  if (/prawn|oyster|calamari|salmon|kingklip|seafood|mussel/.test(n)) return 'fresh off the coast and handled simply, the way it should be';
  if (/lamb/.test(n)) return 'slow-rendered and finished crisp on the grill';
  if (/baklava|malva|cake|dessert|fondant/.test(n)) return 'the sweet note the table will remember';
  const desc = String(description || '').trim();
  if (desc) return desc.replace(/\.$/, '').toLowerCase();
  return 'one of the plates our regulars come back for';
}

function actionPhrase(bestAction, item) {
  if (bestAction) return lc(bestAction);
  const cat = (item?.categoryType || '').toUpperCase();
  if (cat === 'WINE') return 'pour a glass alongside it';
  if (cat === 'DESSERT') return 'finish the table with something sweet';
  if (cat === 'STARTER') return 'open with a starter to share';
  return 'add it to the table';
}

class TemplateNlgProvider extends NlgProvider {
  get name() {
    return 'template';
  }

  get available() {
    return true;
  }

  async phrase({ kind, tone, data = {} }) {
    const t = normalizeTone(tone);
    switch (kind) {
      case KINDS.PAIRING_REASON:
        return this.pairingReason(data, t);
      case KINDS.COACH_SAY_TO_TABLE:
        return this.sayToTable(data, t);
      case KINDS.TABLE_PITCH:
        return this.tablePitch(data, t);
      case KINDS.ITEM_EXPLANATION:
        return this.itemExplanation(data, t);
      case KINDS.UPSELL_SCRIPT:
        return this.upsellScript(data, t);
      case KINDS.SOMMELIER:
        return this.sommelier(data, t);
      case KINDS.SERVICE_RECOVERY:
        return this.serviceRecovery(data, t);
      default:
        return '';
    }
  }

  pairingReason(data, tone) {
    const item = data.item || {};
    const forName = data.forItem?.name || 'this dish';
    const cat = (item.categoryType || '').toUpperCase();
    const food = lc(forName);
    if (cat === 'WINE') {
      if (/steak|beef|rump|fillet|tomahawk|ribeye|wagyu/.test(food)) {
        return tone === 'short'
          ? `Bold red — stands up to the ${forName}.`
          : `A bold, full-bodied red — ${flavorNotes(item.name)}, built to stand up to the char on the ${forName}.`;
      }
      if (/prawn|seafood|salmon|calamari|kingklip|oyster/.test(food)) {
        return `A crisp white — ${flavorNotes(item.name)}, a classic match for the ${forName}.`;
      }
      return `${flavorNotes(item.name).replace(/^a /, '')}${flavorNotes(item.name).startsWith('a ') ? '' : ''} — a confident pour with the ${forName}.`;
    }
    if (cat === 'DRINK') return `A great glass to round off the ${forName}.`;
    if (cat === 'DESSERT') return `The sweet finish that completes the ${forName}.`;
    if (cat === 'STARTER') return `A light opener before the ${forName} lands.`;
    return `Pairs naturally with the ${forName}.`;
  }

  sayToTable(data, tone) {
    const dish = data.dish || {};
    const suggestion = data.suggestion || {};
    const intel = data.guestIntel || {};
    const hook = dishHook(dish.name, dish.description);
    const sName = suggestion.name;

    const base = sName
      ? `${dish.name} is ${hook}. I'd ${actionPhrase(data.bestAction, suggestion)} with the ${sName}`
      : `${dish.name} is ${hook}`;

    if (intel.vip || intel.returning) {
      const close = intel.favorites?.wine && lc(intel.favorites.wine) === lc(sName)
        ? ` — it's the one you enjoyed last time.`
        : ` — it's how I'd set up the table tonight.`;
      return `${base}${close}`;
    }

    switch (tone) {
      case 'casual':
        return sName ? `${dish.name} is ${hook} — honestly, the ${sName} is the move. Trust me on that one.` : `${dish.name} is ${hook}.`;
      case 'luxury':
        return sName ? `${dish.name} is ${hook}. Allow me to pour the ${sName} alongside — it's the pairing I recommend to every table.` : `${dish.name} is ${hook}.`;
      case 'short':
        return sName ? `${dish.name}, ${hook}. Add the ${sName}.` : `${dish.name}, ${hook}.`;
      case 'upsell':
        return sName ? `${dish.name} is ${hook} — and it's made for the ${sName}. Shall I bring both?` : `${dish.name} is ${hook}.`;
      default:
        return sName ? `${base} — it's the pairing I recommend to every table.` : `${base}.`;
    }
  }

  tablePitch(data, tone) {
    const cart = (data.cart || []).map(i => (typeof i === 'string' ? i : i.name)).filter(Boolean);
    const opp = data.opportunity || {};
    const item = opp.suggestedItem || {};
    const intel = data.guestIntel || {};
    if (!item.name) {
      return cart.length
        ? `The table's set with ${joinList(cart.slice(0, 3))}. They look happy — keep the pace easy and offer the dessert menu when they slow down.`
        : `Fresh table — open with a sparkling or a starter board to set the tone.`;
    }
    const anchor = cart.find(c => /shiraz|cabernet|wine|merlot|pinotage|champagne/i.test(c)) || cart[0];
    const lead = anchor
      ? `Since the table's already enjoying the ${anchor}, the ${item.name} is a natural move — they were made for each other.`
      : `The ${item.name} is the standout next move for this table.`;
    const vip = intel.vip ? ' This is a VIP — lead with it confidently.' : '';
    if (tone === 'short') return `Add the ${item.name} — ${money(item.price)}, strong fit.`;
    return `${lead}${vip} Expect roughly ${money(opp.increase || item.price)} more on the check.`;
  }

  itemExplanation(data, tone) {
    const item = data.item || {};
    const hook = dishHook(item.name, item.description);
    const badge = item.chefPick ? "It's a chef's pick" : item.popular ? "It's one of tonight's favourites" : "It's a plate guests rave about";
    if (tone === 'short') return `${item.name} — ${hook}.`;
    return `${item.name} is ${hook}. ${badge}, and it carries the table beautifully.`;
  }

  upsellScript(data, tone) {
    const item = data.suggestedItem || {};
    if (!item.name) return '';
    const cat = (item.categoryType || '').toUpperCase();
    const benefit = cat === 'WINE' ? flavorNotes(item.name)
      : cat === 'DESSERT' ? 'the perfect sweet close'
        : cat === 'STARTER' ? 'a lovely way to open' : 'a great addition';
    switch (tone) {
      case 'luxury':
        return `May I suggest the ${item.name}? ${benefit[0].toUpperCase()}${benefit.slice(1)} — a beautiful addition at ${money(item.price)}.`;
      case 'short':
        return `Add the ${item.name}? ${money(item.price)}.`;
      case 'casual':
        return `Want me to bring the ${item.name} too? It's ${benefit} — ${money(item.price)}.`;
      default:
        return `The ${item.name} would round this off nicely — ${benefit}. Shall I add it for ${money(item.price)}?`;
    }
  }

  sommelier(data, tone) {
    const wine = data.wine || {};
    const dish = data.dish ? lc(typeof data.dish === 'string' ? data.dish : data.dish.name) : 'the table';
    if (!wine.name) return 'Tell me the dish and I will pour the right glass.';
    const notes = wine.notes || flavorNotes(wine.name);
    if (tone === 'short') return `${wine.name} — ${notes}.`;
    return `The ${wine.name} offers ${notes}, which complements ${dish} perfectly${wine.price ? ` (${money(wine.price)})` : ''}.`;
  }

  serviceRecovery(data, tone) {
    const actions = data.suggestedActions || [];
    const wait = data.waitMinutes || 0;
    const lead = wait
      ? `Thank you for your patience — I know the kitchen has taken a little longer than we'd like.`
      : `Thank you for letting us know — let me put this right.`;
    if (actions.includes('comp_dessert')) {
      return `${lead} I'd like to bring you a complimentary dessert while we finish your mains, with my compliments.`;
    }
    if (actions.includes('manager_visit')) {
      return `${lead} I've asked our manager to come across personally, and we're pushing your order to the front of the pass.`;
    }
    if (actions.includes('priority_fire')) {
      return `${lead} I've flagged your table as priority with the kitchen — it's coming right up.`;
    }
    return `${lead} Please bear with me a moment and I'll sort it out straight away.`;
  }
}

module.exports = { TemplateNlgProvider };
