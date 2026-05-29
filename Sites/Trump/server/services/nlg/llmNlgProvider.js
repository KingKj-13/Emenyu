// Optional LLM phrasing provider. Enhances wording only — it is given the structured
// decision data plus the template draft as a seed, and asked to return ONE polished line.
// It must never be required: any miss/timeout/error returns null so nlgService falls back
// to the template provider. Currently implements the Anthropic Messages API.
const { NlgProvider, normalizeTone } = require('./nlgProvider');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = [
  'You are a fine-dining hospitality phrasing assistant for a waiter app.',
  'You are given a structured decision object that has ALREADY been made by the restaurant system,',
  'plus a draft line. Rephrase it into ONE warm, confident, natural line a great waiter would say or read.',
  'Rules: never invent menu items, prices, guests, or facts not present in the data; keep it concise',
  '(one or two sentences); match the requested tone; return ONLY the line with no quotes or preamble.'
].join(' ');

class LlmNlgProvider extends NlgProvider {
  constructor(llmConfig = {}, logger = null) {
    super();
    this.provider = llmConfig.provider || '';
    this.apiKey = llmConfig.apiKey || '';
    this.model = llmConfig.model || 'claude-opus-4-8';
    this.timeoutMs = Number(llmConfig.timeoutMs) || 6000;
    this.logger = logger;
    this.healthy = true; // flips false after repeated failures
    this.failures = 0;
  }

  get name() {
    return `llm:${this.provider}`;
  }

  get available() {
    return this.provider === 'anthropic' && Boolean(this.apiKey) && typeof fetch === 'function' && this.healthy;
  }

  async phrase({ kind, tone, data, seed }) {
    if (!this.available) return null;

    const userContent = JSON.stringify({
      kind,
      tone: normalizeTone(tone),
      draft: seed || '',
      data
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }]
        })
      });

      if (!res.ok) {
        this.registerFailure(`http_${res.status}`);
        return null;
      }

      const json = await res.json();
      const text = Array.isArray(json?.content)
        ? json.content.filter(p => p.type === 'text').map(p => p.text).join(' ').trim()
        : '';
      this.failures = 0;
      return text || null;
    } catch (error) {
      this.registerFailure(error?.name === 'AbortError' ? 'timeout' : 'error');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  registerFailure(reason) {
    this.failures += 1;
    this.logger?.warn?.('nlg_llm_failure', { provider: this.provider, reason, failures: this.failures });
    // Trip the breaker after 3 consecutive failures; it resets on next successful phrase.
    if (this.failures >= 3) this.healthy = false;
  }
}

module.exports = { LlmNlgProvider };
