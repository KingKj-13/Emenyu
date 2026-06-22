'use strict';
// Deterministic chatbot NLU (Phase 3, Task 5) — fully local, no external AI.
//
// Pipeline: lowercase → strip punctuation → token slang/typo map → conservative
// edit-distance correction against a menu/intent lexicon → filler removal.
// Then synonym-based intent detection so many phrasings collapse to one intent
// (e.g. "what's good", "whats good", "best dish", "most popular", "signature dish",
// "chef recommendation" all → RECOMMENDATION).

// ── Slang / common restaurant typos (authoritative, applied per token) ──────────
const TYPO_MAP = {
  // intent words
  wats: 'whats', wts: 'whats', wat: 'what', wot: 'what', whts: 'whats',
  gud: 'good', goood: 'good', gd: 'good', goo: 'good',
  recomend: 'recommend', reccomend: 'recommend', recommend: 'recommend', recommendation: 'recommend', recommendations: 'recommend', recommended: 'recommend',
  populer: 'popular', poular: 'popular', poplar: 'popular',
  signiture: 'signature', signatur: 'signature',
  bst: 'best', beste: 'best',
  // food words
  stake: 'steak', stak: 'steak', steack: 'steak', stek: 'steak',
  chiken: 'chicken', chikn: 'chicken', chickin: 'chicken',
  desert: 'dessert', desserts: 'dessert', dessrt: 'dessert',
  vegitarian: 'vegetarian', vegaterian: 'vegetarian', vejetarian: 'vegetarian', vegetarain: 'vegetarian', veg: 'vegetarian', veggie: 'vegetarian', veggies: 'vegetarian',
  seafud: 'seafood', sefood: 'seafood', seefood: 'seafood',
  praws: 'prawns', prawn: 'prawns',
  spicey: 'spicy', spici: 'spicy',
  // fillers / chat-speak normalised away later
  pls: 'please', plz: 'please', plss: 'please',
  thx: 'thanks', ty: 'thanks',
  u: 'you', ur: 'your', r: 'are', n: 'and'
};

// Tokens dropped entirely (noise / chat-speak).
const FILLERS = new Set(['lol', 'lmao', 'haha', 'haha', 'hmm', 'um', 'uh', 'eh', 'yo', 'hey', 'hi', 'hello', 'thanks', 'please', 'the', 'a', 'an', 'me', 'some', 'any', 'here', 'there', 'now', 'today', 'tonight', 'im', 'i', 'is', 'are', 'and', 'of', 'to', 'for']);

// Lexicon used for conservative edit-distance correction of unknown tokens.
const LEXICON = [
  'steak', 'chicken', 'seafood', 'prawns', 'calamari', 'salmon', 'sushi', 'burger',
  'lamb', 'pork', 'ribs', 'pasta', 'salad', 'dessert', 'cake', 'wine', 'cocktail',
  'beer', 'coffee', 'vegetarian', 'vegan', 'spicy', 'popular', 'recommend', 'best',
  'signature', 'favourite', 'allergen', 'gluten', 'nuts', 'dairy', 'pairing',
  'special', 'deal', 'hours', 'parking', 'wifi', 'booking', 'reservation', 'corkage',
  'good', 'whats', 'menu', 'options', 'something', 'light', 'sweet', 'cheese'
];

// Synonyms that all mean "show me your best / recommended / popular / chef picks".
const RECOMMENDATION_SYNONYMS = [
  'recommend', 'popular', 'best', 'signature', 'favourite', 'favorite', 'good',
  'nice', 'top', 'speciality', 'specialty', 'musttry', 'must-try', 'must try',
  'chef', "chef's", 'chefs', 'standout', 'highlight', 'famous', 'known for'
];

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j += 1) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i += 1) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[m];
}

function correctToken(token) {
  if (TYPO_MAP[token]) return TYPO_MAP[token];
  if (LEXICON.includes(token)) return token;
  // Conservative generic correction: only for longer tokens, distance 1.
  if (token.length >= 5) {
    let best = null;
    let bestDist = 2;
    for (const word of LEXICON) {
      const d = levenshtein(token, word);
      if (d < bestDist) { bestDist = d; best = word; }
    }
    if (best && bestDist <= 1) return best;
  }
  return token;
}

// Normalize a raw message into a corrected, filler-stripped form for routing.
function normalize(message) {
  const original = String(message || '');
  const rawTokens = original
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const corrections = [];
  const corrected = rawTokens.map(tok => {
    const fixed = correctToken(tok);
    if (fixed !== tok) corrections.push({ from: tok, to: fixed });
    return fixed;
  });

  const meaningful = corrected.filter(tok => !FILLERS.has(tok));

  return {
    original,
    normalized: corrected.join(' '),          // corrected, fillers kept (for phrase matching)
    tokens: meaningful,                        // corrected, fillers removed
    corrections
  };
}

function isRecommendationIntent(normalized) {
  const text = String(normalized || '');
  if (/\b(what'?s good|what good|whats good|most popular|best dish|best on the menu|signature dish|chef'?s? (pick|recommend|special)|what do you recommend|what should (i|we))\b/.test(text)) {
    return true;
  }
  const tokens = new Set(text.split(/\s+/));
  return RECOMMENDATION_SYNONYMS.some(s => (s.includes(' ') ? text.includes(s) : tokens.has(s)));
}

module.exports = {
  normalize,
  isRecommendationIntent,
  correctToken,
  levenshtein,
  TYPO_MAP,
  RECOMMENDATION_SYNONYMS
};
