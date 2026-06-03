'use strict';
// Local restaurant-knowledge retrieval (Phase 3, Task 6). Fully deterministic,
// no external AI. Answers hours / policies / allergens / specials / FAQs from
// restaurant data (data/knowledge.json + the live menu + deals).

const fs = require('fs');
const path = require('path');

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const DEFAULT_PROFILE = {
  timezone: 'Africa/Johannesburg',
  hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: '11:00', close: '22:00' })),
  contact: {},
  policies: {},
  faqs: []
};

const POLICY_KEYWORDS = {
  corkage: ['corkage', 'bring my own', 'byo', 'own wine'],
  children: ['kid', 'kids', 'child', 'children', 'family', 'high chair'],
  dress: ['dress', 'dress code', 'attire', 'smart casual'],
  parking: ['parking', 'park'],
  wifi: ['wifi', 'wi-fi', 'internet', 'password'],
  smoking: ['smoking', 'smoke', 'cigarette'],
  reservations: ['reservation', 'reservations', 'booking', 'book a table', 'reserve']
};

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function createKnowledgeService({ config, fileService, logger = null }) {
  const knowledgePath = path.join(config.directories.data, 'knowledge.json');

  function loadProfile() {
    try {
      const raw = fs.readFileSync(knowledgePath, 'utf8');
      return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_PROFILE;
    }
  }

  // Which knowledge intent (if any) the normalized message expresses.
  function detectIntent(normalized) {
    const t = String(normalized || '');
    if (/\b(open|opening|close|closing|hours|what time|open now|still open)\b/.test(t)) return 'hours';
    if (/\b(special|specials|deal|deals|on special)\b/.test(t)) return 'special';
    if (/\b(allerg|gluten|nut|nuts|dairy|lactose|halal|contain|contains)\b/.test(t)) return 'allergen';
    for (const key of Object.keys(POLICY_KEYWORDS)) {
      if (POLICY_KEYWORDS[key].some(k => t.includes(k))) return 'policy';
    }
    return null;
  }

  function nowInTz(tz) {
    const now = new Date();
    let dayShort = 'Sun';
    let hhmm = '12:00';
    try {
      dayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
      hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).format(now);
    } catch {
      dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
      hhmm = now.toTimeString().slice(0, 5);
    }
    return { day: DAY_INDEX[dayShort] ?? now.getDay(), minutes: toMinutes(hhmm), hhmm };
  }

  function hoursReply(profile) {
    const { day, minutes } = nowInTz(profile.timezone);
    const today = (profile.hours || []).find(h => Number(h.day) === day);
    if (!today || today.closed) {
      return { reply: 'We are closed today. Please check back during our regular hours, or ask your waiter.' };
    }
    const openMin = toMinutes(today.open);
    const closeMin = toMinutes(today.close);
    const isOpen = minutes >= openMin && minutes <= closeMin;
    if (isOpen) {
      return { reply: `Yes, we're open now — until ${today.close} today. Can I help you choose something?` };
    }
    if (minutes < openMin) {
      return { reply: `We open at ${today.open} today (until ${today.close}).` };
    }
    return { reply: `We've closed for today (we were open until ${today.close}). We'd love to see you tomorrow.` };
  }

  function policyReply(profile, normalized) {
    for (const key of Object.keys(POLICY_KEYWORDS)) {
      if (POLICY_KEYWORDS[key].some(k => normalized.includes(k))) {
        const answer = (profile.policies || {})[key];
        if (answer) return { reply: answer };
      }
    }
    // Fall back to an FAQ alias match.
    const faq = (profile.faqs || []).find(f =>
      normalized.includes(String(f.q).toLowerCase()) ||
      (f.aliases || []).some(a => normalized.includes(String(a).toLowerCase()))
    );
    return faq ? { reply: faq.a } : null;
  }

  async function specialReply() {
    const deals = (await fileService.loadDeals()).filter(d => d.visible !== false && d.hidden !== true);
    if (deals.length === 0) {
      return { reply: 'There are no active specials right now — but I can point you to tonight’s most popular dishes.' };
    }
    const deal = deals[0];
    const items = (deal.items || []).map(i => i.name).filter(Boolean);
    const price = deal.price ? ` for R${Number(deal.price).toFixed(2)}` : '';
    return { reply: `Today's special — ${deal.name || 'Chef’s deal'}${items.length ? `: ${items.join(', ')}` : ''}${price}.` };
  }

  // Allergen guidance is conservative: we surface items that do NOT list the
  // allergen, and always defer to the waiter for confirmation.
  async function allergenReply(normalized, menuContext) {
    const ALLERGENS = ['gluten', 'nut', 'nuts', 'dairy', 'lactose', 'egg', 'shellfish', 'soy'];
    const term = ALLERGENS.find(a => normalized.includes(a));
    if (/halal/.test(normalized)) {
      return { reply: 'Some dishes can be prepared to preference — please ask your waiter and we’ll confirm with the kitchen.' };
    }
    if (!term || !menuContext) {
      return { reply: 'I can flag allergens from our menu data, but please always confirm with your waiter before ordering.' };
    }
    const safe = (menuContext.items || [])
      .filter(it => !String(it.allergens || '').toLowerCase().includes(term) && !String(it.searchText || '').includes(term))
      .slice(0, 4);
    return {
      reply: safe.length
        ? `A few options that don't list ${term} in our data: ${safe.map(i => i.name).slice(0, 3).join(', ')}. Please confirm with your waiter before ordering.`
        : `I can't find enough ${term}-free matches in our data — please ask your waiter so the kitchen can confirm.`,
      suggestions: safe
    };
  }

  // Returns { reply, suggestions? } or null when this service can't answer.
  async function answer(intent, normalized, menuContext) {
    const profile = loadProfile();
    try {
      if (intent === 'hours') return hoursReply(profile);
      if (intent === 'special') return await specialReply();
      if (intent === 'policy') return policyReply(profile, normalized);
      if (intent === 'allergen') return await allergenReply(normalized, menuContext);
    } catch (error) {
      logger?.warn?.('knowledge_answer_failed', { intent, error: error?.message });
    }
    return null;
  }

  return { detectIntent, answer, loadProfile };
}

module.exports = { createKnowledgeService };
