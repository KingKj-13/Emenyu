'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeName } = require('../utils/helpers');

const PAIRING_DIR = path.join('data', 'pairings');
const CSV_FILES = {
  menuFull: 'trumps_menu_pairings_full.csv',
  menuSimple: 'trumps_full_menu_pairings.csv',
  drinks: 'trumps_drinks_descriptions_expanded.csv'
};

function parseCsv(text = '') {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some(v => String(v).trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(v => String(v).trim() !== '')) rows.push(row);
  }

  if (rows.length < 2) return [];
  const header = rows[0].map(h => normalizeHeader(h));
  return rows.slice(1).map(values => {
    const obj = {};
    header.forEach((key, idx) => { obj[key] = String(values[idx] || '').trim(); });
    return obj;
  });
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function inferCategoryType(value = '') {
  const text = String(value).toLowerCase();
  if (/wine|sauvignon|chardonnay|chenin|merlot|shiraz|pinotage|cabernet|sparkling|brut/.test(text)) return 'WINE';
  if (/beer|lager|pilsner|cocktail|margarita|spritz|tonic|coffee|espresso|whisky|whiskey|martini|mojito|negroni|drink/.test(text)) return 'DRINK';
  if (/dessert|cake|ice cream|sweet|coffee/.test(text)) return 'DESSERT';
  if (/starter|salad|calamari|halloumi|snail|carpaccio/.test(text)) return 'STARTER';
  return 'MAIN';
}

function relationFor(sourceType, targetType, label = '') {
  if (sourceType === 'DRINK' || sourceType === 'WINE') return 'drink-to-food';
  if (targetType === 'DRINK' || targetType === 'WINE') return 'food-to-drink';
  if (sourceType === 'STARTER' && targetType === 'MAIN') return 'starter-to-main';
  if (sourceType === 'MAIN' && targetType === 'DESSERT') return 'main-to-dessert';
  if (sourceType === 'DESSERT' && /coffee|espresso|cappuccino/i.test(label)) return 'dessert-to-coffee';
  return 'food-to-food';
}

function findMenuItem(menuContext, name) {
  const key = normalizeName(name);
  if (!key) return null;
  if (menuContext.byName.has(key)) return menuContext.byName.get(key);
  const candidates = [...menuContext.byName.entries()];
  const exact = candidates.find(([candidate]) => candidate.includes(key) || key.includes(candidate));
  if (exact) return exact[1];
  const tokens = key.split(/\s+/).filter(t => t.length > 2);
  if (!tokens.length) return null;
  const scored = candidates
    .map(([candidate, item]) => ({ item, score: tokens.reduce((sum, token) => sum + (candidate.includes(token) ? 1 : 0), 0) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item || null;
}

function publicCandidate(item, reason, sourceTitle, relation, pairedWith = '') {
  return {
    name: item.name,
    price: Number(item.price) || 0,
    description: item.description || '',
    img: item.img || item.imagePath || '',
    category: item.category || '',
    subcategory: item.subcategory || '',
    categoryType: item.categoryType || inferCategoryType(`${item.category || ''} ${item.name || ''}`),
    reason,
    // The cart item this was paired from, so the upsell script can name it.
    pairedWith,
    source_title: sourceTitle,
    rotationGroup: `csv:${relation}:${normalizeName(item.name)}`,
    relation,
    chef: false
  };
}

class SmartPairingEngine {
  constructor(config, { logger = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.cache = { at: 0, data: null };
  }

  loadData() {
    if (this.cache.data && Date.now() - this.cache.at < 60000) return this.cache.data;
    const base = this.config?.directories?.base || path.resolve(__dirname, '..', '..');
    const dir = path.join(base, PAIRING_DIR);
    const read = file => {
      try {
        return parseCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch (error) {
        this.logger?.warn?.('pairing_csv_read_failed', { file, error: error?.message });
        return [];
      }
    };

    const drinks = new Map(read(CSV_FILES.drinks).map(row => [normalizeName(row.drink), row.description || '']));
    const edges = [];

    for (const row of read(CSV_FILES.menuFull)) {
      const source = row.item;
      if (!source) continue;
      [
        ['wine_pairing', 'Wine pairing'],
        ['beer_pairing', 'Beer pairing'],
        ['cocktail_pairing', 'Cocktail pairing']
      ].forEach(([key, title]) => {
        const target = row[key];
        if (!target) return;
        edges.push({
          source,
          target,
          sourceType: inferCategoryType(`${row.category} ${source}`),
          targetType: inferCategoryType(target),
          reason: row.reasoning || drinks.get(normalizeName(target)) || `${target} is a strong pairing for ${source}.`,
          sourceTitle: title
        });
      });
    }

    for (const row of read(CSV_FILES.menuSimple)) {
      if (!row.item || !row.pairing) continue;
      edges.push({
        source: row.item,
        target: row.pairing,
        sourceType: inferCategoryType(`${row.source_page} ${row.item}`),
        targetType: inferCategoryType(row.pairing),
        reason: row.reasoning || drinks.get(normalizeName(row.pairing)) || `${row.pairing} complements ${row.item}.`,
        sourceTitle: 'Menu pairing'
      });
    }

    this.cache = { at: Date.now(), data: { drinks, edges } };
    return this.cache.data;
  }

  recommend({ cart = [], menuContext, limit = 6 } = {}) {
    const data = this.loadData();
    if (!menuContext || !Array.isArray(cart) || cart.length === 0) return [];

    const cartKeys = new Set(cart.map(item => normalizeName(item.name)).filter(Boolean));
    const out = [];
    const seen = new Set();

    for (const line of cart) {
      const sourceItem = findMenuItem(menuContext, line.name);
      const sourceName = sourceItem?.name || line.name;
      const sourceKey = normalizeName(sourceName);
      const matches = data.edges.filter(edge => {
        const edgeSource = normalizeName(edge.source);
        const edgeTarget = normalizeName(edge.target);
        return edgeSource === sourceKey || edgeSource.includes(sourceKey) || sourceKey.includes(edgeSource) || edgeTarget === sourceKey;
      });

      for (const edge of matches) {
        const reverse = normalizeName(edge.target) === sourceKey;
        const targetName = reverse ? edge.source : edge.target;
        const target = findMenuItem(menuContext, targetName);
        if (!target) continue;
        const key = normalizeName(target.name);
        if (!key || cartKeys.has(key) || seen.has(key)) continue;
        const sourceType = reverse ? edge.targetType : edge.sourceType;
        const targetType = target.categoryType || (reverse ? edge.sourceType : edge.targetType);
        const relation = relationFor(sourceType, targetType, target.name);
        const reason = edge.reason || `${target.name} pairs well with ${sourceName}.`;
        out.push(publicCandidate(target, reason, `CSV ${edge.sourceTitle}`, relation, sourceName));
        seen.add(key);
        if (out.length >= limit) return out;
      }
    }

    return out;
  }
}

module.exports = { SmartPairingEngine };
