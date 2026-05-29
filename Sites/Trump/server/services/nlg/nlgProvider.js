// NLG (natural-language generation) contract — the pluggable "wording layer".
//
// IMPORTANT ARCHITECTURE RULE: providers here NEVER make business decisions.
// They receive a structured decision object (`data`) that the deterministic
// services already produced, plus a `kind` and optional `tone`, and return a
// single hospitality-voice string. The app must stay fully functional with no
// provider beyond the always-on template provider.

// The phrasing requests the waiter UI can make.
const KINDS = Object.freeze({
  PAIRING_REASON: 'pairing-reason', // why a pairing item works for a dish
  TABLE_PITCH: 'table-pitch', // the "SABLE · table pitch" in the order builder
  ITEM_EXPLANATION: 'item-explanation', // "why guests love this" on item detail
  UPSELL_SCRIPT: 'upsell-script', // what to say to upsell an opportunity
  SOMMELIER: 'sommelier', // wine recommendation explanation
  SERVICE_RECOVERY: 'service-recovery', // recovery wording when something goes wrong
  COACH_SAY_TO_TABLE: 'coach-say-to-table' // the verbatim "say to the table" line
});

// Delivery styles surfaced as the "speech options" buttons.
const TONES = Object.freeze(['casual', 'professional', 'luxury', 'short', 'upsell']);

function normalizeTone(tone) {
  const t = String(tone || '').toLowerCase();
  return TONES.includes(t) ? t : 'professional';
}

// Abstract base. A provider implements `phrase()` and reports `available`.
class NlgProvider {
  get name() {
    return 'base';
  }

  get available() {
    return false;
  }

  // eslint-disable-next-line no-unused-vars
  async phrase({ kind, tone, data, seed }) {
    throw new Error('NlgProvider.phrase not implemented');
  }
}

module.exports = { NlgProvider, KINDS, TONES, normalizeTone };
