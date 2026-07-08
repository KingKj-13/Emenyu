// NLG service — local, deterministic wording layer. The template provider is the
// single source of truth and runs entirely offline. There is no external LLM:
// Trump produces all hospitality copy locally with zero outbound calls.
const fs = require('fs');
const path = require('path');
const { TemplateNlgProvider } = require('./templateNlgProvider');
const { KINDS, TONES } = require('./nlgProvider');

// Phase 4 (Recommendation Engine V2) — knowledge/personality.json's
// forbidden_phrases, enforced at runtime (previously only a source-code style
// -guide comment in hospitalityKnowledge.js with no actual check). Every
// generated line is scanned once here, the single choke point every NLG
// consumer already calls through.
const PERSONALITY_FILE = path.join(__dirname, '..', '..', '..', 'knowledge', 'personality.json');
function loadForbiddenPhrases() {
  try {
    const data = JSON.parse(fs.readFileSync(PERSONALITY_FILE, 'utf-8'));
    return Array.isArray(data.forbidden_phrases) ? data.forbidden_phrases : [];
  } catch (error) {
    return [];
  }
}
const FORBIDDEN_PHRASES = loadForbiddenPhrases();

// Strips a banned marketing word/phrase if it slipped into generated text
// (defensive net, not a rewriter — authored copy is already vetted, this
// catches anything new or hand-edited that reintroduces one).
function enforcePersonality(text, logger) {
  if (!text || !FORBIDDEN_PHRASES.length) return text;
  let result = text;
  for (const phrase of FORBIDDEN_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(result)) {
      logger?.debug?.('nlg_forbidden_phrase_stripped', { phrase });
      result = result.replace(re, '').replace(/\s{2,}/g, ' ').trim();
    }
  }
  return result;
}

function createNlgService({ logger } = {}) {
  const template = new TemplateNlgProvider();

  // Phrase a single line. Always returns the template's string (or '' on failure).
  async function phrase({ kind, tone, data } = {}) {
    try {
      const text = await template.phrase({ kind, tone, data });
      return enforcePersonality(text, logger);
    } catch (error) {
      logger?.warn?.('nlg_template_failure', { kind, error: error?.message });
      return '';
    }
  }

  // Phrase several lines in parallel. Input: { key: { kind, tone, data } }.
  async function phraseMany(requests = {}) {
    const entries = Object.entries(requests);
    const results = await Promise.all(entries.map(([, req]) => phrase(req)));
    return Object.fromEntries(entries.map(([key], i) => [key, results[i]]));
  }

  function status() {
    return {
      provider: template.name,
      // Retained for backward compatibility with existing clients; always false.
      llmConfigured: false,
      llmAvailable: false
    };
  }

  return { phrase, phraseMany, status, KINDS, TONES };
}

module.exports = { createNlgService };
