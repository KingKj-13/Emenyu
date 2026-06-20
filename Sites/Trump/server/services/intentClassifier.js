'use strict';
// Deterministic intent + slot classifier (Phase 3A). Fully local, no external AI.
//
// Builds on chatbotNlu (typo/slang normalization + recommendation-synonym
// detection), then extracts structured SLOTS — spice, body, protein, dietary,
// occasion — that drive the tag-aware match source in aiService.recommend().
// `tagScore()` is the pure scoring function shared by the engine and the
// chat:validate harness, so matching is verifiable offline.

const nlu = require('./chatbotNlu');

const SPICE_RE = /\b(spicy|spice|spicey|hot|fiery|peri|peri-?peri|chilli|chili|firecracker|jalapeno|jalapeño|sriracha|heat)\b/;
const LIGHT_RE = /\b(light|lighter|lite|fresh|healthy|delicate|clean|crisp|not too heavy|something small)\b/;
const HEARTY_RE = /\b(hearty|filling|rich|indulgent|heavy|hungry|substantial|big eater)\b/;

const PROTEIN_MAP = [
  ['seafood', /\b(seafood|fish|fishy|prawn|prawns|calamari|squid|mussel|mussels|oyster|oysters|salmon|kingklip|hake|sushi|sashimi|line ?fish)\b/],
  ['beef', /\b(beef|steak|steaks|ribeye|rib-?eye|sirloin|rump|fillet|t-?bone|tomahawk|wagyu|oxtail)\b/],
  ['chicken', /\b(chicken|wings|poultry)\b/],
  ['lamb', /\b(lamb)\b/],
  ['pork', /\b(pork|ribs|bacon|eisbein)\b/],
  ['game', /\b(game|venison|ostrich|kudu|springbok)\b/],
];
const DIETARY_MAP = [
  ['vegan', /\b(vegan|plant-?based)\b/],
  ['vegetarian', /\b(vegetarian|veggie|meat-?free|no meat|without meat)\b/],
  ['gluten-free-able', /\b(gluten-?free|no gluten|coeliac|celiac)\b/],
];
const OCCASION_MAP = [
  ['celebration', /\b(celebrat|birthday|anniversary|engagement|graduation|promotion|special occasion)\b/],
  ['sharing', /\b(football|soccer|rugby|the game|the match|watching|sports|to share|sharing|with friends|the boys|the lads|group)\b/],
  ['date', /\b(date night|date|romantic|just the two|for two|impress)\b/],
  ['quick', /\b(quick|fast|in a hurry|on the go|grab a|before a movie|quick bite)\b/],
];

const PAIRING_RE = /\b(pair|pairs|pairing|go with|goes with|with this|with my|wine for|drink for|what wine|what goes)\b/;
const SWAP_RE = /\b(instead|rather have|swap|change to|actually)\b/;
const INFO_RE = /\b(hours|opening|closing|book a table|booking|reserve|reservation|parking|wifi|wi-fi|corkage|address|located|location|allerg|halal)\b/;
const OFFTOPIC_RE = /\b(stock|share price|weather|the news|bitcoin|crypto|president|capital of|translate|write (me )?code|javascript|python|tell me a joke|meaning of life)\b/;

function classify(message) {
  const norm = nlu.normalize(message);
  const text = ` ${norm.normalized} `;
  const slots = { proteinWanted: [], spice: false, body: null, dietary: [], occasion: null };

  for (const [p, re] of PROTEIN_MAP) if (re.test(text)) slots.proteinWanted.push(p);
  if (SPICE_RE.test(text)) slots.spice = true;
  if (LIGHT_RE.test(text)) slots.body = 'light';
  else if (HEARTY_RE.test(text)) slots.body = 'full';
  for (const [d, re] of DIETARY_MAP) if (re.test(text) && !slots.dietary.includes(d)) slots.dietary.push(d);
  for (const [o, re] of OCCASION_MAP) if (re.test(text)) { slots.occasion = o; break; }

  // Precedence: swap → pairing → occasion → dietary → attribute → recommendation → info → off-topic.
  let type = 'none';
  if (SWAP_RE.test(text)) type = 'swap';
  else if (PAIRING_RE.test(text)) type = 'pairing';
  else if (slots.occasion) type = 'occasion';
  else if (slots.dietary.length) type = 'dietary';
  else if (slots.spice || slots.body || slots.proteinWanted.length) type = 'attribute';
  else if (nlu.isRecommendationIntent(norm.normalized)) type = 'recommendation';
  else if (INFO_RE.test(text)) type = 'info';
  else if (OFFTOPIC_RE.test(text)) type = 'offtopic';

  return { type, slots, normalized: norm.normalized, tokens: norm.tokens, corrections: norm.corrections };
}

// Pure tag→intent score (shared by aiService.addTagMatches + chat:validate).
// Operates on the item's metadata.tags block (Phase 2). Returns 0 when nothing matches.
function tagScore(tags = {}, slots = {}) {
  if (!tags || typeof tags !== 'object') return 0;
  let s = 0;
  const spice = Number(tags.spice) || 0;
  const rich = Number(tags.richness) || 0;
  const protein = Array.isArray(tags.protein) ? tags.protein : [];
  const dietary = Array.isArray(tags.dietary) ? tags.dietary : [];
  const occ = Array.isArray(tags.occasion) ? tags.occasion : [];
  const isDrink = tags.kind === 'DRINK';

  const texture = Array.isArray(tags.texture) ? tags.texture : [];
  const flavour = Array.isArray(tags.flavour) ? tags.flavour : [];

  if (slots.spice) s += spice >= 2 ? 40 : spice >= 1 ? 18 : 0;
  if (slots.body === 'light' && !isDrink) {
    // Salads / sushi are genuinely light; starters less so; mains least.
    if (tags.body === 'light' || ['SALAD', 'SUSHI'].includes(tags.course)) s += 30;
    else if (tags.course === 'STARTER') s += 12;
    if (rich <= 1) s += 8;
    if (rich >= 3) s -= 20;
    // A fried/smoky starter (wings, biltong) is not "light" — demote it; reward fresh.
    if (texture.includes('crispy')) s -= 12;
    if (flavour.includes('fresh')) s += 12;
    if (flavour.includes('smoky') || flavour.includes('charred')) s -= 8;
  }
  if (slots.body === 'full' && !isDrink && rich >= 2) s += 22;
  (slots.proteinWanted || []).forEach(p => { if (protein.includes(p)) s += 35; });
  (slots.dietary || []).forEach(d => { if (dietary.includes(d)) s += 35; });
  if (slots.occasion && occ.includes(slots.occasion)) s += 25;
  return s;
}

function hasAttributeSlots(slots = {}) {
  return Boolean(slots.spice || slots.body || (slots.proteinWanted || []).length || (slots.dietary || []).length || slots.occasion);
}

module.exports = { classify, tagScore, hasAttributeSlots };
