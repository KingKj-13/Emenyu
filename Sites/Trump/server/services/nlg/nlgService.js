// NLG service — selects the wording provider and guarantees a result.
// Template provider is the source of truth and always runs first; the optional LLM
// only enhances it. If the LLM is unconfigured or fails, the template text is returned.
// This is the single seam through which a future local/cloud LLM plugs in.
const { TemplateNlgProvider } = require('./templateNlgProvider');
const { LlmNlgProvider } = require('./llmNlgProvider');
const { KINDS, TONES } = require('./nlgProvider');

function createNlgService({ config, logger } = {}) {
  const template = new TemplateNlgProvider();
  const llm = new LlmNlgProvider(config?.llm || {}, logger);

  // Phrase a single line. Always returns a non-empty string when the template can produce one.
  async function phrase({ kind, tone, data } = {}) {
    let draft = '';
    try {
      draft = await template.phrase({ kind, tone, data });
    } catch (error) {
      logger?.warn?.('nlg_template_failure', { kind, error: error?.message });
      draft = '';
    }

    if (!llm.available) return draft;

    try {
      const enhanced = await llm.phrase({ kind, tone, data, seed: draft });
      return enhanced || draft;
    } catch {
      return draft;
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
      llmConfigured: Boolean(config?.llm?.provider && config?.llm?.apiKey),
      llmAvailable: llm.available,
      provider: llm.available ? llm.name : template.name
    };
  }

  return { phrase, phraseMany, status, KINDS, TONES };
}

module.exports = { createNlgService };
