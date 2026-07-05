// Always-on, offline NLG provider. Composes high-quality hospitality copy from the
// structured decision data. This is BOTH the default and the fallback — the app must
// read well with zero LLM configured, so the templates carry real weight.
const { NlgProvider, KINDS, normalizeTone } = require('./nlgProvider');
const hospitality = require('./hospitalityKnowledge');
const { hashString } = require('../rotationService');

function pick(list, seedKey) {
  if (!list || !list.length) return '';
  if (list.length === 1) return list[0];
  return list[hashString(seedKey) % list.length];
}

function bevTone(tone) {
  return tone === 'casual' ? 'friendly' : (['professional', 'luxury'].includes(tone) ? tone : 'friendly');
}

const isBevCat = it => ['WINE', 'DRINK'].includes(String(it && it.categoryType || '').toUpperCase());

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

  // Phase 2.5 (Hospitality Intelligence): tag-driven WHY, not name-keyword
  // matching. Works for any of the 439 items as long as it has metadata.tags
  // (every item does) — a new menu item needs nothing beyond tags to read the
  // same way. Falls back to the old never-blank category lines only when there
  // is no anchor to reason from at all (empty cart, fresh table).
  pairingReason(data, tone) {
    const item = data.item || {};
    const source = data.forItem || null;
    const forName = source?.name || 'this dish';
    const t = bevTone(tone);

    const split = hospitality.splitDishDrink(item, source);
    if (split) {
      const why = hospitality.whyClauseFor({ dish: split.dish, drink: split.drink, tone: t });
      if (why) return this.composePairingLine(item, source, t, why);
    }
    if (source && !isBevCat(item) && !isBevCat(source)) {
      const why = hospitality.foodPairClauseFor({ target: item, source, tone: t });
      if (why) return why;
    }

    // Never-blank fallback — no anchor to reason from.
    const cat = (item.categoryType || '').toUpperCase();
    if (cat === 'WINE') {
      const notes = flavorNotes(item.name);
      return `${notes[0].toUpperCase()}${notes.slice(1)} — a confident pour with the ${forName}.`;
    }
    if (cat === 'DRINK') return `A great glass to round off the ${forName}.`;
    if (cat === 'DESSERT') return `The sweet finish that completes the ${forName}.`;
    if (cat === 'STARTER') return `A light opener before the ${forName} lands.`;
    return `Pairs naturally with the ${forName}.`;
  }

  // Shared composition for both the card "why" (pairingReason) and the
  // waiter's spoken upsell script (upsellScript) — one narrative shape, tone-
  // varied, built around a tag-driven WHY clause from hospitalityKnowledge.
  // Openers/closers rotate deterministically per pairing so 100 different
  // items don't all read identically, without ever being random/inconsistent.
  composePairingLine(item, source, tone, why) {
    const itemName = item.name;
    const sourceName = source && source.name;
    const method = hospitality.cookingMethodFor(item);
    const withMethod = method && !isBevCat(item) ? ` It's ${method}.` : '';

    if (!sourceName) {
      const openers = {
        friendly: [`If you're open to a recommendation, I'd go with the ${itemName}.`, `Honestly, I'd suggest the ${itemName}.`],
        professional: [`I'd recommend the ${itemName}.`, `My suggestion would be the ${itemName}.`],
        luxury: [`Might I suggest the ${itemName}?`, `A fitting choice would be the ${itemName}.`]
      };
      const opener = pick(openers[tone], `${itemName}|noanchor|open|${tone}`);
      return `${opener} ${why}${withMethod}`.replace(/\s+/g, ' ').trim();
    }

    const openers = {
      friendly: [`I noticed you've gone with the ${sourceName}.`, `Since you've already got the ${sourceName} on the table,`],
      professional: [`You've added the ${sourceName}.`, `With the ${sourceName} already ordered,`],
      luxury: [`With the ${sourceName} already at the table,`, `Given the ${sourceName} you've chosen,`]
    };
    const recommends = {
      friendly: [`If you're open to a recommendation, I'd definitely pair it with our ${itemName}.`, `I'd pair it with our ${itemName}.`],
      professional: [`I'd recommend pairing it with our ${itemName}.`, `I'd suggest the ${itemName} alongside it.`],
      luxury: [`I'd suggest our ${itemName} alongside it.`, `May I suggest the ${itemName} to accompany it?`]
    };
    const closers = {
      friendly: ["It's one of my favourite combinations on the menu.", "It's always a hit at this table."],
      professional: ["It's a pairing I'd confidently recommend.", "It's one of our most requested combinations."],
      luxury: ['It’s a pairing our regulars return for.', 'It rarely disappoints.']
    };
    // A signature dish (derived, not stored — hospitality.signatureFor) earns a
    // closer that says so, rather than the generic pairing-praise closer.
    const dishSide = isBevCat(item) ? source : item;
    const signatureClosers = {
      friendly: ["It's one of our signature dishes, so you're in good hands.", "It's a signature plate here — always a good sign."],
      professional: ["It's one of our signature dishes.", "It's a signature plate, well worth it."],
      luxury: ['It’s one of the kitchen’s signature dishes.', 'It’s a signature of the house.']
    };
    const closerPool = (dishSide && hospitality.signatureFor(dishSide)) ? signatureClosers[tone] : closers[tone];
    const opener = pick(openers[tone], `${itemName}|${sourceName}|open|${tone}`);
    const recommend = pick(recommends[tone], `${itemName}|${sourceName}|rec|${tone}`);
    const closer = pick(closerPool, `${itemName}|${sourceName}|close|${tone}`);
    return `${opener} ${recommend} ${why}${withMethod} ${closer}`.replace(/\s+/g, ' ').trim();
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

  // Phase 2.5 (Hospitality Intelligence): reuses the SAME tag-driven WHY
  // clause + composePairingLine as pairingReason above — the waiter's spoken
  // upsell line and the card's "why" are one narrative engine, not two. This
  // is what renders in the Professional/Friendly/Luxury tone tabs.
  upsellScript(data, tone) {
    const item = data.suggestedItem || {};
    if (!item.name) return '';
    if (tone === 'short') return `Add the ${item.name}? ${money(item.price)}.`;
    const t = bevTone(tone);
    const source = data.forItem || null;

    let why = '';
    const split = hospitality.splitDishDrink(item, source);
    if (split) why = hospitality.whyClauseFor({ dish: split.dish, drink: split.drink, tone: t });
    if (!why && source && !isBevCat(item) && !isBevCat(source)) why = hospitality.foodPairClauseFor({ target: item, source, tone: t });

    if (why) return this.composePairingLine(item, source, t, why);

    // No tag-matched anchor (e.g. empty cart) — short, honest, category-aware line.
    const cat = (item.categoryType || '').toUpperCase();
    const benefit = cat === 'WINE' ? flavorNotes(item.name)
      : cat === 'DESSERT' ? 'a proper sweet way to close the meal'
        : cat === 'STARTER' ? 'a good way to open the table' : 'a solid addition to the table';
    if (t === 'luxury') return `May I suggest the ${item.name}? It's ${benefit} — ${money(item.price)}.`;
    if (t === 'professional') return `I'd recommend the ${item.name}. It's ${benefit} — ${money(item.price)}.`;
    return `I'd add the ${item.name} if you're keen — it's ${benefit}, ${money(item.price)}.`;
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
