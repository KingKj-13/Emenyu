'use strict';
// Gaspard — Carmella's deterministic AI persona voice (see AD-005 in
// emenyu-carmella/ARCHITECTURE_DECISIONS.md and the production spec at
// emenyu-carmella/design/gaspard-prompt-pack.md).
//
// ARCHITECTURE RULE (mirrors server/services/nlg/nlgProvider.js): this module
// NEVER re-scores, re-ranks, filters, or invents menu items. aiService.chat()
// already ran the shared, tenant-agnostic recommendation engine
// (recommendationScoring.js + its Phase-4 companions) and decided WHICH real
// menu items to suggest; composeReply() only decides HOW GASPARD TALKS about
// suggestions that already exist. Every dish named here comes from the
// `suggestions` array the engine produced — there is no path in this file
// that can name a dish that isn't already a real, in-stock (or
// explicitly-caveated) MenuItem row.

// Hard rule 4/5 (prompt pack): no discount/urgency/sales language, never say
// AI/model/algorithm/database. Defensive strip, same pattern as
// nlgService.js's enforcePersonality() — authored templates below are already
// clean, this only catches something slipping in via a dish's own description.
const GUARDED_LANGUAGE = /\b(ai|algorithm|recommendation engine|neural network|database|discount|% ?off|promo(?:tion)?|best value|only \d+ left|limited time|hurry|deal of the day)\b/gi;

function stripGuardedLanguage(text) {
  return String(text || '').replace(GUARDED_LANGUAGE, '').replace(/\s{2,}/g, ' ').trim();
}

function dietaryFlagsIn(message) {
  const lower = String(message || '').toLowerCase();
  const flags = [];
  if (/\ballerg/.test(lower)) flags.push('allergy');
  if (/\bnut/.test(lower)) flags.push('nuts');
  if (/\bgluten/.test(lower)) flags.push('gluten');
  if (/\bvegan\b/.test(lower)) flags.push('vegan');
  if (/\bvegetarian\b/.test(lower)) flags.push('vegetarian');
  if (/\bshellfish|seafood\b/.test(lower) && /\ballerg/.test(lower)) flags.push('shellfish');
  return flags;
}

// Hard rule 1: allergies/diets come first, repeated back once, never guessed.
function dietaryAcknowledgment(flags) {
  if (flags.length === 0) return '';
  if (flags.includes('allergy') || flags.includes('nuts') || flags.includes('shellfish')) {
    return 'Noted — I\'ll keep that away from your table, and I\'ll always ask the kitchen to confirm before it reaches you. ';
  }
  if (flags.includes('vegan')) return 'Noted — vegan it is; our journal is a little shorter here, but let me show you what we have. ';
  if (flags.includes('vegetarian')) return 'Noted — vegetarian for the table. ';
  return '';
}

// Hard rule 3: availability:"ask" items get a graceful caveat, never a flat no.
function availabilityCaveat(item) {
  if (item.availability === 'ask') {
    return ` — I'll gladly check with the kitchen that it's on tonight`;
  }
  return '';
}

// One short, story-rooted reason per dish — never popularity statistics,
// never sales language (hard rule from the prompt pack's "How you recommend").
function dishMention(item) {
  const flavour = item.story || item.description || '';
  const caveat = availabilityCaveat(item);
  if (flavour) {
    return `the ${item.name}${caveat} — ${flavour}`;
  }
  return `the ${item.name}${caveat}`;
}

// Hard rule 6: alcohol is only led with when the guest already showed
// interest (the engine only surfaces a drink when that's what was asked, or
// as a pairing) — Gaspard still always offers the virgin alternative with
// equal pride rather than assuming everyone wants it.
function alcoholPosture(item) {
  const isAlcoholic = ['WINE', 'COCKTAIL', 'BEER'].includes(String(item.beverageKind || '').toUpperCase());
  if (!isAlcoholic) return '';
  return ' If you\'d rather skip the alcohol, tell me and I\'ll find its equal in spirit, without it.';
}

const DAYPART_OPENERS = {
  morning: 'Good morning',
  midday: 'Good afternoon',
  golden: 'Golden hour'
};

function greetingFor(dayPart) {
  if (!dayPart) return '';
  return dayPart.greeting || DAYPART_OPENERS[dayPart.slug] || '';
}

// The single entry point aiService.chat() calls when
// config.assistantPersona === 'gaspard'. `suggestions` is whatever the
// existing intent branch already decided (unchanged); `fallbackReply` is the
// template/Donald-voice reply that branch would otherwise have used, kept
// only as a structural fallback if suggestions is empty and no dedicated
// Gaspard line applies (e.g. an off-topic decline, which is already
// in-character-agnostic enough to reuse as-is per the prompt pack's own
// "gently return to the table" wording).
function composeReply({ message = '', suggestions = [], dayPart = null, isFirstTurn = false } = {}) {
  const flags = dietaryFlagsIn(message);
  const acknowledgment = dietaryAcknowledgment(flags);

  if (suggestions.length === 0) {
    return stripGuardedLanguage(
      `${acknowledgment}Ah — that one isn't in our journal, but if you ask the team, our kitchen takes pride in making guests feel at home.`
    );
  }

  // Hard rule: at most two suggestions per reply.
  const picks = suggestions.slice(0, 2);
  const mentions = picks.map(dishMention);
  const posture = picks.map(alcoholPosture).find(Boolean) || '';

  const greeting = isFirstTurn ? greetingFor(dayPart) : '';
  const lead = greeting ? `${greeting}. ` : '';

  let body;
  if (mentions.length === 1) {
    body = `I'd point you to ${mentions[0]}.`;
  } else {
    body = `I'd pour my attention toward ${mentions[0]}, and ${mentions[1]}.`;
  }

  return stripGuardedLanguage(`${lead}${acknowledgment}${body}${posture}`);
}

module.exports = { composeReply, dietaryFlagsIn, stripGuardedLanguage };
