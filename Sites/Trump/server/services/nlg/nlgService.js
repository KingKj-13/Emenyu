// NLG service — local, deterministic wording layer. The template provider is the
// single source of truth and runs entirely offline. There is no external LLM:
// Trump produces all hospitality copy locally with zero outbound calls.
const { TemplateNlgProvider } = require('./templateNlgProvider');
const { KINDS, TONES } = require('./nlgProvider');

function createNlgService({ logger } = {}) {
  const template = new TemplateNlgProvider();

  // Phrase a single line. Always returns the template's string (or '' on failure).
  async function phrase({ kind, tone, data } = {}) {
    try {
      return await template.phrase({ kind, tone, data });
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
